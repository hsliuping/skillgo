require('dotenv').config()
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const {
  normalizeRuntime,
  parseSkillMarkdown,
  executeLocalSkill
} = require('../lib/executor')

const app = express()
app.use(helmet())
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : ['http://localhost:5173'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}))
app.use(express.json({ limit: '1mb' }))

const mcpBaseUrl = String(process.env.MCP_BASE_URL || 'http://localhost:3100').replace(/\/+$/, '')
const maxTimeoutMs = Math.max(1000, Number(process.env.RUN_MAX_TIMEOUT_MS || 30000))
const allowInstall = String(process.env.RUN_ALLOW_INSTALL || 'true').toLowerCase() !== 'false'
const allowedHttpHosts = String(process.env.RUN_HTTP_ALLOWED_HOSTS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)

const asyncHandler = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}`, err)
    res.status(500).json({
      message: process.env.NODE_ENV === 'development' ? err.message : '服务器错误'
    })
  })

const fetchJson = async (url) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error('无法获取技能列表')
  return response.json()
}

const fetchText = async (url) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error('无法下载技能文件')
  return response.text()
}

const getSkillList = async (latest) => {
  const url = `${mcpBaseUrl}/mcp/skills${latest ? '?latest=true' : ''}`
  const data = await fetchJson(url)
  return Array.isArray(data?.skills) ? data.skills : []
}

const findSkill = async (slug, version) => {
  if (!version) {
    const skills = await getSkillList(true)
    return skills.find((skill) => skill.slug === slug) || null
  }
  const skills = await getSkillList(false)
  return skills.find((skill) => skill.slug === slug && String(skill.version) === String(version)) || null
}

app.get('/health', asyncHandler(async (req, res) => {
  res.json({ status: 'ok' })
}))

app.post('/run', asyncHandler(async (req, res) => {
  const slug = String(req.body?.slug || '').trim()
  const version = String(req.body?.version || '').trim()
  if (!slug) {
    res.status(400).json({ message: '请提供 slug' })
    return
  }
  const skill = await findSkill(slug, version)
  if (!skill) {
    res.status(404).json({ message: '技能不存在' })
    return
  }
  const input = req.body?.input ?? null
  const context = req.body?.context ?? null
  const options = req.body?.options ?? null
  let runtime = normalizeRuntime(skill.runtime, skill.entrypoint)
  let entrypoint = String(skill.entrypoint || '').trim()
  if (skill.skill_url) {
    const markdown = await fetchText(skill.skill_url)
    const parsed = parseSkillMarkdown(markdown)
    if (!runtime) runtime = normalizeRuntime(parsed.runtime, parsed.entrypoint)
    if (!entrypoint) entrypoint = parsed.entrypoint
  }
  const result = await executeLocalSkill({
    repoUrl: skill.repo_url,
    sourcePath: skill.source_path,
    runtime,
    entrypoint,
    input,
    context,
    options,
    maxTimeoutMs,
    allowInstall,
    allowedHttpHosts
  })
  res.json({
    status: result.status,
    skill: { slug: skill.slug, version: skill.version, name: skill.name },
    output: result.output,
    logs: result.logs,
    artifacts: result.artifacts
  })
}))

const port = Number(process.env.RUNNER_PORT || process.env.PORT || 3200)
app.listen(port, () => {
  console.log(`Skill runner running at http://localhost:${port}`)
})
