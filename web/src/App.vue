<template>
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <span class="logo">SkillGo</span>
        <span class="sub">技能分享平台 · skillgo.cn</span>
      </div>
      <nav class="nav">
        <RouterLink to="/">首页</RouterLink>
        <RouterLink to="/submit">提交技能</RouterLink>
        <RouterLink to="/mcp">MCP 服务</RouterLink>
        <template v-if="!userState.token">
          <RouterLink to="/login">登录</RouterLink>
          <RouterLink to="/register">注册</RouterLink>
        </template>
        <RouterLink v-else :to="`/users/${userState.userId}`">{{ userState.username || '我的' }}</RouterLink>
      </nav>
    </header>
    <main class="content">
      <RouterView />
    </main>
  </div>
</template>

<script setup>
import { RouterLink, RouterView } from 'vue-router'
import { userState } from './store'
</script>
