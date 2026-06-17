'use client'
export const dynamic = 'force-dynamic'
import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import CRMLayout from '../_components/CRMLayout'
import {
  Upload, FileSpreadsheet, CheckCircle, AlertCircle, Plus, Users,
  Sparkles, RotateCcw, Trash2, ChevronDown, Check,
} from 'lucide-react'
import {
  R, WHITE, GRAY1, GRAY2, GRAY3, GRAY4, GRAY5, GREEN, YELLOW, BLUE,
  inputCls, labelCls,
} from '@/lib/crm-constants'
import { PAPEL_LABELS, PAPEL_COLORS, type Papel } from '@/lib/useUserRole'
import { confirmDialog } from '@/lib/confirmDialog'
import { toast } from '@/lib/toast'

const ADMIN_EMAIL = 'matheus.nunes@v4company.com'
const PAPEIS: Papel[] = ['admin', 'sdr', 'closer', 'viewer', 'financeiro', 'designer', 'analista_midia', 'gestor_projetos', 'coordenador_peg']

type Tab = 'usuarios' | 'importacao' | 'ia'

// ─── Page route ─────────────────────────────────────────────────────────────

export default function ConfiguracoesPageRoute() {
  const router = useRouter()
  const [userEmail, setUserEmail] = useState<string | undefined>()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setUserEmail(session.user.email)
    })
  }, [])

  async function importLeads(leads: any[]): Promise<{ ok: number; errors: number }> {
    let ok = 0, errors = 0
    const CHUNK = 50
    for (let i = 0; i < leads.length; i += CHUNK) {
      const batch = leads.slice(i, i + CHUNK).map((l: any) => {
        const clean: Record<string, any> = {}
        Object.entries(l).forEach(([k, v]) => { clean[k] = (v === '' || v === undefined) ? null : v })
        return clean
      })
      const { error } = await supabase.from('leads').insert(batch)
      if (error) { errors += batch.length } else { ok += batch.length }
    }
    return { ok, errors }
  }

  return (
    <CRMLayout>
      <ConfiguracoesShell onImport={importLeads} userEmail={userEmail} />
    </CRMLayout>
  )
}

// ─── Shell with tab bar ──────────────────────────────────────────────────────

function ConfiguracoesShell({ onImport, userEmail }: {
  onImport: (leads: any[]) => Promise<{ ok: number; errors: number }>
  userEmail?: string
}) {
  const [activeTab, setActiveTab] = useState<Tab>('usuarios')
  const isAdmin = userEmail === ADMIN_EMAIL

  const TABS: { key: Tab; label: string; Icon: React.FC<any>; subtitle: string }[] = [
    { key: 'usuarios',   label: 'Usuários',        Icon: Users,           subtitle: 'Gerencie quem pode acessar o CRM e suas permissões' },
    { key: 'importacao', label: 'Importação',       Icon: FileSpreadsheet, subtitle: 'Importe leads em massa a partir de planilhas .xlsx ou .csv' },
    { key: 'ia',         label: 'Inteligência IA',  Icon: Sparkles,        subtitle: 'Configure o comportamento da qualificação automática com IA' },
  ]

  const current = TABS.find(t => t.key === activeTab)!

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Page header */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 800, color: R, textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: 6 }}>
          Sistema
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 900, color: GRAY1, margin: 0, letterSpacing: '-0.01em' }}>
          Configurações
        </h1>
        <p style={{ fontSize: 13, color: GRAY2, marginTop: 6, marginBottom: 0 }}>
          {current.subtitle}
        </p>
      </div>

      {/* Tab container */}
      <div style={{ background: WHITE, borderRadius: 14, border: '1px solid #E5E7EB', boxShadow: '0 1px 8px rgba(0,0,0,.06)', overflow: 'hidden' }}>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid #F3F4F6', paddingLeft: 8, paddingRight: 8 }}>
          {TABS.map(({ key, label, Icon }) => {
            const active = activeTab === key
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '15px 18px',
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  fontSize: 13, fontWeight: active ? 700 : 500,
                  color: active ? R : GRAY3,
                  borderBottom: `2px solid ${active ? R : 'transparent'}`,
                  marginBottom: -1,
                  transition: 'color .15s, border-color .15s',
                  whiteSpace: 'nowrap',
                }}
              >
                <Icon size={15} />
                {label}
              </button>
            )
          })}
        </div>

        {/* Tab content */}
        <div style={{ padding: 28 }}>
          {activeTab === 'usuarios'   && <TabUsuarios currentEmail={userEmail} />}
          {activeTab === 'importacao' && <TabImportacao onImport={onImport} />}
          {activeTab === 'ia'         && <TabIA isAdmin={isAdmin} />}
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Usuários ───────────────────────────────────────────────────────────

