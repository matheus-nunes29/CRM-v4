'use client'
import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Users, Plus, LayoutDashboard, GitBranch, Settings, Target, CalendarDays, LogOut, TrendingUp, Wrench, ChevronLeft, ChevronRight, LayoutGrid, Rocket, Home, BookOpen, BarChart2, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { LOGO_SRC } from './logo'

const R         = '#E8001C'
const WHITE     = '#FFFFFF'
const BORDER    = 'rgba(255,255,255,0.07)'
const TEXT_MUT  = 'rgba(237,232,225,0.38)'
const TEXT_ACT  = '#EDE8E1'

type NavItem    = { type: 'item'; id: string; label: string; icon: React.ComponentType<any>; section: string | null }
type NavDivider = { type: 'divider'; label: string; sectionId: string | null }
type NavEntry   = NavItem | NavDivider

const MENU: NavEntry[] = [
  { type: 'item', id: 'inicio', label: 'Início', icon: Home, section: null },
  { type: 'divider', label: 'Vendas', sectionId: 'vendas' },
  { type: 'item', id: 'dashboard',      label: 'Dashboard',      icon: LayoutDashboard, section: 'vendas' },
  { type: 'item', id: 'leads',          label: 'Leads',          icon: Users,           section: 'vendas' },
  { type: 'item', id: 'pipeline',       label: 'Pipeline',       icon: GitBranch,       section: 'vendas' },
  { type: 'item', id: 'metas',          label: 'Metas',          icon: Target,          section: 'vendas' },
  { type: 'item', id: 'acompanhamento', label: 'Acompanhamento', icon: CalendarDays,    section: 'vendas' },
  { type: 'item', id: 'inteligencia',   label: 'Inteligência',   icon: TrendingUp,      section: 'vendas' },
  { type: 'item', id: 'ferramentas',    label: 'Ferramentas',    icon: Wrench,          section: 'vendas' },
  { type: 'divider', label: 'Operação', sectionId: 'operacao' },
  { type: 'item', id: 'cockpit',            label: 'Cockpit',      icon: LayoutGrid, section: 'operacao' },
  { type: 'item', id: 'cockpit/dashboard',  label: 'CS Dashboard', icon: BarChart2,  section: 'operacao' },
  { type: 'item', id: 'expansao',           label: 'Expansão',     icon: Rocket,     section: 'operacao' },
  { type: 'item', id: 'catalogo',           label: 'Catálogo',     icon: BookOpen,   section: 'operacao' },
]

