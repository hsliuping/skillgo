import { createRouter, createWebHistory } from 'vue-router'
import Home from './pages/Home.vue'
import Submit from './pages/Submit.vue'
import Admin from './pages/Admin.vue'
import SkillDetail from './pages/SkillDetail.vue'
import Mcp from './pages/Mcp.vue'
import AdminLogin from './pages/AdminLogin.vue'
import Register from './pages/Register.vue'
import Login from './pages/Login.vue'
import UserProfile from './pages/UserProfile.vue'

const routes = [
  { path: '/', component: Home },
  { path: '/submit', component: Submit },
  { path: '/register', component: Register },
  { path: '/login', component: Login },
  { path: '/users/:id', component: UserProfile },
  { path: '/admin-login', component: AdminLogin },
  { path: '/admin', component: Admin },
  { path: '/skills/:id', component: SkillDetail },
  { path: '/mcp', component: Mcp }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to) => {
  const adminToken = sessionStorage.getItem('adminToken')
  if (to.path === '/admin' && !adminToken) {
    return '/admin-login'
  }
  if (to.path === '/admin-login' && adminToken) {
    return '/admin'
  }
  return true
})

export default router
