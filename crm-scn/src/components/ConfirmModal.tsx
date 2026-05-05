'use client'
import React, { useEffect, useState } from 'react'
import { confirmDialog } from '@/lib/confirmDialog'
import { AlertTriangle, X } from 'lucide-react'
import { R, WHITE, GRAY1, GRAY2, GRAY3 } from '@/lib/crm-constants'

type Pending = {
  title: string
  message?: string
  confirmLabel?: string
  danger?: boolean
  resolve: (result: boolean) => void
}

export function ConfirmModal() {
  const [pending, setPending] = useState<Pending | null>(null)

  useEffect(() => {
    confirmDialog._register((options, resolve) => setPending({ ...options, resolve }))
    return () => confirmDialog._unregister()
  }, [])

  if (!pending) return null

  const color = pending.danger !== false ? R : '#2563EB'
  const confirm = () => { pending.resolve(true);  setPending(null) }
  const cancel  = () => { pending.resolve(false); setPending(null) }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={cancel}
    >
      <div
        style={{ background: WHITE, borderRadius: 16, width: '100%', maxWidth: 400, boxShadow: '0 25px 60px rgba(0,0,0,.25)', overflow: 'hidden', animation: 'confirmSlideIn .18s cubic-bezier(.22,1,.36,1)' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: '20px 24px', borderTop: `4px solid ${color}`, display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
            <AlertTriangle size={18} color={color} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: GRAY1, marginBottom: pending.message ? 6 : 0 }}>{pending.title}</div>
            {pending.message && (
              <div style={{ fontSize: 13, color: GRAY2, lineHeight: 1.55 }}>{pending.message}</div>
            )}
          </div>
          <button onClick={cancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: GRAY3, padding: 2, display: 'flex', flexShrink: 0 }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '16px 24px', borderTop: '1px solid #F3F4F6' }}>
          <button onClick={cancel} style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid #D1D5DB', background: WHITE, color: GRAY2, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Cancelar
          </button>
          <button onClick={confirm} style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: color, color: WHITE, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
            {pending.confirmLabel || 'Confirmar'}
          </button>
        </div>
        <style>{`@keyframes confirmSlideIn { from { opacity:0; transform:scale(.95) } to { opacity:1; transform:scale(1) } }`}</style>
      </div>
    </div>
  )
}
