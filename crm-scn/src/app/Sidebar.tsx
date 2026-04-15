'use client'
import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Users, Plus, LayoutDashboard, GitBranch, Settings, Target, CalendarDays } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { LOGO_SRC } from './logo'

const R = '#E8001C'
const WHITE = '#FFFFFF'
const GRAY1 = '#1A1A1A'
const GRAY2 = '#6B7280'
const SIDEBAR_BG = '#FFFFFF'

const MENU = [
  { id: 'dashboard',      label: 'Dashboard',      icon: LayoutDashboard },
  { id: 'leads',          label: 'Leads',           icon: Users },
  { id: 'pipeline',       label: 'Pipeline',        icon: GitBranch },
  { id: 'metas',          label: 'Metas',           icon: Target },
  { id: 'acompanhamento', label: 'Acompanhamento',  icon: CalendarDays },
  { id: 'configuracoes',  label: 'Configurações',   icon: Settings },
]

type SidebarProps = {
  activeView: string | null
  onNavigate: (view: string) => void
}

export default function Sidebar({ activeView, onNavigate }: SidebarProps) {
  const router = useRouter()
  const [session, setSession] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside style={{ width: 230, background: SIDEBAR_BG, display: 'flex', flexDirection: 'column', flexShrink: 0, boxShadow: '4px 0 24px rgba(0,0,0,0.06)', zIndex: 10 }}>
      <div style={{ padding: '22px 20px 20px', borderBottom: '1px solid #F0EFF8' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 40, height: 40, flexShrink: 0 }}>
            <img src={LOGO_SRC} alt="V4 Company" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'contain' }} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: GRAY1, letterSpacing: '0.02em', lineHeight: 1 }}>V4 COMPANY</div>
            <div style={{ fontSize: 10, color: GRAY2, marginTop: 2, letterSpacing: '0.06em' }}>SCN & CO</div>
          </div>
        </div>
      </div>
      <nav style={{ flex: 1, padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {MENU.map(item => {
          const active = activeView === item.id
          return (
            <button key={item.id} onClick={() => onNavigate(item.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%', background: active ? 'linear-gradient(135deg, #E8001C, #B91C1C)' : 'transparent', color: active ? WHITE : GRAY2, fontWeight: active ? 700 : 500, fontSize: 13, transition: 'all .18s', boxShadow: active ? '0 4px 16px rgba(232,0,28,0.3)' : 'none' }}
              onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = '#FFF1F2'; (e.currentTarget as HTMLElement).style.color = R } }}
              onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = GRAY2 } }}
            >
              <item.icon size={16} />{item.label}
            </button>
          )
        })}
      </nav>
      <div style={{ padding: '14px 12px', borderTop: '1px solid #F0EFF8' }}>
        <button onClick={() => router.push('/leads/new')}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #E8001C, #B91C1C)', color: WHITE, fontSize: 13, fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 12px rgba(232,0,28,0.28)' }}>
          <Plus size={15} /> NOVO LEAD
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 4px 4px' }}>
          {session?.user?.user_metadata?.avatar_url
            ? <img src={session.user.user_metadata.avatar_url} style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, border: '2px solid #EDE9FE' }} alt="" />
            : <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #7C3AED, #6D28D9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: WHITE, flexShrink: 0 }}>{(session?.user?.user_metadata?.full_name || session?.user?.email || 'U')[0].toUpperCase()}</div>
          }
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: GRAY1, lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session?.user?.user_metadata?.full_name || session?.user?.email || ''}</div>
            <button onClick={handleSignOut} style={{ fontSize: 11, color: GRAY2, marginTop: 3, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 500 }}>Sair →</button>
          </div>
        </div>
      </div>
    </aside>
  )
}
