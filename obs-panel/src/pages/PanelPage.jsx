import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  createCollection,
  createOverlay,
  deleteCollection,
  deleteOverlay,
  getApiWebSocketUrl,
  getCollections,
  getOverlays,
  getOverlayThemes,
  updateCollection,
  updateOverlay
} from '../api'
import { coerceNestedItems, getNestedDefaultItem, normalizeThemeFields } from '../utils/themeFields'

export function PanelPage() {
  const location = useLocation()
  const [collections, setCollections] = useState([])
  const [overlays, setOverlays] = useState([])
  const [themes, setThemes] = useState([])
  const [status, setStatus] = useState('')
  const [selectedCollectionId, setSelectedCollectionId] = useState('')
  const [isNewCollectionMode, setIsNewCollectionMode] = useState(false)
  const [newCollectionTitle, setNewCollectionTitle] = useState('')
  const [newOverlayTitle, setNewOverlayTitle] = useState('')
  const [newOverlayThemeId, setNewOverlayThemeId] = useState('')
  const [overlayDrafts, setOverlayDrafts] = useState({})
  const [sourceListenerCounts, setSourceListenerCounts] = useState({})
  const [deleteHold, setDeleteHold] = useState({ overlayId: null, active: false, ready: false })
  const deleteHoldTimeoutRef = useRef(null)

  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const forcedCollectionId = searchParams.get('collectionId')
  const forcedCollectionTitle = searchParams.get('collectionTitle')
  const isCollectionLocked = searchParams.get('lockCollection') === '1'

  const themeById = useMemo(() => {
    const map = new Map()
    for (const theme of themes) {
      map.set(Number(theme.id), theme)
    }
    return map
  }, [themes])

  const overlaysById = useMemo(() => {
    const map = new Map()
    for (const overlay of overlays) {
      map.set(Number(overlay.id), overlay)
    }
    return map
  }, [overlays])

  const selectedCollection = collections.find((c) => Number(c.id) === Number(selectedCollectionId))
  const visibleCollections = collections.filter((collection) => collection.title !== '000-system')
  const selectedOverlays = (selectedCollection?.overlay_ids ?? [])
    .map((id) => overlaysById.get(Number(id)))
    .filter(Boolean)

  useEffect(() => {
    async function loadData() {
      const [collectionData, overlayData, themeData] = await Promise.all([
        getCollections(),
        getOverlays(),
        getOverlayThemes()
      ])
      setCollections(collectionData)
      setOverlays(overlayData)
      setThemes(themeData)
      setStatus('')
    }

    loadData().catch((err) => {
      setStatus(`Errore caricamento dati panel: ${err.message}`)
    })
  }, [])

  useEffect(() => {
    if (!collections.length) return

    let forced = null

    if (forcedCollectionId) {
      forced = collections.find((collection) => String(collection.id) === String(forcedCollectionId)) ?? null
    }

    if (!forced && forcedCollectionTitle) {
      forced = collections.find((collection) => collection.title === forcedCollectionTitle) ?? null
    }

    if (forced) {
      setIsNewCollectionMode(false)
      setSelectedCollectionId(String(forced.id))
    }
  }, [collections, forcedCollectionId, forcedCollectionTitle])

  useEffect(() => {
    const nextDrafts = {}
    for (const overlay of selectedOverlays) {
      nextDrafts[overlay.id] = { ...(overlay.config ?? {}) }
    }
    setOverlayDrafts(nextDrafts)
  }, [selectedCollectionId, overlays])

  useEffect(() => {
    return () => {
      if (deleteHoldTimeoutRef.current) {
        clearTimeout(deleteHoldTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    let alive = true
    let socket = null
    let reconnectTimer = null

    function connect() {
      if (!alive) return
      socket = new WebSocket(getApiWebSocketUrl())

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          const type = message?.type
          const payload = message?.payload ?? {}

          if (type === 'source_listener_snapshot') {
            const snapshot = payload?.listeners ?? {}
            if (snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)) {
              setSourceListenerCounts(snapshot)
            }
            return
          }

          if (type === 'source_listener_changed') {
            const overlayId = Number(payload?.overlay_id)
            const count = Number(payload?.count ?? 0)
            if (!Number.isFinite(overlayId) || overlayId <= 0) return
            setSourceListenerCounts((prev) => {
              const next = { ...prev }
              if (count > 0) {
                next[String(overlayId)] = count
              } else {
                delete next[String(overlayId)]
              }
              return next
            })
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

  function clearDeleteHold() {
    if (deleteHoldTimeoutRef.current) {
      clearTimeout(deleteHoldTimeoutRef.current)
      deleteHoldTimeoutRef.current = null
    }
    setDeleteHold({ overlayId: null, active: false, ready: false })
  }

  function startDeleteHold(overlayId, event) {
    event.preventDefault()
    event.stopPropagation()
    if (deleteHoldTimeoutRef.current) {
      clearTimeout(deleteHoldTimeoutRef.current)
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setDeleteHold({ overlayId, active: true, ready: false })
    deleteHoldTimeoutRef.current = setTimeout(() => {
      setDeleteHold((prev) => {
        if (!prev.active || prev.overlayId !== overlayId) return prev
        return { ...prev, ready: true }
      })
    }, 5000)
  }

  function cancelDeleteHold(overlayId, event) {
    event?.preventDefault?.()
    event?.stopPropagation?.()
    if (deleteHold.overlayId !== overlayId || !deleteHold.active) return
    clearDeleteHold()
  }

  async function finishDeleteHold(overlayId, event) {
    event.preventDefault()
    event.stopPropagation()
    const canDelete = deleteHold.overlayId === overlayId && deleteHold.active && deleteHold.ready
    clearDeleteHold()
    if (canDelete) {
      await onDeleteOverlay(overlayId)
    }
  }

  async function onCreateCollection(event) {
    event.preventDefault()
    if (!newCollectionTitle.trim()) return

    try {
      const created = await createCollection({ title: newCollectionTitle.trim(), overlay_ids: [] })
      const collectionData = await getCollections()
      setCollections(collectionData)
      setSelectedCollectionId(String(created.id))
      setIsNewCollectionMode(false)
      setNewCollectionTitle('')
      setStatus('')
    } catch (err) {
      setStatus(`Errore creazione collection: ${err.message}`)
    }
  }

  async function copySourceUrl(overlayId) {
    const url = `${window.location.origin}/source/${overlayId}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      window.prompt('Copia questo URL source', url)
    }
  }

  async function saveOverlay(overlayId, configOverride) {
    const overlay = overlaysById.get(Number(overlayId))
    if (!overlay) return

    try {
      const nextConfig = configOverride ?? overlayDrafts[overlayId] ?? {}
      const payload = {
        title: String(overlay.title ?? 'Overlay'),
        overlay_theme_id: Number(overlay.overlay_theme_id),
        config: nextConfig
      }
      await updateOverlay(overlayId, payload)
      setStatus('')
    } catch (err) {
      setStatus(`Errore salvataggio overlay ${overlayId}: ${err.message}`)
    }
  }

  async function applyAction(overlayId, action) {
    const base = overlayDrafts[overlayId] ?? {}
    const next = {
      ...base,
      __runtime: {
        action,
        at: Date.now()
      }
    }

    setOverlayDrafts((prev) => ({
      ...prev,
      [overlayId]: next
    }))

    const overlay = overlaysById.get(Number(overlayId))
    if (!overlay) return

    try {
      await updateOverlay(overlayId, {
        title: String(overlay.title ?? 'Overlay'),
        overlay_theme_id: Number(overlay.overlay_theme_id),
        config: next
      })
      setStatus('')
    } catch (err) {
      setStatus(`Errore azione ${action} su overlay ${overlayId}: ${err.message}`)
    }
  }

  async function onDeleteCollection() {
    if (!selectedCollection) return
    try {
      await deleteCollection(selectedCollection.id)
      const collectionData = await getCollections()
      setCollections(collectionData)
      setSelectedCollectionId('')
      setStatus('')
    } catch (err) {
      setStatus(`Errore eliminazione collection: ${err.message}`)
    }
  }

  async function onDeleteOverlay(overlayId) {
    if (!selectedCollection) return

    try {
      const nextIds = (selectedCollection.overlay_ids ?? []).filter((id) => Number(id) !== Number(overlayId))
      await updateCollection(selectedCollection.id, {
        title: selectedCollection.title,
        overlay_ids: nextIds
      })
      await deleteOverlay(overlayId)

      const [collectionData, overlayData] = await Promise.all([getCollections(), getOverlays()])
      setCollections(collectionData)
      setOverlays(overlayData)
      setStatus('')
    } catch (err) {
      setStatus(`Errore eliminazione overlay ${overlayId}: ${err.message}`)
    }
  }

  async function onAddOverlay(event) {
    event.preventDefault()
    if (selectedCollection?.title === '000-system' || isCollectionLocked) return
    if (!selectedCollection || !newOverlayThemeId || !newOverlayTitle.trim()) return

    try {
      const created = await createOverlay({
        title: newOverlayTitle.trim(),
        overlay_theme_id: Number(newOverlayThemeId),
        config: {}
      })

      await updateCollection(selectedCollection.id, {
        title: selectedCollection.title,
        overlay_ids: [...(selectedCollection.overlay_ids ?? []), created.id]
      })

      const [collectionData, overlayData] = await Promise.all([getCollections(), getOverlays()])
      setCollections(collectionData)
      setOverlays(overlayData)
      setNewOverlayTitle('')
      setNewOverlayThemeId('')
      setStatus('')
    } catch (err) {
      setStatus(`Errore creazione overlay: ${err.message}`)
    }
  }

  return (
    <div className="panel-page">
      <div className="panel-header-row">
        <select
          disabled={isCollectionLocked}
          value={isNewCollectionMode ? '__new__' : selectedCollectionId}
          onChange={(e) => {
            const next = e.target.value
            if (next === '__new__') {
              setIsNewCollectionMode(true)
              setSelectedCollectionId('')
            } else {
              setIsNewCollectionMode(false)
              setSelectedCollectionId(next)
            }
          }}
        >
          <option value="">Seleziona collection...</option>
          {!isCollectionLocked && <option value="__new__">+ Crea nuova collection</option>}
          {selectedCollection?.title === '000-system' && (
            <option value={selectedCollectionId}>000-system</option>
          )}
          {visibleCollections.map((collection) => (
            <option key={collection.id} value={collection.id}>
              {collection.title}
            </option>
          ))}
        </select>
        {!!selectedCollectionId && !isCollectionLocked && (
          <button type="button" className="panel-btn panel-delete-btn" onClick={onDeleteCollection}>
            <i className="fa-solid fa-trash" />
          </button>
        )}
      </div>

      {isNewCollectionMode && (
        <form className="panel-new-collection" onSubmit={onCreateCollection}>
          <input
            value={newCollectionTitle}
            onChange={(e) => setNewCollectionTitle(e.target.value)}
            placeholder="Titolo collection"
            required
          />
          <button type="submit" className="panel-btn">
            Crea
          </button>
        </form>
      )}

      {!!selectedCollectionId && (
        <div className="panel-accordion-list">
          {selectedOverlays.length === 0 && <p>Nessuna overlay nella collection selezionata.</p>}

          {selectedOverlays.map((overlay) => {
            const draft = overlayDrafts[overlay.id] ?? {}
            const theme = themeById.get(Number(overlay.overlay_theme_id))
            const fields = normalizeThemeFields(theme?.config_params, draft)
            const sourceListening = Number(sourceListenerCounts[String(overlay.id)] ?? 0) > 0
            return (
              <details className="panel-accordion" key={overlay.id}>
                <summary>
                  <span className="panel-accordion-title">{overlay.title ?? `Overlay ${overlay.id}`}</span>
                  <span className="panel-summary-actions">
                    <span
                      className={`panel-source-led ${sourceListening ? 'on' : 'off'}`}
                      title={sourceListening ? 'Source in ascolto' : 'Nessun source in ascolto'}
                    />
                    <button
                      type="button"
                      className="panel-btn"
                      aria-label="Start"
                      title="Start"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        applyAction(overlay.id, 'start')
                      }}
                    >
                      <i className="fa-solid fa-play" />
                    </button>
                    <button
                      type="button"
                      className="panel-btn"
                      aria-label="Stop"
                      title="Stop"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        applyAction(overlay.id, 'stop')
                      }}
                    >
                      <i className="fa-solid fa-stop" />
                    </button>
                    <button
                      type="button"
                      className="panel-btn"
                      aria-label="Restart"
                      title="Restart"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        applyAction(overlay.id, 'restart')
                      }}
                    >
                      <i className="fa-solid fa-rotate-right" />
                    </button>
                  </span>
                </summary>

                <div className="panel-box">
                  <button type="button" className="panel-btn" onClick={() => copySourceUrl(overlay.id)}>
                    <i className="fa-solid fa-link" /> Copia source url
                  </button>

                  <button
                    type="button"
                    className={`panel-btn panel-delete-btn panel-delete-hold-btn ${
                      deleteHold.overlayId === overlay.id && deleteHold.active ? 'holding' : ''
                    } ${deleteHold.overlayId === overlay.id && deleteHold.ready ? 'ready' : ''}`}
                    onPointerDown={(e) => startDeleteHold(overlay.id, e)}
                    onPointerUp={(e) => finishDeleteHold(overlay.id, e)}
                    onPointerLeave={(e) => cancelDeleteHold(overlay.id, e)}
                    onPointerCancel={(e) => cancelDeleteHold(overlay.id, e)}
                    onContextMenu={(e) => e.preventDefault()}
                    aria-label="Elimina overlay (pressione lunga 5 secondi)"
                    title="Tieni premuto 5 secondi, poi rilascia per eliminare"
                  >
                    <span className="panel-delete-hold-label">
                      <i className="fa-solid fa-trash" /> Elimina overlay (tieni premuto 5s)
                    </span>
                  </button>

                  <div className="panel-form-grid">
                    {fields.map((field) => {
                      const name = field?.name
                      if (!name) return null
                      const type = field.type || 'text'
                      const value = draft[name]

                      if (type === 'nested') {
                        const items = coerceNestedItems(value)
                        const itemFields = Array.isArray(field?.item?.fields) ? field.item.fields : []

                        const applyItemsToConfig = (baseConfig, nextItems) => {
                          const next = {
                            ...(baseConfig ?? {}),
                            [name]: nextItems
                          }
                          if (name.endsWith('_json')) {
                            const mirrorKey = name.slice(0, -5)
                            if (mirrorKey) {
                              next[mirrorKey] = nextItems
                            }
                          }
                          return next
                        }

                        const setItems = (nextItems) => {
                          setOverlayDrafts((prev) => {
                            const current = prev[overlay.id] ?? {}
                            const next = applyItemsToConfig(current, nextItems)
                            return {
                              ...prev,
                              [overlay.id]: next
                            }
                          })
                        }

                        return (
                          <div className="panel-nested-field" key={name}>
                            <div className="panel-nested-head">
                              <strong>{name}</strong>
                              <button
                                type="button"
                                className="panel-btn panel-nested-add-btn"
                                aria-label="Aggiungi item"
                                onClick={() => {
                                  const nextItems = [...items, getNestedDefaultItem(field)]
                                  const nextConfig = applyItemsToConfig(draft, nextItems)
                                  setItems(nextItems)
                                  saveOverlay(overlay.id, nextConfig)
                                }}
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
                                    aria-label="Rimuovi item"
                                    onClick={() => {
                                      const nextItems = items.filter((_, rowIndex) => rowIndex !== index)
                                      const nextConfig = applyItemsToConfig(draft, nextItems)
                                      setItems(nextItems)
                                      saveOverlay(overlay.id, nextConfig)
                                    }}
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
                                              const nextItems = items.map((row, rowIndex) => {
                                                if (rowIndex !== index) return row
                                                return {
                                                  ...row,
                                                  [itemName]: e.target.checked
                                                }
                                              })
                                              setItems(nextItems)
                                            }}
                                            onBlur={() => saveOverlay(overlay.id)}
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
                                              const nextItems = items.map((row, rowIndex) => {
                                                if (rowIndex !== index) return row
                                                return {
                                                  ...row,
                                                  [itemName]: e.target.value
                                                }
                                              })
                                              setItems(nextItems)
                                            }}
                                            onBlur={() => saveOverlay(overlay.id)}
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
                                              const nextItems = items.map((row, rowIndex) => {
                                                if (rowIndex !== index) return row
                                                return {
                                                  ...row,
                                                  [itemName]: e.target.value
                                                }
                                              })
                                              setItems(nextItems)
                                            }}
                                            onBlur={() => saveOverlay(overlay.id)}
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
                                            const nextItems = items.map((row, rowIndex) => {
                                              if (rowIndex !== index) return row
                                              return {
                                                ...row,
                                                [itemName]: itemType === 'number' ? Number(e.target.value) : e.target.value
                                              }
                                            })
                                            setItems(nextItems)
                                          }}
                                          onBlur={() => saveOverlay(overlay.id)}
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
                            <select
                              value={value ?? ''}
                              onChange={(e) =>
                                setOverlayDrafts((prev) => ({
                                  ...prev,
                                  [overlay.id]: {
                                    ...prev[overlay.id],
                                    [name]: e.target.value
                                  }
                                }))
                              }
                              onBlur={() => saveOverlay(overlay.id)}
                            >
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
                            <input
                              type="checkbox"
                              checked={Boolean(value)}
                              onChange={(e) =>
                                setOverlayDrafts((prev) => ({
                                  ...prev,
                                  [overlay.id]: {
                                    ...prev[overlay.id],
                                    [name]: e.target.checked
                                  }
                                }))
                              }
                              onBlur={() => saveOverlay(overlay.id)}
                            />
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
                              onChange={(e) =>
                                setOverlayDrafts((prev) => ({
                                  ...prev,
                                  [overlay.id]: {
                                    ...prev[overlay.id],
                                    [name]: e.target.value
                                  }
                                }))
                              }
                              onBlur={() => saveOverlay(overlay.id)}
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
                            onChange={(e) =>
                              setOverlayDrafts((prev) => ({
                                ...prev,
                                [overlay.id]: {
                                  ...prev[overlay.id],
                                  [name]: type === 'number' ? Number(e.target.value) : e.target.value
                                }
                              }))
                            }
                            onBlur={() => saveOverlay(overlay.id)}
                          />
                        </label>
                      )
                    })}
                  </div>

                </div>
              </details>
            )
          })}

          {selectedCollection?.title !== '000-system' && !isCollectionLocked && (
            <form className="panel-add-overlay" onSubmit={onAddOverlay}>
              <span className="panel-add-plus">+</span>
              <input
                value={newOverlayTitle}
                onChange={(e) => setNewOverlayTitle(e.target.value)}
                placeholder="Titolo overlay"
                required
              />
              <select
                value={newOverlayThemeId}
                onChange={(e) => setNewOverlayThemeId(e.target.value)}
                required
              >
                <option value="">Seleziona theme...</option>
                {themes.map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {theme.title}
                  </option>
                ))}
              </select>
              <button type="submit" className="panel-btn">
                Aggiungi
              </button>
            </form>
          )}
        </div>
      )}

      {status && <p className="status">{status}</p>}
    </div>
  )
}
