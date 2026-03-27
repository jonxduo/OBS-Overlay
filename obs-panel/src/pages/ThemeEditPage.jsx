import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { createOverlayTheme, getOverlayTheme, updateOverlayTheme } from '../api'

export function ThemeEditPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNewTheme = !id
  const [form, setForm] = useState({
    title: '',
    config_params: '{"fields":[]}',
    html: '',
    css: '',
    js: ''
  })
  const [status, setStatus] = useState('')

  useEffect(() => {
    async function loadTheme() {
      if (!id) return
      try {
        const theme = await getOverlayTheme(id)
        setForm({
          title: theme.title,
          config_params: JSON.stringify(theme.config_params ?? { fields: [] }, null, 2),
          html: theme.html ?? '',
          css: theme.css ?? '',
          js: theme.js ?? ''
        })
      } catch (err) {
        setStatus(`Errore caricamento: ${err.message}`)
      }
    }

    loadTheme()
  }, [id])

  async function onSave(event) {
    event.preventDefault()

    try {
      const payload = {
        title: form.title,
        config_params: JSON.parse(form.config_params || '{}'),
        html: form.html,
        css: form.css,
        js: form.js
      }

      if (isNewTheme) {
        const created = await createOverlayTheme(payload)
        setStatus('Tema creato')
        navigate(`/themes/${created.id}`, { replace: true })
      } else {
        await updateOverlayTheme(id, payload)
        setStatus('Tema aggiornato')
      }
    } catch (err) {
      setStatus(`Errore salvataggio: ${err.message}`)
    }
  }

  async function onExportTheme() {
    try {
      const payload = {
        title: form.title,
        config_params: JSON.parse(form.config_params || '{}'),
        html: form.html,
        css: form.css,
        js: form.js
      }
      const json = JSON.stringify(payload, null, 2)
      await navigator.clipboard.writeText(json)
      setStatus('JSON tema copiato negli appunti')
    } catch (err) {
      setStatus(`Errore export: ${err.message}`)
    }
  }

  return (
    <div className="home-page">
      <h1>{isNewTheme ? 'Nuovo Tema' : 'Modifica Tema'}</h1>
      <div className="quick-links">
        <Link to="/">Torna alla home</Link>
        <button type="button" onClick={onExportTheme}>
          Esporta tema JSON
        </button>
      </div>

      <p className="status">{status}</p>

      <form className="card" onSubmit={onSave}>
        <label>
          Titolo
          <input value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} required />
        </label>
        <label>
          Config Params JSON
          <textarea rows="6" value={form.config_params} onChange={(e) => setForm((prev) => ({ ...prev, config_params: e.target.value }))} />
        </label>
        <label>
          HTML
          <textarea rows="5" value={form.html} onChange={(e) => setForm((prev) => ({ ...prev, html: e.target.value }))} />
        </label>
        <label>
          CSS
          <textarea rows="5" value={form.css} onChange={(e) => setForm((prev) => ({ ...prev, css: e.target.value }))} />
        </label>
        <label>
          JS
          <textarea rows="8" value={form.js} onChange={(e) => setForm((prev) => ({ ...prev, js: e.target.value }))} />
        </label>

        <button type="submit">{isNewTheme ? 'Crea tema' : 'Salva modifiche'}</button>
      </form>
    </div>
  )
}
