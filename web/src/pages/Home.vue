<template>
  <div class="home-page">
    <section class="hero">
      <span class="hero-badge">Skill Share</span>
      <h1 class="hero-title">共享 Agent Skills</h1>
      <p class="hero-subtitle">提交、审核、发布，并通过 MCP 服务对外提供技能发现能力。</p>
    </section>

    <section class="search-section">
      <div class="search-bar">
        <div class="search-row">
          <span class="search-icon">🔍</span>
          <input v-model="query" class="search-input" placeholder="搜索技能名称或描述..." @keyup.enter="search" />
        </div>
        <div class="filters">
          <select v-model="category" class="filter-select" @change="search">
            <option value="">全部分类</option>
            <option v-for="item in categories" :key="item" :value="item">{{ item }}</option>
          </select>
          <select v-model="tag" class="filter-select" @change="search">
            <option value="">全部标签</option>
            <option v-for="t in popularTags" :key="t.name" :value="t.name">{{ t.name }} ({{ t.use_count }})</option>
          </select>
          <select v-model="sort" class="filter-select" @change="search">
            <option value="">最新发布</option>
            <option value="popular">最受欢迎</option>
            <option value="reviewed">优先人工审核</option>
          </select>
          <button class="search-btn" @click="search">搜索</button>
        </div>
      </div>

      <div v-if="loading" class="state-text">加载中...</div>
      <div v-else-if="skills.length === 0" class="state-text">暂无已发布技能</div>
      <div v-else class="skill-grid">
        <SkillCard v-for="skill in skills" :key="skill.id" :skill="skill" />
      </div>

      <div v-if="totalPages > 1" class="pagination">
        <button class="page-btn" :disabled="page === 1" @click="goToPage(page - 1)">‹ 上一页</button>
        <template v-for="p in pageButtons" :key="p">
          <span v-if="p === '...'" class="page-ellipsis">…</span>
          <button v-else class="page-btn" :class="{ active: p === page }" @click="goToPage(p)">{{ p }}</button>
        </template>
        <button class="page-btn" :disabled="page === totalPages" @click="goToPage(page + 1)">下一页 ›</button>
        <span class="page-info">共 {{ total }} 条</span>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import SkillCard from '../components/SkillCard.vue'
import { fetchJson } from '../api'

const skills = ref([])
const categories = ref([])
const popularTags = ref([])
const query = ref('')
const category = ref('')
const tag = ref('')
const sort = ref('')
const loading = ref(false)
const page = ref(1)
const pageSize = ref(12)
const total = ref(0)

const totalPages = computed(() => Math.ceil(total.value / pageSize.value))

const pageButtons = computed(() => {
  const total = totalPages.value
  const cur = page.value
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages = []
  pages.push(1)
  if (cur > 3) pages.push('...')
  for (let p = Math.max(2, cur - 1); p <= Math.min(total - 1, cur + 1); p++) pages.push(p)
  if (cur < total - 2) pages.push('...')
  pages.push(total)
  return pages
})

const loadCategories = async () => {
  try {
    categories.value = await fetchJson('/api/categories')
  } catch {}
}

const loadPopularTags = async () => {
  try {
    popularTags.value = await fetchJson('/api/tags/popular')
  } catch {}
}

const loadSkills = async () => {
  loading.value = true
  try {
    const params = new URLSearchParams()
    if (query.value) params.set('q', query.value)
    if (category.value) params.set('category', category.value)
    if (tag.value) params.set('tag', tag.value)
    if (sort.value) params.set('sort', sort.value)
    params.set('status', 'published')
    params.set('page', String(page.value))
    params.set('pageSize', String(pageSize.value))
    const data = await fetchJson(`/api/skills?${params.toString()}`)
    skills.value = data.items || []
    total.value = data.total || 0
  } finally {
    loading.value = false
  }
}

const search = () => {
  page.value = 1
  loadSkills()
}

const goToPage = (p) => {
  if (p < 1 || p > totalPages.value) return
  page.value = p
  loadSkills()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

onMounted(async () => {
  await Promise.all([loadCategories(), loadPopularTags()])
  await loadSkills()
})
</script>

<style scoped>
.home-page {
  padding-bottom: 48px;
}

.hero {
  text-align: center;
  margin-bottom: 48px;
  padding: 40px 24px 32px;
}

.hero-badge {
  display: inline-block;
  padding: 8px 18px;
  border-radius: 999px;
  background: linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%);
  color: #4338ca;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.8px;
  margin-bottom: 20px;
}

.hero-title {
  font-size: 42px;
  font-weight: 800;
  margin: 0 0 16px 0;
  color: #0f172a;
  letter-spacing: -0.5px;
  line-height: 1.2;
}

.hero-subtitle {
  font-size: 17px;
  color: #64748b;
  max-width: 560px;
  margin: 0 auto;
  line-height: 1.6;
}

.search-section {
  max-width: 1100px;
  margin: 0 auto;
}

.search-bar {
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: #fff;
  border-radius: 16px;
  padding: 20px 24px;
  margin-bottom: 32px;
  box-shadow: 0 4px 20px rgba(15, 23, 42, 0.08);
  border: 1px solid rgba(226, 232, 240, 0.8);
}

.search-icon {
  font-size: 18px;
  opacity: 0.5;
  margin-right: 12px;
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 16px;
  padding: 12px 0;
  outline: none;
  min-width: 200px;
}

.search-input::placeholder {
  color: #94a3b8;
}

.search-row {
  display: flex;
  align-items: center;
  border-bottom: 1px solid #f1f5f9;
  padding-bottom: 16px;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.filter-select {
  padding: 10px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
  font-size: 14px;
  color: #334155;
  min-width: 120px;
  cursor: pointer;
  transition: border-color 0.2s;
}

.filter-select:hover {
  border-color: #cbd5e1;
}

.filter-select:focus {
  outline: none;
  border-color: var(--primary-color);
}

.search-btn {
  padding: 10px 24px;
  background: var(--primary-color);
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.search-btn:hover {
  background: #1758d6;
}

.skill-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 24px;
}

.state-text {
  text-align: center;
  color: #94a3b8;
  padding: 64px 24px;
  font-size: 16px;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 48px;
  flex-wrap: wrap;
}

.page-btn {
  min-width: 40px;
  height: 40px;
  padding: 0 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
  color: #334155;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.page-btn:hover:not(:disabled) {
  border-color: var(--primary-color);
  color: var(--primary-color);
  background: #f8faff;
}

.page-btn.active {
  background: var(--primary-color);
  border-color: var(--primary-color);
  color: #fff;
  font-weight: 600;
}

.page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.page-ellipsis {
  min-width: 40px;
  text-align: center;
  color: #94a3b8;
  font-size: 14px;
}

.page-info {
  margin-left: 16px;
  font-size: 14px;
  color: #94a3b8;
}
</style>
