<template>
  <div class="skill-detail" v-if="skill">
    <div class="detail-layout">
      <!-- 主内容区 -->
      <main class="main-content">
        <div class="actions-row">
          <RouterLink class="btn-back" to="/">← 返回列表</RouterLink>
          <div class="actions-right">
            <a class="btn-primary" :href="downloadHref" @click.prevent="handleDownload">下载 SKILL.md</a>
            <button v-if="!showReportForm" class="btn-ghost" @click="showReportForm = true">举报</button>
          </div>
        </div>

        <!-- 举报表单 -->
        <div v-if="showReportForm" class="report-card">
          <h4>举报此技能</h4>
          <div class="report-field">
            <label>举报原因</label>
            <select v-model="reportReason" class="input">
              <option value="malicious">恶意/有害</option>
              <option value="spam">垃圾/广告</option>
              <option value="duplicate">重复内容</option>
              <option value="other">其他</option>
            </select>
          </div>
          <div class="report-field">
            <label>补充说明（选填）</label>
            <textarea v-model="reportDetail" class="input" placeholder="请描述具体情况..." rows="3"></textarea>
          </div>
          <div class="report-field">
            <label>联系方式（选填）</label>
            <input v-model="reportContact" type="text" class="input" placeholder="邮箱或手机" />
          </div>
          <div class="report-actions">
            <button class="btn-primary" :disabled="reporting" @click="submitReport">{{ reporting ? '提交中...' : '提交举报' }}</button>
            <button class="btn-ghost" @click="showReportForm = false">取消</button>
            <span class="muted">{{ reportMessage }}</span>
          </div>
        </div>

        <!-- 标题区 -->
        <header class="skill-header">
          <h1 class="skill-title">{{ skill.name }}<span v-if="installSlug" class="skill-slug"> ({{ installSlug }})</span></h1>
          <div v-if="skill.repo_url || skill.submitter_username" class="source-author-row">
            <span v-if="skill.submitter_username" class="source-item">
              <span class="source-label">作者</span>
              <RouterLink v-if="skill.submitter_id" :to="`/users/${skill.submitter_id}`" class="source-link">{{ skill.submitter_username }}</RouterLink>
              <span v-else class="source-link">{{ skill.submitter_username }}</span>
            </span>
            <span v-if="skill.repo_url" class="source-item">
              <span class="source-label">来源</span>
              <a :href="skill.repo_url" target="_blank" rel="noreferrer" class="source-link">{{ repoDisplayName }}</a>
            </span>
          </div>
          <div class="meta-row">
            <span v-if="skill.review_tier === 'human'" class="badge badge-reviewed">人工审核</span>
            <span v-else-if="skill.review_tier === 'ai'" class="badge badge-ai">AI审核</span>
            <span v-else class="badge badge-none" title="该技能未经审核，使用前请自行评估安全风险">未审核</span>
            <span class="badge badge-cat">{{ skill.category }}</span>
            <span class="badge badge-ver">v{{ skill.version || '1.0.0' }}</span>
            <span v-for="t in (skill.tags || [])" :key="t" class="badge badge-tag">{{ t }}</span>
            <span class="badge badge-status" :class="statusClass">{{ skill.status }}</span>
          </div>
          <p v-if="skill.avg_rating" class="skill-rating">★ {{ skill.avg_rating }} · {{ skill.review_count || 0 }} 评价</p>
          <p class="skill-desc">{{ skill.description }}</p>
        </header>

        <!-- SKILL.md 内容 -->
        <section v-if="skill.content" class="section skill-content-section">
          <h3 class="section-heading">SKILL.md 文件内容</h3>
          <p class="section-desc">技能完整定义，供 Cursor 等工具加载使用</p>
          <div class="markdown-body skill-file-content" v-html="skillContentHtml"></div>
        </section>

        <!-- 评价与评论 -->
        <section v-if="skill.status === 'published'" class="section reviews-section">
          <h3 class="section-heading">评价与评论</h3>
          <div v-if="!reviewSubmitted" class="review-form">
            <div class="star-row">
              <span class="muted">评分：</span>
              <button v-for="n in 5" :key="n" class="star-btn" :class="{ active: reviewRating >= n }" @click="reviewRating = n">★</button>
            </div>
            <textarea v-model="reviewComment" class="input" placeholder="写下你的使用体验（选填）" rows="2"></textarea>
            <button class="btn-primary" :disabled="reviewSubmitting" @click="submitReview">{{ reviewSubmitting ? '提交中...' : '提交评价' }}</button>
          </div>
          <p v-else class="muted">感谢你的评价！</p>
          <div v-if="reviews.items?.length" class="review-list">
            <div v-for="r in reviews.items" :key="r.id" class="review-item">
              <span class="review-rating">★ {{ r.rating }}</span>
              <span class="review-user">{{ r.username }}</span>
              <span class="review-date muted">{{ formatDate(r.created_at) }}</span>
              <p v-if="r.comment" class="review-comment">{{ r.comment }}</p>
            </div>
          </div>
        </section>

        <!-- 在线试用 -->
        <section v-if="skill.status === 'published'" class="section playground-section">
          <h3 class="section-heading">在线试用</h3>
          <p class="section-desc">填写 input 参数（JSON 格式），点击运行查看结果</p>
          <textarea v-model="playgroundInput" class="input code-input" placeholder='{"text": "hello"}' rows="4" spellcheck="false"></textarea>
          <div class="playground-actions">
            <button class="btn-primary" :disabled="playgroundRunning" @click="runPlayground">
              {{ playgroundRunning ? '运行中...' : '运行' }}
            </button>
            <span class="muted">{{ playgroundMessage }}</span>
          </div>
          <div v-if="playgroundResult" class="playground-result">
            <label>输出</label>
            <pre class="code-block">{{ playgroundResult }}</pre>
          </div>
        </section>
      </main>

      <!-- 侧边栏 -->
      <aside class="sidebar">
        <div class="sidebar-card">
          <h4 class="sidebar-title">安装</h4>
          <div class="install-tabs">
            <button v-for="pm in packageManagers" :key="pm.id" class="install-tab" :class="{ active: installPm === pm.id }" @click="installPm = pm.id">
              {{ pm.id }}
            </button>
          </div>
          <div class="install-command">
            <code>{{ installCommand }}</code>
            <button class="copy-btn" @click="copyInstallCommand" :title="copyDone ? '已复制' : '复制'">
              {{ copyDone ? '✓' : '📋' }}
            </button>
          </div>
          <a class="btn-download" :href="downloadHref" @click.prevent="handleDownload">下载 SKILL.md</a>
        </div>

        <div v-if="skill.submitter_username || repoOwner" class="sidebar-card author-card">
          <h4 class="sidebar-label">AUTHOR</h4>
          <div class="author-block">
            <span class="author-name">{{ skill.submitter_username || repoOwner }}</span>
            <RouterLink v-if="skill.submitter_id" :to="`/users/${skill.submitter_id}`" class="author-link">查看全部技能</RouterLink>
            <a v-else-if="repoOwner && isGitHubRepo" :href="`https://github.com/${repoOwner}`" target="_blank" rel="noreferrer" class="author-link">GitHub →</a>
          </div>
        </div>

        <div v-if="skill.repo_url" class="sidebar-card repo-card">
          <h4 class="sidebar-label">REPOSITORY</h4>
          <div class="repo-block">
            <a :href="repoFullUrl" target="_blank" rel="noreferrer" class="repo-name">
              <svg v-if="isGitHubRepo" class="repo-icon" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
              {{ repoDisplayName }}
            </a>
            <div v-if="repoStats" class="repo-stats">
              <span class="repo-stat"><span class="stat-icon">★</span> {{ formatNumber(repoStats.stargazers_count) }}</span>
              <span class="repo-stat"><span class="stat-icon">⎇</span> {{ formatNumber(repoStats.forks_count) }}</span>
            </div>
            <div v-if="repoStats?.license?.spdx_id || skill.license" class="repo-license">
              {{ repoStats?.license?.spdx_id || skill.license }}
            </div>
          </div>
        </div>

        <div class="sidebar-card">
          <h4 class="sidebar-title">信息</h4>
          <dl class="info-list">
            <dt>slug</dt>
            <dd><code>{{ skill.slug }}</code></dd>
            <dt v-if="skill.runtime">运行时</dt>
            <dd v-if="skill.runtime">{{ skill.runtime }}</dd>
          </dl>
        </div>

        <div class="sidebar-card">
          <h4 class="sidebar-title">API 调用</h4>
          <div class="api-snippet">
            <code>curl -L {{ apiBase }}/api/skills/{{ skill.id }}/skill -o SKILL.md</code>
          </div>
          <div class="api-snippet">
            <code>curl -X POST {{ apiBase }}/v1/skills/{{ skill.slug }}/versions/{{ skill.version }}/run -H "Content-Type: application/json" -d '{"input":{"text":"hello"}}'</code>
          </div>
        </div>
      </aside>
    </div>
  </div>
  <div v-else class="loading-state">
    <span class="muted">加载中...</span>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: true
})
import { fetchJson, apiBase } from '../api'
import { userState } from '../store'

