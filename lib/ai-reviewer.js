'use strict'

const { executeLocalSkill, normalizeRuntime } = require('./executor')

const aiReviewEnabled = () => Boolean(process.env.ZHIPU_API_KEY)

const SYSTEM_PROMPT = `你是一个技能安全审核助手。请分析以下 Cursor Skill 的 SKILL.md 内容，判断是否安全、合规、可发布。

检查要点：
1. 是否包含明显恶意指令（如窃取密钥、执行 rm -rf、反弹 shell、读取敏感文件等）
2. 是否包含垃圾广告、钓鱼链接
3. 描述是否清晰、用途是否合理
4. 是否有明显违反平台规则的内容

请用 JSON 格式回复，且仅返回 JSON，不要其他文字：
{"pass": true/false, "reason": "简短理由"}`

/**
 * 使用 LLM 分析 SKILL 内容安全性
 * @param {string} content - SKILL.md 内容
 * @param {string} name - 技能名称
 * @returns {{ pass: boolean, reason: string }}
 */
const analyzeContent = async (content, name = '') => {
  const apiKey = process.env.ZHIPU_API_KEY
  if (!apiKey) {
    return { pass: false, reason: '未配置 ZHIPU_API_KEY，跳过 LLM 分析' }
  }
  const model = process.env.ZHIPU_MODEL || 'glm-4-flash'
  const apiUrl = process.env.ZHIPU_API_URL || 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
  const userContent = `技能名称：${name}\n\n---\n${(content || '').slice(0, 8000)}`
  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent }
        ],
        temperature: 0.2,
        max_tokens: 200
      })
    })
    if (!res.ok) {
      const err = await res.text()
      return { pass: false, reason: `API 调用失败: ${res.status} ${err.slice(0, 100)}` }
    }
    const data = await res.json()
    const text = data.choices?.[0]?.message?.content?.trim() || ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return { pass: false, reason: 'LLM 返回格式无效' }
    }
    const parsed = JSON.parse(jsonMatch[0])
    return {
      pass: Boolean(parsed.pass),
      reason: String(parsed.reason || '').slice(0, 200) || (parsed.pass ? '通过' : '未通过')
    }
  } catch (err) {
    return { pass: false, reason: `分析异常: ${err.message}` }
  }
}

/**
 * 沙箱试跑技能（空 input）
 * @param {object} skill - 技能记录 { repo_url, source_path, runtime, entrypoint }
 * @returns {{ pass: boolean, reason: string }}
 */
const runSandboxTest = async (skill) => {
  const runtime = normalizeRuntime(skill.runtime, skill.entrypoint)
  if (runtime === 'http') {
    return { pass: true, reason: 'HTTP 技能跳过沙箱试跑' }
  }
  if (!skill.repo_url) {
    return { pass: true, reason: '无仓库，跳过试跑' }
  }
  const maxTimeoutMs = Math.min(15000, Number(process.env.AI_REVIEW_RUN_TIMEOUT_MS) || 10000)
  const result = await executeLocalSkill({
    repoUrl: skill.repo_url,
    sourcePath: skill.source_path,
    runtime,
    entrypoint: skill.entrypoint,
    input: {},
    context: {},
    options: { timeoutMs: maxTimeoutMs, install: true },
    maxTimeoutMs,
    allowInstall: true,
    allowedHttpHosts: []
  })
  if (result.status === 'success') {
    return { pass: true, reason: '沙箱试跑成功' }
  }
  const msg = result.output?.message || result.logs?.[0] || '执行失败'
  return { pass: false, reason: `沙箱试跑失败: ${String(msg).slice(0, 150)}` }
}

/**
 * 执行完整 AI 审核：LLM 分析 + 沙箱试跑
 * @param {object} skill - 技能记录
 * @returns {{ pass: boolean, llmResult: object, sandboxResult: object }}
 */
const runAiReview = async (skill) => {
  const llmResult = await analyzeContent(skill.content, skill.name)
  if (!llmResult.pass) {
    return { pass: false, llmResult, sandboxResult: null }
  }
  const sandboxResult = await runSandboxTest(skill)
  if (!sandboxResult.pass) {
    return { pass: false, llmResult, sandboxResult }
  }
  return { pass: true, llmResult, sandboxResult }
}

module.exports = {
  aiReviewEnabled,
  analyzeContent,
  runSandboxTest,
  runAiReview
}
