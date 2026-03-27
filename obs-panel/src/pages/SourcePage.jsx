import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getApiWebSocketUrl, getOverlay, getOverlayTheme } from '../api'

export function SourcePage() {
  const { id } = useParams()
  const [overlay, setOverlay] = useState(null)
  const [theme, setTheme] = useState(null)
  const rootRef = useRef(null)
  const styleRef = useRef(null)
  const controllerRef = useRef(null)
  const lastRuntimeAtRef = useRef(null)

  useEffect(() => {
    let mounted = true

    async function loadOverlayAndTheme() {
      if (!id) return
      try {
        const overlayData = await getOverlay(id)
        const themeData = await getOverlayTheme(overlayData.overlay_theme_id)
        if (mounted) {
          setOverlay(overlayData)
          setTheme(themeData)
        }
      } catch {
        // Source must remain visually empty if data is unavailable.
      }
    }

    loadOverlayAndTheme()

    let socket = null
    let reconnectTimer = null

    function connect() {
      if (!mounted || !id) return
      socket = new WebSocket(getApiWebSocketUrl())

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          const type = message?.type
          const payload = message?.payload ?? {}
          const eventOverlayId = Number(payload?.id)

          if (type === 'overlay_updated' || type === 'overlay_created' || type === 'overlay_deleted') {
            if (eventOverlayId === Number(id)) {
              loadOverlayAndTheme()
            }
            return
          }

          if (type === 'overlay_theme_updated') {
            loadOverlayAndTheme()
          }
        } catch {
        }
      }

      socket.onclose = () => {
        if (!mounted) return
        reconnectTimer = setTimeout(connect, 1200)
      }

      socket.onerror = () => {
        socket?.close()
      }
    }

    connect()

    return () => {
      mounted = false
      if (reconnectTimer) clearTimeout(reconnectTimer)
      socket?.close()
    }
  }, [id])

  useEffect(() => {
    if (!theme || !rootRef.current || !styleRef.current) {
      return
    }

    rootRef.current.innerHTML = theme.html || ''
    styleRef.current.textContent = theme.css || ''

    if (controllerRef.current?.destroy) {
      controllerRef.current.destroy()
    }

    const sourceJs = String(theme.js || '')
    try {
      const factory = new Function(
        'root',
        'config',
        'helpers',
        `${sourceJs}\n;return (typeof createOverlayThemeController === 'function') ? createOverlayThemeController(root, config, helpers) : {};`
      )

      const helpers = {
        setText(selector, value) {
          const element = rootRef.current?.querySelector(selector)
          if (element) element.textContent = String(value)
        }
      }

      controllerRef.current = factory(rootRef.current, overlay?.config ?? {}, helpers) || {}
      lastRuntimeAtRef.current = null
    } catch {
      controllerRef.current = {}
    }

    return () => {
      if (controllerRef.current?.destroy) {
        controllerRef.current.destroy()
      }
    }
  }, [theme?.id])

  useEffect(() => {
    if (!overlay || !controllerRef.current) return

    if (typeof controllerRef.current.updateConfig === 'function') {
      controllerRef.current.updateConfig(overlay.config ?? {})
    }

    const runtime = overlay.config?.__runtime
    if (!runtime?.action || runtime?.at == null) {
      return
    }

    if (runtime.at === lastRuntimeAtRef.current) {
      return
    }

    lastRuntimeAtRef.current = runtime.at
    const handler = controllerRef.current[runtime.action]
    if (typeof handler === 'function') {
      handler()
    }
  }, [overlay])

  return (
    <>
      <style ref={styleRef} />
      <div ref={rootRef} className="source-canvas" />
    </>
  )
}
