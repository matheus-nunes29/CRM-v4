'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { supabase, CatalogoServico } from '@/lib/supabase'
import CRMLayout from '../_components/CRMLayout'
import { R, WHITE, GRAY1, GRAY2, GRAY3, GRAY4, GRAY5, BLUE, PURPLE } from '@/lib/crm-constants'
import { Plus, Trash2, Check, X, GripVertical, ChevronDown, ChevronRight, Edit2, BookOpen } from 'lucide-react'
import { toast } from '@/lib/toast'

const card: React.CSSProperties = {
  background: WHITE,
  borderRadius: 14,
  border: `1px solid ${GRAY5}`,
  boxShadow: '0 1px 4px rgba(0,0,0,.05)',
}

const TIPO_CONFIG = {
  saber: { label: 'Saber', color: BLUE,   bg: '#EDE9FE', border: '#DDD6FE' },
  ter:   { label: 'Ter',   color: PURPLE, bg: '#F5F3FF', border: '#DDD6FE' },
}

type EditState = {
  nome: string
  etapas: string[]
}

export default function CatalogoPage() {
  const [servicos, setServicos]       = useState<CatalogoServico[]>([])
  const [loading, setLoading]         = useState(true)
  const [tipoAtivo, setTipoAtivo]     = useState<'saber' | 'ter'>('saber')

  // Novo serviço
  const [showNew, setShowNew]         = useState(false)
  const [newForm, setNewForm]         = useState<EditState>({ nome: '', etapas: [''] })
  const [saving, setSaving]           = useState(false)

  // Edição
  const [editId, setEditId]           = useState<string | null>(null)
  const [editForm, setEditForm]       = useState<EditState>({ nome: '', etapas: [] })

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('catalogo_servicos')
      .select('*')
      .order('tipo').order('ordem').order('nome')
    setServicos(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── helpers ──────────────────────────────────────────────────────────────────
  function addEtapa(form: EditState, setForm: (f: EditState) => void) {
    setForm({ ...form, etapas: [...form.etapas, ''] })
  }
  function setEtapa(form: EditState, setForm: (f: EditState) => void, i: number, val: string) {
    setForm({ ...form, etapas: form.etapas.map((e, j) => j === i ? val : e) })
  }
  function removeEtapa(form: EditState, setForm: (f: EditState) => void, i: number) {
    setForm({ ...form, etapas: form.etapas.filter((_, j) => j !== i) })
  }
  function moveEtapa(form: EditState, setForm: (f: EditState) => void, i: number, dir: -1 | 1) {
    const arr = [...form.etapas]
    const j = i + dir
    if (j < 0 || j >= arr.length) return
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    setForm({ ...form, etapas: arr })
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────────
  async function createServico() {
    if (!newForm.nome.trim()) return
    setSaving(true)
    const etapas = newForm.etapas.map(e => e.trim()).filter(Boolean)
    const { error } = await supabase.from('catalogo_servicos').insert({
      tipo: tipoAtivo, nome: newForm.nome.trim(), etapas,
      ordem: servicos.filter(s => s.tipo === tipoAtivo).length,
    })
    setSaving(false)
    if (error) { toast.error('Erro ao salvar: ' + error.message); return }
    setShowNew(false)
    setNewForm({ nome: '', etapas: [''] })
    await load()
    toast.success('Serviço criado com sucesso!')
  }

  async function updateServico() {
    if (!editId || !editForm.nome.trim()) return
    setSaving(true)
    const etapas = editForm.etapas.map(e => e.trim()).filter(Boolean)
    const { error } = await supabase.from('catalogo_servicos').update({
      nome: editForm.nome.trim(), etapas,
    }).eq('id', editId)
    setSaving(false)
    if (error) { toast.error('Erro ao salvar: ' + error.message); return }
    setEditId(null)
    await load()
    toast.success('Serviço atualizado!')
  }

  async function toggleAtivo(s: CatalogoServico) {
    await supabase.from('catalogo_servicos').update({ ativo: !s.ativo }).eq('id', s.id)
    await load()
  }

  async function deleteServico(id: string) {
    if (!confirm('Excluir este serviço? Projetos já criados não serão afetados.')) return
    await supabase.from('catalogo_servicos').delete().eq('id', id)
    await load()
    toast.success('Serviço removido.')
  }

  function startEdit(s: CatalogoServico) {
    setEditId(s.id)
    setEditForm({ nome: s.nome, etapas: s.etapas.length > 0 ? [...s.etapas] : [''] })
  }

  // ── render helpers ────────────────────────────────────────────────────────────
  const servicosFiltrados = servicos.filter(s => s.tipo === tipoAtivo)
  const tc = TIPO_CONFIG[tipoAtivo]

  function EtapasEditor({ form, setForm }: { form: EditState; setForm: (f: EditState) => void }) {
    return (
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: GRAY3, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
          Etapas do serviço ({form.etapas.filter(Boolean).length})
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {form.etapas.map((etapa, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <button onClick={() => moveEtapa(form, setForm, i, -1)} disabled={i === 0}
                  style={{ border: 'none', background: 'transparent', cursor: i === 0 ? 'default' : 'pointer', color: i === 0 ? GRAY5 : GRAY3, padding: '1px 3px', fontSize: 10, lineHeight: 1 }}>▲</button>
                <button onClick={() => moveEtapa(form, setForm, i, 1)} disabled={i === form.etapas.length - 1}
                  style={{ border: 'none', background: 'transparent', cursor: i === form.etapas.length - 1 ? 'default' : 'pointer', color: i === form.etapas.length - 1 ? GRAY5 : GRAY3, padding: '1px 3px', fontSize: 10, lineHeight: 1 }}>▼</button>
              </div>
              <span style={{ fontSize: 11, color: GRAY3, width: 18, textAlign: 'right', flexShrink: 0 }}>{i + 1}.</span>
              <input
                type="text"
                value={etapa}
                onChange={e => setEtapa(form, setForm, i, e.target.value)}
                placeholder={`Etapa ${i + 1}`}
                style={{ flex: 1, padding: '7px 10px', border: `1.5px solid ${GRAY5}`, borderRadius: 7, fontSize: 13, color: GRAY1, outline: 'none', background: WHITE }}
              />
              <button onClick={() => removeEtapa(form, setForm, i)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: GRAY3, padding: 4, display: 'flex' }}>
                <X size={14} />
              </button>
            </div>
          ))}
          <button onClick={() => addEtapa(form, setForm)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 7, border: `1.5px dashed ${GRAY5}`, background: GRAY4, color: GRAY2, fontSize: 12, fontWeight: 600, cursor: 'pointer', marginTop: 2 }}>
            <Plus size={13} /> Adicionar etapa
          </button>
        </div>
      </div>
    )
  }

  return (
    <CRMLayout title="Catálogo de Serviços" subtitle="Gerencie os serviços disponíveis para projetos Saber e Ter">
      <div style={{ maxWidth: 780, margin: '0 auto', padding: '28px 20px' }}>

        {/* Tipo tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          {(['saber', 'ter'] as const).map(tipo => {
            const t = TIPO_CONFIG[tipo]
            const ativo = tipoAtivo === tipo
            const count = servicos.filter(s => s.tipo === tipo && s.ativo).length
            return (
              <button key={tipo} onClick={() => { setTipoAtivo(tipo); setShowNew(false); setEditId(null) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 20px', borderRadius: 10,
                  border: `2px solid ${ativo ? t.color : GRAY5}`,
                  background: ativo ? t.bg : WHITE,
                  color: ativo ? t.color : GRAY2,
                  fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  transition: 'all .15s',
                }}>
                {t.label}
                <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 10, background: ativo ? `${t.color}20` : GRAY4, color: ativo ? t.color : GRAY3, fontWeight: 700 }}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Lista de serviços */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: GRAY3 }}>Carregando...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {servicosFiltrados.length === 0 && !showNew && (
              <div style={{ ...card, padding: '48px 24px', textAlign: 'center' }}>
                <BookOpen size={32} color={GRAY3} style={{ margin: '0 auto 12px' }} />
                <div style={{ fontSize: 14, fontWeight: 600, color: GRAY2, marginBottom: 6 }}>Nenhum serviço cadastrado</div>
                <div style={{ fontSize: 12, color: GRAY3 }}>Clique em "+ Novo Serviço" para adicionar</div>
              </div>
            )}

            {servicosFiltrados.map(s => {
              const isEdit = editId === s.id
              return (
                <div key={s.id} style={{ ...card, overflow: 'hidden', opacity: s.ativo ? 1 : 0.6 }}>
                  {/* Color bar */}
                  <div style={{ height: 4, background: `linear-gradient(90deg, ${tc.color}, ${tc.color}66)` }} />

                  <div style={{ padding: '16px 20px' }}>
                    {isEdit ? (
                      /* ── Modo edição ── */
                      <div>
                        <div style={{ marginBottom: 12 }}>
                          <label style={{ fontSize: 10, fontWeight: 700, color: GRAY3, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>Nome do serviço *</label>
                          <input
                            type="text"
                            value={editForm.nome}
                            onChange={e => setEditForm(f => ({ ...f, nome: e.target.value }))}
                            style={{ width: '100%', padding: '10px 13px', border: `1.5px solid ${BLUE}`, borderRadius: 9, fontSize: 14, fontWeight: 600, color: GRAY1, outline: 'none', boxSizing: 'border-box' }}
                          />
                        </div>
                        <EtapasEditor form={editForm} setForm={setEditForm} />
                        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                          <button onClick={() => setEditId(null)} style={{ padding: '8px 16px', borderRadius: 8, border: `1.5px solid ${GRAY5}`, background: WHITE, color: GRAY2, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
                          <button onClick={updateServico} disabled={saving || !editForm.nome.trim()}
                            style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: tc.color, color: WHITE, fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Check size={13} /> {saving ? 'Salvando...' : 'Salvar'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* ── Modo visualização ── */
                      <div>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: s.ativo ? GRAY1 : GRAY3, marginBottom: 4 }}>{s.nome}</div>
                            {s.etapas.length > 0 ? (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 6px', marginTop: 8 }}>
                                {s.etapas.map((etapa, i) => (
                                  <React.Fragment key={i}>
                                    <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, background: tc.bg, border: `1px solid ${tc.border}`, color: tc.color, fontWeight: 600 }}>
                                      {i + 1}. {etapa}
                                    </span>
                                    {i < s.etapas.length - 1 && (
                                      <span style={{ fontSize: 10, color: GRAY3, alignSelf: 'center' }}>›</span>
                                    )}
                                  </React.Fragment>
                                ))}
                              </div>
                            ) : (
                              <div style={{ fontSize: 12, color: GRAY3, fontStyle: 'italic', marginTop: 4 }}>Sem etapas definidas</div>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                            <button onClick={() => toggleAtivo(s)} title={s.ativo ? 'Desativar' : 'Ativar'}
                              style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${s.ativo ? '#A7F3D0' : GRAY5}`, background: s.ativo ? '#F0FDF4' : GRAY4, color: s.ativo ? '#065F46' : GRAY3, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                              {s.ativo ? 'Ativo' : 'Inativo'}
                            </button>
                            <button onClick={() => startEdit(s)} title="Editar"
                              style={{ border: 'none', background: GRAY4, cursor: 'pointer', color: GRAY2, padding: '6px 10px', borderRadius: 7, display: 'flex', alignItems: 'center' }}>
                              <Edit2 size={13} />
                            </button>
                            <button onClick={() => deleteServico(s.id)} title="Excluir"
                              style={{ border: 'none', background: GRAY4, cursor: 'pointer', color: GRAY3, padding: '6px 10px', borderRadius: 7, display: 'flex', alignItems: 'center' }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = R }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = GRAY3 }}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Formulário de novo serviço */}
            {showNew && (
              <div style={{ ...card, overflow: 'hidden' }}>
                <div style={{ height: 4, background: `linear-gradient(90deg, ${tc.color}, ${tc.color}66)` }} />
                <div style={{ padding: '20px 20px' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: GRAY1, marginBottom: 14 }}>Novo serviço — {tc.label}</div>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, color: GRAY3, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>Nome do serviço *</label>
                    <input
                      type="text"
                      value={newForm.nome}
                      onChange={e => setNewForm(f => ({ ...f, nome: e.target.value }))}
                      placeholder="Ex: Estratégia de Conteúdo"
                      autoFocus
                      style={{ width: '100%', padding: '10px 13px', border: `1.5px solid ${tc.color}`, borderRadius: 9, fontSize: 14, fontWeight: 600, color: GRAY1, outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                  <EtapasEditor form={newForm} setForm={setNewForm} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                    <button onClick={() => { setShowNew(false); setNewForm({ nome: '', etapas: [''] }) }}
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

        {/* Botão novo */}
        {!showNew && !editId && (
          <button onClick={() => { setShowNew(true); setEditId(null) }}
            style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 16, padding: '10px 20px', borderRadius: 10, border: `2px dashed ${tc.color}60`, background: `${tc.color}08`, color: tc.color, fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all .15s', width: '100%', justifyContent: 'center' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${tc.color}14` }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = `${tc.color}08` }}>
            <Plus size={15} /> Novo serviço {tc.label}
          </button>
        )}
      </div>
    </CRMLayout>
  )
}
