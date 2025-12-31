import React from 'react'

export default function Modal({ isOpen, title, children, onClose, size = 'md' }) {
  if (!isOpen) return null

  // Prevent background scroll while modal is open
  React.useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
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
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '24px',
        paddingTop: '48px',
        overflowY: 'auto',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div 
        style={{
          background: 'linear-gradient(135deg, #1a2332 0%, #131a2a 100%)',
          border: '1px solid #2d3f5f',
          borderRadius: 'clamp(10px, 2vw, 14px)',
          padding: 'clamp(16px, 3vw, 24px)',
          maxWidth: size === 'sm' ? 420 : size === 'md' ? 560 : size === 'lg' ? 720 : 900,
          width: '95%',
          maxHeight: 'calc(100vh - 120px)',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          boxSizing: 'border-box',
          position: 'relative',
          margin: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 'clamp(18px, 3.5vw, 22px)', fontWeight: 800, color: '#e6e9ef' }}>{title}</h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 24,
              color: '#7c92ab',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
