import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { userState } from './store'
import './style.css'

const app = createApp(App)
app.use(router)
app.mount('#app')

router.afterEach(() => {
  if (typeof sessionStorage !== 'undefined') {
    userState.value = {
      token: sessionStorage.getItem('userToken'),
      userId: sessionStorage.getItem('userId'),
      username: sessionStorage.getItem('username')
    }
  }
})
