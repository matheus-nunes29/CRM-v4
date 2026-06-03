'use client'
import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import CRMLayout from './_components/CRMLayout'
import {
  R, WHITE, GRAY1, GRAY2, GRAY3, GRAY4, GRAY5, GREEN, BLUE, YELLOW, PURPLE,
} from '@/lib/crm-constants'
import {
  LayoutDashboard, Users, GitBranch, Target, CalendarDays, TrendingUp, Wrench,
  LayoutGrid, Rocket, Settings, ArrowRight,
  UserPlus, Video, ShoppingBag, DollarSign,
  Heart, Activity, AlertTriangle, Banknote,
} from 'lucide-react'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

function fmtCurrency(v: number) {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`
}

function currentMonthLabel() {
  return new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

function currentYearMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

type KPI = { label: string; value: string | number; sub?: string; icon: React.ComponentType<any>; color: string; bg: string }

const MODULOS_VENDAS = [
  { id: 'dashboard',      icon: LayoutDashboard, label: 'Dashboard',       desc: 'Análise de KPIs e resultados comerciais do mês' },
  { id: 'leads',          icon: Users,           label: 'Leads',           desc: 'Gerencie e qualifique seus prospects' },
  { id: 'pipeline',       icon: GitBranch,       label: 'Pipeline',        desc: 'Acompanhe o funil de vendas em kanban' },
  { id: 'metas',          icon: Target,          label: 'Metas',           desc: 'Defina e monitore metas da equipe comercial' },
  { id: 'acompanhamento', icon: CalendarDays,    label: 'Acompanhamento',  desc: 'Reuniões, follow-ups e agenda da equipe' },
  { id: 'inteligencia',   icon: TrendingUp,      label: 'Inteligência',    desc: 'Insights e análises de inteligência comercial' },
  { id: 'ferramentas',    icon: Wrench,          label: 'Ferramentas',     desc: 'Calculadoras, scripts e playbooks de vendas' },
]

const MODULOS_OPERACAO = [
  { id: 'cockpit',  icon: LayoutGrid, label: 'Cockpit',  desc: 'Gestão de clientes ativos com Health Score semanal' },
  { id: 'expansao', icon: Rocket,     label: 'Expansão', desc: 'Pipeline de oportunidades de expansão de carteira' },
]

export default function InicioPage() {
  const router = useRouter()
  const [userName, setUserName] = useState('')
  const [kpisVendas, setKpisVendas]   = useState<KPI[]>([])
  const [kpisOp, setKpisOp]           = useState<KPI[]>([])
  const [loading, setLoading]         = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const name = session?.user?.user_metadata?.full_name || session?.user?.email || ''
      setUserName(name.split(' ')[0])
    })
    loadKPIs()
  }, [])

  async function loadKPIs() {
    const mes = currentYearMonth()

    const [leadsRes, clientesRes, projetosRes, hsRes] = await Promise.all([
      supabase.from('leads').select('data_entrada, data_rr, data_assinatura, tcv, situacao_pre_vendas, situacao_closer'),
      supabase.from('clientes').select('id, status'),
      supabase.from('projetos').select('valor, valor_tipo, status, cliente_id'),
      supabase.from('health_score_entries').select('cliente_id, score_total, semana').order('semana', { ascending: false }),
    ])

    const leads = leadsRes.data || []
    const clientes = clientesRes.data || []
    const projetos = projetosRes.data || []
    const hsEntries = hsRes.data || []

    // ── KPIs de Vendas ────────────────────────────────────────────────────────
    const leadsNovos = leads.filter(l => l.data_entrada?.startsWith(mes)).length

    const reunioes = leads.filter(l => l.data_rr?.startsWith(mes)).length

    const vendasFechadas = leads.filter(l => l.data_assinatura?.startsWith(mes))
    const tcvGerado = vendasFechadas.reduce((acc, l) => acc + (l.tcv || 0), 0)

    setKpisVendas([
      { label: 'Leads novos',        value: leadsNovos,              sub: 'no mês',        icon: UserPlus,     color: BLUE,   bg: '#F5F3FF' },
      { label: 'Reuniões realizadas', value: reunioes,               sub: 'no mês',        icon: Video,        color: PURPLE, bg: '#F5F3FF' },
      { label: 'Vendas fechadas',     value: vendasFechadas.length,  sub: 'no mês',        icon: ShoppingBag,  color: GREEN,  bg: '#ECFDF5' },
      { label: 'TCV gerado',          value: tcvGerado > 0 ? fmtCurrency(tcvGerado) : '—', sub: 'no mês', icon: DollarSign, color: '#065F46', bg: '#ECFDF5' },
    ])

    // ── KPIs de Operação ──────────────────────────────────────────────────────
    const clientesAtivos = clientes.filter(c => c.status === 'ativo')
    const ativosIds = new Set(clientesAtivos.map(c => c.id))

    const mrr = projetos
      .filter(p => p.valor_tipo === 'mensalidade' && p.status === 'ativo' && ativosIds.has(p.cliente_id))
      .reduce((acc, p) => acc + p.valor, 0)

    // Latest HS per client
    const latestHsMap: Record<string, number> = {}
    for (const e of hsEntries) {
      if (!(e.cliente_id in latestHsMap)) latestHsMap[e.cliente_id] = e.score_total
    }
    const hsScores = Object.values(latestHsMap)
    const hsMedia = hsScores.length ? hsScores.reduce((a, b) => a + b, 0) / hsScores.length : null
    const emAlerta = hsScores.filter(s => s < 7).length

    setKpisOp([
      { label: 'Clientes ativos',   value: clientesAtivos.length,                          sub: 'atualmente',    icon: Heart,          color: GREEN,   bg: '#ECFDF5' },
      { label: 'MRR total',         value: mrr > 0 ? fmtCurrency(mrr) : '—',               sub: 'recorrente',    icon: Banknote,       color: '#065F46', bg: '#ECFDF5' },
      { label: 'Health Score médio', value: hsMedia !== null ? hsMedia.toFixed(1) : '—',   sub: 'entre clientes', icon: Activity,      color: hsMedia !== null ? (hsMedia >= 7 ? GREEN : hsMedia >= 5 ? '#92400E' : R) : GRAY3, bg: hsMedia !== null ? (hsMedia >= 7 ? '#ECFDF5' : hsMedia >= 5 ? '#FEF3C7' : '#FEE2E2') : GRAY4 },
      { label: 'Clientes em alerta', value: emAlerta,                                      sub: 'HS abaixo de 7', icon: AlertTriangle,  color: emAlerta > 0 ? R : GREEN, bg: emAlerta > 0 ? '#FEE2E2' : '#ECFDF5' },
    ])

    setLoading(false)
  }

  const navigate = (id: string) => router.push(id === 'dashboard' ? '/' : `/${id}`)

  const card: React.CSSProperties = {
    background: WHITE, border: `1px solid ${GRAY5}`, borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,.05)',
  }

  return (
    <CRMLayout title="Início">
      {/* ── Welcome ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: GRAY1, letterSpacing: '-0.02em' }}>
          {greeting()}{userName ? `, ${userName}` : ''}! 👋
        </div>
        <div style={{ fontSize: 13, color: GRAY3, marginTop: 5 }}>
          {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          {' · '}Aqui está um resumo do que está acontecendo agora.
        </div>
      </div>

      {/* ── KPIs Vendas ── */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div style={{ width: 3, height: 16, borderRadius: 2, background: R }} />
          <span style={{ fontSize: 11, fontWeight: 800, color: GRAY2, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Vendas — {currentMonthLabel()}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{ ...card, padding: '18px 20px', height: 90, background: GRAY4 }} />
              ))
            : kpisVendas.map(k => <KPICard key={k.label} {...k} />)
          }
        </div>
      </div>

      {/* ── KPIs Operação ── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div style={{ width: 3, height: 16, borderRadius: 2, background: BLUE }} />
          <span style={{ fontSize: 11, fontWeight: 800, color: GRAY2, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Operação — visão atual
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{ ...card, padding: '18px 20px', height: 90, background: GRAY4 }} />
              ))
            : kpisOp.map(k => <KPICard key={k.label} {...k} />)
          }
        </div>
      </div>

      {/* ── Módulos Vendas ── */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <div style={{ width: 3, height: 16, borderRadius: 2, background: R }} />
          <span style={{ fontSize: 11, fontWeight: 800, color: GRAY2, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Módulos de Vendas</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
          {MODULOS_VENDAS.map(m => <ModuleCard key={m.id} {...m} onClick={() => navigate(m.id)} />)}
        </div>
      </div>

      {/* ── Módulos Operação ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <div style={{ width: 3, height: 16, borderRadius: 2, background: BLUE }} />
          <span style={{ fontSize: 11, fontWeight: 800, color: GRAY2, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Módulos de Operação</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          {MODULOS_OPERACAO.map(m => <ModuleCard key={m.id} {...m} onClick={() => navigate(m.id)} />)}
        </div>
      </div>
    </CRMLayout>
  )
}

function KPICard({ label, value, sub, icon: Icon, color, bg }: KPI) {
  return (
    <div style={{
      background: WHITE, border: `1px solid ${GRAY5}`, borderRadius: 14,
      padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14,
      boxShadow: '0 1px 4px rgba(0,0,0,.05)',
    }}>
      <div style={{ width: 42, height: 42, borderRadius: 11, background: bg, border: `1px solid ${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={19} color={color} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, color: GRAY3, fontWeight: 500, marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: GRAY1, lineHeight: 1, letterSpacing: '-0.01em' }}>{value}</div>
        {sub && <div style={{ fontSize: 10, color: GRAY3, marginTop: 3 }}>{sub}</div>}
      </div>
    </div>
  )
}

function ModuleCard({ icon: Icon, label, desc, onClick }: { icon: React.ComponentType<any>; label: string; desc: string; onClick: () => void }) {
  const [hov, setHov] = React.useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: WHITE, border: `1px solid ${hov ? GRAY3 : GRAY5}`, borderRadius: 14,
        padding: '20px', cursor: 'pointer',
        boxShadow: hov ? '0 4px 16px rgba(0,0,0,.09)' : '0 1px 4px rgba(0,0,0,.05)',
        transform: hov ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'all .18s cubic-bezier(.22,1,.36,1)',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}
    >
      <div style={{ width: 38, height: 38, borderRadius: 10, background: hov ? `${R}0F` : GRAY4, border: `1px solid ${hov ? R + '28' : GRAY5}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .18s', flexShrink: 0 }}>
        <Icon size={17} color={hov ? R : GRAY2} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: GRAY1, marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 12, color: GRAY3, lineHeight: 1.5 }}>{desc}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: hov ? R : GRAY3, transition: 'color .15s' }}>
        Acessar <ArrowRight size={11} />
      </div>
    </div>
  )
}
