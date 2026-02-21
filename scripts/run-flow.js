#!/usr/bin/env node
'use strict'

/**
 * 完整流程测试脚本
 * 用法: node scripts/run-flow.js
 */

require('dotenv').config()

const BASE = process.env.SKILLGO_API_BASE || 'http://localhost:3100'

const fetch = (url, opts = {}) => {
  const u = url.startsWith('http') ? url : `${BASE}${url}`
  return globalThis.fetch(u, {
    ...opts,
    headers: opts.body ? { 'Content-Type': 'application/json', ...opts.headers } : opts.headers
  }).then((r) => (opts.raw ? r : r.json().catch(() => ({}))))
}

const log = (step, msg, data) => {
  console.log(`\n[${step}] ${msg}`)
  if (data !== undefined) console.log(JSON.stringify(data, null, 2).slice(0, 500))
}

async function main() {
  console.log('=== SkillGo 完整流程测试 ===')
  console.log(`API: ${BASE}`)

  // 1. 健康检查
  try {
    const health = await fetch('/api/health')
    log('1', '健康检查', health)
    if (health?.status !== 'ok') throw new Error('健康检查失败')
  } catch (e) {
    console.error('服务未启动，请先运行: npm run dev:server')
    process.exit(1)
  }

  // 2. 管理员登录
  const loginRes = await fetch('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  })
  if (!loginRes?.token) {
    log('2', '登录失败', loginRes)
    process.exit(1)
  }
  log('2', '管理员登录成功', { username: loginRes.username })
  const token = loginRes.token

  const auth = (opts = {}) => ({
    ...opts,
    headers: { ...opts.headers, Authorization: `Bearer ${token}` }
  })

  // 3. 获取技能列表
  const skillsRes = await fetch('/api/skills?pageSize=5')
  log('3', '技能列表', { total: skillsRes.total, items: skillsRes.items?.length })

  // 4. 提交一个技能（不依赖外部网络）
  const ts = Date.now()
  const skillContent = `---
name: 流程测试-${ts}
description: 流程测试用技能
category: 测试
version: 1.0.0
---
# 流程测试技能
这是完整流程测试创建的技能。`
  try {
    const submitRes = await fetch('/api/skills', auth({
      method: 'POST',
      body: JSON.stringify({
        name: `流程测试技能-${ts}`,
        description: '由 run-flow.js 创建的测试技能',
        category: '测试',
        content: skillContent
      })
    }))
    log('4', '提交技能', submitRes)
  } catch (e) {
    log('4', '提交技能', e.message)
  }

  // 5. 再次获取列表（应能看到刚提交的技能）
  const skillsRes2 = await fetch('/api/skills?pageSize=5')
  log('5', '技能列表', { total: skillsRes2.total, 首条: skillsRes2.items?.[0]?.name })

  // 6. 若有 pending 技能则通过审核
  const pendingRes = await fetch('/api/skills?status=pending&pageSize=1')
  if (pendingRes?.items?.length) {
    const skillId = pendingRes.items[0].id
    await fetch(`/api/skills/${skillId}/status`, auth({
      method: 'PATCH',
      body: JSON.stringify({ status: 'published' })
    }))
    log('6', '审核通过', { skillId })
  }

  // 7. 审核队列
  const queueRes = await fetch('/api/admin/review-queue', auth({ method: 'GET' }))
  log('7', '审核队列', { count: queueRes?.length })

  // 8. 触发爬虫（后台，可选）
  try {
    const crawlRes = await fetch('/api/admin/crawl-agent-skills', auth({
      method: 'POST',
      body: JSON.stringify({ pages: 1, delayMs: 1000 })
    }))
    log('8', '爬虫已启动', crawlRes)
  } catch (e) {
    log('8', '爬虫', e.message)
  }

  console.log('\n=== 流程测试完成 ===')
  console.log('\n下一步:')
  console.log('  1. 启动前端: npm run dev:web')
  console.log('  2. 访问 http://localhost:5173')
  console.log('  3. 管理员登录 /admin-login (admin / admin123)')
  console.log('  4. 审核队列、爬取 agent-skills.md、AI 审核等')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
