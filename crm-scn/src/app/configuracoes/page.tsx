'use client'
export const dynamic = 'force-dynamic'
import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import CRMLayout from '../_components/CRMLayout'
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Plus, Users } from 'lucide-react'
import {
  R, WHITE, GRAY1, GRAY2, GRAY3, GRAY4, GREEN, YELLOW, BLUE,
  inputCls, labelCls,
} from '@/lib/crm-constants'
import { PAPEL_LABELS, PAPEL_COLORS, type Papel } from '@/lib/useUserRole'
import { confirmDialog } from '@/lib/confirmDialog'
import { toast } from '@/lib/toast'

const ADMIN_EMAIL = 'matheus.nunes@v4company.com'

const PAPEIS: Papel[] = ['admin', 'sdr', 'closer', 'viewer']

export default function ConfiguracoesPageRoute() {
  const router = useRouter()
  const [userEmail, setUserEmail] = useState<string | undefined>()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setUserEmail(session.user.email)
    })
  }, [])

  async function importLeads(leads: any[]): Promise<{ok: number, errors: number}> {
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
      <ConfiguracoesContent onImport={importLeads} userEmail={userEmail} />
    </CRMLayout>
  )
}

function PapelBadge({ papel }: { papel: Papel | null }) {
  const p = papel ?? 'viewer'
  const c = PAPEL_COLORS[p]
  return (
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: c.bg, color: c.text }}>
      {PAPEL_LABELS[p]}
    </span>
  )
}

