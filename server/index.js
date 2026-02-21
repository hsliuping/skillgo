require('dotenv').config()
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const nodemailer = require('nodemailer')
const mysql = require('mysql2/promise')
const {
  normalizeRuntime,
  parseSkillMarkdown,
  executeLocalSkill
} = require('../lib/executor')
const {
  AdminLoginSchema,
  AuthRegisterSchema,
  AuthLoginSchema,
  SubmitSkillSchema,
  ImportSkillSchema,
  ReportSkillSchema,
  ReviewSkillSchema,
  UpdateStatusSchema,
  validate
} = require('../lib/validators')
const { runAiReview, aiReviewEnabled } = require('../lib/ai-reviewer')
const { runCrawl } = require('../lib/crawl-agent-skills')

const app = express()
app.use(helmet())
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : ['http://localhost:5173'],
  methods: ['GET', 'POST', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Key']
}))
app.use(express.json({ limit: '1mb' }))

// 速率限制：提交/导入每 IP 每小时最多 20 次
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: '请求过于频繁，请稍后再试' }
})
// 速率限制：执行接口每 IP 每分钟最多 10 次
const runLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: '执行请求过于频繁，请稍后再试' }
})

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'skillgo',
  port: Number(process.env.MYSQL_PORT) || 3306,
  connectionLimit: 10
})

const jwtSecret = process.env.JWT_SECRET || 'dev-secret-change-in-production'
const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '8h'
const maxTimeoutMs = Math.max(1000, Number(process.env.RUN_MAX_TIMEOUT_MS || process.env.MAX_TIMEOUT_MS || 30000))
const allowInstall = String(process.env.RUN_ALLOW_INSTALL || process.env.ALLOW_INSTALL || 'true').toLowerCase() !== 'false'
const allowedHttpHosts = String(process.env.RUN_HTTP_ALLOWED_HOSTS || process.env.HTTP_ALLOWED_HOSTS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)

const notifyEnabled = () => String(process.env.NOTIFY_ENABLED || 'false').toLowerCase() === 'true'

const sendSkillStatusEmail = async (skillName, submitterEmail, status, reviewNote) => {
  if (!notifyEnabled() || !submitterEmail) return
  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT) || 465
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!host || !user || !pass) return
  try {
    const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } })
    const statusText = status === 'published' ? '已通过' : status === 'rejected' ? '已拒绝' : status
    const subject = `[SkillGo] 技能「${skillName}」审核结果：${statusText}`
    const text = `您的技能「${skillName}」审核结果为：${statusText}。${reviewNote ? `\n备注：${reviewNote}` : ''}`
    await transporter.sendMail({
      from: process.env.SMTP_FROM || user,
      to: submitterEmail,
      subject,
      text
    })
  } catch (err) {
    console.error('[NOTIFY] 邮件发送失败:', err.message)
  }
}

const slugify = (value) => {
  const base = String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || 'skill'
}

/** 获取安装用 slug（英文，避免编码问题）：优先 meta.id，其次从 source_path 提取目录名，最后 slugify(name) 并转 ASCII */
const getInstallSlug = (meta, sourcePath) => {
  const id = (meta.id || '').trim()
  if (id && /^[a-z0-9][a-z0-9-]*$/.test(id)) return id
  const m = (sourcePath || '').match(/\/([^/]+)\/SKILL\.md$/i)
  if (m) return m[1].toLowerCase().replace(/[^a-z0-9-]/g, '-') || m[1]
  return slugify(meta.name).replace(/[^\x00-\x7F]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'skill'
}

const normalizeStatus = (value) => {
  if (value === 'approved') return 'published'
  if (value === 'rejected') return 'rejected'
  if (value === 'published') return 'published'
  return 'pending'
}

const requireAdmin = async (req, res, next) => {
  const authHeader = req.headers['authorization'] || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    res.status(401).json({ message: '需要管理员身份认证' })
    return
  }
  try {
    const payload = jwt.verify(token, jwtSecret)
    req.admin = payload
    next()
  } catch {
    res.status(401).json({ message: 'Token 无效或已过期' })
  }
}

