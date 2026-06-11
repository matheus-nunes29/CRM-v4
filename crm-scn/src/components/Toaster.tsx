'use client'
import React, { useEffect, useState } from 'react'
import { toast } from '@/lib/toast'
import type { ToastAction } from '@/lib/toast'
import { CheckCircle2, XCircle, Info, X, AlertTriangle } from 'lucide-react'

type ToastItem = { id: number; msg: string; type: 'success' | 'error' | 'info' | 'warning'; action?: ToastAction }

let _nextId = 0

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    toast._register((msg, type, options) => {
      const id = ++_nextId
      const duration = options?.duration ?? (type === 'warning' ? 7000 : 4000)
      setItems(prev => [...prev, { id, msg, type, action: options?.action }])
      setTimeout(() => setItems(prev => prev.filter(t => t.id !== id)), duration)
    })
    return () => toast._unregister()
  }, [])

  const warnings = items.filter(t => t.type === 'warning')
  const toasts   = items.filter(t => t.type !== 'warning')

  return (
    <>
      {/* Warnings — centro da tela, grande e chamativo */}
      {warnings.length > 0 && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 99999,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
          paddingTop: 60, pointerEvents: 'none',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, pointerEvents: 'all', width: '100%', maxWidth: 540, padding: '0 16px' }}>
            {warnings.map(t => (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 16,
                padding: '20px 22px',
                borderRadius: 16,
                background: '#FFFBEB',
                border: '2px solid #F59E0B',
                boxShadow: '0 8px 40px rgba(245,158,11,.35), 0 2px 12px rgba(0,0,0,.12)',
                animation: 'warnSlideDown .25s cubic-bezier(0.34,1.56,0.64,1)',
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: '#FEF3C7', border: '2px solid #F59E0B',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <AlertTriangle size={24} color="#D97706" strokeWidth={2.5} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>
                    Atenção
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#78350F', lineHeight: 1.45 }}>
                    {t.msg}
                  </div>
                </div>
                <button
                  onClick={() => setItems(prev => prev.filter(x => x.id !== t.id))}
                  style={{ background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: 8, cursor: 'pointer', color: '#D97706', padding: '4px 6px', display: 'flex', flexShrink: 0, marginTop: 2 }}
                >
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Toasts normais — canto inferior direito */}
      {toasts.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          display: 'flex', flexDirection: 'column', gap: 10, pointerEvents: 'none',
        }}>
          {toasts.map(t => {
            const colors = {
              success: { bg: '#F0FDF4', border: '#BBF7D0', icon: '#16A34A', text: '#15803D', action: '#15803D' },
              error:   { bg: '#FEF2F2', border: '#FECACA', icon: '#E8001C', text: '#B91C1C', action: '#E8001C' },
              info:    { bg: '#F5F3FF', border: '#DDD6FE', icon: '#7C3AED', text: '#5B21B6', action: '#7C3AED' },
              warning: { bg: '#FFFBEB', border: '#FDE68A', icon: '#D97706', text: '#92400E', action: '#D97706' },
            }[t.type]
            const Icon = t.type === 'success' ? CheckCircle2 : t.type === 'error' ? XCircle : t.type === 'warning' ? AlertTriangle : Info
            return (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '12px 16px', borderRadius: 12,
                background: colors.bg, border: `1px solid ${colors.border}`,
                boxShadow: '0 4px 20px rgba(0,0,0,.12)',
                pointerEvents: 'all', minWidth: 280, maxWidth: 400,
                animation: 'slideIn .2s ease-out',
              }}>
                <Icon size={16} color={colors.icon} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: colors.text, flex: 1, lineHeight: 1.4 }}>{t.msg}</span>
                {t.action && (
                  <button
                    onClick={() => {
                      t.action!.onClick()
                      setItems(prev => prev.filter(x => x.id !== t.id))
                    }}
                    style={{ background: 'none', border: `1px solid ${colors.action}40`, borderRadius: 6, cursor: 'pointer', color: colors.action, padding: '3px 10px', fontSize: 12, fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap' }}
                  >
                    {t.action.label}
                  </button>
                )}
                <button
                  onClick={() => setItems(prev => prev.filter(x => x.id !== t.id))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.icon, padding: 2, display: 'flex', flexShrink: 0 }}
                >
                  <X size={13} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <style>{`
        @keyframes slideIn { from { opacity:0; transform:translateX(20px) } to { opacity:1; transform:translateX(0) } }
        @keyframes warnSlideDown { from { opacity:0; transform:translateY(-24px) scale(.97) } to { opacity:1; transform:translateY(0) scale(1) } }
      `}</style>
    </>
  )
}
