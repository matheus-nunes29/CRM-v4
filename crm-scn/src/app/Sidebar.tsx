'use client'
import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Users, Plus, LayoutDashboard, GitBranch, Settings, Target, CalendarDays, LogOut } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { LOGO_SRC } from './logo'

const R        = '#E8001C'
const WHITE    = '#FFFFFF'
const BG       = '#0E0D0B'
const BORDER   = 'rgba(255,255,255,0.07)'
const TEXT_MUT = 'rgba(255,255,255,0.40)'
const TEXT_ACT = '#FFFFFF'

const MENU = [
  { id: 'dashboard',      label: 'Dashboard',     icon: LayoutDashboard },
  { id: 'leads',          label: 'Leads',          icon: Users },
  { id: 'pipeline',       label: 'Pipeline',       icon: GitBranch },
  { id: 'metas',          label: 'Metas',          icon: Target },
  { id: 'acompanhamento', label: 'Acompanhamento', icon: CalendarDays },
  { id: 'configuracoes',  label: 'Configurações',  icon: Settings },
]

type SidebarProps = {
  activeView: string | null
  onNavigate: (view: string) => void
}

export default function Sidebar({ activeView, onNavigate }: SidebarProps) {
  const router = useRouter()
  const [session, setSession] = useState<any>(null)
  const [hovered, setHovered] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const initials = (session?.user?.user_metadata?.full_name || session?.user?.email || 'U')[0].toUpperCase()

  return (
    <aside style={{
      width: 220,
      background: BG,
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      borderRight: `1px solid ${BORDER}`,
      zIndex: 10,
    }}>
      {/* Logo */}
      <div style={{ padding: '20px 18px 18px', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 8, overflow: 'hidden', background: R, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={LOGO_SRC} alt="V4" style={{ width: 34, height: 34, objectFit: 'contain' }} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: WHITE, letterSpacing: '0.08em', lineHeight: 1 }}>V4 COMPANY</div>
            <div style={{ fontSize: 10, color: TEXT_MUT, marginTop: 3, letterSpacing: '0.06em' }}>SCN & CO</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {MENU.map(item => {
          const active  = activeView === item.id
          const isHover = hovered === item.id && !active
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              onMouseEnter={() => setHovered(item.id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: 9,
                padding: '9px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                textAlign: 'left', width: '100%',
                background: active ? R : isHover ? 'rgba(255,255,255,0.06)' : 'transparent',
                color: active ? WHITE : isHover ? 'rgba(255,255,255,0.75)' : TEXT_MUT,
                fontWeight: active ? 700 : 500,
                fontSize: 13,
                transition: 'background .15s, color .15s',
                boxShadow: active ? `0 2px 12px ${R}55` : 'none',
              }}
            >
              <item.icon size={15} strokeWidth={active ? 2.5 : 2} />
              {item.label}
            </button>
          )
        })}
      </nav>

      {/* Bottom */}
      <div style={{ padding: '12px 10px', borderTop: `1px solid ${BORDER}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Novo Lead */}
        <button
          onClick={() => router.push('/leads/new')}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            padding: '10px 12px', borderRadius: 8, border: `1px solid ${R}`,
            background: 'transparent', color: WHITE, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            letterSpacing: '0.05em', transition: 'background .15s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = R }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
        >
          <Plus size={13} strokeWidth={2.5} /> NOVO LEAD
        </button>

        {/* User */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 4px' }}>
          {session?.user?.user_metadata?.avatar_url
            ? <img src={session.user.user_metadata.avatar_url} style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, border: '1.5px solid rgba(255,255,255,0.15)' }} alt="" />
            : <div style={{ width: 28, height: 28, borderRadius: '50%', background: R, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: WHITE, flexShrink: 0 }}>{initials}</div>
          }
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.75)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1 }}>
              {session?.user?.user_metadata?.full_name || session?.user?.email || ''}
            </div>
            <button
              onClick={handleSignOut}
              style={{ fontSize: 10, color: TEXT_MUT, marginTop: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.55)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = TEXT_MUT }}
            >
              <LogOut size={10} /> Sair
            </button>
          </div>
        </div>
      </div>
    </aside>
  )
}
