'use client'
import React, { useEffect, useState } from 'react'
import { toast } from '@/lib/toast'
import { CheckCircle2, XCircle, Info, X } from 'lucide-react'

type ToastItem = { id: number; msg: string; type: 'success' | 'error' | 'info' }

let _nextId = 0

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    toast._register((msg, type, duration = 4000) => {
      const id = ++_nextId
      setItems(prev => [...prev, { id, msg, type }])
      setTimeout(() => setItems(prev => prev.filter(t => t.id !== id)), duration)
    })
    return () => toast._unregister()
  }, [])

  if (items.length === 0) return null

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: 10, pointerEvents: 'none',
    }}>
      {items.map(t => {
        const colors = {
          success: { bg: '#F0FDF4', border: '#BBF7D0', icon: '#16A34A', text: '#15803D' },
          error:   { bg: '#FEF2F2', border: '#FECACA', icon: '#E8001C', text: '#B91C1C' },
          info:    { bg: '#EFF6FF', border: '#BFDBFE', icon: '#2563EB', text: '#1D4ED8' },
        }[t.type]
        const Icon = t.type === 'success' ? CheckCircle2 : t.type === 'error' ? XCircle : Info
        return (
          <div key={t.id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 16px', borderRadius: 12,
            background: colors.bg, border: `1px solid ${colors.border}`,
            boxShadow: '0 4px 20px rgba(0,0,0,.12)',
            pointerEvents: 'all', minWidth: 280, maxWidth: 380,
            animation: 'slideIn .2s ease-out',
          }}>
            <Icon size={16} color={colors.icon} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: colors.text, flex: 1, lineHeight: 1.4 }}>{t.msg}</span>
            <button
              onClick={() => setItems(prev => prev.filter(x => x.id !== t.id))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.icon, padding: 2, display: 'flex', flexShrink: 0 }}
            >
              <X size={13} />
            </button>
          </div>
        )
      })}
      <style>{`@keyframes slideIn { from { opacity:0; transform:translateX(20px) } to { opacity:1; transform:translateX(0) } }`}</style>
    </div>
  )
}
