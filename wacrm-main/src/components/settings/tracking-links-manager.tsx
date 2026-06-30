'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, Copy, Check, ExternalLink, MousePointerClick, Link2, Zap, Eye, EyeOff, GitBranch, BarChart2, FileDown, CheckCircle2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SettingsPanelHead } from './settings-panel-head';
import { META_CAPI_EVENTS } from '@/lib/capi/events';
import type { Pipeline, PipelineStage, StageTrigger, CapiDispatchLog } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import type { TrackingLink } from '@/types';

const emptyForm = {
  name: '',
  utm_source: '',
  utm_medium: '',
  utm_campaign: '',
  utm_content: '',
  utm_term: '',
  destination_phone: '',
  initial_message: 'Olá! Tenho interesse.',
};

interface PixelConfig {
  id: string;
  pixel_id: string;
  test_event_code?: string | null;
}

export function TrackingLinksManager() {
  const [links, setLinks] = useState<TrackingLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Pixel / CAPI state
  const [pixelConfig, setPixelConfig] = useState<PixelConfig | null>(null);
  const [pixelForm, setPixelForm] = useState({ pixel_id: '', access_token: '', test_event_code: '' });
  const [showToken, setShowToken] = useState(false);
  const [savingPixel, setSavingPixel] = useState(false);
  const [deletePixelConfirm, setDeletePixelConfirm] = useState(false);

  // Pipeline stages CAPI config
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [savingStage, setSavingStage] = useState<string | null>(null);

  // Stage triggers
  const [triggers, setTriggers] = useState<StageTrigger[]>([]);
  const [triggerInputs, setTriggerInputs] = useState<Record<string, { keyword: string; matchType: 'exact' | 'contains' }>>({});
  const [savingTrigger, setSavingTrigger] = useState(false);
  const [expandedTriggerStage, setExpandedTriggerStage] = useState<string | null>(null);

  // CAPI log
  const [capiLog, setCapiLog] = useState<CapiDispatchLog[]>([]);
  const [showCapiLog, setShowCapiLog] = useState(false);

  // Attribution stats
  type AttributionStats = {
    bySource: { source: string; count: number }[];
    byCapiEvent: { event: string; success: number; failed: number }[];
    totals: { contacts: number; capiSuccess: number; capiFailed: number };
  };
  const [stats, setStats] = useState<AttributionStats | null>(null);

  // Initialized after mount to avoid SSR hydration mismatch
  const [baseUrl, setBaseUrl] = useState('');
  useEffect(() => { setBaseUrl(window.location.origin); }, []);

  const fetchLinks = useCallback(async () => {
    const res = await fetch('/api/tracking-links');
    if (res.ok) {
      const json = await res.json();
      setLinks(json.links ?? []);
    }
    setLoading(false);
  }, []);

  const fetchPixelConfig = useCallback(async () => {
    const res = await fetch('/api/capi');
    if (res.ok) {
      const json = await res.json();
      setPixelConfig(json.config ?? null);
      if (json.config) {
        setPixelForm((prev) => ({
          ...prev,
          pixel_id: json.config.pixel_id ?? '',
          test_event_code: json.config.test_event_code ?? '',
        }));
      }
    }
  }, []);

  const fetchPipelines = useCallback(async () => {
    const supabase = createClient();
    const [{ data: pData }, { data: sData }] = await Promise.all([
      supabase.from('pipelines').select('*').order('created_at'),
      supabase.from('pipeline_stages').select('*').order('position'),
    ]);
    setPipelines(pData ?? []);
    setStages(sData ?? []);
  }, []);

  const fetchTriggers = useCallback(async () => {
    const res = await fetch('/api/stage-triggers');
    if (res.ok) setTriggers(await res.json());
  }, []);

  const fetchCapiLog = useCallback(async () => {
    const res = await fetch('/api/capi-log?limit=30');
    if (res.ok) setCapiLog(await res.json());
  }, []);

  const fetchStats = useCallback(async () => {
    const res = await fetch('/api/attribution');
    if (res.ok) setStats(await res.json());
  }, []);

  useEffect(() => {
    fetchLinks();
    fetchPixelConfig();
    fetchPipelines();
    fetchTriggers();
    fetchStats();
  }, [fetchLinks, fetchPixelConfig, fetchPipelines, fetchTriggers, fetchStats]);

  async function handleStageCapiChange(stageId: string, capiEvent: string | null) {
    setStages((prev) =>
      prev.map((s) => (s.id === stageId ? { ...s, capi_event: capiEvent } : s)),
    );
    setSavingStage(stageId);
    try {
      const res = await fetch(`/api/pipeline-stages/${stageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ capi_event: capiEvent }),
      });
      if (!res.ok) throw new Error();
      toast.success('Evento salvo.');
    } catch {
      toast.error('Erro ao salvar evento.');
      fetchPipelines();
    } finally {
      setSavingStage(null);
    }
  }

  function openNew() {
    setForm({ ...emptyForm });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.destination_phone.trim()) {
      toast.error('Nome e número de destino são obrigatórios.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/tracking-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error ?? 'Erro ao salvar');
      }
      toast.success('Link criado com sucesso!');
      setDialogOpen(false);
      fetchLinks();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch('/api/tracking-links', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setDeleteConfirmId(null);
    if (res.ok) {
      toast.success('Link excluído.');
      setLinks((prev) => prev.filter((l) => l.id !== id));
    } else {
      toast.error('Erro ao excluir.');
    }
  }

  function copyLink(link: TrackingLink) {
    const url = `${baseUrl}/r/${link.code}`;
    navigator.clipboard.writeText(url);
    setCopiedId(link.id);
    toast.success('Link copiado!');
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleSavePixel() {
    if (!pixelForm.pixel_id.trim() || !pixelForm.access_token.trim()) {
      toast.error('Pixel ID e Access Token são obrigatórios.');
      return;
    }
    setSavingPixel(true);
    try {
      const res = await fetch('/api/capi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pixelForm),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Erro');
      toast.success('Configuração salva!');
      fetchPixelConfig();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setSavingPixel(false);
    }
  }

  async function handleAddTrigger(stageId: string) {
    const input = triggerInputs[stageId];
    if (!input?.keyword?.trim()) return;
    setSavingTrigger(true);
    try {
      const res = await fetch('/api/stage-triggers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_id: stageId, keyword: input.keyword.trim(), match_type: input.matchType }),
      });
      if (!res.ok) throw new Error();
      const newTrigger = await res.json();
      setTriggers((prev) => [...prev, newTrigger]);
      setTriggerInputs((prev) => ({ ...prev, [stageId]: { keyword: '', matchType: 'contains' } }));
      toast.success('Frase gatilho adicionada.');
    } catch {
      toast.error('Erro ao adicionar frase.');
    } finally {
      setSavingTrigger(false);
    }
  }

  async function handleDeleteTrigger(id: string) {
    const res = await fetch('/api/stage-triggers', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setTriggers((prev) => prev.filter((t) => t.id !== id));
    } else {
      toast.error('Erro ao remover.');
    }
  }

  async function handleDeletePixel() {
    await fetch('/api/capi', { method: 'DELETE' });
    setDeletePixelConfirm(false);
    setPixelConfig(null);
    setPixelForm({ pixel_id: '', access_token: '', test_event_code: '' });
    toast.success('Configuração removida.');
  }

  const field = (key: keyof typeof form, label: string, placeholder: string, required = false) => (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">
        {label}{required && <span className="text-destructive"> *</span>}
      </Label>
      <Input
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        placeholder={placeholder}
        className="bg-muted border-border text-foreground placeholder:text-muted-foreground text-sm"
      />
    </div>
  );

  return (
    <div className="space-y-6">
      <SettingsPanelHead
        title="Links de rastreamento"
        description="Crie links rastreáveis para anúncios. Quando um lead clicar e enviar mensagem, o wacrm associa automaticamente a origem (campanha, conjunto, anúncio) ao contato."
      />

      {/* ── Painel de atribuição ────────────────────────────────── */}
      {stats && (stats.totals.contacts > 0 || stats.totals.capiSuccess > 0) && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Atribuição — últimos 30 dias</span>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-4 text-center">
            <div className="rounded-md bg-muted p-2">
              <p className="text-xl font-bold text-foreground">{stats.totals.contacts}</p>
              <p className="text-[10px] text-muted-foreground">novos contatos</p>
            </div>
            <div className="rounded-md bg-muted p-2">
              <p className="text-xl font-bold text-green-500">{stats.totals.capiSuccess}</p>
              <p className="text-[10px] text-muted-foreground">eventos enviados</p>
            </div>
            <div className="rounded-md bg-muted p-2">
              <p className="text-xl font-bold text-destructive">{stats.totals.capiFailed}</p>
              <p className="text-[10px] text-muted-foreground">eventos com erro</p>
            </div>
          </div>
          {stats.bySource.length > 0 && (
            <div className="space-y-1.5">
              {stats.bySource.map(({ source, count }) => {
                const pct = Math.round((count / stats.totals.contacts) * 100);
                return (
                  <div key={source} className="flex items-center gap-2 text-xs">
                    <span className="w-32 shrink-0 truncate text-muted-foreground">{source}</span>
                    <div className="flex-1 h-1.5 rounded bg-muted overflow-hidden">
                      <div className="h-full rounded bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-6 text-right text-foreground">{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <Button onClick={openNew} size="sm" className="gap-2">
        <Plus className="h-4 w-4" />
        Criar link
      </Button>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : links.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card/50 px-6 py-12 text-center">
          <Link2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Nenhum link ainda</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Crie um link rastreável e use-o nos seus anúncios. Cada clique é registrado
            e o contato é associado à campanha automaticamente.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {links.map((link) => (
            <TrackingLinkCard
              key={link.id}
              link={link}
              baseUrl={baseUrl}
              copied={copiedId === link.id}
              confirmingDelete={deleteConfirmId === link.id}
              onCopy={() => copyLink(link)}
              onDeleteRequest={() => setDeleteConfirmId(link.id)}
              onDeleteConfirm={() => handleDelete(link.id)}
              onDeleteCancel={() => setDeleteConfirmId(null)}
            />
          ))}
        </div>
      )}

      {/* ── Eventos por Etapa ──────────────────────────────────── */}
      <div className="mt-8 border-t border-border pt-8">
        <div className="mb-4 flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-semibold text-foreground">Eventos CAPI por etapa do pipeline</p>
            <p className="text-xs text-muted-foreground">
              Quando um negócio avança para uma etapa, o wacrm dispara automaticamente o
              evento correspondente para o Meta Ads — não apenas ao fechar, mas em cada
              passo da jornada.
            </p>
          </div>
        </div>

        {pipelines.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhum pipeline encontrado. Crie um pipeline em{' '}
            <a href="/pipelines" className="underline">Negócios</a> primeiro.
          </p>
        ) : (
          <div className="space-y-5">
            {pipelines.map((pipeline) => {
              const pipelineStages = stages.filter((s) => s.pipeline_id === pipeline.id);
              return (
                <div key={pipeline.id} className="rounded-lg border border-border bg-card p-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {pipeline.name}
                  </p>
                  <div className="space-y-3">
                    {pipelineStages.map((stage) => {
                      const stageTriggers = triggers.filter((t) => t.stage_id === stage.id);
                      const isExpanded = expandedTriggerStage === stage.id;
                      const input = triggerInputs[stage.id] ?? { keyword: '', matchType: 'contains' as const };
                      return (
                        <div key={stage.id} className="rounded-md border border-border/60 bg-background/50 p-2">
                          {/* Stage CAPI event row */}
                          <div className="flex items-center gap-3">
                            <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: stage.color }} />
                            <span className="w-28 shrink-0 truncate text-sm text-foreground">{stage.name}</span>
                            <select
                              value={stage.capi_event ?? ''}
                              disabled={savingStage === stage.id}
                              onChange={(e) => handleStageCapiChange(stage.id, e.target.value || null)}
                              className="flex-1 rounded-md border border-border bg-muted px-2 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none disabled:opacity-50"
                            >
                              <option value="">— sem evento —</option>
                              {META_CAPI_EVENTS.map((ev) => (
                                <option key={ev.value} value={ev.value}>{ev.label}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => setExpandedTriggerStage(isExpanded ? null : stage.id)}
                              className="shrink-0 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                              title="Frases gatilho"
                            >
                              {stageTriggers.length > 0 && (
                                <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] text-primary">{stageTriggers.length}</span>
                              )}
                              {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            </button>
                          </div>

                          {/* Stage triggers (expanded) */}
                          {isExpanded && (
                            <div className="mt-2 space-y-2 border-t border-border/50 pt-2">
                              <p className="text-[11px] text-muted-foreground">
                                Frases gatilho: quando o cliente enviar uma dessas mensagens, o negócio avança para esta etapa automaticamente.
                              </p>
                              {stageTriggers.map((t) => (
                                <div key={t.id} className="flex items-center gap-2">
                                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                    {t.match_type === 'exact' ? 'exato' : 'contém'}
                                  </span>
                                  <span className="flex-1 text-xs text-foreground">{t.keyword}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteTrigger(t.id)}
                                    className="text-muted-foreground hover:text-destructive"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                              <div className="flex items-center gap-2">
                                <select
                                  value={input.matchType}
                                  onChange={(e) => setTriggerInputs((prev) => ({ ...prev, [stage.id]: { ...input, matchType: e.target.value as 'exact' | 'contains' } }))}
                                  className="rounded-md border border-border bg-muted px-2 py-1 text-xs text-foreground focus:border-primary focus:outline-none"
                                >
                                  <option value="contains">contém</option>
                                  <option value="exact">exato</option>
                                </select>
                                <Input
                                  value={input.keyword}
                                  onChange={(e) => setTriggerInputs((prev) => ({ ...prev, [stage.id]: { ...input, keyword: e.target.value } }))}
                                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddTrigger(stage.id); }}
                                  placeholder="Digite a frase..."
                                  className="flex-1 h-7 bg-muted border-border text-foreground text-xs placeholder:text-muted-foreground"
                                />
                                <Button
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  disabled={savingTrigger || !input.keyword.trim()}
                                  onClick={() => handleAddTrigger(stage.id)}
                                >
                                  <Plus className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Meta Pixel / CAPI ─────────────────────────────────── */}
      <div className="mt-8 border-t border-border pt-8">
        <div className="mb-4 flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-semibold text-foreground">Meta Conversions API (CAPI)</p>
            <p className="text-xs text-muted-foreground">
              Quando um negócio for marcado como ganho, o wacrm envia um evento{' '}
              <strong>Purchase</strong> para o Meta Ads automaticamente — fechando o loop de
              atribuição e otimizando suas campanhas.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Pixel ID</Label>
            <Input
              value={pixelForm.pixel_id}
              onChange={(e) => setPixelForm({ ...pixelForm, pixel_id: e.target.value })}
              placeholder="123456789012345"
              className="bg-muted border-border text-foreground placeholder:text-muted-foreground text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Access Token</Label>
            <div className="relative">
              <Input
                type={showToken ? 'text' : 'password'}
                value={pixelForm.access_token}
                onChange={(e) => setPixelForm({ ...pixelForm, access_token: e.target.value })}
                placeholder="EAAxxxxxxxx..."
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground pr-9 text-sm"
              />
              <button
                type="button"
                onClick={() => setShowToken((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Código de evento de teste{' '}
              <span className="text-[10px] text-muted-foreground/60">(opcional — remova antes de ir a produção)</span>
            </Label>
            <Input
              value={pixelForm.test_event_code}
              onChange={(e) => setPixelForm({ ...pixelForm, test_event_code: e.target.value })}
              placeholder="TEST12345"
              className="bg-muted border-border text-foreground placeholder:text-muted-foreground text-sm"
            />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button onClick={handleSavePixel} disabled={savingPixel} size="sm">
              {savingPixel ? 'Salvando...' : pixelConfig ? 'Atualizar' : 'Salvar'}
            </Button>
            {pixelConfig && !deletePixelConfirm && (
              <Button variant="ghost" size="sm" onClick={() => setDeletePixelConfirm(true)} className="text-destructive hover:text-destructive">
                Remover
              </Button>
            )}
            {deletePixelConfirm && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Confirmar remoção?</span>
                <Button size="sm" variant="destructive" onClick={handleDeletePixel}>Sim</Button>
                <Button size="sm" variant="ghost" onClick={() => setDeletePixelConfirm(false)}>Não</Button>
              </div>
            )}
            {pixelConfig && (
              <span className="text-[11px] text-muted-foreground">
                Pixel <strong>{pixelConfig.pixel_id}</strong> configurado
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Log de disparos CAPI ───────────────────────────────── */}
      <div className="mt-8 border-t border-border pt-8">
        <button
          type="button"
          onClick={() => {
            if (!showCapiLog) fetchCapiLog();
            setShowCapiLog((v) => !v);
          }}
          className="flex w-full items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Log de disparos CAPI</span>
          </div>
          {showCapiLog ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {showCapiLog && (
          <div className="mt-3 space-y-1">
            {capiLog.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">Nenhum disparo registrado ainda.</p>
            ) : capiLog.map((entry) => {
              const contact = entry as (typeof entry & { contact?: { name?: string; phone?: string } });
              return (
                <div key={entry.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50 text-xs">
                  {entry.status === 'success'
                    ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
                    : <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                  }
                  <span className="w-32 shrink-0 font-medium text-foreground">{entry.event_name}</span>
                  <span className="flex-1 truncate text-muted-foreground">
                    {contact.contact?.name ?? contact.contact?.phone ?? '—'}
                  </span>
                  {entry.utm_campaign && (
                    <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">{entry.utm_campaign}</span>
                  )}
                  <span className="shrink-0 text-muted-foreground/60">
                    {new Date(entry.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Relatórios / Exportações ────────────────────────────── */}
      <div className="mt-8 border-t border-border pt-8">
        <div className="mb-3 flex items-center gap-2">
          <FileDown className="h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-semibold text-foreground">Exportar relatórios</p>
            <p className="text-xs text-muted-foreground">Baixe seus dados de atribuição e conversão.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/api/reports/contacts" download>
            <Button variant="outline" size="sm" className="gap-2">
              <FileDown className="h-3.5 w-3.5" />
              Contatos com UTM (.csv)
            </Button>
          </a>
          <a href="/api/reports/gclid" download>
            <Button variant="outline" size="sm" className="gap-2">
              <FileDown className="h-3.5 w-3.5" />
              Conversões Google Ads (.csv)
            </Button>
          </a>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-card sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground">Criar link de rastreamento</DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              O link gerado redireciona para o WhatsApp com uma mensagem que contém
              um código de rastreamento. Quando o lead enviar, o wacrm associa a
              campanha ao contato automaticamente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {field('name', 'Nome do link', 'Ex: Facebook Ads — Campanha Verão', true)}
            {field('destination_phone', 'Número de destino (WhatsApp)', 'Ex: 5511999999999', true)}
            {field('initial_message', 'Mensagem inicial', 'Olá! Tenho interesse.')}
            <p className="text-[10px] text-muted-foreground -mt-2">
              O código de rastreamento é anexado automaticamente ao final desta mensagem.
            </p>

            <div className="border-t border-border pt-4">
              <p className="mb-3 text-xs font-medium text-muted-foreground">Parâmetros UTM (opcional)</p>
              <div className="grid grid-cols-2 gap-3">
                {field('utm_source', 'utm_source', 'facebook')}
                {field('utm_medium', 'utm_medium', 'cpc')}
                {field('utm_campaign', 'utm_campaign', 'campanha-verao')}
                {field('utm_content', 'utm_content', 'criativo-1')}
              </div>
              {field('utm_term', 'utm_term (palavra-chave)', 'crm whatsapp')}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Criar link'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TrackingLinkCard({
  link,
  baseUrl,
  copied,
  confirmingDelete,
  onCopy,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
}: {
  link: TrackingLink;
  baseUrl: string;
  copied: boolean;
  confirmingDelete: boolean;
  onCopy: () => void;
  onDeleteRequest: () => void;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
}) {
  const url = `${baseUrl}/r/${link.code}`;
  const utms = [
    link.utm_source && `source: ${link.utm_source}`,
    link.utm_medium && `medium: ${link.utm_medium}`,
    link.utm_campaign && `campaign: ${link.utm_campaign}`,
    link.utm_content && `content: ${link.utm_content}`,
  ].filter(Boolean);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{link.name}</p>
          <div className="mt-1 flex items-center gap-2">
            <code className="truncate text-[11px] text-muted-foreground">{url}</code>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          {utms.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {utms.map((u) => (
                <span
                  key={u}
                  className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                >
                  {u}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="flex items-center gap-1 rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">
            <MousePointerClick className="h-3 w-3" />
            {link.click_count}
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={onCopy}
            title="Copiar link"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
          {!confirmingDelete ? (
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 text-destructive hover:bg-destructive/10"
              onClick={onDeleteRequest}
              title="Excluir link"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <div className="flex items-center gap-1">
              <Button size="sm" variant="destructive" onClick={onDeleteConfirm}>Excluir</Button>
              <Button size="sm" variant="ghost" onClick={onDeleteCancel}>Não</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
