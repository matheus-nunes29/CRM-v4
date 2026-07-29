'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Bot,
  Lock,
  Loader2,
  Plus,
  Trash2,
  Pencil,
  History as HistoryIcon,
  MessageSquareWarning,
} from 'lucide-react'

import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface AiAgentConfig {
  account_id: string
  enabled: boolean
  system_prompt: string
  allow_pricing: boolean
  price_list: string
  allow_deal_updates: boolean
  escalation_notes: string
}

interface KnowledgeItem {
  id: string
  title: string
  content: string
  source: 'manual' | 'correction'
  is_active: boolean
  created_at: string
}

interface Correction {
  id: string
  original_response: string
  corrected_response: string
  note: string
  created_at: string
}

interface HistoryEntry {
  id: string
  summary: string
  created_at: string
}

interface RunEntry {
  id: string
  response_text: string | null
  outcome: 'replied' | 'handoff' | 'error' | 'skipped'
  error_message: string | null
  created_at: string
}

const OUTCOME_LABEL: Record<RunEntry['outcome'], string> = {
  replied: 'Respondeu',
  handoff: 'Transferiu p/ humano',
  error: 'Erro',
  skipped: 'Ignorado',
}

export function AiAgentSettings() {
  const { hasFeature } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState<AiAgentConfig | null>(null)

  const [items, setItems] = useState<KnowledgeItem[]>([])
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [addingItem, setAddingItem] = useState(false)

  const [corrections, setCorrections] = useState<Correction[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [runs, setRuns] = useState<RunEntry[]>([])

  const enabled = hasFeature('ai_agent')

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [configRes, knowledgeRes, correctionsRes, historyRes] = await Promise.all([
        fetch('/api/ai-agent/config'),
        fetch('/api/ai-agent/knowledge'),
        fetch('/api/ai-agent/corrections'),
        fetch('/api/ai-agent/history'),
      ])
      const configPayload = await configRes.json().catch(() => ({}))
      const knowledgePayload = await knowledgeRes.json().catch(() => ({}))
      const correctionsPayload = await correctionsRes.json().catch(() => ({}))
      const historyPayload = await historyRes.json().catch(() => ({}))

      if (configRes.ok) setConfig(configPayload.config)
      if (knowledgeRes.ok) setItems(knowledgePayload.items ?? [])
      if (correctionsRes.ok) setCorrections(correctionsPayload.corrections ?? [])
      if (historyRes.ok) {
        setHistory(historyPayload.history ?? [])
        setRuns(historyPayload.runs ?? [])
      }
    } catch {
      toast.error('Falha ao carregar configurações do agente de IA')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    loadAll()
  }, [enabled, loadAll])

  async function saveConfig() {
    if (!config) return
    setSaving(true)
    try {
      const res = await fetch('/api/ai-agent/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(payload.error || 'Falha ao salvar')
        return
      }
      setConfig(payload.config)
      toast.success('Configuração salva')
      loadAll()
    } catch {
      toast.error('Falha de rede ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function addKnowledgeItem() {
    if (!newTitle.trim() || !newContent.trim()) {
      toast.error('Preencha título e conteúdo')
      return
    }
    setAddingItem(true)
    try {
      const res = await fetch('/api/ai-agent/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim(), content: newContent.trim() }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(payload.error || 'Falha ao adicionar item')
        return
      }
      setItems((prev) => [payload.item, ...prev])
      setNewTitle('')
      setNewContent('')
      toast.success('Item adicionado à base de conhecimento')
    } catch {
      toast.error('Falha de rede ao adicionar item')
    } finally {
      setAddingItem(false)
    }
  }

  async function toggleItemActive(item: KnowledgeItem) {
    const res = await fetch(`/api/ai-agent/knowledge/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !item.is_active }),
    })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(payload.error || 'Falha ao atualizar item')
      return
    }
    setItems((prev) => prev.map((i) => (i.id === item.id ? payload.item : i)))
  }

  async function deleteItem(id: string) {
    if (!confirm('Remover este item da base de conhecimento?')) return
    const res = await fetch(`/api/ai-agent/knowledge/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      toast.error('Falha ao remover item')
      return
    }
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  if (!enabled) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-5 py-12 text-center">
        <Lock className="size-6 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">Recurso desativado</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          O Agente de IA não está habilitado para esta conta. Fale com o administrador da plataforma pra ativar.
        </p>
      </div>
    )
  }

  if (loading || !config) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Bot className="size-5 text-primary" />
            Agente de IA
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Responde automaticamente no WhatsApp quando nenhum Fluxo/Automação capturar a mensagem, e serve de copiloto interno.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
          <Label htmlFor="ai-agent-enabled" className="text-sm font-medium">
            {config.enabled ? 'Ativo' : 'Desativado'}
          </Label>
          <Switch
            id="ai-agent-enabled"
            checked={config.enabled}
            onCheckedChange={(v) => setConfig({ ...config, enabled: !!v })}
          />
        </div>
      </div>

      <Tabs defaultValue="comportamento" className="space-y-6">
        <TabsList className="bg-muted border border-border h-auto p-1 gap-1">
          <TabsTrigger value="comportamento" className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm text-muted-foreground">
            Comportamento
          </TabsTrigger>
          <TabsTrigger value="conhecimento" className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm text-muted-foreground">
            Base de conhecimento
          </TabsTrigger>
          <TabsTrigger value="correcoes" className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm text-muted-foreground">
            Correções
          </TabsTrigger>
          <TabsTrigger value="historico" className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm text-muted-foreground">
            Histórico
          </TabsTrigger>
        </TabsList>

        {/* ─────────────── COMPORTAMENTO ─────────────── */}
        <TabsContent value="comportamento" className="mt-0 space-y-4">
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div>
              <Label htmlFor="system_prompt">Tom e persona</Label>
              <Textarea
                id="system_prompt"
                rows={5}
                value={config.system_prompt}
                onChange={(e) => setConfig({ ...config, system_prompt: e.target.value })}
                placeholder="Ex: Você é a recepcionista virtual da Clínica X. Seja calorosa, use 'você', nunca prometa desconto sem autorização."
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Instruções de tom/persona — somadas às regras de segurança que já vêm embutidas no agente.
              </p>
            </div>

            <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Pode informar valores</p>
                <p className="text-xs text-muted-foreground">Se desligado, o agente nunca menciona preços — só a lista abaixo, quando ligado.</p>
              </div>
              <Switch
                checked={config.allow_pricing}
                onCheckedChange={(v) => setConfig({ ...config, allow_pricing: !!v })}
              />
            </div>

            {config.allow_pricing && (
              <div>
                <Label htmlFor="price_list">Lista de preços</Label>
                <Textarea
                  id="price_list"
                  rows={4}
                  value={config.price_list}
                  onChange={(e) => setConfig({ ...config, price_list: e.target.value })}
                  placeholder={'Ex:\nPreenchimento labial: R$ 800\nLimpeza de pele: R$ 250'}
                />
              </div>
            )}

            <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Pode ler dados de negócios</p>
                <p className="text-xs text-muted-foreground">Permite que o agente consulte a etapa/valor do negócio ativo do contato ao responder.</p>
              </div>
              <Switch
                checked={config.allow_deal_updates}
                onCheckedChange={(v) => setConfig({ ...config, allow_deal_updates: !!v })}
              />
            </div>

            <div>
              <Label htmlFor="escalation_notes">Quando transferir para um humano</Label>
              <Textarea
                id="escalation_notes"
                rows={4}
                value={config.escalation_notes}
                onChange={(e) => setConfig({ ...config, escalation_notes: e.target.value })}
                placeholder="Ex: Perguntas sobre efeitos colaterais, reclamações, ou fora do horário comercial (9h-18h)."
              />
              <p className="mt-1 text-xs text-muted-foreground">
                O agente sempre transfere quando o cliente pede um atendente, ou quando a pergunta é claramente clínica/médica — isso já é padrão, mesmo sem preencher aqui.
              </p>
            </div>

            <Button onClick={saveConfig} disabled={saving}>
              {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Salvar
            </Button>
          </div>
        </TabsContent>

        {/* ─────────────── BASE DE CONHECIMENTO ─────────────── */}
        <TabsContent value="conhecimento" className="mt-0 space-y-4">
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <p className="text-sm font-medium text-foreground">Adicionar item</p>
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Título (ex: Política de cancelamento)"
            />
            <Textarea
              rows={3}
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Conteúdo — o texto que o agente vai usar como referência."
            />
            <Button size="sm" onClick={addKnowledgeItem} disabled={addingItem}>
              {addingItem ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-2 size-4" />}
              Adicionar
            </Button>
          </div>

          <div className="space-y-2">
            {items.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nenhum item ainda.</p>
            ) : (
              items.map((item) => (
                <div key={item.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{item.title}</p>
                        {item.source === 'correction' && (
                          <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                            Correção
                          </span>
                        )}
                        {!item.is_active && (
                          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Inativo
                          </span>
                        )}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{item.content}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => toggleItemActive(item)}>
                        {item.is_active ? 'Desativar' : 'Ativar'}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteItem(item.id)}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        {/* ─────────────── CORREÇÕES ─────────────── */}
        <TabsContent value="correcoes" className="mt-0 space-y-2">
          <p className="text-xs text-muted-foreground">
            Marcadas no Inbox pelo botão &quot;Corrigir resposta&quot; em mensagens do agente. Cada correção também vira um item na base de conhecimento automaticamente.
          </p>
          {corrections.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma correção registrada ainda.</p>
          ) : (
            corrections.map((c) => (
              <div key={c.id} className="rounded-xl border border-border bg-card p-4 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MessageSquareWarning className="size-3.5" />
                  {formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: ptBR })}
                </div>
                {c.original_response && (
                  <p className="text-xs text-muted-foreground line-through decoration-destructive/50">{c.original_response}</p>
                )}
                <p className="text-sm text-foreground">{c.corrected_response}</p>
                {c.note && <p className="text-xs text-muted-foreground">Nota: {c.note}</p>}
              </div>
            ))
          )}
        </TabsContent>

        {/* ─────────────── HISTÓRICO ─────────────── */}
        <TabsContent value="historico" className="mt-0 space-y-4">
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-foreground">
              <Pencil className="size-4" /> Alterações de configuração
            </p>
            <div className="space-y-2">
              {history.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma alteração ainda.</p>
              ) : (
                history.map((h) => (
                  <div key={h.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm">
                    <span className="text-foreground">{h.summary}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(h.created_at), { addSuffix: true, locale: ptBR })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-foreground">
              <HistoryIcon className="size-4" /> Respostas recentes do agente
            </p>
            <div className="space-y-2">
              {runs.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">O agente ainda não respondeu nenhuma conversa.</p>
              ) : (
                runs.map((r) => (
                  <div key={r.id} className="rounded-lg border border-border bg-card px-3 py-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-medium uppercase tracking-wide">{OUTCOME_LABEL[r.outcome]}</span>
                      <span>{formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: ptBR })}</span>
                    </div>
                    {r.response_text && <p className="mt-1 text-sm text-foreground">{r.response_text}</p>}
                    {r.error_message && <p className="mt-1 text-xs text-destructive">{r.error_message}</p>}
                  </div>
                ))
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
