import React from 'react'

export default function Modal({ isOpen, title, children, onClose, size = 'md' }) {
  if (!isOpen) return null

  // Prevent background scroll
  React.useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { 
      document.body.style.overflow = previousOverflow 
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
        background: 'rgba(0, 0, 0, 0.75)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        overflow: 'hidden',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div 
        style={{
          background: 'linear-gradient(135deg, #1a2332 0%, #131a2a 100%)',
          border: '2px solid #2d3f5f',
          borderRadius: 16,
          maxWidth: size === 'sm' ? 420 : size === 'md' ? 560 : size === 'lg' ? 720 : 900,
          width: '100%',
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
          padding: '20px 24px',
          borderBottom: '1px solid #2d3f5f',
          flexShrink: 0,
        }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#e6e9ef' }}>{title}</h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 28,
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
          padding: '24px', 
          overflowY: 'auto', 
          flex: 1,
          minHeight: 0,
        }}>
          {children}
        </div>
      </div>
    </div>
  )
}
