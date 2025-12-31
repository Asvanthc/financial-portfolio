import React from 'react'

export default function Modal({ isOpen, title, children, onClose, size = 'md' }) {
  if (!isOpen) return null

  // Prevent background scroll and reset scroll position
  React.useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const previousPosition = document.body.style.position
    document.body.style.overflow = 'hidden'
    document.body.style.position = 'relative'
    window.scrollTo(0, 0)
    return () => { 
      document.body.style.overflow = previousOverflow 
      document.body.style.position = previousPosition
    }
  }, [])

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        zIndex: 9999,
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
        padding: '20px',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div 
        style={{
          background: 'linear-gradient(135deg, #1a2332 0%, #131a2a 100%)',
          border: '1px solid #2d3f5f',
          borderRadius: 14,
          padding: 24,
          maxWidth: size === 'sm' ? 420 : size === 'md' ? 560 : size === 'lg' ? 720 : 900,
          width: '100%',
          margin: '0 auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          boxSizing: 'border-box',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, position: 'sticky', top: 0, background: 'linear-gradient(135deg, #1a2332 0%, #131a2a 100%)', zIndex: 1, padding: '0 0 12px 0', borderBottom: '1px solid #2d3f5f' }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#e6e9ef' }}>{title}</h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 24,
              color: '#7c92ab',
              cursor: 'pointer',
              padding: '4px 8px',
            }}
            onMouseEnter={(e) => e.target.style.color = '#e6e9ef'}
            onMouseLeave={(e) => e.target.style.color = '#7c92ab'}
          >
            ✕
          </button>
        </div>
        <div style={{ maxHeight: 'calc(100vh - 160px)', overflowY: 'auto', paddingRight: '4px' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