function UsuariosCard({ currentEmail }: { currentEmail?: string }) {
  const isAdmin = currentEmail === ADMIN_EMAIL
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [papel, setPapel] = useState<Papel>('viewer')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [updatingPapel, setUpdatingPapel] = useState<string | null>(null)
  // Rastreia mudanças pendentes de papel por usuário
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
    const { error: err } = await supabase.from('usuarios_permitidos').insert({
      nome: nome.trim(),
      email: email.trim().toLowerCase(),
      papel,
    })
    if (err) {
      if (err.code === '23505') setError('Este email já está cadastrado')
      else if (err.code === '42501') setError('Sem permissão. Execute a policy no Supabase.')
      else setError(`Erro: ${err.message}`)
    } else {
      setNome(''); setEmail(''); setPapel('viewer'); fetchUsuarios()
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
    setUpdatingPapel(id)
    setError('')
    const { error: err } = await supabase.from('usuarios_permitidos').update({ papel: novoPapel }).eq('id', id)
    if (err) {
      if (err.message.includes('column') || err.code === '42703') {
        setError('A coluna "papel" ainda não existe. Execute o SQL de migração no Supabase Dashboard.')
      } else {
        setError(`Erro ao salvar papel: ${err.message}`)
      }
    } else {
      setUsuarios(prev => prev.map(u => u.id === id ? { ...u, papel: novoPapel } : u))
      setPapelPendente(prev => { const n = { ...prev }; delete n[id]; return n })
    }
    setUpdatingPapel(null)
  }

  return (
    <div style={{ background: WHITE, borderRadius: 14, border: '1px solid #E5E7EB', boxShadow: '0 1px 6px rgba(0,0,0,.07)', overflow: 'hidden' }}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 40, height: 40, background: `${BLUE}12`, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Users size={20} color={BLUE} />
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: GRAY1 }}>Usuários com Acesso</div>
          <div style={{ fontSize: 12, color: GRAY2, marginTop: 2 }}>Gerencie quem pode acessar o CRM via Google</div>
        </div>
      </div>

      <div style={{ padding: 24 }}>
        {/* Add user form — só admin vê */}
        {isAdmin && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 180px auto', gap: 10, marginBottom: 8 }}>
              <div>
                <label style={labelCls}>Nome</label>
                <input style={inputCls} placeholder="Nome completo" value={nome} onChange={e => { setNome(e.target.value); setError('') }} />
              </div>
              <div>
                <label style={labelCls}>Email Google</label>
                <input style={inputCls} placeholder="email@v4company.com" value={email} onChange={e => { setEmail(e.target.value); setError('') }} />
              </div>
              <div>
                <label style={labelCls}>Papel</label>
                <select style={inputCls} value={papel} onChange={e => setPapel(e.target.value as Papel)}>
                  {PAPEIS.map(p => <option key={p} value={p}>{PAPEL_LABELS[p]}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button onClick={addUsuario} disabled={saving}
                  style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: saving ? GRAY2 : R, color: WHITE, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Plus size={14} /> Adicionar
                </button>
              </div>
            </div>
            {error && <div style={{ fontSize: 12, color: R, marginBottom: 14, fontWeight: 600 }}>⚠️ {error}</div>}
          </>
        )}

        {/* Users list */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 32, color: GRAY2, fontSize: 13 }}>Carregando...</div>
        ) : (
          <div style={{ border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: GRAY4 }}>
                  {['Nome', 'Email', 'Papel', 'Último Login', 'Status', ...(isAdmin ? ['Ações'] : [])].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 700, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u, i) => (
                  <tr key={u.id} style={{ borderTop: '1px solid #F3F4F6', background: i % 2 ? GRAY4 : WHITE }}>
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: GRAY1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {u.avatar_url && (
                          <img src={u.avatar_url} alt={u.nome} width={28} height={28} style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                        )}
                        {u.nome}
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', color: GRAY2, fontSize: 12 }}>{u.email}</td>
                    <td style={{ padding: '12px 14px' }}>
                      {isAdmin && u.email !== ADMIN_EMAIL ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <select
                            value={papelPendente[u.id] ?? u.papel ?? 'viewer'}
                            disabled={updatingPapel === u.id}
                            onChange={e => setPapelPendente(prev => ({ ...prev, [u.id]: e.target.value as Papel }))}
                            style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, border: `1px solid ${papelPendente[u.id] ? '#F59E0B' : '#E5E7EB'}`, background: WHITE, cursor: 'pointer', color: GRAY1 }}
                          >
                            {PAPEIS.map(p => <option key={p} value={p}>{PAPEL_LABELS[p]}</option>)}
                          </select>
                          {papelPendente[u.id] && (
                            <button
                              onClick={() => savePapel(u.id)}
                              disabled={updatingPapel === u.id}
                              style={{ padding: '3px 10px', borderRadius: 6, border: 'none', background: GREEN, color: WHITE, fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                            >
                              {updatingPapel === u.id ? '...' : 'Salvar'}
                            </button>
                          )}
                        </div>
                      ) : (
                        <PapelBadge papel={u.papel ?? 'viewer'} />
                      )}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: u.ultimo_login ? GRAY2 : GRAY3 }}>
                      {u.ultimo_login
                        ? new Date(u.ultimo_login).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: u.ativo ? `${GREEN}18` : `${GRAY2}18`, color: u.ativo ? GREEN : GRAY2, border: `1px solid ${u.ativo ? GREEN : GRAY2}33` }}>
                        {u.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    {isAdmin && (
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => toggleAtivo(u.id, u.ativo)}
                            style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${u.ativo ? YELLOW : GREEN}44`, background: u.ativo ? `${YELLOW}12` : `${GREEN}12`, color: u.ativo ? YELLOW : GREEN, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                            {u.ativo ? 'Desativar' : 'Ativar'}
                          </button>
                          {u.email !== ADMIN_EMAIL && (
                            <button onClick={() => removeUsuario(u.id)}
                              style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${R}33`, background: `${R}10`, color: R, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                              Remover
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {usuarios.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32, color: GRAY2 }}>Nenhum usuário cadastrado</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ marginTop: 14, fontSize: 12, color: GRAY2 }}>
          💡 O login é feito com a conta Google cadastrada aqui. Usuários inativos não conseguem acessar.
        </div>
      </div>
    </div>
  )
}