const asyncHandler = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}`, err)
    res.status(500).json({
      message: process.env.NODE_ENV === 'development' ? err.message : '服务器错误'
    })
  })

const parseRepoUrl = (input) => {
  try {
    const url = new URL(input)
    const host = url.hostname
    let provider = ''
    if (host === 'github.com') provider = 'github'
    if (host === 'gitee.com') provider = 'gitee'
    if (host === 'gitlab.com') provider = 'gitlab'
    if (!provider) return null
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length < 2) return null

    let branch = 'main'
    let path = ''
    let isFile = false
    let projectParts = parts.slice(0, 2)

    if (provider === 'gitlab') {
      const markerIndex = parts.indexOf('-')
      if (markerIndex > 0) {
        projectParts = parts.slice(0, markerIndex)
        const mode = parts[markerIndex + 1]
        if (mode === 'tree' && parts[markerIndex + 2]) {
          branch = parts[markerIndex + 2]
          path = parts.slice(markerIndex + 3).join('/')
        } else if (mode === 'blob' && parts[markerIndex + 2]) {
          branch = parts[markerIndex + 2]
          path = parts.slice(markerIndex + 3).join('/')
          isFile = true
        }
      }
    } else {
      if (parts[2] === 'tree' && parts[3]) {
        branch = parts[3]
        path = parts.slice(4).join('/')
      } else if (parts[2] === 'blob' && parts[3]) {
        branch = parts[3]
        path = parts.slice(4).join('/')
        isFile = true
      }
    }

    const project = projectParts.join('/')
    if (!project) return null
    path = decodeURIComponent(path)
    return {
      provider,
      project,
      owner: projectParts[0],
      repo: projectParts[projectParts.length - 1],
      branch,
      path,
      isFile
    }
  } catch {
    return null
  }
}

const githubHeaders = () => {
  const headers = { 'User-Agent': 'skillgo' }
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  }
  return headers
}

const gitlabHeaders = () => {
  const headers = { 'User-Agent': 'skillgo' }
  if (process.env.GITLAB_TOKEN) {
    headers['Private-Token'] = process.env.GITLAB_TOKEN
  }
  return headers
}

const buildGiteeUrl = (base, path, ref) => {
  const url = new URL(`${base}/${path}`)
  if (ref) url.searchParams.set('ref', ref)
  if (process.env.GITEE_TOKEN) {
    url.searchParams.set('access_token', process.env.GITEE_TOKEN)
  }
  return url.toString()
}

const fetchRepoJson = async (repoInfo, url) => {
  const headers = repoInfo.provider === 'gitlab' ? gitlabHeaders() : githubHeaders()
  const response = await fetch(url, { headers })
  if (!response.ok) {
    throw new Error('无法访问仓库内容')
  }
  return response.json()
}

const fetchRepoText = async (repoInfo, url) => {
  const headers = repoInfo.provider === 'gitlab' ? gitlabHeaders() : githubHeaders()
  const response = await fetch(url, { headers })
  if (!response.ok) {
    throw new Error('无法下载技能文件')
  }
  return response.text()
}

const normalizeVersion = (value) => {
  const raw = String(value || '').trim()
  return raw || '1.0.0'
}

const gitlabProjectId = (repoInfo) => encodeURIComponent(repoInfo.project)

const gitlabTreeUrl = (repoInfo, path) => {
  const url = new URL(`https://gitlab.com/api/v4/projects/${gitlabProjectId(repoInfo)}/repository/tree`)
  url.searchParams.set('ref', repoInfo.branch)
  if (path) url.searchParams.set('path', path)
  return url.toString()
}

const gitlabRawUrl = (repoInfo, filePath) =>
  `https://gitlab.com/api/v4/projects/${gitlabProjectId(repoInfo)}/repository/files/${encodeURIComponent(filePath)}/raw?ref=${encodeURIComponent(repoInfo.branch)}`

const collectSkillFiles = async (repoInfo) => {
  if (repoInfo.provider === 'gitlab') {
    if (repoInfo.isFile) {
      if (!repoInfo.path.endsWith('SKILL.md')) return []
      return [{ path: repoInfo.path, download_url: gitlabRawUrl(repoInfo, repoInfo.path) }]
    }
    const rootPath = repoInfo.path || ''
    const list = await fetchRepoJson(repoInfo, gitlabTreeUrl(repoInfo, rootPath))
    if (!Array.isArray(list)) return []
    const results = []
    for (const item of list) {
      if (item.type === 'blob' && item.name === 'SKILL.md') {
        results.push({ path: item.path, download_url: gitlabRawUrl(repoInfo, item.path) })
      }
      if (item.type === 'tree') {
        const childList = await fetchRepoJson(repoInfo, gitlabTreeUrl(repoInfo, item.path))
        if (Array.isArray(childList)) {
          const skillFile = childList.find((child) => child.type === 'blob' && child.name === 'SKILL.md')
          if (skillFile) {
            results.push({ path: skillFile.path, download_url: gitlabRawUrl(repoInfo, skillFile.path) })
          }
        }
      }
    }
    return results
  }

  const apiBase =
    repoInfo.provider === 'gitee'
      ? `https://gitee.com/api/v5/repos/${repoInfo.project}/contents`
      : `https://api.github.com/repos/${repoInfo.project}/contents`

  if (repoInfo.isFile) {
    if (!repoInfo.path.endsWith('SKILL.md')) return []
    const fileMetaUrl =
      repoInfo.provider === 'gitee'
        ? buildGiteeUrl(apiBase, repoInfo.path, repoInfo.branch)
        : `${apiBase}/${repoInfo.path}?ref=${repoInfo.branch}`
    const fileMeta = await fetchRepoJson(repoInfo, fileMetaUrl)
    if (!fileMeta.download_url) return []
    return [{ path: repoInfo.path, download_url: fileMeta.download_url }]
  }

  const rootPath = repoInfo.path || ''
  const listUrl =
    repoInfo.provider === 'gitee'
      ? buildGiteeUrl(apiBase, rootPath, repoInfo.branch)
      : `${apiBase}/${rootPath}?ref=${repoInfo.branch}`
  const list = await fetchRepoJson(repoInfo, listUrl)
  if (!Array.isArray(list)) return []
  const results = []
  for (const item of list) {
    if (item.type === 'file' && item.name === 'SKILL.md') {
      results.push({ path: item.path, download_url: item.download_url })
    }
    if (item.type === 'dir') {
      const childListUrl =
        repoInfo.provider === 'gitee'
          ? buildGiteeUrl(apiBase, item.path, repoInfo.branch)
          : `${apiBase}/${item.path}?ref=${repoInfo.branch}`
      const childList = await fetchRepoJson(repoInfo, childListUrl)
      if (Array.isArray(childList)) {
        const skillFile = childList.find((child) => child.type === 'file' && child.name === 'SKILL.md')
        if (skillFile) {
          results.push({ path: skillFile.path, download_url: skillFile.download_url })
        }
      }
    }
  }
  return results
}

