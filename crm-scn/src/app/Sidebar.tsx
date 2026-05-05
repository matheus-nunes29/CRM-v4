'use client'
import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Users, Plus, LayoutDashboard, GitBranch, Settings, Target, CalendarDays, LogOut, TrendingUp, Wrench, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { LOGO_SRC } from './logo'

const R         = '#E8001C'
const WHITE     = '#FFFFFF'
const BORDER    = 'rgba(255,255,255,0.07)'
const TEXT_MUT  = 'rgba(237,232,225,0.38)'
const TEXT_ACT  = '#EDE8E1'
const GLASS_BG  = 'rgba(255,255,255,0.06)'

type MenuItem = { id: string; label: string; icon: React.ComponentType<any>; children?: { id: string; label: string }[] }

const MENU: MenuItem[] = [
  { id: 'dashboard',      label: 'Dashboard',     icon: LayoutDashboard },
  { id: 'leads',          label: 'Leads',          icon: Users },
  { id: 'pipeline',       label: 'Pipeline',       icon: GitBranch },
  { id: 'metas',          label: 'Metas',          icon: Target },
  { id: 'acompanhamento', label: 'Acompanhamento', icon: CalendarDays },
  { id: 'inteligencia',   label: 'Inteligência',   icon: TrendingUp },
  { id: 'ferramentas',    label: 'Ferramentas',    icon: Wrench },
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
  const [indicatorTop, setIndicatorTop] = useState<number | null>(null)
  const [mounted, setMounted] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('sidebar-collapsed') === 'true'
  })
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  const toggleCollapse = () => setCollapsed(v => {
    const next = !v
    localStorage.setItem('sidebar-collapsed', String(next))
    return next
  })

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!activeView) return
    const el = itemRefs.current[activeView]
    if (el) {
      const navTop = el.parentElement?.getBoundingClientRect().top ?? 0
      const elTop  = el.getBoundingClientRect().top
      setIndicatorTop(elTop - navTop)
    }
  }, [activeView])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const initials = (session?.user?.user_metadata?.full_name || session?.user?.email || 'U')[0].toUpperCase()

  return (
    <aside style={{
      width: collapsed ? 64 : 220,
      background: '#0E0D0B',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      borderRight: `1px solid ${BORDER}`,
      boxShadow: '1px 0 0 rgba(255,255,255,0.04)',
      zIndex: 10,
      opacity: mounted ? 1 : 0,
      transition: 'opacity .3s, width .22s cubic-bezier(.22,1,.36,1)',
      overflow: 'hidden',
    }}>

      {/* Logo */}
      <div style={{ padding: collapsed ? '16px 0' : '20px 18px 18px', borderBottom: `1px solid ${BORDER}`, display:'flex', justifyContent: collapsed ? 'center' : 'flex-start' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          animation: 'fadeUp .4s cubic-bezier(.22,1,.36,1) both',
        }}>
          <div style={{
            width: 34, height: 34, flexShrink: 0, borderRadius: 9,
            overflow: 'hidden',
            background: `linear-gradient(135deg, ${R}, #FF4040)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 0 22px ${R}55, 0 4px 12px rgba(0,0,0,0.4)`,
            border: '1px solid rgba(255,255,255,0.20)',
          }}>
            <img src={LOGO_SRC} alt="V4" style={{ width: 34, height: 34, objectFit: 'contain' }} />
          </div>
          {!collapsed && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: TEXT_ACT, letterSpacing: '0.08em', lineHeight: 1 }}>V4 COMPANY</div>
              <div style={{ fontSize: 10, color: TEXT_MUT, marginTop: 3, letterSpacing: '0.06em' }}>SCN & CO</div>
            </div>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: collapsed ? '14px 6px' : '14px 10px', display: 'flex', flexDirection: 'column', gap: 1, position: 'relative' }}>
        {/* Sliding glass indicator */}
        {indicatorTop !== null && (
          <div style={{
            position: 'absolute', left: 10, width: 'calc(100% - 20px)', height: 36,
            top: indicatorTop, borderRadius: 9,
            background: `linear-gradient(135deg, ${R}DD, ${R}99)`,
            backdropFilter: 'blur(12px)',
            boxShadow: `0 4px 20px ${R}50, 0 0 0 1px ${R}40, inset 0 1px 0 rgba(255,255,255,0.25)`,
            transition: 'top .22s cubic-bezier(.22,1,.36,1)',
            pointerEvents: 'none', zIndex: 0,
          }} />
        )}

        {MENU.map((item, idx) => {
          const active = activeView === item.id
          const isHover = hovered === item.id && !active

          return (
            <button
              key={item.id}
              ref={el => { itemRefs.current[item.id] = el }}
              onClick={() => onNavigate(item.id)}
              onMouseEnter={() => setHovered(item.id)}
              onMouseLeave={() => setHovered(null)}
              title={collapsed ? item.label : undefined}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 9,
                padding: collapsed ? '9px 0' : '9px 12px', borderRadius: 9, border: 'none', cursor: 'pointer',
                textAlign: 'left', width: '100%', position: 'relative', zIndex: 1,
                background: isHover ? 'rgba(255,255,255,0.07)' : 'transparent',
                color: active ? WHITE : isHover ? 'rgba(237,232,225,0.85)' : TEXT_MUT,
                fontWeight: active ? 700 : 500, fontSize: 13,
                transition: 'background .16s ease, color .16s ease, transform .18s cubic-bezier(.22,1,.36,1)',
                transform: !collapsed && isHover ? 'translateX(3px)' : 'translateX(0)',
                animation: `slideRight .35s cubic-bezier(.22,1,.36,1) ${idx * 40}ms both`,
              }}
            >
              <item.icon
                size={15} strokeWidth={active ? 2.5 : 2}
                style={{ transition: 'transform .2s', transform: isHover ? 'scale(1.15)' : 'scale(1)', flexShrink: 0, filter: active ? 'drop-shadow(0 0 6px rgba(255,255,255,0.5))' : 'none' }}
              />
              {!collapsed && item.label}
            </button>
          )
        })}

        {/* Toggle collapse */}
        <button
          onClick={toggleCollapse}
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          style={{ display:'flex', alignItems:'center', justifyContent: collapsed ? 'center' : 'flex-end', gap:6, padding: collapsed ? '8px 0' : '8px 12px', borderRadius:9, border:'none', cursor:'pointer', background:'transparent', color:TEXT_MUT, width:'100%', marginTop:8, transition:'color .15s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(237,232,225,0.60)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = TEXT_MUT }}
        >
          {collapsed ? <ChevronRight size={14} /> : <><span style={{ fontSize:11, fontWeight:500 }}>Recolher</span><ChevronLeft size={14} /></>}
        </button>
      </nav>

      {/* Bottom */}
      <div style={{ padding: collapsed ? '12px 6px' : '12px 10px', borderTop: `1px solid ${BORDER}`, display: 'flex', flexDirection: 'column', gap: 8, alignItems: collapsed ? 'center' : 'stretch' }}>
        {/* Novo Lead */}
        <button
          onClick={() => router.push('/leads/new')}
          title={collapsed ? 'Novo Lead' : undefined}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            padding: collapsed ? '10px 0' : '10px 12px', borderRadius: 9,
            border: `1px solid rgba(232,0,28,0.45)`,
            background: 'rgba(232,0,28,0.10)',
            backdropFilter: 'blur(12px)',
            color: WHITE, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            letterSpacing: collapsed ? 0 : '0.05em',
            transition: 'background .18s, border-color .18s, box-shadow .18s',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10)',
          }}
          onMouseEnter={e => {
            const el = e.currentTarget
            el.style.background = R
            el.style.borderColor = R
            el.style.boxShadow = `0 0 24px ${R}55, 0 4px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.2)`
          }}
          onMouseLeave={e => {
            const el = e.currentTarget
            el.style.background = 'rgba(232,0,28,0.10)'
            el.style.borderColor = 'rgba(232,0,28,0.45)'
            el.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.10)'
          }}
        >
          <Plus size={13} strokeWidth={2.5} style={{ flexShrink: 0 }} />
          {!collapsed && 'NOVO LEAD'}
        </button>

        {/* User */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 4px', justifyContent: collapsed ? 'center' : 'flex-start' }}>
          <button onClick={handleSignOut} title={collapsed ? 'Sair' : undefined} style={{ background:'none', border:'none', cursor:'pointer', padding:0, display:'flex', flexShrink:0 }}>
            {session?.user?.user_metadata?.avatar_url
              ? <img src={session.user.user_metadata.avatar_url}
                  style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, border: '1.5px solid rgba(255,255,255,0.18)' }} alt="" />
              : <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: `linear-gradient(135deg, ${R}, #FF4040)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, color: WHITE, flexShrink: 0,
                  boxShadow: `0 0 14px ${R}50, 0 2px 8px rgba(0,0,0,0.4)`,
                  border: '1px solid rgba(255,255,255,0.18)',
                }}>
                  {initials}
                </div>
            }
          </button>
          {!collapsed && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(237,232,225,0.72)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1 }}>
                {session?.user?.user_metadata?.full_name || session?.user?.email || ''}
              </div>
              <button
                onClick={handleSignOut}
                style={{ fontSize: 10, color: TEXT_MUT, marginTop: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4, transition: 'color .15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(237,232,225,0.60)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = TEXT_MUT }}
              >
                <LogOut size={10} /> Sair
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
