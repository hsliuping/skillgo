'use strict'

const AGENT_SKILLS_BASE = 'https://agent-skills.md'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 从 HTML 中提取 /skills/owner/repo/skill-name 链接 */
function extractSkillUrls(html) {
  const seen = new Set()
  const re = /\/skills\/([^/"'<>?\s]+)\/([^/"'<>?\s]+)\/([^/"'<>?\s]+)/g
  const results = []
  let m
  while ((m = re.exec(html)) !== null) {
    const key = `${m[1]}/${m[2]}/${m[3]}`
    if (!seen.has(key)) {
      seen.add(key)
      results.push({ owner: m[1], repo: m[2], skillName: m[3] })
    }
  }
  return results
}

/** 构建 GitHub 导入 URL */
function toImportUrl({ owner, repo, skillName }) {
  return `https://github.com/${owner}/${repo}/tree/HEAD/skills/${skillName}`
}

/** 抓取一页 */
async function fetchPage(pageNum) {
  const url = pageNum <= 1 ? `${AGENT_SKILLS_BASE}/` : `${AGENT_SKILLS_BASE}/?page=${pageNum}`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'SkillGo-Crawler/1.0 (https://skillgo.cn)' }
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

/**
 * 执行爬取并导入
 * @param {object} options
 * @param {string} options.apiBase - SkillGo API 地址
 * @param {number} options.pages - 爬取页数
 * @param {number} options.delayMs - 每页间隔
 * @param {function} [options.onProgress] - 进度回调 (msg) => void
 * @returns {{ total, imported, skipped, failed, skills: string[] }}
 */
async function runCrawl({ apiBase = 'http://localhost:3100', pages = 5, delayMs = 2000, onProgress = () => {} }) {
  const log = (msg) => {
    onProgress(msg)
    console.log(`[CRAWL] ${msg}`)
  }
  const allSkills = new Map()
  for (let p = 1; p <= pages; p++) {
    try {
      const html = await fetchPage(p)
      const skills = extractSkillUrls(html)
      for (const s of skills) {
        const key = `${s.owner}/${s.repo}/${s.skillName}`
        if (!allSkills.has(key)) allSkills.set(key, s)
      }
      log(`第 ${p}/${pages} 页: ${skills.length} 个，累计 ${allSkills.size}`)
    } catch (err) {
      log(`第 ${p} 页失败: ${err.message}`)
    }
    if (p < pages) await sleep(delayMs)
  }
  const list = [...allSkills.values()]
  log(`共 ${list.length} 个唯一技能，开始导入...`)
  let imported = 0
  let skipped = 0
  let failed = 0
  for (let i = 0; i < list.length; i++) {
    const s = list[i]
    const url = toImportUrl(s)
    try {
      const res = await fetch(`${apiBase}/api/skills/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: url })
      })
      const result = await res.json().catch(() => ({}))
      if (res.ok) {
        imported += result.imported || 0
        skipped += result.skipped || 0
      } else {
        failed += 1
      }
    } catch {
      failed += 1
    }
    if ((i + 1) % 10 === 0) log(`进度 ${i + 1}/${list.length}`)
    await sleep(300)
  }
  log(`完成: 导入 ${imported}, 跳过 ${skipped}, 失败 ${failed}`)
  return { total: list.length, imported, skipped, failed, skills: list.map((s) => toImportUrl(s)) }
}

module.exports = { runCrawl, extractSkillUrls, toImportUrl, fetchPage }