// ── 管理员认证路由 ────────────────────────────────────────────────
app.post('/api/admin/login', validate(AdminLoginSchema), asyncHandler(async (req, res) => {
  const { username, password } = req.validated
  const [rows] = await pool.query('select * from admins where username = ?', [username])
  const admin = rows[0]
  if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
    res.status(401).json({ message: '用户名或密码错误' })
    return
  }
  await pool.query('update admins set last_login_at = now() where id = ?', [admin.id])
  const token = jwt.sign({ id: admin.id, username: admin.username }, jwtSecret, { expiresIn: jwtExpiresIn })
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString()
  res.json({ token, expiresAt, username: admin.username })
}))

app.post('/api/admin/logout', requireAdmin, asyncHandler(async (req, res) => {
  res.json({ message: '已退出登录' })
}))

app.get('/api/admin/me', requireAdmin, asyncHandler(async (req, res) => {
  const [rows] = await pool.query('select id, username, created_at, last_login_at from admins where id = ?', [req.admin.id])
  if (!rows[0]) {
    res.status(404).json({ message: '管理员不存在' })
    return
  }
  res.json(rows[0])
}))

const optionalUser = async (req, res, next) => {
  const authHeader = req.headers['authorization'] || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    next()
    return
  }
  try {
    const payload = jwt.verify(token, jwtSecret)
    if (payload.role === 'user' && payload.id) {
      const [rows] = await pool.query('select id, username, email, avatar_url, bio from users where id = ? and status = ?', [payload.id, 'active'])
      req.user = rows[0] || null
    }
  } catch {}
  next()
}

app.post('/api/auth/register', validate(AuthRegisterSchema), asyncHandler(async (req, res) => {
  const { username, email, password } = req.validated
  const u = String(username).trim().slice(0, 64)
  const e = String(email).trim().toLowerCase().slice(0, 255)
  const hash = await bcrypt.hash(password, 10)
  try {
    const [result] = await pool.query(
      'insert into users (username, email, password_hash, status, created_at) values (?, ?, ?, ?, now())',
      [u, e, hash, 'active']
    )
    const token = jwt.sign({ id: result.insertId, role: 'user' }, jwtSecret, { expiresIn: jwtExpiresIn })
    res.status(201).json({ token, expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(), user: { id: result.insertId, username: u, email: e } })
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ message: '用户名或邮箱已存在' })
      return
    }
    throw err
  }
}))

app.post('/api/auth/login', validate(AuthLoginSchema), asyncHandler(async (req, res) => {
  const { email, password } = req.validated
  const [rows] = await pool.query('select * from users where email = ? and status = ?', [String(email).trim().toLowerCase(), 'active'])
  const user = rows[0]
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    res.status(401).json({ message: '邮箱或密码错误' })
    return
  }
  await pool.query('update users set last_login_at = now() where id = ?', [user.id])
  const token = jwt.sign({ id: user.id, role: 'user' }, jwtSecret, { expiresIn: jwtExpiresIn })
  res.json({
    token,
    expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
    user: { id: user.id, username: user.username, email: user.email, avatar_url: user.avatar_url, bio: user.bio }
  })
}))

app.get('/api/users/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  const [rows] = await pool.query(
    'select id, username, avatar_url, bio, created_at from users where id = ? and status = ?',
    [id, 'active']
  )
  const user = rows[0]
  if (!user) {
    res.status(404).json({ message: '用户不存在' })
    return
  }
  const [skillsRows] = await pool.query(
    'select id, name, slug, version, description, category, status, created_at from skills where submitter_id = ? order by created_at desc limit 50',
    [id]
  )
  user.skills = skillsRows
  res.json(user)
}))

// ── 健康检查 ──────────────────────────────────────────────────────
app.get('/api/health', asyncHandler(async (req, res) => {
  await pool.query('select 1')
  res.json({ status: 'ok' })
}))

const upsertTagsForSkill = async (skillId, tagNames) => {
  const names = [...new Set((tagNames || []).map((n) => String(n).trim()).filter(Boolean))].slice(0, 10)
  for (const name of names) {
    await pool.query(
      'insert into tags (name, use_count) values (?, 1) on duplicate key update use_count = use_count + 1',
      [name]
    )
    const [rows] = await pool.query('select id from tags where name = ?', [name])
    if (rows[0]) {
      await pool.query('insert ignore into skill_tags (skill_id, tag_id) values (?, ?)', [skillId, rows[0].id])
    }
  }
}

app.post('/api/skills', optionalUser, submitLimiter, validate(SubmitSkillSchema), asyncHandler(async (req, res) => {
  const v = req.validated
  const name = v.name
  const description = v.description
  const category = v.category
  const content = v.content
  const tags = v.tags || []
  const version = normalizeVersion(v.version)
  const compatibility = String(v.compatibility || '')
  const runtime = String(v.runtime || '')
  const provider = String(v.provider || '')
  const license = String(v.license || '')
  const licenseUrl = String(v.licenseUrl || v.license_url || '')
  const entrypoint = String(v.entrypoint || v.run || v.command || '')
  const baseSlug = slugify(name)
  const [existing] = await pool.query(
    'select id from skills where slug = ? and version = ?',
    [baseSlug, version]
  )
  if (existing.length) {
    res.status(409).json({ message: '该版本已存在' })
    return
  }
  const submitterId = req.user?.id || null
  const [result] = await pool.query(
    `insert into skills (name, slug, version, description, category, content, status, repo_url, source_path, compatibility, runtime, provider, license, license_url, entrypoint, submitter_id, review_tier, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now(), now())`,
    [
      name,
      baseSlug,
      version,
      description,
      category,
      content,
      'published',
      null,
      null,
      compatibility || null,
      runtime || null,
      provider || null,
      license || null,
      licenseUrl || null,
      entrypoint || null,
      submitterId,
      'none'
    ]
  )
  const skillId = result.insertId
  await upsertTagsForSkill(skillId, tags)
  res.status(201).json({ id: skillId, status: 'published', review_tier: 'none' })
}))

