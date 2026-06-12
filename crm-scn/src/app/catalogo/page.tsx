'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { supabase, CatalogoServico } from '@/lib/supabase'
import CRMLayout from '../_components/CRMLayout'
import { R, WHITE, GRAY1, GRAY2, GRAY3, GRAY4, GRAY5 } from '@/lib/crm-constants'
import { Plus, Trash2, Check, X, Edit2, BookOpen } from 'lucide-react'
import { toast } from '@/lib/toast'
import { confirmDialog } from '@/lib/confirmDialog'

const GREEN = '#065F46'
const card: React.CSSProperties = {
  background: WHITE, borderRadius: 14,
  border: `1px solid ${GRAY5}`, boxShadow: '0 1px 4px rgba(0,0,0,.05)',
}

type Tipo = 'saber' | 'ter' | 'executar'

const TIPO_CONFIG: Record<Tipo, { label: string; color: string; bg: string; border: string }> = {
  saber:    { label: 'Saber',    color: R,     bg: '#FEE2E2', border: '#FECACA' },
  ter:      { label: 'Ter',      color: R,     bg: '#FFF1F1', border: '#FED7D7' },
  executar: { label: 'Executar', color: GREEN, bg: '#ECFDF5', border: '#A7F3D0' },
}

const VOLUME_LABELS: Record<string, string> = {
  campanhas: 'Campanhas/mês',
  posts:     'Posts/mês',
  design:    'Estáticos + Vídeos/mês',
  generic:   'Volume genérico/mês',
}

export type EditState = {
  nome: string
  etapas: string[]
  tem_volume: boolean
  volume_type: string
}

const emptyEdit = (isExecutar = false): EditState => ({
  nome: '', etapas: isExecutar ? [] : [''],
  tem_volume: false, volume_type: '',
})

// ── Helpers de etapas (nível de módulo — evita remount por redefinição) ────────
function addEtapa(f: EditState, set: (v: EditState) => void) {
  set({ ...f, etapas: [...f.etapas, ''] })
}
function setEtapaVal(f: EditState, set: (v: EditState) => void, i: number, v: string) {
  set({ ...f, etapas: f.etapas.map((e, j) => j === i ? v : e) })
}
function removeEtapa(f: EditState, set: (v: EditState) => void, i: number) {
  set({ ...f, etapas: f.etapas.filter((_, j) => j !== i) })
}
function moveEtapa(f: EditState, set: (v: EditState) => void, i: number, dir: -1 | 1) {
  const arr = [...f.etapas]; const j = i + dir
  if (j < 0 || j >= arr.length) return
  ;[arr[i], arr[j]] = [arr[j], arr[i]]
  set({ ...f, etapas: arr })
}

// ── EtapasEditor (nível de módulo — sem remount ao digitar) ───────────────────
function EtapasEditor({ f, set }: { f: EditState; set: (v: EditState) => void }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: GRAY3, letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: 8 }}>
        Etapas ({f.etapas.filter(Boolean).length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {f.etapas.map((etapa, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <button onClick={() => moveEtapa(f, set, i, -1)} disabled={i === 0}
                style={{ border: 'none', background: 'transparent', cursor: i === 0 ? 'default' : 'pointer', color: i === 0 ? GRAY5 : GRAY3, padding: '1px 3px', fontSize: 10, lineHeight: 1 }}>▲</button>
              <button onClick={() => moveEtapa(f, set, i, 1)} disabled={i === f.etapas.length - 1}
                style={{ border: 'none', background: 'transparent', cursor: i === f.etapas.length - 1 ? 'default' : 'pointer', color: i === f.etapas.length - 1 ? GRAY5 : GRAY3, padding: '1px 3px', fontSize: 10, lineHeight: 1 }}>▼</button>
            </div>
            <span style={{ fontSize: 11, color: GRAY3, width: 18, textAlign: 'right' as const, flexShrink: 0 }}>{i + 1}.</span>
            <input
              type="text"
              value={etapa}
              onChange={e => setEtapaVal(f, set, i, e.target.value)}
              placeholder={`Etapa ${i + 1}`}
              style={{ flex: 1, padding: '7px 10px', border: `1.5px solid ${GRAY5}`, borderRadius: 7, fontSize: 13, color: GRAY1, outline: 'none', background: WHITE }}
            />
            <button onClick={() => removeEtapa(f, set, i)}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: GRAY3, padding: 4, display: 'flex' }}>
              <X size={14} />
            </button>
          </div>
        ))}
        <button onClick={() => addEtapa(f, set)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 7, border: `1.5px dashed ${GRAY5}`, background: GRAY4, color: GRAY2, fontSize: 12, fontWeight: 600, cursor: 'pointer', marginTop: 2 }}>
          <Plus size={13} /> Adicionar etapa
        </button>
      </div>
    </div>
  )
}

