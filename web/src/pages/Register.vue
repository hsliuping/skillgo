<template>
  <div class="card">
    <h2 class="section-title">用户注册</h2>
    <p class="muted">注册后可提交技能并建立个人主页。</p>

    <div class="field">
      <label>用户名</label>
      <input v-model="username" class="input" type="text" placeholder="请输入用户名" autocomplete="username" />
    </div>

    <div class="field">
      <label>邮箱</label>
      <input v-model="email" class="input" type="email" placeholder="请输入邮箱" autocomplete="email" />
    </div>

    <div class="field">
      <label>密码</label>
      <input v-model="password" class="input" type="password" placeholder="至少 6 位" autocomplete="new-password" />
    </div>

    <div class="toolbar">
      <button class="button" :disabled="loading" @click="register">{{ loading ? '注册中...' : '注册' }}</button>
      <RouterLink class="button outline" to="/login">已有账号？去登录</RouterLink>
      <span class="muted">{{ message }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import { fetchJson } from '../api'

const router = useRouter()
const username = ref('')
const email = ref('')
const password = ref('')
const message = ref('')
const loading = ref(false)

const register = async () => {
  message.value = ''
  if (!username.value || !email.value || !password.value) {
    message.value = '请填写完整信息'
    return
  }
  if (password.value.length < 6) {
    message.value = '密码至少 6 位'
    return
  }
  loading.value = true
  try {
    const data = await fetchJson('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: username.value,
        email: email.value,
        password: password.value
      })
    })
    sessionStorage.setItem('userToken', data.token)
    sessionStorage.setItem('userId', String(data.user.id))
    sessionStorage.setItem('username', data.user.username)
    const { userState } = await import('../store')
    userState.value = { token: data.token, userId: String(data.user.id), username: data.user.username }
    router.push('/')
  } catch (error) {
    message.value = error.message || '注册失败'
  } finally {
    loading.value = false
  }
}
</script>
