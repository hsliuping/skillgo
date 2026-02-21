#!/usr/bin/env node
'use strict'

const isDebug = () => process.env.SKILLGO_DEBUG === '1' || process.env.SKILLGO_DEBUG === 'true'
const API_BASE = process.env.SKILLGO_API || 'http://skillgo.cn'

const debug = (...args) => {
  if (isDebug()) console.error('[skillgo]', ...args)
}

const wrapFetch = (fn) => async (...args) => {
  try {
    return await fn(...args)
  } catch (e) {
    if (isDebug()) {
      console.error('[skillgo] 请求失败:', e.message)
      if (e.cause) console.error('[skillgo] cause:', e.cause)
      if (e.stack) console.error('[skillgo] stack:', e.stack)
    }
    const msg = e.message || ''
    const isNetworkErr = msg.includes('fetch failed') || e.cause?.code === 'ECONNREFUSED' || e.cause?.code === 'ENOTFOUND'
    if (isNetworkErr) {
      throw new Error(
        `无法连接 SkillGo API (${API_BASE})。请检查网络或设置 SKILLGO_API`
      )
    }
    throw e
  }
}

const fetchJson = wrapFetch(async (path) => {
  const url = `${API_BASE}${path}`
  debug('GET', url)
  const start = Date.now()
  const res = await fetch(url)
  debug('响应', res.status, `${Date.now() - start}ms`)
  if (!res.ok) throw new Error(`请求失败: ${res.status} ${res.statusText}`)
  return res.json()
})

const fetchText = wrapFetch(async (path) => {
  const url = `${API_BASE}${path}`
  debug('GET', url)
  const start = Date.now()
  const res = await fetch(url)
  debug('响应', res.status, `${Date.now() - start}ms`)
  if (!res.ok) throw new Error(`请求失败: ${res.status} ${res.statusText}`)
  return res.text()
})

const search = async (keyword) => {
  const data = await fetchJson(`/api/skills?status=published&q=${encodeURIComponent(keyword)}&pageSize=20`)
  const items = data.items || []
  if (items.length === 0) {
    console.log('未找到匹配的技能')
    return
  }
  console.log('\n技能列表:')
  items.forEach((s) => {
    console.log(`  ${s.slug}@${s.version} - ${s.name}`)
    console.log(`    ${s.description}`)
  })
}

const fetchRepoDir = async (project, relPath, localDir, branch, isGitee, fs, path) => {
  const apiPath = relPath || (isGitee ? '.' : '')
  let contents = []
  if (isGitee) {
    const apiUrl = `https://gitee.com/api/v5/repos/${project}/contents/${apiPath}`
    debug('获取目录', apiUrl)
    try {
      contents = await fetch(apiUrl).then((r) => (r.ok ? r.json() : []))
    } catch {
      return 0
    }
  } else {
    const apiUrl = `https://api.github.com/repos/${project}/contents/${apiPath}`
    debug('获取目录', apiUrl)
    try {
      const res = await fetch(apiUrl)
      debug('GitHub API 响应', res.status)
      contents = res.ok ? await res.json() : []
      if (!res.ok && isDebug()) debug('GitHub API 错误', res.status, await res.text().catch(() => ''))
    } catch (e) {
      if (isDebug()) debug('GitHub API 异常', e.message)
      return 0
    }
  }
  if (!Array.isArray(contents)) contents = [contents]
  let count = 0
  const filePath = (p, name) => (p ? `${p}/${name}` : name)
  for (const f of contents) {
    const name = f.name
    if (f.type === 'dir') {
      const subRelPath = filePath(relPath, name)
      const subLocalDir = path.join(localDir, name)
      await fs.mkdir(subLocalDir, { recursive: true })
      count += await fetchRepoDir(project, subRelPath, subLocalDir, branch, isGitee, fs, path)
    } else if (f.type === 'file') {
      if (name === 'SKILL.md') continue
      const fullPath = filePath(relPath, name)
      const rawUrl = isGitee
        ? `https://gitee.com/${project}/raw/${branch}/${fullPath}`
        : `https://raw.githubusercontent.com/${project}/${branch}/${fullPath}`
      try {
        const content = await fetch(rawUrl).then((r) => (r.ok ? r.text() : null))
        if (content !== null) {
          await fs.writeFile(path.join(localDir, name), content, 'utf-8')
          debug('已下载', fullPath)
          count += 1
        }
      } catch {}
    }
  }
  return count
}