const baseRepoUrl = (repoInfo) => {
  if (repoInfo.provider === 'github') return `https://github.com/${repoInfo.project}`
  if (repoInfo.provider === 'gitee') return `https://gitee.com/${repoInfo.project}`
  if (repoInfo.provider === 'gitlab') return `https://gitlab.com/${repoInfo.project}.git`
  return null
}

app.post('/api/skills/import', optionalUser, submitLimiter, validate(ImportSkillSchema), asyncHandler(async (req, res) => {
  const { repoUrl } = req.validated
  const repoInfo = parseRepoUrl(repoUrl)
  if (!repoInfo) {
    res.status(400).json({ message: '仅支持 GitHub、Gitee、GitLab 仓库链接' })
    return
  }
  const skillFiles = await collectSkillFiles(repoInfo)
  if (!skillFiles.length) {
    res.status(400).json({ message: '未找到 SKILL.md 文件' })
    return
  }
  let imported = 0
  let skipped = 0
  for (const file of skillFiles) {
    const markdown = await fetchRepoText(repoInfo, file.download_url)
    const meta = parseSkillMarkdown(markdown)
    const baseSlug = getInstallSlug(meta, file.path)
    const version = normalizeVersion(meta.version)
    const [existing] = await pool.query(
      'select id from skills where slug = ? and version = ?',
      [baseSlug, version]
    )
    if (existing.length) {
      skipped += 1
      continue
    }
    const submitterId = req.user?.id || null
    const storedRepoUrl = baseRepoUrl(repoInfo) || repoUrl
    const [insResult] = await pool.query(
      `insert into skills (name, slug, version, description, category, content, status, repo_url, source_path, compatibility, runtime, provider, license, license_url, entrypoint, submitter_id, review_tier, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now(), now())`,
      [
        meta.name,
        baseSlug,
        version,
        meta.description,
        meta.category,
        markdown,
        'published',
        storedRepoUrl,
        file.path,
        meta.compatibility || null,
        meta.runtime || null,
        meta.provider || null,
        meta.license || null,
        meta.license_url || null,
        meta.entrypoint || null,
        submitterId,
        'none'
      ]
    )
    await upsertTagsForSkill(insResult.insertId, meta.tags || [])
    imported += 1
  }
  res.status(201).json({ imported, skipped })
}))

app.get('/api/skills', asyncHandler(async (req, res) => {
  const status = req.query.status || 'published'
  const query = String(req.query.q || '').trim()
  const category = String(req.query.category || '').trim()
  const tag = String(req.query.tag || '').trim()
  const latest = String(req.query.latest || '').toLowerCase()
  const sort = String(req.query.sort || '').toLowerCase()
  const page = Math.max(1, Number(req.query.page) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 12))

  const conditions = []
  const params = []

  if (status && status !== 'all') {
    conditions.push('skills.status = ?')
    params.push(status)
  }
  if (query) {
    const like = `%${query}%`
    conditions.push('(skills.name like ? or skills.description like ? or skills.content like ?)')
    params.push(like, like, like)
  }
  if (category) {
    conditions.push('skills.category = ?')
    params.push(category)
  }
  if (tag) {
    conditions.push('skills.id in (select skill_id from skill_tags where tag_id = (select id from tags where name = ?))')
    params.push(tag)
  }
  if (req.query.slug) {
    conditions.push('skills.slug = ?')
    params.push(String(req.query.slug))
  }
  if (req.query.version) {
    conditions.push('skills.version = ?')
    params.push(String(req.query.version))
  }

  if (latest === 'true' || latest === '1' || latest === 'yes') {
    const latestConditions = []
    const latestParams = []
    if (status && status !== 'all') {
      latestConditions.push('s2.status = ?')
      latestParams.push(status)
    }
    if (category) {
      latestConditions.push('s2.category = ?')
      latestParams.push(category)
    }
    const latestClause = latestConditions.length ? ` and ${latestConditions.join(' and ')}` : ''
    conditions.push(
      `skills.created_at = (
        select max(s2.created_at)
        from skills s2
        where s2.slug = skills.slug${latestClause}
      )`
    )
    params.push(...latestParams)
  }

  const whereClause = conditions.length ? `where ${conditions.join(' and ')}` : ''
  const [countRows] = await pool.query(
    `select count(*) as count from skills ${whereClause}`,
    params
  )
  const total = countRows[0]?.count || 0
  const listParams = [...params, pageSize, (page - 1) * pageSize]
  let orderBy = "field(skills.review_tier, 'human', 'ai', 'none') asc, skills.created_at desc"
  if (sort === 'popular') orderBy = "field(skills.review_tier, 'human', 'ai', 'none') asc, (skills.install_count + skills.view_count + coalesce(skills.review_count, 0) * 2) desc, skills.created_at desc"
  else if (sort === 'reviewed') orderBy = "field(skills.review_tier, 'human', 'ai', 'none') asc, skills.reviewed_at desc, skills.created_at desc"
  const [rows] = await pool.query(
    `select skills.id, skills.name, skills.slug, skills.version, skills.description, skills.category, skills.status, skills.repo_url, skills.compatibility, skills.runtime, skills.provider, skills.license, skills.license_url, skills.entrypoint, skills.install_count, skills.view_count, skills.review_count, skills.avg_rating, skills.reviewed_at, skills.review_tier, skills.created_at,
      u.username as submitter_username,
      group_concat(distinct t.name) as tags
     from skills
     left join users u on skills.submitter_id = u.id
     left join skill_tags st on skills.id = st.skill_id
     left join tags t on st.tag_id = t.id
     ${whereClause}
     group by skills.id
     order by ${orderBy} limit ? offset ?`,
    listParams
  )
  const items = rows.map((r) => ({
    ...r,
    tags: r.tags ? r.tags.split(',').filter(Boolean) : []
  }))
  res.json({ items, total, page, pageSize })
}))

