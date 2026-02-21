'use strict'

const fs = require('fs/promises')
const path = require('path')
const os = require('os')
const { execFile, spawn } = require('child_process')
const { promisify } = require('util')

const execFileAsync = promisify(execFile)

const sandboxEnabled = () =>
  String(process.env.SANDBOX_ENABLED || 'false').toLowerCase() === 'true'

const getSandboxImage = (runtime) => {
  const key = `SANDBOX_IMAGE_${runtime}`
  const val = process.env[key]
  if (val) return val
  if (runtime === 'python') return process.env.SANDBOX_IMAGE_python || 'python:3.11-slim'
  if (runtime === 'node') return process.env.SANDBOX_IMAGE_node || 'node:20-slim'
  if (runtime === 'bash') return process.env.SANDBOX_IMAGE_bash || 'bash:5'
  return 'python:3.11-slim'
}

const getSandboxMemory = () => process.env.SANDBOX_MEMORY || '256m'
const getSandboxCpus = () => process.env.SANDBOX_CPUS || '0.5'
const getSandboxNetwork = () => process.env.SANDBOX_NETWORK || 'none'

const parseJsonSafe = (value) => {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

const fileExists = async (target) => {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

const readJsonIfExists = async (target) => {
  if (!(await fileExists(target))) return null
  const text = await fs.readFile(target, 'utf-8')
  return parseJsonSafe(text)
}

const createTempDir = async () => fs.mkdtemp(path.join(os.tmpdir(), 'skill-run-'))

const removeDir = async (dir) => {
  if (!dir) return
  await fs.rm(dir, { recursive: true, force: true })
}

const cloneRepo = async (repoUrl, dest) => {
  await execFileAsync('git', ['clone', '--depth', '1', repoUrl, dest], { timeout: 60000 })
}

const resolveWorkdir = (repoDir, sourcePath) => {
  if (!sourcePath) return repoDir
  const dir = path.dirname(sourcePath)
  return path.join(repoDir, dir)
}

const resolveEntrypoint = (workdir, entrypoint) => {
  const target = path.isAbsolute(entrypoint) ? entrypoint : path.join(workdir, entrypoint)
  const normalizedWorkdir = path.resolve(workdir)
  const normalizedTarget = path.resolve(target)
  if (!normalizedTarget.startsWith(`${normalizedWorkdir}${path.sep}`) && normalizedTarget !== normalizedWorkdir) {
    return ''
  }
  return normalizedTarget
}

const normalizeRuntime = (value, entrypoint) => {
  const runtime = String(value || '').trim().toLowerCase()
  if (runtime) return runtime
  const target = String(entrypoint || '').trim().toLowerCase()
  if (target.startsWith('http://') || target.startsWith('https://')) return 'http'
  if (target.endsWith('.py')) return 'python'
  if (target.endsWith('.js') || target.endsWith('.cjs') || target.endsWith('.mjs')) return 'node'
  if (target.endsWith('.sh')) return 'bash'
  return ''
}

const detectEntrypoint = async (workdir, runtime) => {
  const pythonCandidates = ['main.py', 'app.py', 'run.py']
  const nodeCandidates = ['index.js', 'main.js', 'app.js']
  const bashCandidates = ['run.sh', 'entrypoint.sh']
  const tryCandidates = async (candidates) => {
    for (const candidate of candidates) {
      if (await fileExists(path.join(workdir, candidate))) return candidate
    }
    return ''
  }
  if (runtime === 'python') return { runtime, entrypoint: await tryCandidates(pythonCandidates) }
  if (runtime === 'node') return { runtime, entrypoint: await tryCandidates(nodeCandidates) }
  if (runtime === 'bash') return { runtime, entrypoint: await tryCandidates(bashCandidates) }
  const python = await tryCandidates(pythonCandidates)
  if (python) return { runtime: 'python', entrypoint: python }
  const node = await tryCandidates(nodeCandidates)
  if (node) return { runtime: 'node', entrypoint: node }
  const bash = await tryCandidates(bashCandidates)
  if (bash) return { runtime: 'bash', entrypoint: bash }
  return { runtime: '', entrypoint: '' }
}

/** 解析 SKILL.md frontmatter，返回技能元信息（合并了 server 和 runner 两版解析逻辑）。 */
const parseSkillMarkdown = (content) => {
  let name = ''
  let skillId = ''
  let description = ''
  let category = '未分类'
  let version = '1.0.0'
  let compatibility = ''
  let runtime = ''
  let provider = ''
  let license = ''
  let licenseUrl = ''
  let entrypoint = ''
  let tags = []
  const trimmed = content.trim()
  if (trimmed.startsWith('---')) {
    const lines = trimmed.split('\n')
    let endIndex = -1
    for (let i = 1; i < lines.length; i += 1) {
      if (lines[i].trim() === '---') { endIndex = i; break }
    }
    if (endIndex > 1) {
      lines.slice(1, endIndex).forEach((line) => {
        const [rawKey, ...rest] = line.split(':')
        if (!rawKey || rest.length === 0) return
        const key = rawKey.trim().toLowerCase().replace(/-/g, '_')
        const value = rest.join(':').trim()
        if (key === 'name') name = value
        if (key === 'description') description = value
        if (key === 'category') category = value || category
        if (key === 'version') version = value || version
        if (key === 'compatibility' || key === 'platform') compatibility = value
        if (key === 'runtime') runtime = value
        if (key === 'provider') provider = value
        if (key === 'license') license = value
        if (key === 'license_url') licenseUrl = value
        if (key === 'entrypoint' || key === 'run' || key === 'command') entrypoint = value
        if (key === 'id') skillId = value.trim()
        if (key === 'tags') {
          try {
            const parsed = value.includes('[') ? JSON.parse(value) : value.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean)
            tags = Array.isArray(parsed) ? parsed : (typeof parsed === 'string' ? [parsed] : [])
          } catch {}
        }
      })
    }
  }
  if (!name) {
    const match = content.match(/^#\s+(.+)$/m)
    if (match) name = match[1].trim()
  }
  if (!description) {
    const firstText = content.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('#') && l !== '---')
    if (firstText) description = firstText.slice(0, 120)
  }
  const id = skillId && /^[a-z0-9][a-z0-9-]*$/.test(skillId) ? skillId : ''
  return {
    name: name || '未命名技能',
    id,
    description: description || '暂无简介',
    category,
    version: String(version || '1.0.0'),
    compatibility,
    runtime,
    provider,
    license,
    license_url: licenseUrl,
    entrypoint,
    tags: Array.isArray(tags) ? tags : []
  }
}

/**
 * 检查 HTTP 目标是否在白名单内。
 * @param {string} url
 * @param {string[]} allowedHttpHosts  允许的 host 列表，空数组表示不限制
 */
const isAllowedHttpTarget = (url, allowedHttpHosts = []) => {
  if (!url) return false
  if (!allowedHttpHosts.length) return true
  try {
    const parsed = new URL(url)
    return allowedHttpHosts.includes(parsed.host)
  } catch {
    return false
  }
}

/**
 * 执行 HTTP 类型技能。
 * @param {string} entrypoint
 * @param {*} payload  { input, context, options }
 * @param {string[]} [allowedHttpHosts]
 */
const executeHttpSkill = async (entrypoint, payload, allowedHttpHosts = []) => {
  if (!isAllowedHttpTarget(entrypoint, allowedHttpHosts)) {
    return { status: 'error', output: { message: '执行入口不在允许范围内' }, logs: [], artifacts: [] }
  }
  const response = await fetch(entrypoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  const text = await response.text()
  const json = parseJsonSafe(text)
  return {
    status: response.ok ? 'success' : 'error',
    output: json ?? { text },
    logs: [],
    artifacts: []
  }
}

/**
 * 在 Docker 沙箱中执行技能。
 */
const executeInSandbox = async ({
  tempDir, workdir, runtime, entrypoint, input, context, options,
  maxTimeoutMs = 30000, allowInstall = true
}) => {
  const timeoutMs = Math.min(maxTimeoutMs, Math.max(1000, Number(options?.timeoutMs) || 30000))
  const workspaceMount = path.resolve(tempDir)
  const image = getSandboxImage(runtime)
  const memory = getSandboxMemory()
  const cpus = getSandboxCpus()
  const network = getSandboxNetwork()

  let command, args
  if (runtime === 'python') {
    command = process.env.PYTHON || 'python3'
    args = [entrypoint]
  } else if (runtime === 'node') {
    command = process.env.NODE || 'node'
    args = [entrypoint]
  } else if (runtime === 'bash') {
    command = process.env.BASH || 'bash'
    args = [entrypoint]
  } else {
    return { status: 'error', output: { message: '不支持的运行时' }, logs: [], artifacts: [] }
  }

  const relWorkdir = path.relative(tempDir, workdir).replace(/\\/g, '/')
  const containerWorkdir = relWorkdir ? `/workspace/${relWorkdir}` : '/workspace'
  const shouldInstall = allowInstall && (options?.install === true || options?.installDeps === true)

  let runCmd = ''
  if (runtime === 'python' && shouldInstall) {
    const reqPath = path.join(workdir, 'requirements.txt')
    if (await fileExists(reqPath)) {
      runCmd = `pip install -r requirements.txt -q 2>/dev/null || true; `
    }
  }
  if (runtime === 'node' && shouldInstall) {
    const pkgPath = path.join(workdir, 'package.json')
    if (await fileExists(pkgPath)) {
      runCmd = `npm install --omit=dev 2>/dev/null || true; `
    }
  }
  runCmd += `${command} ${args.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`

  const dockerArgs = [
    'run', '--rm',
    '--network', network,
    '--memory', memory,
    '--cpus', cpus,
    '--read-only',
    '-v', `${workspaceMount}:/workspace`,
    '-w', containerWorkdir,
    image,
    'sh', '-c', runCmd
  ]

  return new Promise((resolve) => {
    const proc = spawn('docker', dockerArgs, {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    proc.stdout?.on('data', (chunk) => { stdout += chunk.toString() })
    proc.stderr?.on('data', (chunk) => { stderr += chunk.toString() })

    const timer = setTimeout(() => {
      proc.kill('SIGKILL')
      proc.killed = true
    }, timeoutMs)

    proc.on('close', async (code, signal) => {
      clearTimeout(timer)
      const outputFile = await readJsonIfExists(path.join(workdir, 'output.json'))
      const artifactsFile = await readJsonIfExists(path.join(workdir, 'artifacts.json'))
      const output = outputFile || { text: stdout, stderr }
      const artifacts = Array.isArray(artifactsFile) ? artifactsFile : []
      const status = code === 0 && !signal ? 'success' : 'error'
      resolve({ status, output, logs: stderr ? [stderr] : [], artifacts })
    })
    proc.on('error', (err) => {
      clearTimeout(timer)
      resolve({
        status: 'error',
        output: { message: err.message || 'Docker 执行失败' },
        logs: [],
        artifacts: []
      })
    })
  })
}

/**
 * 执行技能（自动分发到 HTTP、沙箱或宿主机执行），返回 { status, output, logs, artifacts }。
 * @param {object}   params
 * @param {string}   [params.repoUrl]
 * @param {string}   [params.sourcePath]
 * @param {string}   [params.runtime]
 * @param {string}   [params.entrypoint]
 * @param {*}        [params.input]
 * @param {*}        [params.context]
 * @param {*}        [params.options]
 * @param {number}   [params.maxTimeoutMs]
 * @param {boolean}  [params.allowInstall]
 * @param {string[]} [params.allowedHttpHosts]
 */
const executeLocalSkill = async ({
  repoUrl, sourcePath, runtime, entrypoint, input, context, options,
  maxTimeoutMs = 30000, allowInstall = true, allowedHttpHosts = []
}) => {
  // HTTP 技能直接转发
  if (runtime === 'http' || (!runtime && entrypoint && (entrypoint.startsWith('http://') || entrypoint.startsWith('https://')))) {
    if (!entrypoint) return { status: 'error', output: { message: '未配置执行入口' }, logs: [], artifacts: [] }
    return executeHttpSkill(entrypoint, { input, context, options }, allowedHttpHosts)
  }
  if (!repoUrl) {
    return { status: 'error', output: { message: '缺少 repo_url，无法执行' }, logs: [], artifacts: [] }
  }
  const tempDir = await createTempDir()
  let workdir = tempDir
  try {
    const repoDir = path.join(tempDir, 'repo')
    await cloneRepo(repoUrl, repoDir)
    workdir = resolveWorkdir(repoDir, sourcePath)
    await fs.mkdir(workdir, { recursive: true })
    if (!entrypoint || !runtime) {
      const detected = await detectEntrypoint(workdir, runtime)
      if (!runtime) runtime = detected.runtime
      if (!entrypoint) entrypoint = detected.entrypoint
    }
    if (!runtime) return { status: 'error', output: { message: '未配置可执行运行时' }, logs: [], artifacts: [] }
    if (!entrypoint) return { status: 'error', output: { message: '未配置执行入口' }, logs: [], artifacts: [] }

    const inputPath = path.join(workdir, 'input.json')
    const contextPath = path.join(workdir, 'context.json')
    const optionsPath = path.join(workdir, 'options.json')
    await fs.writeFile(inputPath, JSON.stringify(input ?? null, null, 2))
    await fs.writeFile(contextPath, JSON.stringify(context ?? null, null, 2))
    await fs.writeFile(optionsPath, JSON.stringify(options ?? null, null, 2))
    const env = { ...process.env, SKILL_INPUT: inputPath, SKILL_CONTEXT: contextPath, SKILL_OPTIONS: optionsPath }

    const entryPath = resolveEntrypoint(workdir, entrypoint)
    if (!entryPath) return { status: 'error', output: { message: '执行入口无效' }, logs: [], artifacts: [] }

    if (sandboxEnabled()) {
      return await executeInSandbox({
        tempDir, workdir, runtime, entrypoint, input, context, options,
        maxTimeoutMs, allowInstall
      })
    }

    const shouldInstall = allowInstall && (options?.install === true || options?.installDeps === true)
    if (shouldInstall && runtime === 'python') {
      const req = path.join(workdir, 'requirements.txt')
      if (await fileExists(req)) {
        await execFileAsync(process.env.PYTHON || 'python3', ['-m', 'pip', 'install', '-r', req],
          { cwd: workdir, timeout: 120000, maxBuffer: 2 * 1024 * 1024, env })
      }
    }
    if (shouldInstall && runtime === 'node') {
      const pkg = path.join(workdir, 'package.json')
      if (await fileExists(pkg)) {
        await execFileAsync('npm', ['install', '--omit=dev'],
          { cwd: workdir, timeout: 120000, maxBuffer: 2 * 1024 * 1024, env })
      }
    }

    let command, args
    if (runtime === 'python') { command = process.env.PYTHON || 'python3'; args = [entryPath] }
    else if (runtime === 'node') { command = process.env.NODE || 'node'; args = [entryPath] }
    else if (runtime === 'bash') { command = process.env.BASH || 'bash'; args = [entryPath] }
    else return { status: 'error', output: { message: '不支持的运行时' }, logs: [], artifacts: [] }

    let stdout = '', stderr = '', status = 'success'
    try {
      const timeoutMs = Math.min(maxTimeoutMs, Math.max(1000, Number(options?.timeoutMs) || 30000))
      const result = await execFileAsync(command, args, { cwd: workdir, timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024, env })
      stdout = result.stdout || ''
      stderr = result.stderr || ''
    } catch (error) {
      status = 'error'
      stdout = error.stdout || ''
      stderr = error.stderr || error.message || ''
    }
    const outputFile = await readJsonIfExists(path.join(workdir, 'output.json'))
    const artifactsFile = await readJsonIfExists(path.join(workdir, 'artifacts.json'))
    const output = outputFile || { text: stdout, stderr }
    const artifacts = Array.isArray(artifactsFile) ? artifactsFile : []
    return { status, output, logs: stderr ? [stderr] : [], artifacts }
  } finally {
    await removeDir(tempDir)
  }
}

module.exports = {
  parseJsonSafe,
  fileExists,
  readJsonIfExists,
  createTempDir,
  removeDir,
  cloneRepo,
  resolveWorkdir,
  resolveEntrypoint,
  normalizeRuntime,
  detectEntrypoint,
  parseSkillMarkdown,
  isAllowedHttpTarget,
  executeHttpSkill,
  executeLocalSkill
}