function ConfiguracoesContent({ onImport, userEmail }: { onImport: (leads: any[]) => Promise<{ok: number, errors: number}>; userEmail?: string }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<any[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ok: number, errors: number} | null>(null)
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
    const auto: Record<string, string> = {}
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
      'step': '',
      'authority': 'autority', 'autority': 'autority',
      'need': 'need', 'timing': 'timing', 'budget': 'budget',
    }
    cols.forEach((col: string) => {
      const normalized = col.toLowerCase().trim()
      auto[col] = aliases[normalized] || ''
    })
    return auto
  }

  async function handleFile(f: File) {
    setFile(f)
    setResult(null)
    setStep('upload')

    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const data = e.target?.result
        const XLSX = (window as any).XLSX
        if (!XLSX) { toast.info('Aguarde o carregamento da biblioteca e tente novamente.'); return }
        const workbook = XLSX.read(data, { type: 'binary', cellDates: true })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

        if (rows.length < 2) return
        let headerRowIdx = 0
        for (let i = 0; i < Math.min(10, rows.length); i++) {
          const firstCell = String(rows[i][0] || '').trim().toUpperCase()
          if (firstCell === 'EMPRESA' || firstCell === 'COMPANY' || firstCell === 'NOME') {
            headerRowIdx = i; break
          }
        }
        const hdrs = rows[headerRowIdx].map((h: any) => String(h).trim()).filter((h: string) => h)
        setHeaders(hdrs)
        setMapping(autoMap(hdrs))
        const firstDataIdx = headerRowIdx + 1
        const dataRows = rows.slice(firstDataIdx, firstDataIdx + 6).filter((row: any[]) => {
          const first = String(row[0] || '').trim()
          return first && first !== hdrs[0]
        }).slice(0, 5).map((row: any[]) => {
          const obj: Record<string, any> = {}
          hdrs.forEach((h: string, i: number) => { obj[h] = row[i] })
          return obj
        })
        setPreview(dataRows)
        setStep('map')
      } catch(err) {
        toast.error('Erro ao ler arquivo. Certifique-se que é um arquivo .xlsx ou .csv válido.')
      }
    }
    reader.readAsBinaryString(f)
  }

  async function handleImport() {
    if (!file) return
    setImporting(true)

    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const data = e.target?.result
        const XLSX = (window as any).XLSX
        if (!XLSX) { toast.info('Aguarde o carregamento da biblioteca e tente novamente.'); return }
        const workbook = XLSX.read(data, { type: 'binary', cellDates: true })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

        let headerRowIdx = 0
        for (let i = 0; i < Math.min(10, rows.length); i++) {
          const firstCell = String(rows[i][0] || '').trim().toUpperCase()
          if (firstCell === 'EMPRESA' || firstCell === 'COMPANY' || firstCell === 'NOME') {
            headerRowIdx = i; break
          }
        }
        const hdrs = rows[headerRowIdx].map((h: any) => String(h).trim())
        const firstDataIdx = headerRowIdx + 1
        const dataRows = rows.slice(firstDataIdx).filter((row: any[]) => {
          const first = String(row[0] || '').trim()
          return first && first.toUpperCase() !== hdrs[0].toUpperCase()
        })

        const leads = dataRows.map((row: any[]) => {
          const lead: Record<string, any> = {}
          hdrs.forEach((h: string, i: number) => {
            const field = mapping[h]
            if (!field || !h) return
            let val = row[i]
            if (val === '' || val === null || val === undefined) return
            if (field.startsWith('data_') && val instanceof Date) {
              val = val.toISOString().split('T')[0]
            } else if (field.startsWith('data_') && typeof val === 'string' && val.trim()) {
              try { val = new Date(val).toISOString().split('T')[0] } catch { return }
            }
            if (field === 'tcv' || field === 'bant') {
              val = Number(String(val).replace(/[^0-9.,]/g, '').replace(',', '.'))
              if (isNaN(val)) return
            }
            lead[field] = val
          })
          return lead
        }).filter((l: any) => l.empresa && String(l.empresa).trim())

        const res = await onImport(leads)
        setResult(res)
        setStep('done')
      } catch(err: any) {
        toast.error('Erro na importação: ' + err.message)
      }
      setImporting(false)
    }
    reader.readAsBinaryString(file)
  }

  function reset() {
    setFile(null); setPreview([]); setHeaders([]); setMapping({})
    setResult(null); setStep('upload')
  }

  const btnStyle: React.CSSProperties = { padding: '11px 22px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: GRAY1, margin: 0 }}>Configurações</h1>
        <p style={{ fontSize: 13, color: GRAY2, marginTop: 4 }}>Importação em massa e configurações do CRM</p>
      </div>

      {/* CARD IMPORTAÇÃO */}
      <div style={{ background: WHITE, borderRadius: 14, border: '1px solid #E5E7EB', boxShadow: '0 1px 6px rgba(0,0,0,.07)', overflow: 'hidden' }}>

        <div style={{ padding: '20px 24px', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, background: `${R}12`, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileSpreadsheet size={20} color={R} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: GRAY1 }}>Importar Leads via Excel</div>
            <div style={{ fontSize: 12, color: GRAY2, marginTop: 2 }}>Suba um arquivo .xlsx ou .csv com sua lista de leads</div>
          </div>
        </div>

        <div style={{ padding: 24 }}>

          {/* STEP 1: UPLOAD */}
          {step === 'upload' && (
            <div>
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
                style={{ border: `2px dashed ${dragOver ? R : '#D1D5DB'}`, borderRadius: 12, padding: '48px 24px', textAlign: 'center', background: dragOver ? `${R}06` : GRAY4, transition: 'all .2s', cursor: 'pointer' }}
                onClick={() => document.getElementById('xlsx-input')?.click()}
              >
                <Upload size={36} color={dragOver ? R : GRAY2} style={{ margin: '0 auto 12px', display: 'block' }} />
                <div style={{ fontSize: 15, fontWeight: 700, color: dragOver ? R : GRAY1, marginBottom: 6 }}>
                  {dragOver ? 'Solte o arquivo aqui' : 'Arraste o arquivo ou clique para selecionar'}
                </div>
                <div style={{ fontSize: 12, color: GRAY2 }}>Suporta .xlsx e .csv</div>
                <input id="xlsx-input" type="file" accept=".xlsx,.csv" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
              </div>

              <div style={{ marginTop: 16, padding: '14px 16px', background: GRAY4, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: GRAY1 }}>📋 Modelo de planilha</div>
                  <div style={{ fontSize: 11, color: GRAY2, marginTop: 2 }}>Baixe o template com as colunas corretas</div>
                </div>
                <button onClick={() => {
                  const cols = ['EMPRESA','NOME DO LEAD','TELEFONE','DATA ENTRADA','ORIGEM','CUSTO BROKER','QUEM RECOMENDOU','SEGMENTO','CONEXÃO','SITUAÇÃO BDR','BANT','BUDGET','AUTHORITY','NEED','TIMING','TEMPERATURA','SITUAÇÃO CLOSER','FATURAMENTO','CARGO','TCV','DATA RA','DATA RR','DATA VENDA','DATA ATIVAÇÃO','DATA FUP','PRÓXIMOS PASSOS']
                  const example = ['Empresa Exemplo','João Silva','11999999999','2026-04-01','Indicação','','','Varejo','','','','','','','','MORNO','','200-400k','Diretor','15000','','','','','','Marcar reunião']
                  const csv = [cols.join(','), example.join(',')].join('\n')
                  const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a'); a.href = url; a.download = 'MODELO_LEADS_V4.csv'; a.click()
                  URL.revokeObjectURL(url)
                }} style={{ ...btnStyle, background: GRAY1, color: WHITE }}>
                  ⬇ Baixar modelo (.csv)
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: MAPEAMENTO */}
          {step === 'map' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: GRAY1 }}>📂 {file?.name}</div>
                  <div style={{ fontSize: 12, color: GRAY2, marginTop: 2 }}>{headers.length} colunas detectadas — mapeie cada uma para o campo correto</div>
                </div>
                <button onClick={reset} style={{ ...btnStyle, background: GRAY4, color: GRAY2, padding: '8px 14px', fontSize: 12 }}>
                  Trocar arquivo
                </button>
              </div>

              <div style={{ border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: GRAY4 }}>
                      <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 700, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.07em', width: '35%' }}>Coluna na planilha</th>
                      <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 700, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.07em', width: '25%' }}>Exemplo</th>
                      <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 700, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Campo no CRM</th>
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
                          <select style={{ ...inputCls, padding: '7px 10px', fontSize: 12, width: '100%' }}
                            value={mapping[h] || ''} onChange={e => setMapping(m => ({ ...m, [h]: e.target.value }))}>
                            {CRM_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {preview.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Preview (primeiras 5 linhas)</div>
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
                <button onClick={reset} style={{ ...btnStyle, background: GRAY4, color: GRAY2 }}>Cancelar</button>
                <button onClick={handleImport} disabled={importing} style={{ ...btnStyle, background: importing ? GRAY2 : R, color: WHITE, minWidth: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  {importing ? (
                    <><div style={{ width: 14, height: 14, border: '2px solid #ffffff44', borderTopColor: WHITE, borderRadius: '50%', animation: 'spin .7s linear infinite' }} /> Importando...</>
                  ) : (
                    <><Upload size={15} /> Importar Leads</>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: RESULTADO */}
          {step === 'done' && result && (
            <div style={{ textAlign: 'center', padding: '32px 24px' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: result.errors === 0 ? `${GREEN}18` : `${YELLOW}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                {result.errors === 0
                  ? <CheckCircle size={32} color={GREEN} />
                  : <AlertCircle size={32} color={YELLOW} />}
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: GRAY1, marginBottom: 8 }}>Importação concluída!</div>
              <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginBottom: 24 }}>
                <div style={{ background: `${GREEN}12`, border: `1px solid ${GREEN}33`, borderRadius: 10, padding: '12px 20px' }}>
                  <div style={{ fontSize: 28, fontWeight: 900, color: GREEN }}>{result.ok}</div>
                  <div style={{ fontSize: 12, color: GRAY2, marginTop: 2 }}>leads importados</div>
                </div>
                {result.errors > 0 && (
                  <div style={{ background: `${R}12`, border: `1px solid ${R}33`, borderRadius: 10, padding: '12px 20px' }}>
                    <div style={{ fontSize: 28, fontWeight: 900, color: R }}>{result.errors}</div>
                    <div style={{ fontSize: 12, color: GRAY2, marginTop: 2 }}>com erro</div>
                  </div>
                )}
              </div>
              <button onClick={reset} style={{ ...btnStyle, background: R, color: WHITE }}>Importar nova lista</button>
            </div>
          )}
        </div>
      </div>

      {/* CARD USUÁRIOS — admin vê e gerencia, outros só visualizam */}
      <UsuariosCard currentEmail={userEmail} />

      {/* CARD INFO */}
      <div style={{ background: WHITE, borderRadius: 14, border: '1px solid #E5E7EB', boxShadow: '0 1px 6px rgba(0,0,0,.07)', padding: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: GRAY1, marginBottom: 16 }}>📌 Como funciona a importação</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          {[
            { n: '1', title: 'Prepare a planilha', desc: 'Use o modelo disponível acima ou sua própria planilha. Cada linha deve ser um lead.' },
            { n: '2', title: 'Mapeie as colunas', desc: 'Após o upload, indique qual coluna da sua planilha corresponde a qual campo do CRM.' },
            { n: '3', title: 'Importe', desc: 'Clique em importar. Os leads são adicionados sem duplicar os já existentes.' },
          ].map(s => (
            <div key={s.n} style={{ display: 'flex', gap: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: R, color: WHITE, fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>{s.n}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: GRAY1, marginBottom: 4 }}>{s.title}</div>
                <div style={{ fontSize: 12, color: GRAY2, lineHeight: 1.5 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
