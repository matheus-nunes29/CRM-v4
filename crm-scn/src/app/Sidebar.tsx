'use client'
import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Users, LayoutDashboard, GitBranch, Settings, Target, CalendarDays, LogOut, TrendingUp, Wrench, ChevronLeft, ChevronRight, LayoutGrid, Rocket, Home, BookOpen, BarChart2, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { LOGO_SRC } from './logo'

const R        = '#E8001C'
const WHITE    = '#FFFFFF'
const BORDER   = 'rgba(255,255,255,0.07)'
const TEXT_MUT = 'rgba(237,232,225,0.38)'
const TEXT_ACT = '#EDE8E1'

type NavItem    = { type: 'item'; id: string; label: string; icon: React.ComponentType<any>; section: string | null }
type NavSection = { type: 'section'; id: string; label: string }
type NavSep     = { type: 'sep' }
type NavEntry   = NavItem | NavSection | NavSep

const MENU: NavEntry[] = [
  { type: 'item', id: 'inicio', label: 'Início', icon: Home, section: null },
  { type: 'section', id: 'vendas', label: 'Vendas' },
  { type: 'item', id: 'dashboard',      label: 'Dashboard',      icon: LayoutDashboard, section: 'vendas' },
  { type: 'item', id: 'leads',          label: 'Leads',          icon: Users,           section: 'vendas' },
  { type: 'item', id: 'pipeline',       label: 'Pipeline',       icon: GitBranch,       section: 'vendas' },
  { type: 'item', id: 'metas',          label: 'Metas',          icon: Target,          section: 'vendas' },
  { type: 'item', id: 'acompanhamento', label: 'Acompanhamento', icon: CalendarDays,    section: 'vendas' },
  { type: 'item', id: 'inteligencia',   label: 'Inteligência',   icon: TrendingUp,      section: 'vendas' },
  { type: 'item', id: 'ferramentas',    label: 'Ferramentas',    icon: Wrench,          section: 'vendas' },
  { type: 'section', id: 'operacao', label: 'Operação' },
  { type: 'item', id: 'cockpit',           label: 'Cockpit',      icon: LayoutGrid, section: 'operacao' },
  { type: 'item', id: 'cockpit/dashboard', label: 'CS Dashboard', icon: BarChart2,  section: 'operacao' },
  { type: 'item', id: 'expansao',          label: 'Expansão',     icon: Rocket,     section: 'operacao' },
  { type: 'item', id: 'catalogo',          label: 'Catálogo',     icon: BookOpen,   section: 'operacao' },
]

function sectionOf(id: string | null): string | null {
  if (!id) return null
  const e = MENU.find(x => x.type === 'item' && x.id === id)
  return e?.type === 'item' ? e.section : null
}

type SidebarProps = { activeView: string | null; onNavigate: (view: string) => void }

