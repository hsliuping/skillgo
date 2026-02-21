<template>
  <div>
    <section class="card">
      <h2 class="section-title">审核后台</h2>
      <div class="toolbar">
        <button class="button" @click="loadReviewQueue">审核队列</button>
        <button class="button" @click="loadPending">待审核(pending)</button>
        <button class="button" @click="loadReports">举报列表</button>
        <button class="button secondary" @click="runAiReviewBatch" :disabled="aiReviewRunning">批量 AI 审核</button>
        <button class="button secondary" @click="runCrawl" :disabled="crawlRunning">爬取 agent-skills.md</button>
        <button class="button outline" @click="logout">退出登录</button>
        <span class="muted">{{ message }}</span>
      </div>
    </section>

    <section v-if="showReports" class="card">
      <h3 class="subsection-title">举报列表</h3>
      <table v-if="reports.length" class="table">
        <thead>
          <tr>
            <th>技能</th>
            <th>原因</th>
            <th>详情</th>
            <th>联系方式</th>
            <th>时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in reports" :key="r.id">
            <td><RouterLink :to="`/skills/${r.skill_id}`">{{ r.skill_name }} v{{ r.version }}</RouterLink></td>
            <td>{{ r.reason }}</td>
            <td class="muted">{{ r.detail || '-' }}</td>
            <td class="muted">{{ r.reporter_contact || '-' }}</td>
            <td>{{ formatDate(r.created_at) }}</td>
            <td><button class="button secondary small" @click="dismissReport(r.id)">驳回</button></td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">暂无待处理举报</p>
    </section>

    <section class="card">
      <h3 class="subsection-title">{{ showReviewQueue ? '审核队列（按下载量优先）' : '待审核技能(pending)' }}</h3>
      <div class="muted" v-if="showReviewQueue">未审核优先，高下载量优先。可标记为 AI 审核或人工审核。</div>
      <div v-if="loading" class="muted">加载中...</div>
      <table v-else class="table">
        <thead>
          <tr>
            <th>名称</th>
            <th>分类</th>
            <th>版本</th>
            <th>审核层级</th>
            <th>下载/浏览/评论</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="skill in skills" :key="skill.id">
            <td><RouterLink :to="`/skills/${skill.id}`">{{ skill.name }}</RouterLink></td>
            <td>{{ skill.category }}</td>
            <td>v{{ skill.version || '1.0.0' }}</td>
            <td>
              <span v-if="skill.review_tier === 'human'" class="tag tag-reviewed">人工审核</span>
              <span v-else-if="skill.review_tier === 'ai'" class="tag tag-ai">AI审核</span>
              <span v-else class="tag tag-none">未审核</span>
            </td>
            <td class="muted">{{ (skill.install_count || 0) + (skill.view_count || 0) }}{{ (skill.review_count || 0) ? ` / ${skill.review_count}评` : '' }}</td>
            <td>
              <template v-if="showReviewQueue">
                <button v-if="skill.review_tier !== 'ai'" class="button small" @click="runAiReview(skill.id)" :disabled="aiReviewRunning">AI审核</button>
                <button v-if="skill.review_tier !== 'ai'" class="button small" @click="setReviewTier(skill.id, 'ai')">标记AI</button>
                <button v-if="skill.review_tier !== 'human'" class="button small" @click="setReviewTier(skill.id, 'human')">标记人工</button>
              </template>
              <template v-else>
                <button class="button" @click="updateStatus(skill.id, 'published')">通过</button>
                <button class="button secondary" @click="updateStatus(skill.id, 'rejected')">拒绝</button>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="skills.length === 0 && !loading" class="muted">暂无数据</div>
    </section>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import { fetchJson } from '../api'

const skills = ref([])
const reports = ref([])
const showReports = ref(false)
const showReviewQueue = ref(true)
const loading = ref(false)
const aiReviewRunning = ref(false)
const crawlRunning = ref(false)
const message = ref('')
const router = useRouter()

const formatDate = (d) => (d ? new Date(d).toLocaleString('zh-CN') : '')

