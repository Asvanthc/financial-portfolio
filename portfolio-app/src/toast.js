// Tiny toast bus.
//
// Deliberately a module-level emitter rather than React context: any component can
// call `toast.error(...)` without the provider having to be threaded through
// DivisionCard -> holdings rows -> forms. <ToastHost/> mounts once and subscribes.

let nextId = 1
const listeners = new Set()
let items = []

function emit() {
  listeners.forEach(fn => fn(items))
}

function push(kind, message, { detail = null, ttl = kind === 'error' ? 9000 : 4500 } = {}) {
  const id = nextId++
  items = [...items, { id, kind, message, detail }]
  emit()
  if (ttl > 0) setTimeout(() => dismiss(id), ttl)
  return id
}

export function dismiss(id) {
  items = items.filter(t => t.id !== id)
  emit()
}

export function subscribe(fn) {
  listeners.add(fn)
  fn(items)
  return () => listeners.delete(fn)
}

export const toast = {
  success: (msg, opts) => push('success', msg, opts),
  error: (msg, opts) => push('error', msg, opts),
  info: (msg, opts) => push('info', msg, opts),
  warn: (msg, opts) => push('warn', msg, opts),
}