const fetchRepoFiles = async (repoUrl, sourcePath, dir, fs, path) => {
  const m = repoUrl.match(/github\.com\/([^/]+\/[^/]+?)(?:\/|\.git)?$/i) || repoUrl.match(/gitee\.com\/([^/]+\/[^/]+?)(?:\/|\.git)?$/i)
  if (!m) return 0
  const project = m[1]
  const dirPath = sourcePath.replace(/\/SKILL\.md$/i, '').replace(/^\/+/, '')
  if (!dirPath) return 0
  const isGitee = /gitee\.com/i.test(repoUrl)
  let branch = isGitee ? 'master' : 'main'
  if (!isGitee) {
    try {
      const repoInfo = await fetch(`https://api.github.com/repos/${project}`).then((r) => (r.ok ? r.json() : null))
      if (repoInfo?.default_branch) branch = repoInfo.default_branch
    } catch {}
  }
  return fetchRepoDir(project, dirPath, dir, branch, isGitee, fs, path)
}

const install = async (slug, version, cwd) => {
  debug('install', { slug, version, cwd })
  const fs = await import('fs/promises')
  const path = await import('path')
  let skill
  if (version) {
    let data = await fetchJson(`/api/skills?status=published&slug=${encodeURIComponent(slug)}&version=${encodeURIComponent(version)}`)
    let items = data.items || []
    if (items.length === 0) {
      debug('slug 未匹配，尝试按名称搜索')
      data = await fetchJson(`/api/skills?status=published&q=${encodeURIComponent(slug)}&pageSize=50`)
      items = (data.items || []).filter((s) => s.version === version)
    }
    debug('查询结果:', items.length, '条')
    skill = items[0]
    if (!skill) {
      debug('未找到匹配技能，slug=', slug, 'version=', version)
      console.error(`未找到技能: ${slug}${version ? '@' + version : ''}`)
      process.exit(1)
    }
  } else {
    debug('从 MCP 获取技能列表')
    const all = await fetchJson('/mcp/skills?latest=true')
    const skills = all.skills || []
    debug('MCP 返回', skills.length, '个技能')
    skill = skills.find((s) => s.slug === slug || s.name === slug)
    if (!skill) {
      console.error(`未找到技能: ${slug}`)
      process.exit(1)
    }
  }
  if (skill.review_tier === 'none' || !skill.review_tier) {
    console.warn('警告：该技能未经审核，使用前请自行评估安全风险。')
  }
  const text = await fetchText(`/api/skills/${skill.id}/skill`)
  const dir = path.join(cwd, 'skills', skill.slug)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, 'SKILL.md'), text, 'utf-8')
  let extra = 0
  const detail = await fetchJson(`/api/skills/${skill.id}`)
  const repoUrl = detail.repo_url || skill.repo_url
  const sourcePath = detail.source_path || skill.source_path
  if (repoUrl && sourcePath) {
    extra = await fetchRepoFiles(repoUrl, sourcePath, dir, fs, path)
    if (extra === 0 && isDebug()) {
      debug('fetchRepoFiles 返回 0，repo_url=', repoUrl, 'source_path=', sourcePath)
    }
  } else if (isDebug()) {
    debug('跳过仓库文件下载: repo_url=', repoUrl || '(空)', 'source_path=', sourcePath || '(空)')
  }
  const files = extra > 0 ? ` (含 ${extra} 个代码文件)` : ''
  console.log(`已安装 ${skill.slug}@${skill.version} 到 ${dir}${files}`)
}

