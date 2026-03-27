import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import JSZip from 'jszip'
import {
  createOverlayTheme,
  deleteOverlayTheme,
  getApiWebSocketUrl,
  getOverlayThemes,
  getRtmpStatus,
  startRtmpServer,
  stopRtmpServer
} from '../api'

export function HomePage() {
  const [themes, setThemes] = useState([])
  const [status, setStatus] = useState('')
  const [rtmpInfo, setRtmpInfo] = useState({
    running: false,
    rtmp_url: '',
    rtmp_ingest_server: '',
    rtmp_stream_key: '',
    rtmp_publish_url: '',
    rtmp_playback_url: '',
    phone_camera_publish_url: '',
    obs_source_url: '',
    ingest_active: false
  })
  const importInputRef = useRef(null)
  const panelUrl = `${window.location.origin}/panel`

  function validateConfigParams(value) {
    if (value == null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('panel.json non valido: deve essere un oggetto JSON')
    }
    return value
  }

  function validateHtml(value) {
    const html = String(value ?? '')
    if (!html.trim()) {
      throw new Error('index.html vuoto')
    }
    const doc = new DOMParser().parseFromString(html, 'text/html')
    if (!doc || !doc.documentElement) {
      throw new Error('index.html non valido')
    }
    return html
  }

  function validateCss(value) {
    const css = String(value ?? '')
    if (!css.trim()) {
      throw new Error('style.css vuoto')
    }
    if (typeof CSSStyleSheet !== 'undefined') {
      const sheet = new CSSStyleSheet()
      sheet.replaceSync(css)
    }
    return css
  }

  function validateJs(value) {
    const js = String(value ?? '')
    if (!js.trim()) {
      throw new Error('functions.js vuoto')
    }
    // Validate syntax without executing.
    new Function(js)
    return js
  }

  async function readZipTheme(file) {
    const zip = await JSZip.loadAsync(file)
    const names = Object.keys(zip.files)
    const byBasename = new Map()
    for (const name of names) {
      const entry = zip.files[name]
      if (entry.dir) continue
      const base = name.split('/').pop()?.toLowerCase()
      if (base) byBasename.set(base, entry)
    }

    const panelEntry = byBasename.get('panel.json')
    const htmlEntry = byBasename.get('index.html')
    const cssEntry = byBasename.get('style.css')
    const jsEntry = byBasename.get('functions.js') ?? byBasename.get('funcion.js')

    if (!panelEntry || !htmlEntry || !cssEntry || !jsEntry) {
      throw new Error('ZIP non valido: richiesti panel.json, index.html, style.css, functions.js')
    }

    const panelText = await panelEntry.async('string')
    const htmlText = await htmlEntry.async('string')
    const cssText = await cssEntry.async('string')
    const jsText = await jsEntry.async('string')

    let parsedPanel
    try {
      parsedPanel = JSON.parse(panelText)
    } catch {
      throw new Error('panel.json non valido: JSON malformato')
    }

    const title = file.name.replace(/\.[^.]+$/, '') || 'Imported Theme'

    return {
      title,
      config_params: validateConfigParams(parsedPanel),
      html: validateHtml(htmlText),
      css: validateCss(cssText),
      js: validateJs(jsText)
    }
  }

  function hasRtmpChanged(prev, next) {
    return (
      Boolean(prev?.running) !== Boolean(next?.running) ||
      Boolean(prev?.ingest_active) !== Boolean(next?.ingest_active) ||
      String(prev?.rtmp_url ?? '') !== String(next?.rtmp_url ?? '') ||
      String(prev?.rtmp_ingest_server ?? '') !== String(next?.rtmp_ingest_server ?? '') ||
      String(prev?.rtmp_stream_key ?? '') !== String(next?.rtmp_stream_key ?? '') ||
      String(prev?.rtmp_publish_url ?? '') !== String(next?.rtmp_publish_url ?? '') ||
      String(prev?.rtmp_playback_url ?? '') !== String(next?.rtmp_playback_url ?? '') ||
      String(prev?.phone_camera_publish_url ?? '') !== String(next?.phone_camera_publish_url ?? '') ||
      String(prev?.obs_source_url ?? '') !== String(next?.obs_source_url ?? '')
    )
  }

  async function loadThemes() {
    const data = await getOverlayThemes()
    setThemes(data)
  }

  useEffect(() => {
    async function init() {
      await loadThemes()
      const statusData = await getRtmpStatus()
      setRtmpInfo(statusData)
    }

    init().catch((err) => setStatus(err.message))
  }, [])

  useEffect(() => {
    let alive = true
    let socket = null
    let reconnectTimer = null

    function connect() {
      if (!alive) return
      const wsUrl = getApiWebSocketUrl()
      socket = new WebSocket(wsUrl)

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          const type = message?.type
          const payload = message?.payload ?? {}

          if (type === 'rtmp_status') {
            setRtmpInfo((prev) => (hasRtmpChanged(prev, payload) ? payload : prev))
            return
          }

          if (type === 'overlay_theme_created' || type === 'overlay_theme_updated' || type === 'overlay_theme_deleted') {
            loadThemes().catch(() => {})
          }
        } catch {
        }
      }

      socket.onclose = () => {
        if (!alive) return
        reconnectTimer = setTimeout(connect, 1200)
      }

      socket.onerror = () => {
        socket?.close()
      }
    }

    connect()

    return () => {
      alive = false
      if (reconnectTimer) clearTimeout(reconnectTimer)
      socket?.close()
    }
  }, [])

  async function onStartRtmp() {
    try {
      const data = await startRtmpServer()
      setRtmpInfo(data)
      setStatus('Server RTMP avviato')
    } catch (err) {
      setStatus(`Errore start RTMP: ${err.message}`)
    }
  }

  async function onStopRtmp() {
    try {
      const data = await stopRtmpServer()
      setRtmpInfo(data)
      setStatus('Server RTMP fermato')
    } catch (err) {
      setStatus(`Errore stop RTMP: ${err.message}`)
    }
  }

  async function onCopyPanelUrl() {
    try {
      await navigator.clipboard.writeText(panelUrl)
      setStatus(`URL panel copiato: ${panelUrl}`)
    } catch {
      setStatus(`URL panel: ${panelUrl}`)
    }
  }

  async function onCopyText(label, text) {
    if (!text) {
      setStatus(`${label} non disponibile`)
      return
    }

    try {
      await navigator.clipboard.writeText(text)
      setStatus(`${label} copiato`) 
    } catch {
      setStatus(`${label}: ${text}`)
    }
  }

  async function onImportThemePayload(payload) {
    try {
      const configParams = validateConfigParams(payload.config_params ?? {})
      const html = validateHtml(payload.html ?? '')
      const css = validateCss(payload.css ?? '')
      const js = validateJs(payload.js ?? '')
      await createOverlayTheme({
        title: String(payload.title || '').trim() || 'Imported Theme',
        config_params: configParams,
        html,
        css,
        js
      })
      await loadThemes()
      setStatus('Theme importato')
    } catch (err) {
      setStatus(`Errore import: ${err.message}`)
    }
  }

  function onOpenImportPicker() {
    importInputRef.current?.click()
  }

  async function onImportFileChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const lowerName = file.name.toLowerCase()
      if (lowerName.endsWith('.zip')) {
        const payload = await readZipTheme(file)
        await onImportThemePayload(payload)
      } else {
        const text = await file.text()
        const payload = JSON.parse(text)
        await onImportThemePayload(payload)
      }
    } catch (err) {
      setStatus(`Errore import file: ${err.message}`)
    }
  }

  async function onDeleteTheme(themeId) {
    try {
      await deleteOverlayTheme(themeId)
      await loadThemes()
      setStatus(`Theme ${themeId} eliminato`)
    } catch (err) {
      setStatus(`Errore eliminazione: ${err.message}`)
    }
  }

  return (
    <div className="home-page">
      <details className="rtmp-accordion" open>
        <summary>
          <span>OBS Panel</span>
        </summary>
        <div className="rtmp-mini-box">
          <p className="subtitle">Aggiungi questo URL in OBS tramite Docks - Custom Browser Docks per avere il pannello sempre disponibile.</p>
          <div className="panel-url-row">
            <textarea readOnly rows={2} value={panelUrl} />
            <button type="button" onClick={onCopyPanelUrl}>Copia</button>
          </div>
        </div>
      </details>

      <details className="rtmp-accordion">
        <summary>
          <span>Stream</span>
          <span className="rtmp-header-actions">
            <button
              type="button"
              className={`rtmp-header-btn ${rtmpInfo.running ? 'running' : ''}`}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onStartRtmp()
              }}
            >
              <i className="fa-solid fa-play" /> Start
            </button>
            <button
              type="button"
              className="rtmp-header-btn"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onStopRtmp()
              }}
            >
              <i className="fa-solid fa-stop" /> Stop
            </button>
            <span className="rtmp-led-group">
              <span className={`rtmp-led ${rtmpInfo.running ? 'on' : 'off'}`} title="Server RTMP" />
              <span className={`rtmp-led ${rtmpInfo.ingest_active ? 'on' : 'off'}`} title="Segnale in ingresso" />
            </span>
          </span>
        </summary>
        <div className="rtmp-mini-box">
          <p className="subtitle">Questa sezione avvia e ferma il server RTMP locale per ingest e playback dello stream.</p>

          <div className="rtmp-mini-row">
            <span>TX</span>
            <input readOnly value={rtmpInfo.phone_camera_publish_url || rtmpInfo.rtmp_publish_url} />
            <button type="button" onClick={() => onCopyText('URL TX', rtmpInfo.phone_camera_publish_url || rtmpInfo.rtmp_publish_url)}>
              Copia
            </button>
          </div>

          <div className="rtmp-mini-row">
            <span>OBS</span>
            <input readOnly value={rtmpInfo.obs_source_url || rtmpInfo.rtmp_playback_url} />
            <button type="button" onClick={() => onCopyText('URL OBS', rtmpInfo.obs_source_url || rtmpInfo.rtmp_playback_url)}>
              Copia
            </button>
          </div>
        </div>
      </details>

      <details className="rtmp-accordion" open>
        <summary>
          <span>Overlay Themes</span>
        </summary>
        <div className="rtmp-mini-box">
          <div className="theme-toolbar">
            <Link to="/themes/new" className="panel-btn theme-link-btn">
              <i className="fa-solid fa-plus" /> New
            </Link>
            <button type="button" className="panel-btn" onClick={onOpenImportPicker}>
              <i className="fa-solid fa-file-import" /> Import
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json,application/zip,.zip"
              className="hidden-file-input"
              onChange={onImportFileChange}
            />
          </div>

          <div className="themes-list compact">
            {themes.length === 0 && <p>Nessun tema disponibile.</p>}
            {themes.map((theme) => (
              <div className="theme-item" key={theme.id}>
                <div className="theme-item-header">
                  <strong>
                    #{theme.id} - {theme.title}
                  </strong>
                  <div className="theme-item-actions">
                    <Link to={`/themes/${theme.id}`} className="panel-btn theme-link-btn">
                      Edit
                    </Link>
                    <button type="button" className="panel-btn panel-delete-btn" onClick={() => onDeleteTheme(theme.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </details>

      <p className="status">{status}</p>
    </div>
  )
}