const route = useRoute()
const skill = ref(null)
const showReportForm = ref(false)
const reportReason = ref('other')
const reportDetail = ref('')
const reportContact = ref('')
const reportMessage = ref('')
const reporting = ref(false)
const playgroundInput = ref('{}')
const playgroundRunning = ref(false)
const playgroundMessage = ref('')
const playgroundResult = ref('')
const reviews = ref({ items: [], review_count: 0, avg_rating: null })
const reviewRating = ref(5)
const reviewComment = ref('')
const reviewSubmitted = ref(false)
const reviewSubmitting = ref(false)
const installPm = ref('npm')
const copyDone = ref(false)
const packageManagers = [
  { id: 'pnpm', cmd: 'pnpm dlx skillgo install' },
  { id: 'npm', cmd: 'npx skillgo install' },
  { id: 'yarn', cmd: 'yarn dlx skillgo install' },
  { id: 'bun', cmd: 'bunx skillgo install' }
]

const skillContentHtml = computed(() => {
  let content = skill.value?.content || ''
  if (!content) return ''
  try {
    content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    const html = md.render(content)
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['h1','h2','h3','h4','h5','h6','p','br','strong','em','code','pre','ul','ol','li','blockquote','a','hr','table','thead','tbody','tr','th','td','span','div'],
      ALLOWED_ATTR: ['href','target','rel','class']
    })
  } catch {
    return ''
  }
})