app.get('/api/skills/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  const [rows] = await pool.query(
    `select s.*, u.username as submitter_username from skills s
     left join users u on s.submitter_id = u.id where s.id = ?`,
    [id]
  )
  const row = rows[0]
  if (!row) {
    res.status(404).json({ message: '技能不存在' })
    return
  }
  const [tagRows] = await pool.query(
    'select t.name from skill_tags st join tags t on st.tag_id = t.id where st.skill_id = ?',
    [id]
  )
  row.tags = tagRows.map((r) => r.name)
  pool.query('update skills set view_count = view_count + 1 where id = ?', [id]).catch(() => {})
  res.json(row)
}))

app.get('/api/tags/popular', asyncHandler(async (req, res) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20))
  const [rows] = await pool.query(
    'select name, use_count from tags order by use_count desc limit ?',
    [limit]
  )
  res.json(rows)
}))

app.post('/api/skills/:id/report', optionalUser, validate(ReportSkillSchema), asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  const { reason, detail, contact } = req.validated
  const r = reason
  const d = String(detail || '').trim().slice(0, 1000)
  const c = String(contact || '').trim().slice(0, 255) || null
  const [skillRows] = await pool.query('select id from skills where id = ?', [id])
  if (!skillRows.length) {
    res.status(404).json({ message: '技能不存在' })
    return
  }
  const reporterId = req.user?.id || null
  await pool.query(
    'insert into skill_reports (skill_id, reporter_id, reason, detail, reporter_contact, status, created_at) values (?, ?, ?, ?, ?, ?, now())',
    [id, reporterId, r, d || null, c, 'open']
  )
  const threshold = Number(process.env.REPORT_AUTO_HIDE_THRESHOLD || 3)
  const [countRows] = await pool.query(
    'select count(*) as cnt from skill_reports where skill_id = ? and status = ?',
    [id, 'open']
  )
  if (countRows[0]?.cnt >= threshold) {
    await pool.query("update skills set status = 'pending' where id = ?", [id])
  }
  res.status(201).json({ message: '举报已提交' })
}))

app.get('/api/skills/:id/reviews', asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  const [skillRows] = await pool.query('select id from skills where id = ?', [id])
  if (!skillRows.length) {
    res.status(404).json({ message: '技能不存在' })
    return
  }
  const [rows] = await pool.query(
    `select r.id, r.rating, r.comment, r.created_at, u.username
     from skill_reviews r
     left join users u on r.user_id = u.id
     where r.skill_id = ?
     order by r.created_at desc limit 50`,
    [id]
  )
  const [stats] = await pool.query(
    'select review_count, avg_rating from skills where id = ?',
    [id]
  )
  res.json({
    items: rows.map((r) => ({ ...r, username: r.username || '匿名' })),
    review_count: stats[0]?.review_count || 0,
    avg_rating: stats[0]?.avg_rating ? Number(stats[0].avg_rating) : null
  })
}))

app.post('/api/skills/:id/reviews', optionalUser, validate(ReviewSkillSchema), asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  const { rating, comment } = req.validated
  const [skillRows] = await pool.query('select id from skills where id = ?', [id])
  if (!skillRows.length) {
    res.status(404).json({ message: '技能不存在' })
    return
  }
  const userId = req.user?.id || null
  await pool.query(
    'insert into skill_reviews (skill_id, user_id, rating, comment, created_at) values (?, ?, ?, ?, now())',
    [id, userId, rating, String(comment || '').trim().slice(0, 500) || null]
  )
  const [agg] = await pool.query(
    'select count(*) as cnt, avg(rating) as avg_r from skill_reviews where skill_id = ?',
    [id]
  )
  const cnt = agg[0]?.cnt || 0
  const avgR = agg[0]?.avg_r ? Number(agg[0].avg_r).toFixed(2) : null
  await pool.query(
    'update skills set review_count = ?, avg_rating = ? where id = ?',
    [cnt, avgR, id]
  )
  res.status(201).json({ message: '评价已提交', review_count: cnt, avg_rating: avgR ? Number(avgR) : null })
}))

app.patch('/api/skills/:id/review-tier', requireAdmin, asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  const tier = String(req.body?.review_tier || req.body?.tier || '').toLowerCase()
  if (!['ai', 'human'].includes(tier)) {
    res.status(400).json({ message: 'review_tier 需为 ai 或 human' })
    return
  }
  const col = tier === 'human' ? 'reviewed_at' : 'ai_reviewed_at'
  const [result] = await pool.query(
    `update skills set review_tier = ?, ${col} = now(), updated_at = now() where id = ? and status = ?`,
    [tier, id, 'published']
  )
  if (!result.affectedRows) {
    res.status(404).json({ message: '技能不存在或未发布' })
    return
  }
  await pool.query(
    'insert into audit_logs (admin_id, action, target_type, target_id, detail, created_at) values (?, ?, ?, ?, ?, now())',
    [req.admin.id, 'set_review_tier', 'skill', id, JSON.stringify({ tier })]
  )
  res.json({ review_tier: tier })
}))

