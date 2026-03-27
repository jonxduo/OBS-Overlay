import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import MonacoEditor from '@monaco-editor/react'
import {
  createCollection,
  createOverlay,
  createOverlayTheme,
  deleteOverlay,
  getCollections,
  getOverlayTheme,
  updateCollection,
  updateOverlayTheme
} from '../api'
import { coerceNestedItems, getFieldDefaultValue, getNestedDefaultItem, normalizeThemeFields } from '../utils/themeFields'

const SECTIONS = [
  { key: 'panel', label: 'panel', field: 'config_params', hint: 'JSON config params', language: 'json' },
  { key: 'overlay', label: 'overlay.html', field: 'html', hint: 'Contenuto HTML overlay', language: 'html' },
  { key: 'style', label: 'style.css', field: 'css', hint: 'Stili CSS overlay', language: 'css' },
  { key: 'functions', label: 'functions.js', field: 'js', hint: 'Funzioni JavaScript overlay', language: 'javascript' },
  { key: 'preview', label: 'preview', field: null, hint: 'Anteprima non disponibile' }
]

function ensurePreviewDefaults(fields, config) {
  const source = config ?? {}
  let changed = false
  const next = { ...source }

  for (const field of fields) {
    const name = field?.name
    if (!name) continue
    if (next[name] == null) {
      next[name] = getFieldDefaultValue(field)
      changed = true
    }
  }

  return changed ? next : source
}

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
  const [previewConfig, setPreviewConfig] = useState({})
  const [status, setStatus] = useState('')
  const [previewSession, setPreviewSession] = useState({
    loading: false,
    error: '',
    panelUrl: '',
    sourceUrl: ''
  })

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
        setPreviewConfig({})
      } catch (err) {
        setStatus(`Errore caricamento: ${err.message}`)
      }
    }

    loadTheme()
  }, [id])

  async function onSave(event) {
    event.preventDefault()
    await saveThemeSilently()
  }

  async function saveThemeSilently() {
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
        setStatus('')
        navigate(`/themes/${created.id}`, { replace: true })
        return created.id
      } else {
        await updateOverlayTheme(id, payload)
        setStatus('')
        return Number(id)
      }
    } catch (err) {
      setStatus(`Errore salvataggio: ${err.message}`)
      return null
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

  const parsedConfig = useMemo(() => {
    try {
      return { value: JSON.parse(form.config_params || '{}'), error: '' }
    } catch {
      return { value: { fields: [] }, error: 'Config Params JSON non valido: preview form disabilitato.' }
    }
  }, [form.config_params])

  const previewFields = useMemo(() => normalizeThemeFields(parsedConfig.value, previewConfig), [parsedConfig.value, previewConfig])

  useEffect(() => {
    if (!previewFields.length) return
    setPreviewConfig((prev) => ensurePreviewDefaults(previewFields, prev))
  }, [previewFields])

  function onEditorChange(nextValue) {
    if (!currentSection.field) return
    setForm((prev) => ({
      ...prev,
      [currentSection.field]: nextValue
    }))
  }

  function updatePreviewField(name, value) {
    setPreviewConfig((prev) => ({
      ...prev,
      [name]: value
    }))
  }

  async function preparePreviewSession() {
    setPreviewSession((prev) => ({ ...prev, loading: true, error: '' }))

    const themeId = await saveThemeSilently()
    if (!themeId) {
      setPreviewSession((prev) => ({ ...prev, loading: false, error: 'Salvataggio tema fallito' }))
      return
    }

    try {
      const collections = await getCollections()
      let systemCollection = collections.find((collection) => collection.title === '000-system')

      if (!systemCollection) {
        systemCollection = await createCollection({ title: '000-system', overlay_ids: [] })
      } else {
        const oldIds = systemCollection.overlay_ids ?? []
        if (oldIds.length) {
          await Promise.all(oldIds.map((overlayId) => deleteOverlay(overlayId).catch(() => null)))
          await updateCollection(systemCollection.id, {
            title: systemCollection.title,
            overlay_ids: []
          })
        }
      }

      const overlay = await createOverlay({
        title: `preview-theme-${themeId}`,
        overlay_theme_id: Number(themeId),
        config: previewConfig ?? {}
      })

      await updateCollection(systemCollection.id, {
        title: systemCollection.title,
        overlay_ids: [overlay.id]
      })

      const origin = window.location.origin
      const panelUrl = `${origin}/panel?collectionId=${systemCollection.id}&collectionTitle=000-system&lockCollection=1`
      const sourceUrl = `${origin}/source/${overlay.id}`

      setPreviewSession({
        loading: false,
        error: '',
        panelUrl,
        sourceUrl
      })
      setActiveSection('preview')
    } catch (err) {
      setPreviewSession((prev) => ({
        ...prev,
        loading: false,
        error: `Errore preparazione preview: ${err.message}`
      }))
    }
  }

  function renderPreviewField(field) {
    const name = field?.name
    if (!name) return null
    const type = field.type || 'text'
    const value = previewConfig[name]

    if (type === 'nested') {
      const items = coerceNestedItems(value)
      const itemFields = Array.isArray(field?.item?.fields) ? field.item.fields : []

      const applyItems = (nextItems) => {
        setPreviewConfig((prev) => {
          const next = {
            ...prev,
            [name]: nextItems
          }
          if (name.endsWith('_json')) {
            const mirrorKey = name.slice(0, -5)
            if (mirrorKey) next[mirrorKey] = nextItems
          }
          return next
        })
      }

      return (
        <div className="panel-nested-field" key={name}>
          <div className="panel-nested-head">
            <strong>{name}</strong>
            <button
              type="button"
              className="panel-btn panel-nested-add-btn"
              onClick={() => applyItems([...items, getNestedDefaultItem(field)])}
            >
              +
            </button>
          </div>

          {items.length === 0 && <p className="panel-nested-empty">Nessun item</p>}

          {items.map((item, index) => (
            <div className="panel-nested-item" key={`${name}-${index}`}>
              <div className="panel-nested-item-head">
                <button
                  type="button"
                  className="panel-btn panel-delete-btn panel-nested-remove-btn"
                  onClick={() => applyItems(items.filter((_, rowIndex) => rowIndex !== index))}
                >
                  <i className="fa-solid fa-trash" />
                </button>
              </div>

              <div className="panel-nested-item-fields">
                {itemFields.map((itemField) => {
                  const itemName = itemField?.name
                  if (!itemName) return null
                  const itemType = itemField.type || 'text'
                  const itemValue = item?.[itemName]

                  if (itemType === 'checkbox') {
                    return (
                      <label key={`${name}-${index}-${itemName}`} className="panel-field-inline">
                        <span>{itemField.label || itemName}</span>
                        <input
                          type="checkbox"
                          checked={Boolean(itemValue)}
                          onChange={(e) => {
                            const nextItems = items.map((row, rowIndex) =>
                              rowIndex !== index ? row : { ...row, [itemName]: e.target.checked }
                            )
                            applyItems(nextItems)
                          }}
                        />
                      </label>
                    )
                  }

                  if (itemType === 'select' && Array.isArray(itemField.options)) {
                    return (
                      <label key={`${name}-${index}-${itemName}`}>
                        {itemField.label || itemName}
                        <select
                          value={itemValue ?? ''}
                          onChange={(e) => {
                            const nextItems = items.map((row, rowIndex) =>
                              rowIndex !== index ? row : { ...row, [itemName]: e.target.value }
                            )
                            applyItems(nextItems)
                          }}
                        >
                          <option value="">Seleziona...</option>
                          {itemField.options.map((option) => {
                            const optionValue = typeof option === 'object' ? option.value : option
                            const optionLabel = typeof option === 'object' ? option.label : option
                            return (
                              <option key={String(optionValue)} value={String(optionValue)}>
                                {String(optionLabel)}
                              </option>
                            )
                          })}
                        </select>
                      </label>
                    )
                  }

                  if (itemType === 'textarea' || itemField.multiline === true) {
                    return (
                      <label key={`${name}-${index}-${itemName}`}>
                        {itemField.label || itemName}
                        <textarea
                          rows={Number(itemField.rows) > 0 ? Number(itemField.rows) : 3}
                          value={itemValue ?? ''}
                          onChange={(e) => {
                            const nextItems = items.map((row, rowIndex) =>
                              rowIndex !== index ? row : { ...row, [itemName]: e.target.value }
                            )
                            applyItems(nextItems)
                          }}
                        />
                      </label>
                    )
                  }

                  return (
                    <label key={`${name}-${index}-${itemName}`}>
                      {itemField.label || itemName}
                      <input
                        type={itemType === 'number' ? 'number' : 'text'}
                        value={itemValue ?? ''}
                        onChange={(e) => {
                          const nextItems = items.map((row, rowIndex) =>
                            rowIndex !== index
                              ? row
                              : { ...row, [itemName]: itemType === 'number' ? Number(e.target.value) : e.target.value }
                          )
                          applyItems(nextItems)
                        }}
                      />
                    </label>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )
    }

    if (type === 'select' && Array.isArray(field.options)) {
      return (
        <label key={name}>
          {field.label || name}
          <select value={value ?? ''} onChange={(e) => updatePreviewField(name, e.target.value)}>
            <option value="">Seleziona...</option>
            {field.options.map((option) => {
              const optionValue = typeof option === 'object' ? option.value : option
              const optionLabel = typeof option === 'object' ? option.label : option
              return (
                <option key={String(optionValue)} value={String(optionValue)}>
                  {String(optionLabel)}
                </option>
              )
            })}
          </select>
        </label>
      )
    }

    if (type === 'checkbox') {
      return (
        <label key={name} className="panel-field-inline">
          <span>{field.label || name}</span>
          <input type="checkbox" checked={Boolean(value)} onChange={(e) => updatePreviewField(name, e.target.checked)} />
        </label>
      )
    }

    if (type === 'textarea' || field.multiline === true) {
      return (
        <label key={name}>
          {field.label || name}
          <textarea
            rows={Number(field.rows) > 0 ? Number(field.rows) : 3}
            value={value ?? ''}
            onChange={(e) => updatePreviewField(name, e.target.value)}
          />
        </label>
      )
    }

    return (
      <label key={name}>
        {field.label || name}
        <input
          type={type === 'number' ? 'number' : 'text'}
          value={value ?? ''}
          onChange={(e) => updatePreviewField(name, type === 'number' ? Number(e.target.value) : e.target.value)}
        />
      </label>
    )
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
                onClick={() => {
                  if (section.key === 'preview') {
                    preparePreviewSession()
                    return
                  }
                  setActiveSection(section.key)
                }}
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
              <div className="theme-preview-split">
                <div className="theme-preview-form-pane">
                  {previewSession.loading && <p className="status">Preparazione preview...</p>}
                  {!previewSession.loading && previewSession.error && <p className="status">{previewSession.error}</p>}
                  {!previewSession.loading && !previewSession.error && previewSession.panelUrl && (
                    <iframe title="Panel preview" className="theme-preview-iframe" src={previewSession.panelUrl} />
                  )}
                </div>

                <div className="theme-preview-render-pane">
                  {previewSession.loading && <p className="status">Caricamento source...</p>}
                  {!previewSession.loading && previewSession.error && <p className="status">{previewSession.error}</p>}
                  {!previewSession.loading && !previewSession.error && previewSession.sourceUrl && (
                    <iframe title="Source preview" className="theme-preview-iframe" src={previewSession.sourceUrl} />
                  )}
                </div>
              </div>
            ) : (
              <div className="theme-editor-plain-wrap">
                <div className="theme-editor-plain-hint">{currentSection.hint}</div>
                <div className="theme-monaco-wrap">
                  <MonacoEditor
                    theme="vs-dark"
                    language={currentSection.language || 'plaintext'}
                    value={currentValue}
                    onChange={(value) => onEditorChange(value ?? '')}
                    options={{
                      minimap: { enabled: false },
                      fontSize: 11,
                      lineNumbers: 'on',
                      automaticLayout: true,
                      scrollBeyondLastLine: false,
                      wordWrap: 'off',
                      tabSize: 2,
                      smoothScrolling: true
                    }}
                  />
                </div>
              </div>
            )}
          </section>
        </div>
      </form>
    </div>
  )
}
