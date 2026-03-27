import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { createOverlayTheme, getOverlayTheme, updateOverlayTheme } from '../api'

const SECTIONS = [
  { key: 'panel', label: 'panel', field: 'config_params', hint: 'JSON config params' },
  { key: 'overlay', label: 'overlay.html', field: 'html', hint: 'Contenuto HTML overlay' },
  { key: 'style', label: 'style.css', field: 'css', hint: 'Stili CSS overlay' },
  { key: 'functions', label: 'functions.js', field: 'js', hint: 'Funzioni JavaScript overlay' },
  { key: 'preview', label: 'preview', field: null, hint: 'Anteprima non disponibile' }
]

export function ThemeEditPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNewTheme = !id
  const [activeSection, setActiveSection] = useState('panel')
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

  const currentSection = SECTIONS.find((section) => section.key === activeSection) ?? SECTIONS[0]
  const currentValue = currentSection.field ? form[currentSection.field] ?? '' : ''

  function onEditorChange(nextValue) {
    if (!currentSection.field) return
    setForm((prev) => ({
      ...prev,
      [currentSection.field]: nextValue
    }))
  }

  return (
    <div className="home-page theme-editor-page">
      {status && <p className="status">{status}</p>}

      <form className="card theme-editor-card" onSubmit={onSave}>
        <div className="theme-editor-topbar">
          <Link to="/" className="panel-btn theme-link-btn">
            <i className="fa-solid fa-arrow-left" /> Home
          </Link>
          <input
            className="theme-title-input"
            placeholder="Titolo tema"
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            required
          />
          <button type="submit" className="panel-btn">
            <i className="fa-solid fa-floppy-disk" /> Save
          </button>
          <button type="button" className="panel-btn" onClick={onExportTheme}>
            <i className="fa-solid fa-file-export" /> Export
          </button>
        </div>

        <div className="theme-editor-layout">
          <aside className="theme-editor-sidebar">
            {SECTIONS.map((section) => (
              <button
                key={section.key}
                type="button"
                className={`theme-section-btn ${activeSection === section.key ? 'active' : ''}`}
                onClick={() => setActiveSection(section.key)}
              >
                {section.label}
              </button>
            ))}
          </aside>

          <section className="theme-editor-main">
            <div className="theme-editor-main-head">
              <strong>{currentSection.label}</strong>
              {!isNewTheme && <span>ID tema: {id}</span>}
            </div>

            {currentSection.key === 'preview' ? (
              <div className="theme-preview-placeholder">Preview non ancora disponibile.</div>
            ) : (
              <div className="theme-editor-plain-wrap">
                <div className="theme-editor-plain-hint">{currentSection.hint}</div>
                <textarea
                  className="theme-plain-editor"
                  value={currentValue}
                  onChange={(e) => onEditorChange(e.target.value)}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  autoComplete="off"
                />
              </div>
            )}
          </section>
        </div>
      </form>
    </div>
  )
}
