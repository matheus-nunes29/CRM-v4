'use client'
import React, { useEffect, ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Sidebar from '../Sidebar'
import { CONTENT_BG, WHITE, GRAY1, GRAY2, GRAY3, R } from '@/lib/crm-constants'

const VIEW_MAP: Record<string, string> = {
  '/': 'dashboard', '/leads': 'leads', '/pipeline': 'pipeline',
  '/metas': 'metas', '/acompanhamento': 'acompanhamento', '/configuracoes': 'configuracoes'
}
const VIEW_LABELS: Record<string, string> = {
  dashboard: 'Dashboard', leads: 'Leads', pipeline: 'Pipeline',
  metas: 'Metas', acompanhamento: 'Acompanhamento', configuracoes: 'Configurações'
}

export default function CRMLayout({ children, title, subtitle }: { children: ReactNode; title?: string; subtitle?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const view = VIEW_MAP[pathname] || 'dashboard'

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/login')
    })
  }, [])

  const navigate = (v: string) => router.push(v === 'dashboard' ? '/' : `/${v}`)

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar activeView={view} onNavigate={navigate} />
      <div style={{ flex: 1, background: CONTENT_BG, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {/* Top bar */}
        <div style={{
          background: WHITE,
          borderBottom: '1px solid #E6E1D8',
          padding: '0 28px',
          height: 54,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: R, textTransform: 'uppercase', letterSpacing: '0.16em' }}>CRM</span>
            <span style={{ color: GRAY3, fontSize: 14, lineHeight: 1 }}>›</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: GRAY1 }}>{title || VIEW_LABELS[view] || view}</span>
          </div>
          {subtitle && (
            <span style={{ fontSize: 11, color: GRAY2, fontWeight: 500 }}>{subtitle}</span>
          )}
        </div>
        {/* Content */}
        <div style={{ flex: 1, padding: '28px 32px', minHeight: 0 }}>
          {children}
        </div>
      </div>
    </div>
  )
}