const repoDisplayName = computed(() => {
  const url = skill.value?.repo_url || ''
  if (!url) return ''
  try {
    const m = url.match(/github\.com\/([^/]+\/[^/]+?)(?:\/|\.git)?$/i) || url.match(/gitee\.com\/([^/]+\/[^/]+?)(?:\/|\.git)?$/i) || url.match(/gitlab\.com\/([^/]+\/[^/]+?)(?:\/|\.git)?$/i)
    return m ? m[1] : url.replace(/^https?:\/\//, '').replace(/\.git$/, '')
  } catch {
    return url
  }
})

const isGitHubRepo = computed(() => /github\.com/i.test(skill.value?.repo_url || ''))

const repoOwner = computed(() => {
  const url = skill.value?.repo_url || ''
  const m = url.match(/github\.com\/([^/]+)\//i) || url.match(/gitee\.com\/([^/]+)\//i) || url.match(/gitlab\.com\/([^/]+)\//i)
  return m ? m[1] : ''
})

const repoFullUrl = computed(() => {
  const url = skill.value?.repo_url || ''
  if (!url) return '#'
  return url.startsWith('http') ? url : `https://${url}`
})

const repoStats = ref(null)

const formatNumber = (n) => {
  if (n == null || n === undefined) return '-'
  return Number(n).toLocaleString()
}

const loadRepoStats = async () => {
  const url = skill.value?.repo_url || ''
  const m = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\/|\.git)?$/i)
  if (!m) return
  const [, owner, repo] = m
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: { Accept: 'application/vnd.github.v3+json' }
    })
    if (res.ok) {
      repoStats.value = await res.json()
    }
  } catch {}
}

const installSlug = computed(() => {
  const s = skill.value?.slug || ''
  if (/^[a-z0-9][a-z0-9-]*$/.test(s)) return s
  const path = skill.value?.source_path || ''
  const m = path.match(/\/([^/]+)\/SKILL\.md$/i)
  return m ? m[1] : ''
})

const installCommand = computed(() => {
  if (!skill.value) return ''
  const pm = packageManagers.find((p) => p.id === installPm.value) || packageManagers[1]
  const slug = installSlug.value || skill.value.slug
  const ver = skill.value.version
  return `${pm.cmd} ${slug}@${ver || '1.0.0'}`
})

const copyInstallCommand = async () => {
  try {
    await navigator.clipboard.writeText(installCommand.value)
    copyDone.value = true
    setTimeout(() => { copyDone.value = false }, 1500)
  } catch {}
}

const statusClass = computed(() => {
  if (!skill.value) return ''
  if (skill.value.status === 'published') return 'status-published'
  if (skill.value.status === 'rejected') return 'status-rejected'
  return 'status-pending'
})

