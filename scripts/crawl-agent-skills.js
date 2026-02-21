#!/usr/bin/env node
'use strict'

/**
 * 从 https://agent-skills.md/ 爬取技能并导入 SkillGo
 *
 * 用法：
 *   node scripts/crawl-agent-skills.js [--pages=N] [--delay=2000] [--dry-run]
 *
 * 环境变量：
 *   SKILLGO_API_BASE   SkillGo API 地址，默认 http://localhost:3100
 *   CRAWL_PAGES       爬取页数，默认 5
 *   CRAWL_DELAY_MS    每页间隔毫秒，默认 2000
 */

require('dotenv').config()

const { runCrawl, toImportUrl } = require('../lib/crawl-agent-skills')

const BASE = process.env.SKILLGO_API_BASE || 'http://localhost:3100'
const MAX_PAGES = Number(process.env.CRAWL_PAGES || process.argv.find((a) => a.startsWith('--pages='))?.split('=')[1]) || 5
const DELAY_MS = Number(process.env.CRAWL_DELAY_MS || process.argv.find((a) => a.startsWith('--delay='))?.split('=')[1]) || 2000
const DRY_RUN = process.argv.includes('--dry-run')

async function main() {
  console.log(`[CRAWL] agent-skills.md 爬虫`)
  console.log(`[CRAWL] 目标: ${BASE}, 页数: ${MAX_PAGES}, 间隔: ${DELAY_MS}ms, dry-run: ${DRY_RUN}`)
  if (DRY_RUN) {
    const { fetchPage, extractSkillUrls } = require('../lib/crawl-agent-skills')
    const html = await fetchPage(1)
    const skills = extractSkillUrls(html)
    console.log(`[CRAWL] 第1页发现 ${skills.length} 个技能`)
    skills.slice(0, 5).forEach((s) => console.log(`  - ${toImportUrl(s)}`))
    if (skills.length > 5) console.log(`  ... 等 ${skills.length} 个`)
    return
  }
  const result = await runCrawl({
    apiBase: BASE,
    pages: MAX_PAGES,
    delayMs: DELAY_MS
  })
  console.log(`[CRAWL] 完成: 导入 ${result.imported}, 跳过 ${result.skipped}, 失败 ${result.failed}`)
}

main().catch((err) => {
  console.error('[CRAWL]', err)
  process.exit(1)
})
