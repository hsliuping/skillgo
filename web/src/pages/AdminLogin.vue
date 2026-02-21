<template>
  <div class="card">
    <h2 class="section-title">管理员登录</h2>
    <p class="muted">登录后才可访问审核后台。</p>

    <div class="field">
      <label>用户名</label>
      <input v-model="username" class="input" type="text" placeholder="请输入用户名" autocomplete="username" />
    </div>

    <div class="field">
      <label>密码</label>
      <input v-model="password" class="input" type="password" placeholder="请输入密码" autocomplete="current-password" />
    </div>

    <div class="toolbar">
      <button class="button" :disabled="loading" @click="login">{{ loading ? '登录中...' : '登录' }}</button>
      <span class="muted">{{ message }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { fetchJson } from '../api'

const router = useRouter()
const username = ref('')
const password = ref('')
const message = ref('')
const loading = ref(false)

const login = async () => {
  message.value = ''
  if (!username.value || !password.value) {
    message.value = '请填写用户名和密码'
    return
  }
  loading.value = true
  try {
    const data = await fetchJson('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username: username.value, password: password.value })
    })
    sessionStorage.setItem('adminToken', data.token)
    sessionStorage.setItem('adminUsername', data.username)
    router.push('/admin')
  } catch (error) {
    message.value = error.message || '登录失败，请检查用户名和密码'
  } finally {
    loading.value = false
  }
}
</script>