const formatDate = (d) => (d ? new Date(d).toLocaleString('zh-CN') : '')

const loadSkill = async () => {
  const data = await fetchJson(`/api/skills/${route.params.id}`)
  skill.value = data
  repoStats.value = null
  if (data?.id) {
    loadReviews()
    loadRepoStats()
  }
}

const loadReviews = async () => {
  if (!skill.value?.id) return
  try {
    reviews.value = await fetchJson(`/api/skills/${skill.value.id}/reviews`)
  } catch {}
}

const submitReview = async () => {
  if (!skill.value?.id || reviewSubmitting.value) return
  if (reviewRating.value < 1 || reviewRating.value > 5) return
  reviewSubmitting.value = true
  try {
    const headers = {}
    if (userState.value?.token) headers.Authorization = `Bearer ${userState.value.token}`
    const data = await fetchJson(`/api/skills/${skill.value.id}/reviews`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ rating: reviewRating.value, comment: reviewComment.value.trim() })
    })
    reviewSubmitted.value = true
    await loadReviews()
    skill.value = { ...skill.value, review_count: data.review_count, avg_rating: data.avg_rating }
  } catch (e) {
    alert(e.message || '提交失败')
  } finally {
    reviewSubmitting.value = false
  }
}

const downloadHref = computed(() => skill.value ? `${apiBase}/api/skills/${skill.value.id}/skill` : '#')

const handleDownload = () => {
  if (skill.value?.review_tier === 'none' || !skill.value?.review_tier) {
    if (!window.confirm('该技能未经审核，可能存在安全风险。确定要下载吗？')) return
  }
  window.location.href = downloadHref.value
}

const runPlayground = async () => {
  if (!skill.value || skill.value.status !== 'published') return
  if (skill.value.review_tier === 'none' || !skill.value.review_tier) {
    if (!window.confirm('该技能未经审核，可能存在安全风险。确定要继续运行吗？')) return
  }
  playgroundMessage.value = ''
  playgroundResult.value = ''
  let input
  try {
    input = JSON.parse(playgroundInput.value || '{}')
  } catch {
    playgroundMessage.value = '请输入有效的 JSON'
    return
  }
  playgroundRunning.value = true
  try {
    const data = await fetchJson(`/v1/skills/${skill.value.slug}/versions/${skill.value.version || '1.0.0'}/run`, {
      method: 'POST',
      body: JSON.stringify({ input })
    })
    playgroundResult.value = JSON.stringify(data.output || data, null, 2)
    if (data.status === 'error') {
      playgroundMessage.value = data.output?.message || '执行失败'
    }
  } catch (e) {
    playgroundMessage.value = e.message || '请求失败'
    playgroundResult.value = ''
  } finally {
    playgroundRunning.value = false
  }
}

const submitReport = async () => {
  reportMessage.value = ''
  reporting.value = true
  try {
    const headers = {}
    if (userState.value?.token) headers.Authorization = `Bearer ${userState.value.token}`
    await fetchJson(`/api/skills/${skill.value.id}/report`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ reason: reportReason.value, detail: reportDetail.value, contact: reportContact.value })
    })
    reportMessage.value = '举报已提交'
    showReportForm.value = false
  } catch (e) {
    reportMessage.value = e.message || '提交失败'
  } finally {
    reporting.value = false
  }
}

onMounted(loadSkill)
</script>

<style scoped>
.skill-detail {
  max-width: 1280px;
  margin: 0 auto;
}

.detail-layout {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 32px;
  align-items: start;
}

@media (max-width: 900px) {
  .detail-layout {
    grid-template-columns: 1fr;
  }
}

.main-content {
  min-width: 0;
  background: #fff;
  border: 1px solid var(--card-border);
  border-radius: 16px;
  padding: 32px;
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.06);
}

.actions-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.btn-back {
  font-size: 14px;
  color: var(--text-muted);
  font-weight: 500;
  transition: color 0.2s;
}

.btn-back:hover {
  color: var(--primary-color);
}

.actions-right {
  display: flex;
  gap: 10px;
}

.btn-primary {
  display: inline-flex;
  align-items: center;
  padding: 10px 18px;
  background: var(--primary-color);
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
  transition: background 0.2s;
}