app.post('/api/admin/ai-review/:id', requireAdmin, asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  const [rows] = await pool.query(
    'select id, name, slug, version, content, repo_url, source_path, runtime, entrypoint, status, review_tier from skills where id = ?',
    [id]
  )
  const skill = rows[0]
  if (!skill || skill.status !== 'published') {
    res.status(404).json({ message: '技能不存在或未发布' })
    return
  }
  if (skill.review_tier === 'human') {
    res.status(400).json({ message: '已人工审核，无需 AI 审核' })
    return
  }
  const result = await runAiReview(skill)
  if (result.pass) {
    await pool.query(
      "update skills set review_tier = 'ai', ai_reviewed_at = now(), updated_at = now() where id = ?",
      [id]
    )
    await pool.query(
      'insert into audit_logs (admin_id, action, target_type, target_id, detail, created_at) values (?, ?, ?, ?, ?, now())',
      [req.admin.id, 'ai_review', 'skill', id, JSON.stringify({ llm: result.llmResult, sandbox: result.sandboxResult })]
    )
    res.json({ pass: true, review_tier: 'ai', llm: result.llmResult, sandbox: result.sandboxResult })
  } else {
    res.json({
      pass: false,
      llm: result.llmResult,
      sandbox: result.sandboxResult,
      reason: result.llmResult?.reason || result.sandboxResult?.reason
    })
  }
}))

app.post('/api/admin/ai-review-batch', requireAdmin, asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.body?.limit) || 5, 20)
  if (!aiReviewEnabled()) {
    res.status(400).json({ message: '未配置 ZHIPU_API_KEY，无法执行 AI 审核' })
    return
  }
  const [rows] = await pool.query(
    `select id, name, slug, version, content, repo_url, source_path, runtime, entrypoint, status, review_tier
     from skills
     where status = 'published' and review_tier = 'none'
     order by (install_count + view_count + coalesce(review_count, 0) * 2) desc, created_at desc
     limit ?`,
    [limit]
  )
  const results = []
  for (const skill of rows) {
    const result = await runAiReview(skill)
    if (result.pass) {
      await pool.query(
        "update skills set review_tier = 'ai', ai_reviewed_at = now(), updated_at = now() where id = ?",
        [skill.id]
      )
      await pool.query(
        'insert into audit_logs (admin_id, action, target_type, target_id, detail, created_at) values (?, ?, ?, ?, ?, now())',
        [req.admin.id, 'ai_review', 'skill', skill.id, JSON.stringify({ llm: result.llmResult, sandbox: result.sandboxResult })]
      )
      results.push({ id: skill.id, name: skill.name, pass: true })
    } else {
      results.push({ id: skill.id, name: skill.name, pass: false, reason: result.llmResult?.reason || result.sandboxResult?.reason })
    }
  }
  res.json({ processed: results.length, results })
}))

app.post('/api/admin/crawl-agent-skills', requireAdmin, asyncHandler(async (req, res) => {
  const pages = Math.min(Math.max(1, Number(req.body?.pages) || 5), 50)
  const delayMs = Math.min(Math.max(500, Number(req.body?.delayMs) || 2000), 10000)
  const apiBase = `${req.protocol}://${req.get('host')}`
  const adminId = req.admin.id
  res.json({ message: '爬虫已启动，将在后台执行', pages, delayMs })
  setImmediate(async () => {
    try {
      const result = await runCrawl({ apiBase, pages, delayMs })
      await pool.query(
        'insert into audit_logs (admin_id, action, target_type, target_id, detail, created_at) values (?, ?, ?, ?, ?, now())',
        [adminId, 'crawl_agent_skills', 'system', 0, JSON.stringify(result)]
      )
      console.log('[CRAWL] 完成:', result)
    } catch (err) {
      console.error('[CRAWL] 失败:', err)
    }
  })
}))

app.get('/api/admin/review-queue', requireAdmin, asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `select id, name, slug, version, description, category, status, review_tier, install_count, view_count, review_count, avg_rating, created_at
     from skills
     where status = 'published'
     order by field(review_tier, 'none', 'ai', 'human') asc,
       (install_count + view_count + coalesce(review_count, 0) * 2) desc,
       created_at desc
     limit 100`
  )
  res.json(rows)
}))

app.get('/api/admin/reports', requireAdmin, asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `select r.id, r.skill_id, r.reason, r.detail, r.reporter_contact, r.status, r.created_at, s.name as skill_name, s.slug, s.version
     from skill_reports r
     join skills s on r.skill_id = s.id
     where r.status = 'open'
     order by r.created_at desc limit 100`
  )
  res.json(rows)
}))

app.post('/api/admin/reports/:id/dismiss', requireAdmin, asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  const [result] = await pool.query(
    "update skill_reports set status = 'dismissed', resolved_at = now() where id = ?",
    [id]
  )
  if (!result.affectedRows) {
    res.status(404).json({ message: '举报不存在' })
    return
  }
  res.json({ message: '已驳回' })
}))

app.get('/api/skills/:id/skill', asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  const [rows] = await pool.query('select * from skills where id = ?', [id])
  const row = rows[0]
  if (!row) {
    res.status(404).send('技能不存在')
    return
  }
  const metaLines = [
    `name: ${row.slug}`,
    `version: ${row.version}`,
    `description: ${row.description}`
  ]
  if (row.compatibility) metaLines.push(`compatibility: ${row.compatibility}`)
  if (row.runtime) metaLines.push(`runtime: ${row.runtime}`)
  if (row.provider) metaLines.push(`provider: ${row.provider}`)
  if (row.license) metaLines.push(`license: ${row.license}`)
  if (row.license_url) metaLines.push(`license_url: ${row.license_url}`)
  if (row.entrypoint) metaLines.push(`entrypoint: ${row.entrypoint}`)
  const markdown = `---\n${metaLines.join('\n')}\n---\n\n# ${row.name}\n\n${row.content}\n`
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="SKILL.md"')
  res.send(markdown)
}))

