'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';
import {
  Plus, Pencil, Trash2, Loader2, FileText, X, Info,
  Image, Video, Mic, Link2, Upload, ChevronDown, GripVertical, Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { SettingsPanelHead } from './settings-panel-head';
import type { QuickTemplate, TemplateMessage } from '@/types';

// ── Constants ─────────────────────────────────────────────────────────────────

const VARIABLE_HINTS = ['{{nome}}', '{{telefone}}', '{{empresa}}'];

type MediaType = 'image' | 'video' | 'audio';

const MEDIA_OPTS: { value: MediaType; label: string; icon: React.ReactNode; accept: string }[] = [
  { value: 'image', label: 'Imagem', icon: <Image className="h-3.5 w-3.5" />, accept: 'image/*' },
  { value: 'video', label: 'Vídeo',  icon: <Video className="h-3.5 w-3.5" />, accept: 'video/*' },
  { value: 'audio', label: 'Áudio',  icon: <Mic   className="h-3.5 w-3.5" />, accept: 'audio/*' },
];

const SEQ_DELAY_OPTIONS = [
  { label: '5 segundos',  value: 5_000 },
  { label: '10 segundos', value: 10_000 },
  { label: '30 segundos', value: 30_000 },
  { label: '1 minuto',    value: 60_000 },
  { label: '2 minutos',   value: 120_000 },
  { label: '5 minutos',   value: 300_000 },
];

const DEFAULT_SEQ_DELAY = 30_000;

function mediaIcon(type?: MediaType | null) {
  if (type === 'image') return <Image className="h-3 w-3" />;
  if (type === 'video') return <Video className="h-3 w-3" />;
  if (type === 'audio') return <Mic   className="h-3 w-3" />;
  return null;
}
function mediaLabel(type?: MediaType | null) {
  if (type === 'image') return 'Imagem';
  if (type === 'video') return 'Vídeo';
  if (type === 'audio') return 'Áudio';
  return null;
}
function delayLabel(ms: number) {
  return SEQ_DELAY_OPTIONS.find(o => o.value === ms)?.label ?? `${ms / 1000}s`;
}

// ── Message form state ────────────────────────────────────────────────────────

interface MsgForm {
  body: string;
  mediaType: MediaType | '';
  mediaUrl: string;
  delay_before_ms: number; // used for index > 0
}

function emptyMsg(delay = DEFAULT_SEQ_DELAY): MsgForm {
  return { body: '', mediaType: '', mediaUrl: '', delay_before_ms: delay };
}

interface FormState {
  name: string;
  messages: MsgForm[];
}

const EMPTY_FORM: FormState = { name: '', messages: [emptyMsg()] };

// ── Helpers ───────────────────────────────────────────────────────────────────

function insertAtCursor(el: HTMLTextAreaElement | null, text: string, current: string): { next: string; cursor: number } {
  const pos = el?.selectionStart ?? current.length;
  const next = current.slice(0, pos) + text + current.slice(pos);
  return { next, cursor: pos + text.length };
}

function formToMessages(msgs: MsgForm[]): TemplateMessage[] {
  return msgs.map((m, i) => ({
    body: m.body.trim(),
    media_type: (m.mediaType as MediaType) || null,
    media_url: m.mediaType ? m.mediaUrl.trim() || null : null,
    ...(i > 0 ? { delay_before_ms: m.delay_before_ms } : {}),
  }));
}

function templateToForm(t: QuickTemplate): FormState {
  if (t.messages && t.messages.length > 0) {
    return {
      name: t.name,
      messages: t.messages.map((m, i) => ({
        body: m.body,
        mediaType: (m.media_type as MediaType) ?? '',
        mediaUrl: m.media_url ?? '',
        delay_before_ms: i > 0 ? (m.delay_before_ms ?? DEFAULT_SEQ_DELAY) : DEFAULT_SEQ_DELAY,
      })),
    };
  }
  return {
    name: t.name,
    messages: [{
      body: t.body,
      mediaType: (t.media_type as MediaType) ?? '',
      mediaUrl: t.media_url ?? '',
      delay_before_ms: DEFAULT_SEQ_DELAY,
    }],
  };
}

// ── Single message card ───────────────────────────────────────────────────────

interface MsgCardProps {
  index: number;
  total: number;
  msg: MsgForm;
  uploading: boolean;
  onChange: (updated: MsgForm) => void;
  onRemove: () => void;
  onUpload: (file: File, index: number) => void;
}

function MsgCard({ index, total, msg, uploading, onChange, onRemove, onUpload }: MsgCardProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function insertVar(v: string) {
    const { next, cursor } = insertAtCursor(textareaRef.current, v, msg.body);
    onChange({ ...msg, body: next });
    setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(cursor, cursor);
    }, 0);
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Card header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <GripVertical className="h-3.5 w-3.5 opacity-40" />
          Mensagem {index + 1}
        </div>
        {total > 1 && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-lg p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
            aria-label="Remover mensagem"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="space-y-3 p-4">
        {/* Variable hints */}
        <div className="flex flex-wrap gap-1.5">
          {VARIABLE_HINTS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => insertVar(v)}
              className="rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors"
            >
              {v}
            </button>
          ))}
        </div>

        {/* Body */}
        <Textarea
          ref={textareaRef}
          value={msg.body}
          onChange={(e) => onChange({ ...msg, body: e.target.value })}
          placeholder={index === 0 ? 'Olá, {{nome}}! Aqui é a equipe…' : 'Mensagem de acompanhamento…'}
          rows={4}
          className="resize-none font-mono text-sm"
        />

        {/* Media */}
        <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Mídia (opcional)</span>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => onChange({ ...msg, mediaType: '', mediaUrl: '' })}
              className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all ${
                !msg.mediaType ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40'
              }`}
            >
              Nenhuma
            </button>
            {MEDIA_OPTS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChange({ ...msg, mediaType: opt.value })}
                className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all ${
                  msg.mediaType === opt.value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40'
                }`}
              >
                {opt.icon}{opt.label}
              </button>
            ))}
          </div>

          {msg.mediaType && (
            <div className="flex gap-2 pt-1">
              <div className="relative flex-1">
                <Link2 className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={msg.mediaUrl}
                  onChange={(e) => onChange({ ...msg, mediaUrl: e.target.value })}
                  placeholder="https://…"
                  className="pl-8 text-sm"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Upload
              </Button>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept={MEDIA_OPTS.find(o => o.value === msg.mediaType)?.accept}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onUpload(file, index);
                  e.target.value = '';
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Delay separator between messages ─────────────────────────────────────────

interface DelaySepProps {
  value: number;
  onChange: (v: number) => void;
}

function DelaySep({ value, onChange }: DelaySepProps) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="h-px flex-1 border-t border-dashed border-border" />
      <div className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Aguardar</span>
        <div className="relative">
          <select
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="appearance-none rounded-md bg-transparent pr-5 text-xs font-semibold text-foreground outline-none"
          >
            {SEQ_DELAY_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-0 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>
      <div className="h-px flex-1 border-t border-dashed border-border" />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function QuickTemplateManager() {
  const supabase = createClient();
  const { accountId } = useAuth();

  const [templates, setTemplates] = useState<QuickTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<QuickTemplate | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('quick_templates')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) toast.error('Falha ao carregar templates');
    else setTemplates((data as QuickTemplate[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function openNew() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(t: QuickTemplate) {
    setEditingId(t.id);
    setForm(templateToForm(t));
    setDialogOpen(true);
  }

  function updateMsg(index: number, updated: MsgForm) {
    setForm(f => {
      const msgs = [...f.messages];
      msgs[index] = updated;
      return { ...f, messages: msgs };
    });
  }

  function addMsg() {
    setForm(f => ({ ...f, messages: [...f.messages, emptyMsg()] }));
  }

  function removeMsg(index: number) {
    setForm(f => ({ ...f, messages: f.messages.filter((_, i) => i !== index) }));
  }

  function updateDelay(index: number, ms: number) {
    setForm(f => {
      const msgs = [...f.messages];
      msgs[index] = { ...msgs[index], delay_before_ms: ms };
      return { ...f, messages: msgs };
    });
  }

  async function handleUpload(file: File, msgIndex: number) {
    if (!accountId) { toast.error('Conta não identificada'); return; }
    setUploading(true);
    const ext = file.name.split('.').pop() ?? 'bin';
    const path = `account-${accountId}/quick-templates/${Date.now()}_${msgIndex}.${ext}`;
    const { error } = await supabase.storage.from('chat-media').upload(path, file, { upsert: false });
    if (error) { toast.error('Falha no upload: ' + error.message); setUploading(false); return; }
    const { data: pub } = supabase.storage.from('chat-media').getPublicUrl(path);
    updateMsg(msgIndex, { ...form.messages[msgIndex], mediaUrl: pub.publicUrl });
    setUploading(false);
    toast.success('Arquivo enviado');
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Nome é obrigatório'); return; }
    for (const [i, m] of form.messages.entries()) {
      if (!m.body.trim()) { toast.error(`Mensagem ${i + 1} não pode estar vazia`); return; }
      if (m.mediaType && !m.mediaUrl.trim()) { toast.error(`Informe a URL ou faça upload da mídia da mensagem ${i + 1}`); return; }
    }
    if (!accountId) { toast.error('Conta não identificada'); return; }

    const messages = formToMessages(form.messages);
    const firstMsg = messages[0];

    const payload = {
      name: form.name.trim(),
      body: firstMsg.body,
      media_type: firstMsg.media_type ?? null,
      media_url: firstMsg.media_url ?? null,
      messages: messages.length > 1 ? messages : null,
      updated_at: new Date().toISOString(),
    };

    setSaving(true);
    if (editingId) {
      const { error } = await supabase.from('quick_templates').update(payload).eq('id', editingId);
      if (error) { toast.error('Falha ao atualizar template'); setSaving(false); return; }
      toast.success('Template atualizado');
    } else {
      const { error } = await supabase.from('quick_templates').insert({ ...payload, account_id: accountId });
      if (error) { toast.error('Falha ao criar template'); setSaving(false); return; }
      toast.success('Template criado');
    }
    setSaving(false);
    setDialogOpen(false);
    load();
  }

  async function handleDelete(t: QuickTemplate) {
    setDeleting(t.id);
    const { error } = await supabase.from('quick_templates').delete().eq('id', t.id);
    setDeleting(null);
    setConfirmDelete(null);
    if (error) toast.error('Falha ao excluir template');
    else { toast.success('Template excluído'); load(); }
  }

  function msgCount(t: QuickTemplate) {
    if (t.messages && t.messages.length > 1) return t.messages.length;
    return 1;
  }

  return (
    <div className="space-y-6">
      <SettingsPanelHead
        title="Templates Rápidos"
        description="Mensagens modelo para disparos via API não oficial do WhatsApp. Crie sequências com múltiplas mensagens e delays configuráveis entre elas."
        action={
          <Button size="sm" onClick={openNew} className="gap-1.5">
            <Plus className="h-4 w-4" /> Novo template
          </Button>
        }
      />

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : templates.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border">
          <FileText className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">Nenhum template ainda</p>
          <p className="text-xs text-muted-foreground">Crie o primeiro template rápido para usar nos disparos.</p>
          <Button size="sm" variant="outline" onClick={openNew} className="mt-2 gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Criar template
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => {
            const count = msgCount(t);
            return (
              <div key={t.id} className="flex items-start gap-4 rounded-xl border border-border bg-card p-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-foreground">{t.name}</p>
                    {count > 1 && (
                      <span className="flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[10px] font-medium text-primary">
                        {count} mensagens
                      </span>
                    )}
                    {t.media_type && (
                      <span className="flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {mediaIcon(t.media_type as MediaType)}{mediaLabel(t.media_type as MediaType)}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap">{t.body}</p>
                  {count > 1 && t.messages && (
                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                      {t.messages.slice(1).map((m, i) => (
                        <span key={i} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {delayLabel(m.delay_before_ms ?? DEFAULT_SEQ_DELAY)}
                          <span className="rounded bg-muted px-1.5 py-0.5">msg {i + 2}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button type="button" onClick={() => openEdit(t)}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" aria-label="Editar">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(t)} disabled={deleting === t.id}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-400 transition-colors disabled:opacity-40" aria-label="Excluir">
                    {deleting === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) setDialogOpen(false); }}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar template' : 'Novo template rápido'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="qt-name">Nome <span className="text-primary">*</span></Label>
              <Input
                id="qt-name"
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="ex: Boas-vindas, Follow-up, Proposta…"
              />
            </div>

            {/* Message sequence */}
            <div className="space-y-0">
              {form.messages.map((msg, i) => (
                <div key={i}>
                  {/* Delay separator (before every message except the first) */}
                  {i > 0 && (
                    <DelaySep
                      value={msg.delay_before_ms}
                      onChange={(v) => updateDelay(i, v)}
                    />
                  )}
                  <MsgCard
                    index={i}
                    total={form.messages.length}
                    msg={msg}
                    uploading={uploading}
                    onChange={(updated) => updateMsg(i, updated)}
                    onRemove={() => removeMsg(i)}
                    onUpload={handleUpload}
                  />
                </div>
              ))}
            </div>

            {/* Add message */}
            <button
              type="button"
              onClick={addMsg}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-sm font-medium text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
            >
              <Plus className="h-4 w-4" />
              Adicionar mensagem à sequência
            </button>

            {/* Info */}
            <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                Cada mensagem é enviada em sequência para o mesmo contato antes de avançar para o próximo. Use <strong className="text-foreground">{'{{nome}}'}</strong>, <strong className="text-foreground">{'{{telefone}}'}</strong> e <strong className="text-foreground">{'{{empresa}}'}</strong> em qualquer mensagem.
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || uploading || !form.name.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingId ? 'Salvar alterações' : 'Criar template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!confirmDelete} onOpenChange={(v) => { if (!v) setConfirmDelete(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Excluir template</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja excluir <strong className="text-foreground">{confirmDelete?.name}</strong>? Esta ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => confirmDelete && handleDelete(confirmDelete)} disabled={!!deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