function getSectionOf(id: string): string | null {
  const item = MENU.find(e => e.type === 'item' && e.id === id)
  return item?.type === 'item' ? item.section : null
}

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
  const [openSection, setOpenSection] = useState<string | null>(() => {
    if (typeof window === 'undefined') return 'vendas'
    return getSectionOf(localStorage.getItem('sidebar-active') || '') || 'vendas'
  })
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  const toggleCollapse = () => setCollapsed(v => {
    const next = !v
    localStorage.setItem('sidebar-collapsed', String(next))
    return next
  })

  const toggleSection = (id: string) => {
    setOpenSection(prev => prev === id ? null : id)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    setMounted(true)
  }, [])

  // open the section of the active item
  useEffect(() => {
    if (!activeView) return
    const sec = getSectionOf(activeView)
    if (sec) setOpenSection(sec)
    localStorage.setItem('sidebar-active', activeView)
  }, [activeView])

  useEffect(() => {
    if (!activeView) return
    const el = itemRefs.current[activeView]
    if (el) {
      const navTop = el.parentElement?.getBoundingClientRect().top ?? 0
      const elTop  = el.getBoundingClientRect().top
      setIndicatorTop(elTop - navTop)
    }
  }, [activeView, openSection])

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, animation: 'fadeUp .4s cubic-bezier(.22,1,.36,1) both' }}>
          <div style={{
            width: 34, height: 34, flexShrink: 0, borderRadius: 9, overflow: 'hidden',
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
      <nav style={{ flex: 1, overflowY: 'auto', padding: collapsed ? '14px 6px' : '14px 10px', display: 'flex', flexDirection: 'column', gap: 1, position: 'relative' }}>
        {/* Sliding indicator */}
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

        {MENU.map((entry, idx) => {
          if (entry.type === 'divider') {
            // empty divider (separator before Configurações)
            if (!entry.sectionId) {
              return (
                <div key={`div-${idx}`} style={{ margin: '10px 0 6px', padding: collapsed ? '0 6px' : '0 4px' }}>
                  <div style={{ height: 1, background: BORDER }} />
                </div>
              )
            }

            // collapsible section header
            const isOpen = openSection === entry.sectionId
            return (
              <button
                key={`sec-${entry.sectionId}`}
                onClick={() => !collapsed && toggleSection(entry.sectionId!)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between',
                  gap: 6, margin: idx === 0 ? '4px 0 2px' : '8px 0 2px',
                  padding: collapsed ? '6px 0' : '5px 4px',
                  background: 'transparent', border: 'none',
                  cursor: collapsed ? 'default' : 'pointer', width: '100%',
                }}
              >
                {!collapsed && (
                  <>
                    <span style={{ fontSize: 9, fontWeight: 700, color: TEXT_MUT, letterSpacing: '0.12em', textTransform: 'uppercase' as const, whiteSpace: 'nowrap' as const, opacity: 0.7 }}>
                      {entry.label}
                    </span>
                    {isOpen
                      ? <ChevronUp size={11} color={TEXT_MUT} style={{ opacity: 0.6, flexShrink: 0 }} />
                      : <ChevronDown size={11} color={TEXT_MUT} style={{ opacity: 0.6, flexShrink: 0 }} />
                    }
                  </>
                )}
                {collapsed && <div style={{ width: '100%', height: 1, background: BORDER }} />}
              </button>
            )
          }

          // regular nav item
          const item = entry
          const active = activeView === item.id
          const isHover = hovered === item.id && !active

          // hide items when section is collapsed (but always show when sidebar is collapsed to icon-only)
          const hidden = !collapsed && item.section !== null && openSection !== item.section

          return (
            <button
              key={item.id}
              ref={el => { itemRefs.current[item.id] = el }}
              onClick={() => onNavigate(item.id)}
              onMouseEnter={() => setHovered(item.id)}
              onMouseLeave={() => setHovered(null)}
              title={collapsed ? item.label : undefined}
              style={{
                display: hidden ? 'none' : 'flex',
                alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 9,
                padding: collapsed ? '9px 0' : '9px 12px', borderRadius: 9, border: 'none', cursor: 'pointer',
                textAlign: 'left', width: '100%', position: 'relative', zIndex: 1,
                background: isHover ? 'rgba(255,255,255,0.07)' : 'transparent',
                color: active ? WHITE : isHover ? 'rgba(237,232,225,0.85)' : TEXT_MUT,
                fontWeight: active ? 700 : 500, fontSize: 13,
                transition: 'background .16s ease, color .16s ease, transform .18s cubic-bezier(.22,1,.36,1)',
                transform: !collapsed && isHover ? 'translateX(3px)' : 'translateX(0)',
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

      {/* Bottom — configurações + user */}
      <div style={{ padding: collapsed ? '12px 6px' : '12px 10px', borderTop: `1px solid ${BORDER}`, display: 'flex', flexDirection: 'column', gap: 8, alignItems: collapsed ? 'center' : 'stretch' }}>
        {/* Configurações fixo */}
        {(() => {
          const active = activeView === 'configuracoes'
          const isHover = hovered === 'configuracoes' && !active
          return (
            <button
              ref={el => { itemRefs.current['configuracoes'] = el }}
              onClick={() => onNavigate('configuracoes')}
              onMouseEnter={() => setHovered('configuracoes')}
              onMouseLeave={() => setHovered(null)}
              title={collapsed ? 'Configurações' : undefined}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 9,
                padding: collapsed ? '9px 0' : '9px 12px', borderRadius: 9, border: 'none', cursor: 'pointer',
                textAlign: 'left', width: '100%', position: 'relative', zIndex: 1,
                background: active ? `linear-gradient(135deg, ${R}DD, ${R}99)` : isHover ? 'rgba(255,255,255,0.07)' : 'transparent',
                color: active ? WHITE : isHover ? 'rgba(237,232,225,0.85)' : TEXT_MUT,
                fontWeight: active ? 700 : 500, fontSize: 13,
                transition: 'background .16s ease, color .16s ease, transform .18s cubic-bezier(.22,1,.36,1)',
                transform: !collapsed && isHover ? 'translateX(3px)' : 'translateX(0)',
                boxShadow: active ? `0 4px 20px ${R}50, 0 0 0 1px ${R}40` : 'none',
              }}
            >
              <Settings
                size={15} strokeWidth={active ? 2.5 : 2}
                style={{ transition: 'transform .2s', transform: isHover ? 'scale(1.15)' : 'scale(1)', flexShrink: 0, filter: active ? 'drop-shadow(0 0 6px rgba(255,255,255,0.5))' : 'none' }}
              />
              {!collapsed && 'Configurações'}
            </button>
          )
        })()}
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
