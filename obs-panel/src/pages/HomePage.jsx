import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  createOverlayTheme,
  deleteOverlayTheme,
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

    async function pollRtmpStatus() {
      try {
        const statusData = await getRtmpStatus()
        if (alive) {
          setRtmpInfo((prev) => (hasRtmpChanged(prev, statusData) ? statusData : prev))
        }
      } catch {
        if (alive) {
          setRtmpInfo((prev) => {
            if (!prev.running && !prev.ingest_active) return prev
            return { ...prev, running: false, ingest_active: false }
          })
        }
      }
    }

    const id = setInterval(pollRtmpStatus, 1500)
    return () => {
      alive = false
      clearInterval(id)
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
      await createOverlayTheme({
        title: payload.title,
        config_params: payload.config_params ?? {},
        html: payload.html ?? '',
        css: payload.css ?? '',
        js: payload.js ?? ''
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
      const text = await file.text()
      const payload = JSON.parse(text)
      await onImportThemePayload(payload)
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
              accept="application/json,.json"
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
