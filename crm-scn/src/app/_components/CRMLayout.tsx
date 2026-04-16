'use client'
import React, { useEffect, ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Sidebar from '../Sidebar'
import { CONTENT_BG, WHITE, GRAY1, GRAY2, GRAY3 } from '@/lib/crm-constants'

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
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } } * { box-sizing: border-box; }`}</style>
      <Sidebar activeView={view} onNavigate={navigate} />
      <div style={{ flex: 1, background: CONTENT_BG, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {/* top bar */}
        <div style={{ background: WHITE, borderBottom: '1px solid #EEEEF5', padding: '0 28px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, boxShadow: '0 1px 8px rgba(0,0,0,.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#E8001C', textTransform: 'uppercase', letterSpacing: '0.18em' }}>CRM</span>
            <span style={{ color: GRAY3, fontSize: 16, lineHeight: '1' }}>›</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: GRAY1 }}>{title || VIEW_LABELS[view] || view}</span>
          </div>
          {subtitle && <span style={{ fontSize: 12, color: GRAY2 }}>{subtitle}</span>}
        </div>
        {/* content */}
        <div style={{ flex: 1, padding: '28px 32px', minHeight: 0 }}>
          {children}
        </div>
      </div>
    </div>
  )
}
