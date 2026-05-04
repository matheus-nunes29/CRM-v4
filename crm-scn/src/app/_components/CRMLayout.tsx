'use client'
import React, { useEffect, useState, ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Sidebar from '../Sidebar'
import { Toaster } from '@/components/Toaster'
import { GRAY1, GRAY2, GRAY3, R } from '@/lib/crm-constants'

const VIEW_MAP: Record<string, string> = {
  '/': 'dashboard', '/leads': 'leads', '/pipeline': 'pipeline',
  '/metas': 'metas', '/acompanhamento': 'acompanhamento',
  '/inteligencia': 'inteligencia', '/configuracoes': 'configuracoes',
  '/calculadoras/executar': 'calculadoras/executar',
  '/calculadoras/roi': 'calculadoras/roi',
  '/scripts': 'scripts',
}
const VIEW_LABELS: Record<string, string> = {
  dashboard: 'Dashboard', leads: 'Leads', pipeline: 'Pipeline',
  metas: 'Metas', acompanhamento: 'Acompanhamento',
  inteligencia: 'Inteligência Comercial', configuracoes: 'Configurações',
  'calculadoras/executar': 'Calculadora Executar',
  'calculadoras/roi': 'Calculadora de Ganho',
  scripts: 'Scripts & Playbook',
}

export default function CRMLayout({ children, title, subtitle }: { children: ReactNode; title?: string; subtitle?: string }) {
  const router   = useRouter()
  const pathname = usePathname()
  const view     = VIEW_MAP[pathname] || 'dashboard'
  const [progress, setProgress] = useState(false)
  const [prevPath, setPrevPath] = useState(pathname)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      // Update last seen timestamp
      supabase
        .from('usuarios_permitidos')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('email', session.user.email!)
        .then(() => {})
    })
  }, [])

  useEffect(() => {
    if (pathname !== prevPath) {
      setProgress(true)
      const t = setTimeout(() => setProgress(false), 600)
      setPrevPath(pathname)
      return () => clearTimeout(t)
    }
  }, [pathname])

  const navigate = (v: string) => router.push(v === 'dashboard' ? '/' : `/${v}`)

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar activeView={view} onNavigate={navigate} />

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', background: '#F6F3EE' }}>

        {/* Top bar */}
        <div style={{
          background: '#FFFFFF',
          borderBottom: '1px solid #E5E7EB',
          boxShadow: '0 1px 4px rgba(0,0,0,.06)',
          padding: '0 28px',
          height: 54,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Navigation progress bar */}
          {progress && (
            <div style={{
              position: 'absolute', top: 0, left: 0, height: 2,
              background: `linear-gradient(90deg, ${R}, #FF6B6B, ${R})`,
              borderRadius: 1,
              animation: 'topbar-progress .6s cubic-bezier(.22,1,.36,1) forwards',
              boxShadow: `0 0 8px ${R}60`,
              zIndex: 10,
            }} />
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, animation: 'fadeUp .3s cubic-bezier(.22,1,.36,1)' }}>
            <span style={{
              fontSize: 10, fontWeight: 900, color: R,
              textTransform: 'uppercase', letterSpacing: '0.18em',
            }}>CRM</span>
            <span style={{ color: GRAY3, fontSize: 14, lineHeight: 1 }}>›</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: GRAY1 }}>{title || VIEW_LABELS[view] || view}</span>
          </div>

          {subtitle && (
            <span style={{ fontSize: 11, color: GRAY2, fontWeight: 500 }}>{subtitle}</span>
          )}
        </div>

        {/* Content */}
        <div
          key={pathname}
          style={{ flex: 1, padding: '28px 32px', minHeight: 0, animation: 'fadeUp .35s cubic-bezier(.22,1,.36,1)' }}
        >
          {children}
        </div>
      </div>

      <Toaster />
    </div>
  )
}
