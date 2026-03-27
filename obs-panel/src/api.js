const apiBase = import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:8000/api'

export function getApiWebSocketUrl() {
  try {
    const baseUrl = new URL(apiBase, window.location.origin)
    const protocol = baseUrl.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${baseUrl.host}/ws`
  } catch {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}/ws`
  }
}

async function parseResponse(res) {
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.detail || 'Errore API')
  }
  return res.json()
}

export async function getOverlayThemes() {
  const res = await fetch(`${apiBase}/overlay-themes`)
  return parseResponse(res)
}

export async function getOverlayTheme(id) {
  const res = await fetch(`${apiBase}/overlay-themes/${id}`)
  return parseResponse(res)
}

export async function getOverlays() {
  const res = await fetch(`${apiBase}/overlays`)
  return parseResponse(res)
}

export async function getOverlay(id) {
  const res = await fetch(`${apiBase}/overlays/${id}`)
  return parseResponse(res)
}

export async function updateOverlay(id, payload) {
  const res = await fetch(`${apiBase}/overlays/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  return parseResponse(res)
}

export async function getCollections() {
  const res = await fetch(`${apiBase}/collections`)
  return parseResponse(res)
}

export async function createOverlayTheme(payload) {
  const res = await fetch(`${apiBase}/overlay-themes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  return parseResponse(res)
}

export async function updateOverlayTheme(id, payload) {
  const res = await fetch(`${apiBase}/overlay-themes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  return parseResponse(res)
}

export async function deleteOverlayTheme(id) {
  const res = await fetch(`${apiBase}/overlay-themes/${id}`, {
    method: 'DELETE'
  })
  return parseResponse(res)
}

export async function createOverlay(payload) {
  const res = await fetch(`${apiBase}/overlays`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  return parseResponse(res)
}

export async function deleteOverlay(id) {
  const res = await fetch(`${apiBase}/overlays/${id}`, {
    method: 'DELETE'
  })
  return parseResponse(res)
}

export async function createCollection(payload) {
  const res = await fetch(`${apiBase}/collections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  return parseResponse(res)
}

export async function updateCollection(id, payload) {
  const res = await fetch(`${apiBase}/collections/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  return parseResponse(res)
}

export async function deleteCollection(id) {
  const res = await fetch(`${apiBase}/collections/${id}`, {
    method: 'DELETE'
  })
  return parseResponse(res)
}

export async function getRtmpStatus() {
  const res = await fetch(`${apiBase}/rtmp/status`)
  return parseResponse(res)
}

export async function startRtmpServer() {
  const res = await fetch(`${apiBase}/rtmp/start`, {
    method: 'POST'
  })
  return parseResponse(res)
}

export async function stopRtmpServer() {
  const res = await fetch(`${apiBase}/rtmp/stop`, {
    method: 'POST'
  })
  return parseResponse(res)
}