.btn-primary:hover {
  background: #1758d6;
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-ghost {
  padding: 10px 18px;
  background: transparent;
  border: 1px solid var(--card-border);
  border-radius: 10px;
  font-size: 14px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s;
}

.btn-ghost:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.report-card {
  background: #f8fafc;
  border: 1px solid var(--card-border);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 28px;
}

.report-card h4 {
  margin: 0 0 16px 0;
  font-size: 16px;
}

.report-field {
  margin-bottom: 16px;
}

.report-field label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.report-actions {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-top: 16px;
}

.skill-header {
  margin-bottom: 32px;
}

.skill-title {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.5px;
  color: var(--text-color);
  margin: 0 0 12px 0;
  line-height: 1.3;
}

.skill-slug {
  font-weight: 500;
  color: #64748b;
  font-size: 0.85em;
}

.source-author-row {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  margin-bottom: 14px;
  font-size: 14px;
}

.source-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.source-label {
  color: var(--text-muted);
  font-weight: 500;
}

.source-link {
  color: var(--primary-color);
  font-weight: 500;
  text-decoration: none;
}

.source-link:hover {
  text-decoration: underline;
}

.meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.badge {
  padding: 5px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
}

.badge-reviewed {
  background: #f3e8ff;
  color: #7c3aed;
  border: 1px solid #c4b5fd;
}

.badge-ai {
  background: #dcfce7;
  color: #15803d;
  border: 1px solid #86efac;
}

.badge-none {
  background: #fef9c3;
  color: #a16207;
  border: 1px solid #fde047;
  cursor: help;
}

.badge-cat, .badge-tag {
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #e2e8f0;
}

.badge-ver {
  background: #eef2ff;
  color: #4338ca;
  border: 1px solid #c7d2fe;
}

.badge-status.status-published {
  background: #ecfdf3;
  color: #047857;
  border: 1px solid #bbf7d0;
}

.badge-status.status-pending {
  background: #fff7ed;
  color: #c2410c;
  border: 1px solid #fed7aa;
}

.badge-status.status-rejected {
  background: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fecaca;
}

.skill-rating {
  font-size: 14px;
  color: #f59e0b;
  margin: 0 0 12px 0;
}

.skill-desc {
  font-size: 16px;
  line-height: 1.6;
  color: var(--text-muted);
  margin: 0;
}

.section {
  margin-bottom: 36px;
}

.section-heading {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-color);
  margin: 0 0 8px 0;
}

.section-desc {
  font-size: 14px;
  color: var(--text-muted);
  margin: 0 0 16px 0;
}

.code-block {
  background: #1e293b;
  color: #e2e8f0;
  border-radius: 12px;
  padding: 20px;
  font-family: 'Consolas', 'Monaco', 'Fira Code', monospace;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-x: auto;
  border: none;
}

.skill-file-content {
  max-height: 480px;
  overflow-y: auto;
  padding: 20px;
  background: #1e293b;
  border-radius: 12px;
  color: #e2e8f0;
}