const loadReports = async () => {
  showReports.value = true
  message.value = ''
  try {
    reports.value = await fetchJson('/api/admin/reports', {
      headers: { Authorization: `Bearer ${getToken()}` }
    })
  } catch (e) {
    if (e.status === 401) {
      sessionStorage.removeItem('adminToken')
      router.push('/admin-login')
    } else message.value = e.message
  }
}

const dismissReport = async (id) => {
  try {
    await fetchJson(`/api/admin/reports/${id}/dismiss`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` }
    })
    reports.value = reports.value.filter((r) => r.id !== id)
  } catch (e) {
    message.value = e.message
  }
}

const getToken = () => sessionStorage.getItem('adminToken') || ''

const loadReviewQueue = async () => {
  showReviewQueue.value = true
  const token = getToken()
  if (!token) {
    router.push('/admin-login')
    return
  }
  loading.value = true
  try {
    skills.value = await fetchJson('/api/admin/review-queue', {
      headers: { Authorization: `Bearer ${token}` }
    })
  } catch (error) {
    if (error.status === 401) {
      sessionStorage.removeItem('adminToken')
      router.push('/admin-login')
    } else {
      message.value = error.message
    }
  } finally {
    loading.value = false
  }
}

const loadPending = async () => {
  showReviewQueue.value = false
  const token = getToken()
  if (!token) {
    router.push('/admin-login')
    return
  }
  loading.value = true
  try {
    const data = await fetchJson('/api/skills?status=pending', {
      headers: { Authorization: `Bearer ${token}` }
    })
    skills.value = data.items || []
  } catch (error) {
    if (error.status === 401) {
      sessionStorage.removeItem('adminToken')
      router.push('/admin-login')
    } else {
      message.value = error.message
    }
  } finally {
    loading.value = false
  }
}

const runAiReview = async (id) => {
  message.value = ''
  aiReviewRunning.value = true
  try {
    const data = await fetchJson(`/api/admin/ai-review/${id}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` }
    })
    message.value = data.pass ? `技能已通过 AI 审核` : `AI 审核未通过: ${data.reason || ''}`
    await loadReviewQueue()
  } catch (e) {
    message.value = e.message || 'AI 审核失败'
  } finally {
    aiReviewRunning.value = false
  }
}

const runCrawl = async () => {
  message.value = ''
  crawlRunning.value = true
  try {
    const data = await fetchJson('/api/admin/crawl-agent-skills', {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ pages: 5, delayMs: 2000 })
    })
    message.value = data.message || '爬虫已启动'
  } catch (e) {
    message.value = e.message || '启动失败'
  } finally {
    crawlRunning.value = false
  }
}

const runAiReviewBatch = async () => {
  message.value = ''
  aiReviewRunning.value = true
  try {
    const data = await fetchJson('/api/admin/ai-review-batch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ limit: 5 })
    })
    const passed = data.results?.filter((r) => r.pass).length || 0
    message.value = `批量处理 ${data.processed} 个，通过 ${passed} 个`
    await loadReviewQueue()
  } catch (e) {
    message.value = e.message || '批量 AI 审核失败'
  } finally {
    aiReviewRunning.value = false
  }
}

const setReviewTier = async (id, tier) => {
  message.value = ''
  try {
    await fetchJson(`/api/skills/${id}/review-tier`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ review_tier: tier })
    })
    await loadReviewQueue()
  } catch (e) {
    message.value = e.message
  }
}

const updateStatus = async (id, status) => {
  message.value = ''
  const reviewNote = window.prompt('审核备注（选填，直接确定跳过）')
  try {
    const body = { status }
    if (reviewNote && reviewNote.trim()) body.reviewNote = reviewNote.trim()
    await fetchJson(`/api/skills/${id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify(body)
    })
    await loadPending()
  } catch (error) {
    message.value = error.message
  }
}

const logout = async () => {
  try {
    await fetchJson('/api/admin/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` }
    })
  } catch {}
  sessionStorage.removeItem('adminToken')
  sessionStorage.removeItem('adminUsername')
  router.push('/admin-login')
}

onMounted(loadReviewQueue)
</script>
