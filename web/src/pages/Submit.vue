<template>
  <div class="card">
    <h2 class="section-title">提交技能</h2>
    <p class="muted">支持 GitHub、Gitee、GitLab 链接，系统会自动拉取仓库中的 SKILL.md 文件。</p>

    <div class="field">
      <label>代码库链接</label>
      <input v-model="repoUrl" class="input" placeholder="https://gitee.com/owner/repo/tree/main/skills" />
    </div>

    <div class="toolbar">
      <button class="button" @click="submit">提交仓库</button>
      <span class="muted">{{ message }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { fetchJson } from '../api'
import { userState } from '../store'

const repoUrl = ref('')
const message = ref('')

const submit = async () => {
  message.value = ''
  const headers = {}
  if (userState.value?.token) {
    headers.Authorization = `Bearer ${userState.value.token}`
  }
  try {
    const data = await fetchJson('/api/skills/import', {
      method: 'POST',
      headers,
      body: JSON.stringify({ repoUrl: repoUrl.value })
    })
    message.value = `已提交仓库，导入 ${data.imported || 0} 个技能，跳过 ${data.skipped || 0} 个`
    repoUrl.value = ''
  } catch (error) {
    message.value = error.message
  }
}
</script>
