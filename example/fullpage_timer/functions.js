function createOverlayThemeController(root, config, helpers) {
  let timerId = null
  let currentConfig = { ...(config || {}) }
  let remainingMs = 0

  const wrapEl = root.querySelector('#wrap')
  const titleEl = root.querySelector('#intro-text')
  const hoursEl = root.querySelector('#hours')
  const minutesEl = root.querySelector('#minutes')
  const secondsEl = root.querySelector('#seconds')
  const sepHoursEl = root.querySelector('#sep-hours')

  const defaultTitle = titleEl?.textContent || ''

  function clampInt(value, fallback = 0) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return fallback
    return Math.max(0, Math.floor(parsed))
  }

  function durationFromConfig(cfg) {
    const h = clampInt(cfg?.hours, 0)
    const m = clampInt(cfg?.minutes, 0)
    const s = clampInt(cfg?.seconds, 0)
    return (h * 3600 + m * 60 + s) * 1000
  }

  function pad2(value) {
    return String(value).padStart(2, '0')
  }

  function applyTitle() {
    if (!titleEl) return
    const title = String(currentConfig?.title ?? '').trim()
    titleEl.textContent = title || defaultTitle
  }

  function applyShowHours() {
    const showHours = Boolean(currentConfig?.show_hours)
    if (sepHoursEl) {
      sepHoursEl.style.display = showHours ? '' : 'none'
    }
    if (hoursEl) {
      const timeItem = hoursEl.closest('.time-item')
      if (timeItem) timeItem.style.display = showHours ? '' : 'none'
    }
  }

  function render() {
    const totalSec = Math.max(0, Math.floor(remainingMs / 1000))
    const hours = Math.floor(totalSec / 3600)
    const minutes = Math.floor((totalSec % 3600) / 60)
    const seconds = totalSec % 60

    if (hoursEl) hoursEl.textContent = pad2(hours)
    if (minutesEl) minutesEl.textContent = pad2(minutes)
    if (secondsEl) secondsEl.textContent = pad2(seconds)

    const finished = totalSec <= 0
    if (wrapEl) wrapEl.classList.toggle('finished', finished)
  }

  function stop() {
    if (!timerId) return
    clearInterval(timerId)
    timerId = null
  }

  function start() {
    if (timerId) return
    if (remainingMs <= 0) {
      remainingMs = durationFromConfig(currentConfig)
      render()
    }

    timerId = setInterval(() => {
      remainingMs = Math.max(0, remainingMs - 1000)
      render()

      if (remainingMs <= 0) {
        stop()
        const behavior = String(currentConfig?.finish_behavior || 'hold')
        if (behavior === 'reset') {
          remainingMs = durationFromConfig(currentConfig)
          render()
        } else if (behavior === 'stop') {
          remainingMs = 0
          render()
        }
      }
    }, 1000)
  }

  function restart() {
    stop()
    remainingMs = durationFromConfig(currentConfig)
    render()
    start()
  }

  function updateConfig(next) {
    currentConfig = { ...(next || {}) }
    applyTitle()
    applyShowHours()

    if (!timerId) {
      remainingMs = durationFromConfig(currentConfig)
      render()
    }
  }

  updateConfig(currentConfig)

  return {
    start,
    stop,
    restart,
    updateConfig,
    destroy: stop,
  }
}