function PapelBadge({ papel }: { papel: Papel | null }) {
  const p = papel ?? 'viewer'
  const c = PAPEL_COLORS[p]
  return (
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: c.bg, color: c.text }}>
      {PAPEL_LABELS[p]}
    </span>
  )
}

function TabUsuarios({ currentEmail }: { currentEmail?: string }) {
  const isAdmin = currentEmail === ADMIN_EMAIL
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [papel, setPapel] = useState<Papel>('viewer')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [updatingPapel, setUpdatingPapel] = useState<string | null>(null)
  const [papelPendente, setPapelPendente] = useState<Record<string, Papel>>({})

  useEffect(() => { fetchUsuarios() }, [])

  async function fetchUsuarios() {
    setLoading(true)
    const [{ data: rpcData }, { data: directData }] = await Promise.all([
      supabase.rpc('get_usuarios_com_ultimo_login'),
      supabase.from('usuarios_permitidos').select('id, papel, avatar_url'),
    ])
    if (rpcData) {
      const extra = Object.fromEntries((directData || []).map((u: any) => [u.id, u]))
      setUsuarios(rpcData.map((u: any) => ({ ...u, papel: extra[u.id]?.papel ?? null, avatar_url: extra[u.id]?.avatar_url ?? null })))
    }
    setLoading(false)
  }

  async function addUsuario() {
    if (!nome.trim() || !email.trim()) { setError('Preencha nome e email'); return }
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) { setError('Email inválido'); return }
    setSaving(true); setError('')
    const { error: err } = await supabase.from('usuarios_permitidos').insert({ nome: nome.trim(), email: email.trim().toLowerCase(), papel })
    if (err) {
      if (err.code === '23505') setError('Este email já está cadastrado')
      else if (err.code === '42501') setError('Sem permissão. Execute a policy no Supabase.')
      else setError(`Erro: ${err.message}`)
    } else {
      setNome(''); setEmail(''); setPapel('viewer'); fetchUsuarios()
      toast.success('Usuário adicionado.')
    }
    setSaving(false)
  }

  async function toggleAtivo(id: string, ativo: boolean) {
    await supabase.from('usuarios_permitidos').update({ ativo: !ativo }).eq('id', id)
    fetchUsuarios()
  }

  async function removeUsuario(id: string) {
    const ok = await confirmDialog.show({ title: 'Remover este usuário?', confirmLabel: 'Remover', danger: true })
    if (!ok) return
    await supabase.from('usuarios_permitidos').delete().eq('id', id)
    fetchUsuarios()
  }

  async function savePapel(id: string) {
    const novoPapel = papelPendente[id]
    if (!novoPapel) return
    setUpdatingPapel(id); setError('')
    const { error: err } = await supabase.from('usuarios_permitidos').update({ papel: novoPapel }).eq('id', id)
    if (err) {
      setError(err.message.includes('column') || err.code === '42703'
        ? 'A coluna "papel" ainda não existe. Execute o SQL de migração.'
        : `Erro ao salvar papel: ${err.message}`)
    } else {
      setUsuarios(prev => prev.map(u => u.id === id ? { ...u, papel: novoPapel } : u))
      setPapelPendente(prev => { const n = { ...prev }; delete n[id]; return n })
    }
    setUpdatingPapel(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Add user form — admin only */}
      {isAdmin && (
        <div style={{ background: GRAY4, borderRadius: 12, padding: '20px 20px 16px', border: '1px solid #E5E7EB' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: GRAY1, marginBottom: 14 }}>Adicionar novo usuário</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 180px', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelCls}>Nome completo <span style={{ color: R }}>*</span></label>
              <input style={inputCls} placeholder="Ex: João Silva" value={nome} onChange={e => { setNome(e.target.value); setError('') }} />
            </div>
            <div>
              <label style={labelCls}>Email Google <span style={{ color: R }}>*</span></label>
              <input style={inputCls} type="email" placeholder="email@empresa.com" value={email} onChange={e => { setEmail(e.target.value); setError('') }} />
            </div>
            <div>
              <label style={labelCls}>Função</label>
              <select style={inputCls} value={papel} onChange={e => setPapel(e.target.value as Papel)}>
                {PAPEIS.map(p => <option key={p} value={p}>{PAPEL_LABELS[p]}</option>)}
              </select>
            </div>
          </div>
          {error && (
            <div style={{ fontSize: 12, color: R, fontWeight: 600, marginBottom: 10 }}>{error}</div>
          )}
          <button
            onClick={addUsuario} disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 20px', borderRadius: 8, border: 'none', background: saving ? GRAY3 : R, color: WHITE, fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}
          >
            <Plus size={14} /> {saving ? 'Adicionando...' : 'Adicionar usuário'}
          </button>
        </div>
      )}

      {/* Users table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: GRAY3, fontSize: 13 }}>Carregando usuários...</div>
      ) : usuarios.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: GRAY3, fontSize: 13 }}>Nenhum usuário cadastrado</div>
      ) : (
        <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: GRAY4 }}>
                {['Usuário', 'Função', 'Último acesso', 'Status', ...(isAdmin ? [''] : [])].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '11px 16px', fontSize: 11, fontWeight: 700, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u, i) => (
                <tr key={u.id} style={{ borderTop: '1px solid #F3F4F6', background: i % 2 ? '#FAFAFA' : WHITE, transition: 'background .1s' }}>
                  <td style={{ padding: '13px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt={u.nome} width={32} height={32} style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: `linear-gradient(135deg, ${R}, #FF4040)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: WHITE, flexShrink: 0 }}>
                          {u.nome?.[0]?.toUpperCase() ?? '?'}
                        </div>
                      )}
                      <div>
                        <div style={{ fontWeight: 600, color: GRAY1, fontSize: 13 }}>{u.nome}</div>
                        <div style={{ fontSize: 11, color: GRAY3, marginTop: 1 }}>{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '13px 16px' }}>
                    {isAdmin && u.email !== ADMIN_EMAIL ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <select
                          value={papelPendente[u.id] ?? u.papel ?? 'viewer'}
                          disabled={updatingPapel === u.id}
                          onChange={e => setPapelPendente(prev => ({ ...prev, [u.id]: e.target.value as Papel }))}
                          style={{ fontSize: 11, fontWeight: 700, padding: '4px 8px', borderRadius: 6, border: `1px solid ${papelPendente[u.id] ? '#F59E0B' : '#E5E7EB'}`, background: WHITE, cursor: 'pointer', color: GRAY1 }}
                        >
                          {PAPEIS.map(p => <option key={p} value={p}>{PAPEL_LABELS[p]}</option>)}
                        </select>
                        {papelPendente[u.id] && (
                          <button
                            onClick={() => savePapel(u.id)}
                            disabled={updatingPapel === u.id}
                            style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: GREEN, color: WHITE, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                          >
                            {updatingPapel === u.id ? '...' : 'Salvar'}
                          </button>
                        )}
                      </div>
                    ) : (
                      <PapelBadge papel={u.papel ?? 'viewer'} />
                    )}
                  </td>
                  <td style={{ padding: '13px 16px', fontSize: 12, color: u.ultimo_login ? GRAY2 : GRAY3 }}>
                    {u.ultimo_login
                      ? new Date(u.ultimo_login).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                      : '—'}
                  </td>
                  <td style={{ padding: '13px 16px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: u.ativo ? `${GREEN}15` : `${GRAY2}15`, color: u.ativo ? GREEN : GRAY2, border: `1px solid ${u.ativo ? GREEN : GRAY2}30` }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: u.ativo ? GREEN : GRAY2 }} />
                      {u.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  {isAdmin && (
                    <td style={{ padding: '13px 16px' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => toggleAtivo(u.id, u.ativo)}
                          style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${u.ativo ? YELLOW : GREEN}44`, background: u.ativo ? `${YELLOW}10` : `${GREEN}10`, color: u.ativo ? YELLOW : GREEN, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                        >
                          {u.ativo ? 'Desativar' : 'Ativar'}
                        </button>
                        {u.email !== ADMIN_EMAIL && (
                          <button
                            onClick={() => removeUsuario(u.id)}
                            style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${R}30`, background: `${R}08`, color: R, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ fontSize: 12, color: GRAY3, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 4, height: 4, borderRadius: '50%', background: GRAY3, flexShrink: 0 }} />
        O login é feito com a conta Google cadastrada aqui. Usuários inativos não conseguem acessar o CRM.
      </div>
    </div>
  )
}

// ─── Tab: Importação ─────────────────────────────────────────────────────────

function TabImportacao({ onImport }: { onImport: (leads: any[]) => Promise<{ ok: number; errors: number }> }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<any[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ ok: number; errors: number } | null>(null)
  const [step, setStep] = useState<'upload' | 'map' | 'done'>('upload')
  const [dragOver, setDragOver] = useState(false)

  const CRM_FIELDS = [
    { key: '', label: '— Ignorar coluna —' },
    { key: 'empresa', label: 'Empresa *' },
    { key: 'origem', label: 'Origem' },
    { key: 'segmento', label: 'Segmento' },
    { key: 'closer', label: 'Closer' },
    { key: 'temperatura', label: 'Temperatura' },
    { key: 'situacao_closer', label: 'Situação Closer' },
    { key: 'tier', label: 'Tier' },
    { key: 'faturamento', label: 'Faturamento' },
    { key: 'cargo', label: 'Cargo' },
    { key: 'urgencia', label: 'Urgência' },
    { key: 'data_entrada', label: 'Data de Entrada' },
    { key: 'data_ra', label: 'Data RA' },
    { key: 'data_rr', label: 'Data RR' },
    { key: 'data_assinatura', label: 'Data Venda' },
    { key: 'data_ativacao', label: 'Data Ativação' },
    { key: 'data_fup', label: 'Data FUP' },
    { key: 'tcv', label: 'TCV (R$)' },
    { key: 'proximos_passos', label: 'Próximos Passos' },
    { key: 'venda', label: 'Venda?' },
    { key: 'bant', label: 'BANT' },
    { key: 'nome_lead', label: 'Nome do Lead' },
    { key: 'telefone', label: 'Telefone' },
    { key: 'situacao_pre_vendas', label: 'Situação BDR' },
    { key: 'broker', label: 'Custo Broker' },
    { key: 'recomendacoes', label: 'Quem Recomendou' },
    { key: 'conexao', label: 'Conexão' },
  ]

  function autoMap(cols: string[]) {
    const aliases: Record<string, string> = {
      'empresa': 'empresa', 'company': 'empresa', 'nome': 'empresa',
      'origem': 'origem', 'source': 'origem',
      'segmento': 'segmento', 'segment': 'segmento',
      'closer': 'closer', 'vendedor': 'closer',
      'temperatura': 'temperatura', 'temp': 'temperatura',
      'situação closer': 'situacao_closer', 'situacao': 'situacao_closer', 'status': 'situacao_closer',
      'tier': 'tier',
      'faturamento': 'faturamento', 'revenue': 'faturamento',
      'cargo': 'cargo', 'role': 'cargo',
      'urgência': 'urgencia', 'urgencia': 'urgencia',
      'data entrada': 'data_entrada', 'data de entrada': 'data_entrada', 'entrada': 'data_entrada',
      'data ra': 'data_ra', 'data reunião agendada': 'data_ra', 'ra': 'data_ra',
      'data rr': 'data_rr', 'data reunião realizada': 'data_rr', 'rr': 'data_rr',
      'data assinatura': 'data_assinatura', 'data venda': 'data_assinatura', 'assinatura': 'data_assinatura',
      'data ativação': 'data_ativacao', 'data ativacao': 'data_ativacao', 'ativação': 'data_ativacao',
      'data fup': 'data_fup', 'fup': 'data_fup', 'follow up': 'data_fup',
      'tcv': 'tcv', 'valor': 'tcv', 'ticket': 'tcv',
      'próximos passos': 'proximos_passos', 'proximos passos': 'proximos_passos', 'next steps': 'proximos_passos',
      'venda': 'venda', 'vendido': 'venda',
      'bant': 'bant',
      'nome do lead': 'nome_lead', 'nome lead': 'nome_lead', 'contato': 'nome_lead',
      'telefone': 'telefone', 'phone': 'telefone',
      'situação bdr': 'situacao_pre_vendas', 'situacao bdr': 'situacao_pre_vendas',
      'custo broker': 'broker', 'broker': 'broker',
      'quem recomendou': 'recomendacoes', 'quem recomendou / indicou': 'recomendacoes', 'indicou': 'recomendacoes',
      'conexão': 'conexao', 'conexao': 'conexao',
      'authority': 'autority', 'autority': 'autority',
      'need': 'need', 'timing': 'timing', 'budget': 'budget',
    }
    const auto: Record<string, string> = {}
    cols.forEach(col => { auto[col] = aliases[col.toLowerCase().trim()] || '' })
    return auto
  }

  async function handleFile(f: File) {
    setFile(f); setResult(null); setStep('upload')
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const XLSX = (window as any).XLSX
        if (!XLSX) { toast.info('Aguarde o carregamento da biblioteca.'); return }
        const workbook = XLSX.read(e.target?.result, { type: 'binary', cellDates: true })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
        if (rows.length < 2) return
        let headerRowIdx = 0
        for (let i = 0; i < Math.min(10, rows.length); i++) {
          const first = String(rows[i][0] || '').trim().toUpperCase()
          if (first === 'EMPRESA' || first === 'COMPANY' || first === 'NOME') { headerRowIdx = i; break }
        }
        const hdrs = rows[headerRowIdx].map((h: any) => String(h).trim()).filter((h: string) => h)
        setHeaders(hdrs); setMapping(autoMap(hdrs))
        const dataRows = rows.slice(headerRowIdx + 1, headerRowIdx + 7)
          .filter((row: any[]) => String(row[0] || '').trim() && String(row[0] || '').trim() !== hdrs[0])
          .slice(0, 5)
          .map((row: any[]) => { const obj: Record<string, any> = {}; hdrs.forEach((h: string, i: number) => { obj[h] = row[i] }); return obj })
        setPreview(dataRows); setStep('map')
      } catch { toast.error('Erro ao ler arquivo. Certifique-se que é .xlsx ou .csv válido.') }
    }
    reader.readAsBinaryString(f)
  }

  async function handleImport() {
    if (!file) return
    setImporting(true)
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const XLSX = (window as any).XLSX
        if (!XLSX) { toast.info('Aguarde o carregamento da biblioteca.'); setImporting(false); return }
        const workbook = XLSX.read(e.target?.result, { type: 'binary', cellDates: true })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
        let headerRowIdx = 0
        for (let i = 0; i < Math.min(10, rows.length); i++) {
          const first = String(rows[i][0] || '').trim().toUpperCase()
          if (first === 'EMPRESA' || first === 'COMPANY' || first === 'NOME') { headerRowIdx = i; break }
        }
        const hdrs = rows[headerRowIdx].map((h: any) => String(h).trim())
        const leads = rows.slice(headerRowIdx + 1)
          .filter((row: any[]) => String(row[0] || '').trim() && String(row[0] || '').trim().toUpperCase() !== hdrs[0].toUpperCase())
          .map((row: any[]) => {
            const lead: Record<string, any> = {}
            hdrs.forEach((h: string, i: number) => {
              const field = mapping[h]
              if (!field || !h) return
              let val = row[i]
              if (val === '' || val === null || val === undefined) return
              if (field.startsWith('data_') && val instanceof Date) { val = val.toISOString().split('T')[0] }
              else if (field.startsWith('data_') && typeof val === 'string' && val.trim()) {
                try { val = new Date(val).toISOString().split('T')[0] } catch { return }
              }
              if (field === 'tcv' || field === 'bant') {
                val = Number(String(val).replace(/[^0-9.,]/g, '').replace(',', '.'))
                if (isNaN(val)) return
              }
              lead[field] = val
            })
            return lead
          })
          .filter((l: any) => l.empresa && String(l.empresa).trim())
        const res = await onImport(leads)
        setResult(res); setStep('done')
      } catch (err: any) { toast.error('Erro na importação: ' + err.message) }
      setImporting(false)
    }
    reader.readAsBinaryString(file)
  }

  function reset() {
    setFile(null); setPreview([]); setHeaders([]); setMapping({})
    setResult(null); setStep('upload')
  }

  const STEPS = [
    { key: 'upload', label: 'Upload' },
    { key: 'map',    label: 'Mapear' },
    { key: 'done',   label: 'Concluído' },
  ]
  const stepIdx = STEPS.findIndex(s => s.key === step)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Step indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        {STEPS.map((s, i) => {
          const done = i < stepIdx
          const active = i === stepIdx
          return (
            <React.Fragment key={s.key}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: done ? GREEN : active ? R : GRAY4,
                  border: `2px solid ${done ? GREEN : active ? R : '#D1D5DB'}`,
                  fontSize: 12, fontWeight: 800, color: done || active ? WHITE : GRAY3,
                  transition: 'all .2s',
                }}>
                  {done ? <Check size={13} /> : i + 1}
                </div>
                <span style={{ fontSize: 11, fontWeight: active ? 700 : 500, color: active ? R : done ? GREEN : GRAY3 }}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div style={{ flex: 1, height: 2, background: i < stepIdx ? GREEN : GRAY5, margin: '0 8px', marginBottom: 20, transition: 'background .2s' }} />
              )}
            </React.Fragment>
          )
        })}
      </div>

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
            onClick={() => document.getElementById('xlsx-input')?.click()}
            style={{ border: `2px dashed ${dragOver ? R : '#D1D5DB'}`, borderRadius: 12, padding: '52px 24px', textAlign: 'center', background: dragOver ? `${R}06` : GRAY4, transition: 'all .2s', cursor: 'pointer' }}
          >
            <Upload size={36} color={dragOver ? R : GRAY2} style={{ margin: '0 auto 14px', display: 'block' }} />
            <div style={{ fontSize: 15, fontWeight: 700, color: dragOver ? R : GRAY1, marginBottom: 6 }}>
              {dragOver ? 'Solte o arquivo aqui' : 'Arraste o arquivo ou clique para selecionar'}
            </div>
            <div style={{ fontSize: 12, color: GRAY3 }}>Suporta .xlsx e .csv — cada linha = um lead</div>
            <input id="xlsx-input" type="file" accept=".xlsx,.csv" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: GRAY4, borderRadius: 10, border: '1px solid #E5E7EB' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: GRAY1, marginBottom: 2 }}>Modelo de planilha</div>
              <div style={{ fontSize: 11, color: GRAY3 }}>Baixe o template com todas as colunas disponíveis</div>
            </div>
            <button
              onClick={() => {
                const cols = ['EMPRESA','NOME DO LEAD','TELEFONE','DATA ENTRADA','ORIGEM','CUSTO BROKER','QUEM RECOMENDOU','SEGMENTO','CONEXÃO','SITUAÇÃO BDR','BANT','BUDGET','AUTHORITY','NEED','TIMING','TEMPERATURA','SITUAÇÃO CLOSER','FATURAMENTO','CARGO','TCV','DATA RA','DATA RR','DATA VENDA','DATA ATIVAÇÃO','DATA FUP','PRÓXIMOS PASSOS']
                const example = ['Empresa Exemplo','João Silva','11999999999','2026-04-01','Indicação','','','Varejo','','','','','','','','MORNO','','200-400k','Diretor','15000','','','','','','Marcar reunião']
                const csv = [cols.join(','), example.join(',')].join('\n')
                const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a'); a.href = url; a.download = 'MODELO_LEADS_V4.csv'; a.click()
                URL.revokeObjectURL(url)
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 8, border: 'none', background: GRAY1, color: WHITE, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              <FileSpreadsheet size={14} /> Baixar modelo
            </button>
          </div>

          {/* How it works */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            {[
              { n: '1', title: 'Prepare a planilha', desc: 'Use o modelo ou sua própria planilha. Cada linha deve ser um lead.' },
              { n: '2', title: 'Mapeie as colunas',  desc: 'Indique qual coluna corresponde a qual campo do CRM.' },
              { n: '3', title: 'Importe',             desc: 'Os leads são adicionados. Já existentes não são duplicados.' },
            ].map(s => (
              <div key={s.n} style={{ display: 'flex', gap: 12, padding: '14px 16px', background: GRAY4, borderRadius: 10, border: '1px solid #E5E7EB' }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: R, color: WHITE, fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{s.n}</div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: GRAY1, marginBottom: 3 }}>{s.title}</div>
                  <div style={{ fontSize: 11, color: GRAY2, lineHeight: 1.5 }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Map */}
      {step === 'map' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: GRAY1 }}>{file?.name}</div>
              <div style={{ fontSize: 12, color: GRAY3, marginTop: 2 }}>{headers.length} colunas detectadas — mapeie cada uma</div>
            </div>
            <button onClick={reset} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #E5E7EB', background: WHITE, color: GRAY2, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              Trocar arquivo
            </button>
          </div>

          <div style={{ border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: GRAY4 }}>
                  {['Coluna na planilha', 'Exemplo', 'Campo no CRM'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 700, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {headers.map((h, i) => (
                  <tr key={h} style={{ borderTop: '1px solid #F3F4F6', background: i % 2 ? GRAY4 : WHITE }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: GRAY1 }}>{h}</td>
                    <td style={{ padding: '10px 14px', color: GRAY2, fontSize: 12, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {preview[0]?.[h] !== undefined ? String(preview[0][h]).slice(0, 40) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <select
                        style={{ ...inputCls, padding: '7px 10px', fontSize: 12, width: '100%' }}
                        value={mapping[h] || ''}
                        onChange={e => setMapping(m => ({ ...m, [h]: e.target.value }))}
                      >
                        {CRM_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {preview.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Preview — primeiras {preview.length} linhas</div>
              <div style={{ overflowX: 'auto', border: '1px solid #E5E7EB', borderRadius: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: GRAY4 }}>
                      {headers.slice(0, 6).map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: GRAY2, fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #F3F4F6' }}>
                        {headers.slice(0, 6).map(h => (
                          <td key={h} style={{ padding: '8px 12px', color: GRAY1, whiteSpace: 'nowrap', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {String(row[h] || '—').slice(0, 40)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={reset} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #E5E7EB', background: WHITE, color: GRAY2, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Cancelar
            </button>
            <button
              onClick={handleImport} disabled={importing}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', borderRadius: 8, border: 'none', background: importing ? GRAY3 : R, color: WHITE, fontSize: 13, fontWeight: 700, cursor: importing ? 'not-allowed' : 'pointer', minWidth: 160, justifyContent: 'center' }}
            >
              {importing
                ? <><div style={{ width: 14, height: 14, border: '2px solid #fff4', borderTopColor: WHITE, borderRadius: '50%', animation: 'spin .7s linear infinite' }} /> Importando...</>
                : <><Upload size={15} /> Importar Leads</>
              }
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Done */}
      {step === 'done' && result && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: result.errors === 0 ? `${GREEN}15` : `${YELLOW}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            {result.errors === 0
              ? <CheckCircle size={36} color={GREEN} />
              : <AlertCircle size={36} color={YELLOW} />}
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: GRAY1, marginBottom: 8 }}>
            {result.errors === 0 ? 'Importação concluída!' : 'Importado com avisos'}
          </div>
          <div style={{ fontSize: 13, color: GRAY2, marginBottom: 24 }}>
            {result.ok} leads adicionados{result.errors > 0 ? ` · ${result.errors} com erro` : ''}
          </div>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginBottom: 28 }}>
            <div style={{ background: `${GREEN}12`, border: `1px solid ${GREEN}30`, borderRadius: 12, padding: '14px 24px', minWidth: 100 }}>
              <div style={{ fontSize: 32, fontWeight: 900, color: GREEN }}>{result.ok}</div>
              <div style={{ fontSize: 12, color: GRAY2, marginTop: 2 }}>importados</div>
            </div>
            {result.errors > 0 && (
              <div style={{ background: `${R}10`, border: `1px solid ${R}25`, borderRadius: 12, padding: '14px 24px', minWidth: 100 }}>
                <div style={{ fontSize: 32, fontWeight: 900, color: R }}>{result.errors}</div>
                <div style={{ fontSize: 12, color: GRAY2, marginTop: 2 }}>com erro</div>
              </div>
            )}
          </div>
          <button onClick={reset} style={{ padding: '10px 28px', borderRadius: 8, border: 'none', background: R, color: WHITE, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            Importar nova lista
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Tab: Inteligência IA ────────────────────────────────────────────────────

function TabIA({ isAdmin }: { isAdmin: boolean }) {
  const [prompt, setPrompt] = useState('')
  const [original, setOriginal] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/gerar-qualificacao')
      .then(r => r.json())
      .then(({ instructions }) => { setPrompt(instructions || ''); setOriginal(instructions || '') })
      .finally(() => setLoading(false))
  }, [])

  async function salvar() {
    setSaving(true); setSaved(false)
    const { error } = await supabase.from('configuracoes_sistema').upsert(
      { chave: 'instrucoes_qualificacao', valor: prompt, updated_at: new Date().toISOString() },
      { onConflict: 'chave' }
    )
    if (!error) { setOriginal(prompt); setSaved(true); setTimeout(() => setSaved(false), 3000) }
    else toast.error('Erro ao salvar: ' + error.message)
    setSaving(false)
  }

  async function restaurarPadrao() {
    await supabase.from('configuracoes_sistema').delete().eq('chave', 'instrucoes_qualificacao')
    const res = await fetch('/api/gerar-qualificacao').then(r => r.json())
    setPrompt(res.instructions); setOriginal(res.instructions)
    toast.info('Instruções restauradas para o padrão.')
  }

  const dirty = prompt !== original

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Info box */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        {[
          { title: 'BANT',              desc: 'Budget, Authority, Need, Timing — qualificação financeira e de autoridade do lead' },
          { title: 'SPICED',            desc: 'Situation, Pain, Impact, Critical Event, Decision — contexto e urgência' },
          { title: 'Estrutura Comercial', desc: 'Canais, investimento, ferramentas, equipe, faturamento e metas' },
        ].map(s => (
          <div key={s.title} style={{ padding: '12px 16px', background: `${R}06`, borderRadius: 10, border: `1px solid ${R}18` }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: R, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>{s.title}</div>
            <div style={{ fontSize: 11, color: GRAY2, lineHeight: 1.5 }}>{s.desc}</div>
          </div>
        ))}
      </div>

      {/* Label */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: GRAY1, marginBottom: 4 }}>
          Instruções de extração
          {!isAdmin && (
            <span style={{ marginLeft: 10, fontSize: 11, fontWeight: 600, background: GRAY4, color: GRAY3, padding: '3px 8px', borderRadius: 20 }}>
              Somente admin pode editar
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: GRAY3, marginBottom: 10 }}>
          Descreva em linguagem natural o que a IA deve observar em cada campo. O schema JSON é gerenciado automaticamente.
        </div>

        {loading ? (
          <div style={{ height: 280, background: GRAY4, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: GRAY3 }}>
            Carregando instruções...
          </div>
        ) : (
          <textarea
            value={prompt}
            onChange={e => { setPrompt(e.target.value); setSaved(false) }}
            disabled={!isAdmin}
            rows={20}
            style={{
              width: '100%', padding: '14px 16px', borderRadius: 10,
              border: `1px solid ${dirty ? R : '#D1D5DB'}`,
              fontSize: 13, color: GRAY1,
              background: isAdmin ? WHITE : GRAY4,
              fontFamily: 'inherit', lineHeight: 1.7,
              resize: 'vertical', outline: 'none',
              boxSizing: 'border-box', transition: 'border-color .15s',
            }}
          />
        )}
      </div>

      {/* Actions */}
      {!loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            onClick={restaurarPadrao} disabled={!isAdmin || saving}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: '1px solid #E5E7EB', background: WHITE, color: GRAY2, fontSize: 12, fontWeight: 600, cursor: isAdmin ? 'pointer' : 'not-allowed', opacity: isAdmin ? 1 : 0.5 }}
          >
            <RotateCcw size={13} /> Restaurar padrão
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {saved && <span style={{ fontSize: 12, color: GREEN, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}><Check size={13} /> Salvo</span>}
            {dirty && !saved && <span style={{ fontSize: 11, color: GRAY3 }}>Alterações não salvas</span>}
            <button
              onClick={salvar}
              disabled={!isAdmin || saving || !dirty}
              style={{
                padding: '9px 24px', borderRadius: 8, border: 'none',
                background: dirty && isAdmin ? R : GRAY4,
                color: dirty && isAdmin ? WHITE : GRAY3,
                fontSize: 13, fontWeight: 700,
                cursor: dirty && isAdmin ? 'pointer' : 'not-allowed',
                transition: 'all .15s',
              }}
            >
              {saving ? 'Salvando...' : 'Salvar instruções'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
