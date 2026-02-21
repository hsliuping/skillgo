<template>
  <div class="card">
    <h2 class="section-title">用户登录</h2>
    <p class="muted">登录后可提交技能并管理个人主页。</p>

    <div class="field">
      <label>邮箱</label>
      <input v-model="email" class="input" type="email" placeholder="请输入邮箱" autocomplete="email" />
    </div>

    <div class="field">
      <label>密码</label>
      <input v-model="password" class="input" type="password" placeholder="请输入密码" autocomplete="current-password" />
    </div>

    <div class="toolbar">
      <button class="button" :disabled="loading" @click="login">{{ loading ? '登录中...' : '登录' }}</button>
      <RouterLink class="button outline" to="/register">没有账号？去注册</RouterLink>
      <span class="muted">{{ message }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import { fetchJson } from '../api'

const router = useRouter()
const email = ref('')
const password = ref('')
const message = ref('')
const loading = ref(false)

const login = async () => {
  message.value = ''
  if (!email.value || !password.value) {
    message.value = '请填写邮箱和密码'
    return
  }
  loading.value = true
  try {
    const data = await fetchJson('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: email.value, password: password.value })
    })
    sessionStorage.setItem('userToken', data.token)
    sessionStorage.setItem('userId', String(data.user.id))
    sessionStorage.setItem('username', data.user.username)
    const { userState } = await import('../store')
    userState.value = { token: data.token, userId: String(data.user.id), username: data.user.username }
    router.push('/')
  } catch (error) {
    message.value = error.message || '登录失败'
  } finally {
    loading.value = false
  }
}
</script>
