export function normalizeThemeFields(configParams, fallbackConfig) {
  if (Array.isArray(configParams?.fields)) {
    return configParams.fields
  }

  return Object.keys(fallbackConfig ?? {}).map((key) => ({
    name: key,
    label: key,
    type: typeof fallbackConfig[key] === 'number' ? 'number' : 'text'
  }))
}

export function getNestedDefaultItem(field) {
  const itemFields = Array.isArray(field?.item?.fields) ? field.item.fields : []
  const next = {}
  for (const itemField of itemFields) {
    const key = itemField?.name
    if (!key) continue
    if (itemField.default != null) {
      next[key] = itemField.default
    } else if (itemField.type === 'number') {
      next[key] = 0
    } else if (itemField.type === 'checkbox') {
      next[key] = false
    } else {
      next[key] = ''
    }
  }
  return next
}

export function coerceNestedItems(value) {
  if (Array.isArray(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

export function getFieldDefaultValue(field) {
  if (field?.default != null) return field.default
  const type = field?.type || 'text'
  if (type === 'number') return 0
  if (type === 'checkbox') return false
  if (type === 'nested') return []
  return ''
}