app.post('/v1/skills/:slug/versions/:version/run', runLimiter, asyncHandler(async (req, res) => {
  const slug = String(req.params.slug || '').trim()
  const version = String(req.params.version || '').trim()
  if (!slug || !version) {
    res.status(400).json({ message: '请提供技能标识与版本' })
    return
  }
  const [rows] = await pool.query(
    'select * from skills where slug = ? and version = ? and status = ?',
    [slug, version, 'published']
  )
  const row = rows[0]
  if (!row) {
    res.status(404).json({ message: '技能不存在' })
    return
  }
  const input = req.body?.input ?? null
  const context = req.body?.context ?? null
  const options = req.body?.options ?? null
  const entrypoint = String(row.entrypoint || '').trim()
  const runtime = normalizeRuntime(row.runtime, entrypoint)
  const result = await executeLocalSkill({
    repoUrl: row.repo_url,
    sourcePath: row.source_path,
    runtime,
    entrypoint,
    input,
    context,
    options,
    maxTimeoutMs,
    allowInstall,
    allowedHttpHosts
  })
  // 异步增加安装/执行量，不阻塞响应
  if (result.status === 'success') {
    pool.query('update skills set install_count = install_count + 1 where id = ?', [row.id]).catch(() => {})
  }
  res.json({
    status: result.status,
    skill: { id: row.id, slug: row.slug, version: row.version, name: row.name },
    output: result.output,
    logs: result.logs,
    artifacts: result.artifacts
  })
}))

app.patch('/api/skills/:id/status', requireAdmin, validate(UpdateStatusSchema), asyncHandler(async (req, res) => {
  const status = normalizeStatus(req.validated.status)
  const reviewNote = String(req.validated.reviewNote ?? req.validated.review_note ?? '').trim().slice(0, 500)
  const id = Number(req.params.id)
  const [oldRows] = await pool.query('select status from skills where id = ?', [id])
  if (!oldRows.length) {
    res.status(404).json({ message: '技能不存在' })
    return
  }
  const oldStatus = oldRows[0].status
  const setReviewedAt = (status === 'published' && oldStatus === 'pending') ? ', reviewed_at = now(), review_tier = "human"' : ''
  const [result] = await pool.query(
    `update skills set status = ?, review_note = if(? != "", ?, review_note), updated_at = now()${setReviewedAt} where id = ?`,
    [status, reviewNote, reviewNote, id]
  )
  if (!result.affectedRows) {
    res.status(404).json({ message: '技能不存在' })
    return
  }
  await pool.query(
    'insert into audit_logs (admin_id, action, target_type, target_id, detail, created_at) values (?, ?, ?, ?, ?, now())',
    [req.admin.id, 'update_status', 'skill', id, JSON.stringify({ from: oldStatus, to: status, reviewNote: reviewNote || undefined })]
  )
  if ((status === 'published' || status === 'rejected') && oldStatus === 'pending') {
    const [skillRows] = await pool.query('select name, submitter_id from skills where id = ?', [id])
    const submitterId = skillRows[0]?.submitter_id
    if (submitterId) {
      const [userRows] = await pool.query('select email from users where id = ?', [submitterId])
      const email = userRows[0]?.email
      if (email) {
        sendSkillStatusEmail(skillRows[0].name, email, status, reviewNote).catch(() => {})
      }
    }
  }
  res.json({ status })
}))

app.get('/api/categories', asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    'select distinct category from skills where status = ? order by category',
    ['published']
  )
  res.json(rows.map((row) => row.category))
}))

app.get('/mcp/skills', asyncHandler(async (req, res) => {
  const latest = String(req.query.latest || '').toLowerCase()
  const baseUrl = `${req.protocol}://${req.get('host')}`
  let rows = []
  if (latest === 'true' || latest === '1' || latest === 'yes') {
    const [result] = await pool.query(
      `select s.id, s.name, s.description, s.category, s.slug, s.version, s.repo_url, s.source_path, s.compatibility, s.runtime, s.provider, s.license, s.license_url, s.entrypoint, s.review_tier
       from skills s
       join (
         select slug, max(created_at) as max_created
         from skills
         where status = 'published'
         group by slug
       ) latest on s.slug = latest.slug and s.created_at = latest.max_created
       where s.status = 'published'
       order by s.created_at desc`
    )
    rows = result.map((row) => ({
      ...row,
      skill_url: `${baseUrl}/api/skills/${row.id}/skill`,
      run_url: `${baseUrl}/v1/skills/${row.slug}/versions/${row.version}/run`
    }))
  } else {
    const [result] = await pool.query(
      'select id, name, description, category, slug, version, repo_url, source_path, compatibility, runtime, provider, license, license_url, entrypoint, review_tier from skills where status = ? order by created_at desc',
      ['published']
    )
    rows = result.map((row) => ({
      ...row,
      skill_url: `${baseUrl}/api/skills/${row.id}/skill`,
      run_url: `${baseUrl}/v1/skills/${row.slug}/versions/${row.version}/run`
    }))
  }
  res.json({
    service: 'skill-share-mcp',
    updatedAt: new Date().toISOString(),
    skills: rows
  })
}))

const ensureColumn = async (name, definition) => {
  const [rows] = await pool.query(
    `select count(*) as count
     from information_schema.columns
     where table_schema = database() and table_name = 'skills' and column_name = ?`,
    [name]
  )
  if (rows[0]?.count === 0) {
    await pool.query(`alter table skills add column ${name} ${definition}`)
  }
}

const ensureUniqueIndex = async (name, columns) => {
  const [rows] = await pool.query(
    `select count(*) as count
     from information_schema.statistics
     where table_schema = database() and table_name = 'skills' and index_name = ?`,
    [name]
  )
  if (rows[0]?.count === 0) {
    await pool.query(`create unique index ${name} on skills (${columns})`)
  }
}

