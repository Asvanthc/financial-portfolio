import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom'
import { subscribe, dismiss } from '../toast'

const STYLE = {
  success: { color: 'var(--green)', border: 'rgba(74,222,128,0.35)', bg: 'rgba(74,222,128,0.10)', icon: '✓' },
  error:   { color: 'var(--red)',   border: 'rgba(248,113,113,0.35)', bg: 'rgba(248,113,113,0.10)', icon: '✕' },
  warn:    { color: 'var(--orange)', border: 'rgba(251,146,60,0.35)', bg: 'rgba(251,146,60,0.10)', icon: '!' },
  info:    { color: 'var(--cyan)',  border: 'rgba(34,211,238,0.35)', bg: 'rgba(34,211,238,0.10)', icon: 'i' },
}

export default function ToastHost() {
  const [items, setItems] = useState([])
  useEffect(() => subscribe(setItems), [])
  if (!items.length) return null

  return ReactDOM.createPortal(
    <div className="toast-stack" role="status" aria-live="polite">
      {items.map(t => {
        const s = STYLE[t.kind] || STYLE.info
        return (
          <div key={t.id} className="toast" style={{ borderColor: s.border, background: s.bg }}>
            <span className="toast-icon" style={{ color: s.color, borderColor: s.border }}>{s.icon}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="toast-msg">{t.message}</div>
              {t.detail && <div className="toast-detail">{t.detail}</div>}
            </div>
            <button className="btn-icon" aria-label="Dismiss" onClick={() => dismiss(t.id)}>✕</button>
          </div>
        )
      })}
    </div>,
    document.body
  )
}
