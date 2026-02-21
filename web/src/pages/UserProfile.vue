<template>
  <div class="card" v-if="user">
    <h2 class="section-title">{{ user.username }}</h2>
    <p v-if="user.bio" class="muted">{{ user.bio }}</p>
    <p class="muted">注册于 {{ formatDate(user.created_at) }}</p>

    <h3 class="subsection-title">提交的技能</h3>
    <div v-if="user.skills?.length" class="skill-list">
      <div v-for="s in user.skills" :key="s.id" class="skill-item">
        <RouterLink :to="`/skills/${s.id}`">{{ s.name }}</RouterLink>
        <span class="muted">v{{ s.version }}</span>
        <span class="status-pill" :class="statusClass(s.status)">{{ s.status }}</span>
      </div>
    </div>
    <p v-else class="muted">暂无提交的技能</p>
  </div>
  <div v-else-if="loading" class="card muted">加载中...</div>
  <div v-else class="card muted">用户不存在</div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { fetchJson } from '../api'

const route = useRoute()
const user = ref(null)
const loading = ref(true)

const formatDate = (d) => {
  if (!d) return ''
  const dt = new Date(d)
  return dt.toLocaleDateString('zh-CN')
}

const statusClass = (status) => {
  if (status === 'published') return 'status-published'
  if (status === 'rejected') return 'status-rejected'
  return 'status-pending'
}

onMounted(async () => {
  try {
    user.value = await fetchJson(`/api/users/${route.params.id}`)
  } catch {
    user.value = null
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.subsection-title {
  font-size: 18px;
  margin: 24px 0 12px 0;
}

.skill-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.skill-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.skill-item a {
  color: var(--primary-color);
  text-decoration: none;
}

.skill-item a:hover {
  text-decoration: underline;
}
</style>
