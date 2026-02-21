import { ref } from 'vue'

export const userState = ref({
  token: typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('userToken') : null,
  userId: typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('userId') : null,
  username: typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('username') : null
})

export const setUser = (token, userId, username) => {
  userState.value = { token, userId, username }
}

export const clearUser = () => {
  userState.value = { token: null, userId: null, username: null }
}