const list = async (cwd) => {
  const fs = await import('fs/promises')
  const path = await import('path')
  const skillsDir = path.join(cwd, 'skills')
  try {
    const entries = await fs.readdir(skillsDir, { withFileTypes: true })
    const dirs = entries.filter((e) => e.isDirectory())
    if (dirs.length === 0) {
      console.log('当前目录下未安装任何技能')
      return
    }
    console.log('\n已安装技能:')
    for (const d of dirs) {
      const skillPath = path.join(skillsDir, d.name, 'SKILL.md')
      try {
        await fs.access(skillPath)
        console.log(`  ${d.name}`)
      } catch {}
    }
  } catch (e) {
    if (e.code === 'ENOENT') console.log('当前目录下未安装任何技能')
    else throw e
  }
}

const update = async (cwd) => {
  const fs = await import('fs/promises')
  const path = await import('path')
  const skillsDir = path.join(cwd, 'skills')
  let entries
  try {
    entries = await fs.readdir(skillsDir, { withFileTypes: true })
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.log('当前目录下未安装任何技能')
      return
    }
    throw e
  }
  const dirs = entries.filter((e) => e.isDirectory())
  for (const d of dirs) {
    try {
      const slug = d.name.includes('@') ? d.name.split('@')[0] : d.name
      await install(slug, null, cwd)
    } catch (e) {
      console.error(`更新 ${d.name} 失败:`, e.message)
    }
  }
}

const main = async () => {
  let args = process.argv.slice(2)
  if (args[0] === '--version' || args[0] === '-v') {
    try {
      const fs = await import('fs')
      const path = await import('path')
      const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'))
      console.log('skillgo', pkg.version)
    } catch {
      console.log('skillgo 1.0.2')
    }
    return
  }
  if (args.includes('--debug') || args.includes('-d')) {
    args = args.filter((a) => a !== '--debug' && a !== '-d')
    process.env.SKILLGO_DEBUG = '1'
  }
  if (isDebug()) {
    debug('API_BASE:', process.env.SKILLGO_API || '(默认)', '->', API_BASE)
    debug('命令:', args[0], '参数:', args.slice(1))
  }
  const cmd = args[0]
  const cwd = process.cwd()

  if (cmd === 'search') {
    const keyword = args[1] || ''
    await search(keyword)
    return
  }

  if (cmd === 'install') {
    const spec = args[1]
    if (!spec) {
      console.error('用法: skillgo install <slug>[@version]')
      process.exit(1)
    }
    const at = spec.indexOf('@')
    const slug = at > 0 ? spec.slice(0, at) : spec
    const version = at > 0 ? spec.slice(at + 1) : null
    await install(slug, version, cwd)
    return
  }

  if (cmd === 'list') {
    await list(cwd)
    return
  }

  if (cmd === 'update') {
    if (args[1] === '--all') {
      await update(cwd)
    } else {
      console.log('用法: skillgo update --all')
    }
    return
  }

  console.log(`
SkillGo CLI - 技能管理工具 (https://skillgo.cn)

用法:
  skillgo search <keyword>    搜索技能
  skillgo install <slug>      安装技能到当前目录 skills/
  skillgo install <slug>@<ver> 安装指定版本（支持中文名/slug）
  skillgo list                列出已安装技能
  skillgo update --all        更新所有已安装技能
  skillgo --version           查看版本

选项:
  --debug, -d  调试模式，输出请求详情和错误堆栈

环境变量:
  SKILLGO_API   API 地址，默认 http://skillgo.cn
  SKILLGO_DEBUG 设为 1 启用调试模式
`)
}

main().catch((e) => {
  if (isDebug()) {
    console.error('[skillgo] 错误:', e.message)
    if (e.stack) console.error(e.stack)
  } else {
    console.error(e.message)
  }
  process.exit(1)
})
