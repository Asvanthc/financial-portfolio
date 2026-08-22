import React from 'react'
import ReactDOM from 'react-dom'

export default function Modal({ isOpen, title, children, onClose, size = 'md' }) {
  const boxRef = React.useRef(null)
  if (!isOpen) return null

  // Prevent background scroll, close on Escape, and keep the keyboard inside the dialog.
  // Previously Escape did nothing, focus stayed on whatever opened the modal, and Tab
  // walked straight into the page behind it.
  React.useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const opener = document.activeElement
    document.body.style.overflow = 'hidden'

    const focusables = () => Array.from(
      boxRef.current?.querySelectorAll('button, [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])') || []
    ).filter(el => !el.disabled && el.offsetParent !== null)

    // Move focus in, preferring the first real control over the close button.
    const initial = focusables()
    ;(initial.find(el => el.tagName === 'INPUT' || el.tagName === 'SELECT') || initial[0] || boxRef.current)?.focus?.()

    function onKeyDown(e) {
      if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); return }
      if (e.key !== 'Tab') return
      const list = focusables()
      if (!list.length) return
      const first = list[0], last = list[list.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.style.overflow = previousOverflow
      opener?.focus?.()
    }
  }, [onClose])

  const modalContent = (
    <div 
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 12px',
        overflowY: 'auto',
        boxSizing: 'border-box',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div 
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : 'Dialog'}
        tabIndex={-1}
        style={{
          background: 'linear-gradient(135deg, #1a2332 0%, #131a2a 100%)',
          border: '2px solid #2d3f5f',
          borderRadius: 16,
          width: 'min(96vw, ' + (size === 'sm' ? 420 : size === 'md' ? 560 : size === 'lg' ? 720 : 900) + 'px)',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
          boxSizing: 'border-box',
          position: 'relative',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          padding: '18px 20px',
          borderBottom: '1px solid #2d3f5f',
          flexShrink: 0,
        }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#e6e9ef' }}>{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 24,
              color: '#7c92ab',
              cursor: 'pointer',
              padding: '0',
              lineHeight: 1,
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseEnter={(e) => e.target.style.color = '#ef4444'}
            onMouseLeave={(e) => e.target.style.color = '#7c92ab'}
          >
            ✕
          </button>
        </div>
        <div style={{ 
          padding: '20px', 
          overflowY: 'auto', 
          flex: 1,
          minHeight: 0,
        }}>
          {children}
        </div>
      </div>
    </div>
  )

  return ReactDOM.createPortal(modalContent, document.body)
}