const init = async () => {
  await pool.query(`
    create table if not exists skills (
      id int auto_increment primary key,
      name varchar(255) not null,
      slug varchar(255) not null,
      version varchar(64) not null default '1.0.0',
      description varchar(1024) not null,
      category varchar(255) not null,
      content longtext not null,
      status varchar(32) not null,
      repo_url varchar(1024),
      source_path varchar(1024),
      compatibility varchar(255),
      runtime varchar(255),
      provider varchar(255),
      license varchar(255),
      license_url varchar(1024),
      entrypoint varchar(1024),
      created_at datetime not null,
      updated_at datetime not null
    )
  `)
  await ensureColumn('repo_url', 'varchar(1024)')
  await ensureColumn('source_path', 'varchar(1024)')
  await ensureColumn('version', "varchar(64) not null default '1.0.0'")
  await ensureColumn('compatibility', 'varchar(255)')
  await ensureColumn('runtime', 'varchar(255)')
  await ensureColumn('provider', 'varchar(255)')
  await ensureColumn('license', 'varchar(255)')
  await ensureColumn('license_url', 'varchar(1024)')
  await ensureColumn('entrypoint', 'varchar(1024)')
  await ensureColumn('install_count', 'int not null default 0')
  await ensureColumn('view_count', 'int not null default 0')
  await ensureColumn('review_note', 'varchar(500)')
  await ensureColumn('reviewed_at', 'datetime')
  await ensureColumn('review_tier', "varchar(16) not null default 'none'")
  await ensureColumn('ai_reviewed_at', 'datetime')
  await ensureColumn('submitter_id', 'int')
  await ensureColumn('review_count', 'int not null default 0')
  await ensureColumn('avg_rating', 'decimal(3,2) default null')
  await pool.query("update skills set review_tier = 'human' where reviewed_at is not null and (review_tier is null or review_tier = 'none')")
  await pool.query("update skills set version = '1.0.0' where version is null or version = ''")
  const [slugIndex] = await pool.query(
    `select count(*) as count
     from information_schema.statistics
     where table_schema = database() and table_name = 'skills' and index_name = 'slug' and non_unique = 0`
  )
  if (slugIndex[0]?.count) {
    await pool.query('alter table skills drop index slug')
  }
  await ensureUniqueIndex('slug_version', 'slug, version')

  // 创建管理员表
  await pool.query(`
    create table if not exists admins (
      id int auto_increment primary key,
      username varchar(64) not null unique,
      password_hash varchar(255) not null,
      created_at datetime not null,
      last_login_at datetime
    )
  `)

  // 创建审计日志表
  await pool.query(`
    create table if not exists audit_logs (
      id int auto_increment primary key,
      admin_id int not null,
      action varchar(64) not null,
      target_type varchar(32) not null,
      target_id int not null,
      detail json,
      created_at datetime not null,
      foreign key (admin_id) references admins(id)
    )
  `)

  // 创建标签表
  await pool.query(`
    create table if not exists tags (
      id int auto_increment primary key,
      name varchar(64) not null unique,
      use_count int not null default 0
    )
  `)
  await pool.query(`
    create table if not exists skill_tags (
      skill_id int not null,
      tag_id int not null,
      primary key (skill_id, tag_id),
      foreign key (skill_id) references skills(id) on delete cascade,
      foreign key (tag_id) references tags(id) on delete cascade
    )
  `)

  // 创建用户表
  await pool.query(`
    create table if not exists users (
      id int auto_increment primary key,
      username varchar(64) not null unique,
      email varchar(255) not null unique,
      password_hash varchar(255) not null,
      avatar_url varchar(1024),
      bio varchar(500),
      status varchar(32) not null default 'active',
      created_at datetime not null,
      last_login_at datetime
    )
  `)

  // 创建评论/评分表
  await pool.query(`
    create table if not exists skill_reviews (
      id int auto_increment primary key,
      skill_id int not null,
      user_id int,
      rating tinyint not null,
      comment varchar(500),
      created_at datetime not null,
      foreign key (skill_id) references skills(id) on delete cascade,
      foreign key (user_id) references users(id) on delete set null
    )
  `)

  // 创建举报表
  await pool.query(`
    create table if not exists skill_reports (
      id int auto_increment primary key,
      skill_id int not null,
      reporter_id int,
      reason varchar(32) not null,
      detail text,
      reporter_contact varchar(255),
      status varchar(32) not null default 'open',
      created_at datetime not null,
      resolved_at datetime,
      foreign key (skill_id) references skills(id) on delete cascade,
      foreign key (reporter_id) references users(id) on delete set null
    )
  `)
  const [reportCol] = await pool.query(
    `select count(*) as count from information_schema.columns where table_schema = database() and table_name = 'skill_reports' and column_name = 'reporter_contact'`
  )
  if (reportCol[0]?.count === 0) {
    await pool.query('alter table skill_reports add column reporter_contact varchar(255)')
  }

  // 若无管理员账号，自动创建默认账号（账号：admin，密码：admin123，上线前必须修改）
  const [adminRows] = await pool.query('select count(*) as count from admins')
  if (adminRows[0]?.count === 0) {
    const defaultPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'admin123'
    const hash = await bcrypt.hash(defaultPassword, 10)
    await pool.query(
      'insert into admins (username, password_hash, created_at) values (?, ?, now())',
      ['admin', hash]
    )
    console.log(`[INIT] 已创建默认管理员账号: admin / ${defaultPassword} （请立即修改密码！）`)
  }

  const port = Number(process.env.PORT) || 3100
  app.listen(port, () => {
    console.log(`Skill server running at http://localhost:${port}`)
  })
}

init()