.markdown-body :deep(h1) { font-size: 1.5em; margin: 0 0 16px 0; font-weight: 700; }
.markdown-body :deep(h2) { font-size: 1.25em; margin: 24px 0 12px 0; font-weight: 600; }
.markdown-body :deep(h3) { font-size: 1.1em; margin: 20px 0 10px 0; font-weight: 600; }
.markdown-body :deep(p) { margin: 0 0 12px 0; line-height: 1.6; }
.markdown-body :deep(ul), .markdown-body :deep(ol) { margin: 0 0 12px 0; padding-left: 24px; }
.markdown-body :deep(li) { margin: 4px 0; }
.markdown-body :deep(code) {
  background: rgba(255,255,255,0.1);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.9em;
}
.markdown-body :deep(pre) {
  background: rgba(0,0,0,0.3);
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 12px 0;
}
.markdown-body :deep(pre code) { background: none; padding: 0; }
.markdown-body :deep(blockquote) {
  border-left: 4px solid #475569;
  padding-left: 16px;
  margin: 12px 0;
  color: #94a3b8;
}
.markdown-body :deep(a) { color: #7dd3fc; text-decoration: none; }
.markdown-body :deep(a:hover) { text-decoration: underline; }
.markdown-body :deep(hr) { border: none; border-top: 1px solid #475569; margin: 20px 0; }
.markdown-body :deep(table) { border-collapse: collapse; width: 100%; margin: 12px 0; }
.markdown-body :deep(th), .markdown-body :deep(td) { border: 1px solid #475569; padding: 8px 12px; text-align: left; }
.markdown-body :deep(th) { background: rgba(0,0,0,0.2); font-weight: 600; }

.code-input {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px;
  margin: 12px 0;
}

.reviews-section {
  background: #f8fafc;
  border: 1px solid var(--card-border);
  border-radius: 12px;
  padding: 24px;
}

.review-form {
  margin-bottom: 20px;
}

.star-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.star-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.4em;
  color: #cbd5e1;
  padding: 0 2px;
}
.star-btn.active, .star-btn:hover { color: #f59e0b; }

.review-list { margin-top: 16px; }
.review-item {
  padding: 12px 0;
  border-bottom: 1px solid var(--card-border);
}
.review-item:last-child { border-bottom: none; }
.review-rating { color: #f59e0b; margin-right: 10px; }
.review-user { font-weight: 500; margin-right: 10px; }
.review-comment { margin: 8px 0 0; color: var(--text-muted); font-size: 14px; }

.playground-section {
  background: #f8fafc;
  border: 1px solid var(--card-border);
  border-radius: 12px;
  padding: 24px;
}

.playground-actions {
  display: flex;
  gap: 12px;
  align-items: center;
  margin: 12px 0;
}

.playground-result {
  margin-top: 16px;
}
.playground-result pre {
  max-height: 280px;
  overflow: auto;
}

/* 侧边栏 */
.sidebar {
  position: sticky;
  top: 100px;
}

.sidebar-card {
  background: #fff;
  border: 1px solid var(--card-border);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
}

.sidebar-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
  margin: 0 0 16px 0;
}

.sidebar-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  margin: 0 0 12px 0;
  text-transform: uppercase;
}

.author-card .author-block,
.repo-card .repo-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.author-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color);
}

.author-link {
  font-size: 13px;
  color: var(--primary-color);
  text-decoration: none;
}
.author-link:hover { text-decoration: underline; }

.repo-name {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-color);
  text-decoration: none;
  transition: color 0.2s;
}
.repo-name:hover { color: var(--primary-color); }

.repo-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.repo-stats {
  display: flex;
  gap: 16px;
  font-size: 14px;
  color: var(--text-muted);
}

.repo-stat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.stat-icon {
  color: #f59e0b;
  font-size: 14px;
}
.repo-stat:last-child .stat-icon { color: var(--text-muted); }

.repo-license {
  font-size: 12px;
  color: var(--text-muted);
}

.install-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
}

.install-tab {
  padding: 6px 12px;
  border: 1px solid var(--card-border);
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.install-tab:hover { background: #f8fafc; }
.install-tab.active {
  background: var(--primary-color);
  border-color: var(--primary-color);
  color: #fff;
}

.install-command {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  background: #f1f5f9;
  border-radius: 8px;
  border: 1px solid var(--card-border);
  margin-bottom: 12px;
}

.install-command code {
  flex: 1;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  overflow-x: auto;
  color: #334155;
}

.copy-btn {
  flex-shrink: 0;
  padding: 6px 10px;
  border: none;
  border-radius: 6px;
  background: #e2e8f0;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}
.copy-btn:hover { background: #cbd5e1; }

.btn-download {
  display: block;
  text-align: center;
  padding: 10px;
  background: var(--primary-weak);
  color: var(--primary-color);
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  transition: all 0.2s;
}
.btn-download:hover {
  background: #dbeafe;
}

.info-list {
  margin: 0;
  font-size: 13px;
}

.info-list dt {
  color: var(--text-muted);
  font-weight: 500;
  margin-bottom: 4px;
  margin-top: 12px;
}
.info-list dt:first-child { margin-top: 0; }

.info-list dd {
  margin: 0;
  color: var(--text-color);
}

.info-list code {
  font-size: 12px;
  background: #f1f5f9;
  padding: 2px 6px;
  border-radius: 4px;
}

.info-list a {
  color: var(--primary-color);
  word-break: break-all;
}

.truncate {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}

.api-snippet {
  margin-bottom: 12px;
}
.api-snippet:last-child { margin-bottom: 0; }

.api-snippet code {
  display: block;
  font-size: 11px;
  padding: 10px 12px;
  background: #f1f5f9;
  border-radius: 8px;
  border: 1px solid var(--card-border);
  white-space: pre-wrap;
  word-break: break-all;
  font-family: 'Consolas', 'Monaco', monospace;
  color: #475569;
}

.loading-state {
  padding: 60px 0;
  text-align: center;
}

.muted { color: var(--text-muted); }
</style>