// ── VolumeEditor (nível de módulo) ────────────────────────────────────────────
function VolumeEditor({ f, set }: { f: EditState; set: (v: EditState) => void }) {
  return (
    <div style={{ marginTop: 14, padding: '14px 16px', background: GRAY4, borderRadius: 10, border: `1px solid ${GRAY5}` }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
        <input type="checkbox" checked={f.tem_volume} onChange={e => set({ ...f, tem_volume: e.target.checked, volume_type: '' })}
          style={{ width: 16, height: 16, accentColor: GREEN, cursor: 'pointer' }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: GRAY1 }}>Tem volume (quantidade mensal prevista)</span>
      </label>
      {f.tem_volume && (
        <div style={{ marginTop: 10 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: GRAY3, textTransform: 'uppercase' as const, letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>Tipo de volume *</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {(['campanhas', 'posts', 'design', 'generic'] as const).map(vt => (
              <label key={vt} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, border: `1.5px solid ${f.volume_type === vt ? GREEN : GRAY5}`, background: f.volume_type === vt ? '#ECFDF5' : WHITE, cursor: 'pointer' }}>
                <input type="radio" name="volume_type" value={vt} checked={f.volume_type === vt} onChange={() => set({ ...f, volume_type: vt })} style={{ accentColor: GREEN }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: f.volume_type === vt ? GREEN : GRAY2 }}>
                    {vt === 'campanhas' ? 'Campanhas' : vt === 'posts' ? 'Posts' : vt === 'design' ? 'Design' : 'Genérico'}
                  </div>
                  <div style={{ fontSize: 10, color: GRAY3 }}>{VOLUME_LABELS[vt]}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── CatalogoPage ──────────────────────────────────────────────────────────────
function slugify(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

export default function CatalogoPage() {
  const [servicos, setServicos]   = useState<CatalogoServico[]>([])
  const [loading, setLoading]     = useState(true)
  const [tipoAtivo, setTipoAtivo] = useState<Tipo>('saber')
  const [showNew, setShowNew]     = useState(false)
  const [newForm, setNewForm]     = useState<EditState>(emptyEdit())
  const [saving, setSaving]       = useState(false)
  const [editId, setEditId]       = useState<string | null>(null)
  const [editForm, setEditForm]   = useState<EditState>(emptyEdit())

  const isExecutar = tipoAtivo === 'executar'

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('catalogo_servicos').select('*')
      .order('tipo').order('ordem').order('nome')
    setServicos(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function createServico() {
    if (!newForm.nome.trim()) return
    setSaving(true)
    const etapas = newForm.etapas.map(e => e.trim()).filter(Boolean)
    const payload: any = {
      tipo: tipoAtivo, nome: newForm.nome.trim(), etapas,
      tem_volume: isExecutar ? newForm.tem_volume : false,
      volume_type: isExecutar && newForm.tem_volume ? newForm.volume_type || null : null,
      chave: isExecutar ? slugify(newForm.nome.trim()) : null,
      ordem: servicos.filter(s => s.tipo === tipoAtivo).length,
    }
    const { error } = await supabase.from('catalogo_servicos').insert(payload)
    setSaving(false)
    if (error) { toast.error('Erro: ' + error.message); return }
    setShowNew(false); setNewForm(emptyEdit(isExecutar)); await load()
    toast.success('Serviço criado!')
  }

  async function updateServico() {
    if (!editId || !editForm.nome.trim()) return
    setSaving(true)
    const etapas = editForm.etapas.map(e => e.trim()).filter(Boolean)
    const payload: any = {
      nome: editForm.nome.trim(), etapas,
      tem_volume: editForm.tem_volume,
      volume_type: editForm.tem_volume ? editForm.volume_type || null : null,
    }
    const { error } = await supabase.from('catalogo_servicos').update(payload).eq('id', editId)
    setSaving(false)
    if (error) { toast.error('Erro: ' + error.message); return }
    setEditId(null); await load(); toast.success('Serviço atualizado!')
  }

  async function toggleAtivo(s: CatalogoServico) {
    await supabase.from('catalogo_servicos').update({ ativo: !s.ativo }).eq('id', s.id)
    await load()
  }

  async function deleteServico(id: string) {
    if (!await confirmDialog.show({ title: 'Excluir serviço?', message: 'Projetos existentes não serão afetados.', confirmLabel: 'Excluir', danger: true })) return
    await supabase.from('catalogo_servicos').delete().eq('id', id)
    await load(); toast.success('Serviço removido.')
  }

  function startEdit(s: CatalogoServico) {
    setEditId(s.id)
    setEditForm({
      nome: s.nome,
      etapas: s.etapas.length > 0 ? [...s.etapas] : (s.tipo !== 'executar' ? [''] : []),
      tem_volume: s.tem_volume,
      volume_type: s.volume_type || '',
    })
  }

  const tc = TIPO_CONFIG[tipoAtivo]
  const lista = servicos.filter(s => s.tipo === tipoAtivo)

  return (
    <CRMLayout title="Catálogo de Serviços" subtitle="Gerencie os serviços disponíveis para projetos Saber, Ter e Executar">
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '28px 20px' }}>

        {/* Tipo tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
          {(['saber', 'ter', 'executar'] as Tipo[]).map(tipo => {
            const t = TIPO_CONFIG[tipo]
            const ativo = tipoAtivo === tipo
            const count = servicos.filter(s => s.tipo === tipo && s.ativo).length
            return (
              <button key={tipo} onClick={() => { setTipoAtivo(tipo); setShowNew(false); setEditId(null) }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, border: `2px solid ${ativo ? t.color : GRAY5}`, background: ativo ? t.bg : WHITE, color: ativo ? t.color : GRAY2, fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'all .15s' }}>
                {t.label}
                <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 10, background: ativo ? `${t.color}20` : GRAY4, color: ativo ? t.color : GRAY3, fontWeight: 700 }}>{count}</span>
              </button>
            )
          })}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: GRAY3 }}>Carregando...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {lista.length === 0 && !showNew && (
              <div style={{ ...card, padding: '48px 24px', textAlign: 'center' }}>
                <BookOpen size={32} color={GRAY3} style={{ margin: '0 auto 12px' }} />
                <div style={{ fontSize: 14, fontWeight: 600, color: GRAY2, marginBottom: 6 }}>Nenhum serviço cadastrado</div>
                <div style={{ fontSize: 12, color: GRAY3 }}>Clique em "+ Novo Serviço" abaixo para adicionar</div>
              </div>
            )}

            {lista.map(s => {
              const isEdit = editId === s.id
              return (
                <div key={s.id} style={{ ...card, overflow: 'hidden', opacity: s.ativo ? 1 : 0.55 }}>
                  <div style={{ height: 4, background: `linear-gradient(90deg, ${tc.color}, ${tc.color}66)` }} />
                  <div style={{ padding: '16px 20px' }}>
                    {isEdit ? (
                      <div>
                        <div style={{ marginBottom: 12 }}>
                          <label style={{ fontSize: 10, fontWeight: 700, color: GRAY3, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>Nome *</label>
                          <input type="text" value={editForm.nome} onChange={e => setEditForm(f => ({ ...f, nome: e.target.value }))} autoFocus
                            style={{ width: '100%', padding: '10px 13px', border: `1.5px solid ${tc.color}`, borderRadius: 9, fontSize: 14, fontWeight: 600, color: GRAY1, outline: 'none', boxSizing: 'border-box' as const }} />
                        </div>
                        {isExecutar
                          ? <VolumeEditor f={editForm} set={setEditForm} />
                          : <EtapasEditor f={editForm} set={setEditForm} />}
                        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                          <button onClick={() => setEditId(null)} style={{ padding: '8px 16px', borderRadius: 8, border: `1.5px solid ${GRAY5}`, background: WHITE, color: GRAY2, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
                          <button onClick={updateServico} disabled={saving || !editForm.nome.trim()}
                            style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: editForm.nome.trim() ? tc.color : GRAY3, color: WHITE, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Check size={13} /> {saving ? 'Salvando...' : 'Salvar'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: s.ativo ? GRAY1 : GRAY3, marginBottom: 6 }}>{s.nome}</div>
                          {s.tipo === 'executar' ? (
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {s.tem_volume && s.volume_type ? (
                                <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, background: tc.bg, border: `1px solid ${tc.border}`, color: tc.color, fontWeight: 600 }}>
                                  📊 {VOLUME_LABELS[s.volume_type]}
                                </span>
                              ) : (
                                <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, background: GRAY4, border: `1px solid ${GRAY5}`, color: GRAY3, fontWeight: 500 }}>
                                  Sem volume
                                </span>
                              )}
                            </div>
                          ) : s.etapas.length > 0 ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 6px' }}>
                              {s.etapas.map((etapa, i) => (
                                <React.Fragment key={i}>
                                  <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, background: tc.bg, border: `1px solid ${tc.border}`, color: tc.color, fontWeight: 600 }}>
                                    {i + 1}. {etapa}
                                  </span>
                                  {i < s.etapas.length - 1 && <span style={{ fontSize: 10, color: GRAY3, alignSelf: 'center' }}>›</span>}
                                </React.Fragment>
                              ))}
                            </div>
                          ) : (
                            <div style={{ fontSize: 12, color: GRAY3, fontStyle: 'italic' }}>Sem etapas definidas</div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button onClick={() => toggleAtivo(s)}
                            style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${s.ativo ? '#A7F3D0' : GRAY5}`, background: s.ativo ? '#F0FDF4' : GRAY4, color: s.ativo ? GREEN : GRAY3, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                            {s.ativo ? 'Ativo' : 'Inativo'}
                          </button>
                          <button onClick={() => startEdit(s)}
                            style={{ border: 'none', background: GRAY4, cursor: 'pointer', color: GRAY2, padding: '6px 10px', borderRadius: 7, display: 'flex', alignItems: 'center' }}>
                            <Edit2 size={13} />
                          </button>
                          <button onClick={() => deleteServico(s.id)}
                            style={{ border: 'none', background: GRAY4, cursor: 'pointer', color: GRAY3, padding: '6px 10px', borderRadius: 7, display: 'flex', alignItems: 'center' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = R }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = GRAY3 }}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Form novo serviço */}
            {showNew && (
              <div style={{ ...card, overflow: 'hidden' }}>
                <div style={{ height: 4, background: `linear-gradient(90deg, ${tc.color}, ${tc.color}66)` }} />
                <div style={{ padding: '20px 20px' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: GRAY1, marginBottom: 14 }}>Novo serviço — {tc.label}</div>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, color: GRAY3, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>Nome *</label>
                    <input type="text" value={newForm.nome} onChange={e => setNewForm(f => ({ ...f, nome: e.target.value }))}
                      placeholder={isExecutar ? 'Ex: Inbound Marketing' : 'Ex: Estratégia de Conteúdo'}
                      autoFocus
                      style={{ width: '100%', padding: '10px 13px', border: `1.5px solid ${tc.color}`, borderRadius: 9, fontSize: 14, fontWeight: 600, color: GRAY1, outline: 'none', boxSizing: 'border-box' as const }} />
                  </div>
                  {isExecutar
                    ? <VolumeEditor f={newForm} set={setNewForm} />
                    : <EtapasEditor f={newForm} set={setNewForm} />}
                  <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                    <button onClick={() => { setShowNew(false); setNewForm(emptyEdit(isExecutar)) }}
                      style={{ padding: '8px 16px', borderRadius: 8, border: `1.5px solid ${GRAY5}`, background: WHITE, color: GRAY2, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
                    <button onClick={createServico} disabled={saving || !newForm.nome.trim()}
                      style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: newForm.nome.trim() ? tc.color : GRAY3, color: WHITE, fontSize: 13, fontWeight: 700, cursor: saving || !newForm.nome.trim() ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Check size={13} /> {saving ? 'Salvando...' : 'Criar serviço'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {!showNew && !editId && (
          <button onClick={() => { setShowNew(true); setEditId(null); setNewForm(emptyEdit(isExecutar)) }}
            style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 16, padding: '10px 20px', borderRadius: 10, border: `2px dashed ${tc.color}60`, background: `${tc.color}08`, color: tc.color, fontSize: 13, fontWeight: 700, cursor: 'pointer', width: '100%', justifyContent: 'center', transition: 'background .15s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${tc.color}14` }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = `${tc.color}08` }}>
            <Plus size={15} /> Novo serviço {tc.label}
          </button>
        )}
      </div>
    </CRMLayout>
  )
}
