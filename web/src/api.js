export const apiBase = import.meta.env.VITE_API_BASE || 'http://localhost:3100'

export const fetchJson = async (url, options = {}) => {
  const headers = options.headers || {}
  const finalHeaders = options.body
    ? { 'Content-Type': 'application/json', ...headers }
    : headers
  const response = await fetch(`${apiBase}${url}`, {
    ...options,
    headers: finalHeaders
  })
  if (!response.ok) {
    let message = '请求失败'
    try {
      const data = await response.json()
      message = data.message || message
    } catch {}
    const err = new Error(message)
    err.status = response.status
    throw err
  }
  return response.json()
}