export default function Sidebar({ activeView, onNavigate }: SidebarProps) {
  const router   = useRouter()
  const [session, setSession] = useState<any>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [indicatorTop, setIndicatorTop] = useState<number | null>(null)
  const [mounted, setMounted]   = useState(false)
  const [collapsed, setCollapsed] = useState(() =>
    typeof window !== 'undefined' && localStorage.getItem('sidebar-collapsed') === 'true'
  )
  // initialise from the activeView prop so it's always correct on first render
  const [openSection, setOpenSection] = useState<string | null>(
    () => sectionOf(activeView) ?? 'vendas'
  )
  const navRef   = useRef<HTMLElement>(null)
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    setMounted(true)
  }, [])

  // keep the correct section open whenever active route changes
  useEffect(() => {
    if (!activeView) return
    const sec = sectionOf(activeView)
    if (sec) setOpenSection(sec)
  }, [activeView])

  // recalculate indicator after section state and active view settle
  useEffect(() => {
    if (!activeView) return
    const el = itemRefs.current[activeView]
    const nav = navRef.current
    if (!el || !nav) return
    // hide indicator when the active item is not visible (section collapsed)
    if (el.getBoundingClientRect().height === 0) { setIndicatorTop(null); return }
    const navTop = nav.getBoundingClientRect().top
    const elTop  = el.getBoundingClientRect().top
    setIndicatorTop(elTop - navTop + nav.scrollTop)
  }, [activeView, openSection, collapsed])

  const handleSignOut = async () => { await supabase.auth.signOut(); router.push('/login') }
  const initials = (session?.user?.user_metadata?.full_name || session?.user?.email || 'U')[0].toUpperCase()

  return (
    <aside style={{
      width: collapsed ? 64 : 220,
      background: '#0E0D0B',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
      borderRight: `1px solid ${BORDER}`,
      boxShadow: '1px 0 0 rgba(255,255,255,0.04)',
      zIndex: 10,
      opacity: mounted ? 1 : 0,
      transition: 'opacity .3s, width .22s cubic-bezier(.22,1,.36,1)',
      overflow: 'hidden',
    }}>

      {/* Logo */}
      <div style={{ padding: collapsed ? '16px 0' : '20px 18px 18px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: collapsed ? 'center' : 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, animation: 'fadeUp .4s cubic-bezier(.22,1,.36,1) both' }}>
          <div style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 9, overflow: 'hidden', background: `linear-gradient(135deg, ${R}, #FF4040)`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 22px ${R}55, 0 4px 12px rgba(0,0,0,0.4)`, border: '1px solid rgba(255,255,255,0.20)' }}>
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
      <nav ref={navRef} style={{ flex: 1, overflowY: 'auto', padding: collapsed ? '14px 6px' : '14px 10px', display: 'flex', flexDirection: 'column', gap: 1, position: 'relative' }}>

        {/* Sliding red indicator — lives inside nav, only for nav items */}
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
          // ── separator ──
          if (entry.type === 'sep') {
            return <div key="sep" style={{ margin: '8px 0 4px', height: 1, background: BORDER, flexShrink: 0 }} />
          }

          // ── section header ──
          if (entry.type === 'section') {
            const isOpen = openSection === entry.id
            return (
              <button
                key={entry.id}
                onClick={() => !collapsed && setOpenSection(prev => prev === entry.id ? null : entry.id)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between',
                  gap: 6, margin: '8px 0 2px', padding: collapsed ? '5px 0' : '4px 4px',
                  background: 'transparent', border: 'none',
                  cursor: collapsed ? 'default' : 'pointer', width: '100%', flexShrink: 0,
                }}
              >
                {collapsed
                  ? <div style={{ width: '100%', height: 1, background: BORDER }} />
                  : <>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(237,232,225,0.75)', letterSpacing: '0.10em', textTransform: 'uppercase' as const, whiteSpace: 'nowrap' as const }}>
                        {entry.label}
                      </span>
                      {isOpen
                        ? <ChevronUp   size={11} color={TEXT_MUT} style={{ opacity: 0.5, flexShrink: 0 }} />
                        : <ChevronDown size={11} color={TEXT_MUT} style={{ opacity: 0.5, flexShrink: 0 }} />
                      }
                    </>
                }
              </button>
            )
          }

          // ── nav item ──
          const active  = activeView === entry.id
          const isHover = hovered === entry.id && !active
          // hide when its section is collapsed; always show when sidebar is icon-only or section is null
          const hidden  = !collapsed && entry.section !== null && openSection !== entry.section

          return (
            <button
              key={entry.id}
              ref={el => { itemRefs.current[entry.id] = el }}
              onClick={() => onNavigate(entry.id)}
              onMouseEnter={() => setHovered(entry.id)}
              onMouseLeave={() => setHovered(null)}
              title={collapsed ? entry.label : undefined}
              style={{
                display: hidden ? 'none' : 'flex',
                alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 9,
                padding: collapsed ? '9px 0' : '9px 12px', borderRadius: 9, border: 'none', cursor: 'pointer',
                textAlign: 'left', width: '100%', position: 'relative', zIndex: 1, flexShrink: 0,
                background: isHover ? 'rgba(255,255,255,0.07)' : 'transparent',
                color: active ? WHITE : isHover ? 'rgba(237,232,225,0.85)' : TEXT_MUT,
                fontWeight: active ? 700 : 500, fontSize: 13,
                transition: 'background .16s ease, color .16s ease, transform .18s cubic-bezier(.22,1,.36,1)',
                transform: !collapsed && isHover ? 'translateX(3px)' : 'translateX(0)',
              }}
            >
              <entry.icon
                size={15} strokeWidth={active ? 2.5 : 2}
                style={{ transition: 'transform .2s', transform: isHover ? 'scale(1.15)' : 'scale(1)', flexShrink: 0, filter: active ? 'drop-shadow(0 0 6px rgba(255,255,255,0.5))' : 'none' }}
              />
              {!collapsed && entry.label}
            </button>
          )
        })}

        {/* Toggle collapse */}
        <button
          onClick={() => setCollapsed(v => { const n = !v; localStorage.setItem('sidebar-collapsed', String(n)); return n })}
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          style={{ display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-end', gap: 6, padding: collapsed ? '8px 0' : '8px 12px', borderRadius: 9, border: 'none', cursor: 'pointer', background: 'transparent', color: TEXT_MUT, width: '100%', marginTop: 8, flexShrink: 0, transition: 'color .15s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(237,232,225,0.60)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = TEXT_MUT }}
        >
          {collapsed ? <ChevronRight size={14} /> : <><span style={{ fontSize: 11, fontWeight: 500 }}>Recolher</span><ChevronLeft size={14} /></>}
        </button>
      </nav>

      {/* Bottom — configurações + user */}
      <div style={{ padding: collapsed ? '12px 6px' : '12px 10px', borderTop: `1px solid ${BORDER}`, display: 'flex', alignItems: collapsed ? 'center' : 'stretch', flexDirection: 'column', gap: 6 }}>
        {/* Configurações fixo */}
        {(() => {
          const active  = activeView === 'configuracoes'
          const isHover = hovered === 'configuracoes' && !active
          return (
            <button
              onClick={() => onNavigate('configuracoes')}
              onMouseEnter={() => setHovered('configuracoes')}
              onMouseLeave={() => setHovered(null)}
              title={collapsed ? 'Configurações' : undefined}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 9,
                padding: collapsed ? '9px 0' : '9px 12px', borderRadius: 9, border: 'none', cursor: 'pointer',
                width: '100%',
                background: active
                  ? `linear-gradient(135deg, ${R}DD, ${R}99)`
                  : isHover ? 'rgba(255,255,255,0.07)' : 'transparent',
                color: active ? WHITE : isHover ? 'rgba(237,232,225,0.85)' : TEXT_MUT,
                fontWeight: active ? 700 : 500, fontSize: 13,
                boxShadow: active ? `0 4px 20px ${R}50, 0 0 0 1px ${R}40, inset 0 1px 0 rgba(255,255,255,0.25)` : 'none',
                transition: 'background .16s, color .16s, transform .18s cubic-bezier(.22,1,.36,1)',
                transform: !collapsed && isHover ? 'translateX(3px)' : 'translateX(0)',
              }}
            >
              <Settings size={15} strokeWidth={active ? 2.5 : 2}
                style={{ flexShrink: 0, filter: active ? 'drop-shadow(0 0 6px rgba(255,255,255,0.5))' : 'none', transition: 'transform .2s', transform: isHover ? 'scale(1.15)' : 'scale(1)' }}
              />
              {!collapsed && 'Configurações'}
            </button>
          )
        })()}
        <div style={{ height: 1, background: BORDER, margin: '2px 0' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 4px', justifyContent: collapsed ? 'center' : 'flex-start' }}>
          <button onClick={handleSignOut} title={collapsed ? 'Sair' : undefined} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', flexShrink: 0 }}>
            {session?.user?.user_metadata?.avatar_url
              ? <img src={session.user.user_metadata.avatar_url} style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, border: '1.5px solid rgba(255,255,255,0.18)' }} alt="" />
              : <div style={{ width: 28, height: 28, borderRadius: '50%', background: `linear-gradient(135deg, ${R}, #FF4040)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: WHITE, flexShrink: 0, boxShadow: `0 0 14px ${R}50, 0 2px 8px rgba(0,0,0,0.4)`, border: '1px solid rgba(255,255,255,0.18)' }}>
                  {initials}
                </div>
            }
          </button>
          {!collapsed && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(237,232,225,0.72)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1 }}>
                {session?.user?.user_metadata?.full_name || session?.user?.email || ''}
              </div>
              <button onClick={handleSignOut} style={{ fontSize: 10, color: TEXT_MUT, marginTop: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4, transition: 'color .15s' }}
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
