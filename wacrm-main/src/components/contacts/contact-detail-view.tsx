'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { formatCurrency } from '@/lib/currency';
import { toast } from 'sonner';
import type { Contact, ContactNote, CustomField, Deal, TrackingLink } from '@/types';
import { CustomFieldInput } from '@/components/shared/custom-field-input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Phone,
  Mail,
  Building2,
  Copy,
  Check,
  Loader2,
  Plus,
  Trash2,
  Save,
  DollarSign,
  Briefcase,
  FileText,
  SlidersHorizontal,
  TrendingUp,
  TrendingDown,
  Tag as TagIcon,
  CalendarDays,
  CalendarPlus,
  Megaphone,
} from 'lucide-react';
import { ScheduleEventModal } from '@/components/calendar/schedule-event-modal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface ContactDetailViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string | null;
  onUpdated: () => void;
}

export interface ContactDetailContentProps {
  contactId: string;
  onUpdated: () => void;
  onWhatsApp?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(name?: string | null) {
  if (!name) return '?';
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

function dealStatusMeta(deal: Deal) {
  const role = (deal as Deal & { stage?: { fixed_role?: string } }).stage?.fixed_role;
  if (role === 'won')  return { label: 'Ganho',   color: '#22c55e', Icon: TrendingUp };
  if (role === 'lost') return { label: 'Perdido',  color: '#ef4444', Icon: TrendingDown };
  if (deal.status === 'won')  return { label: 'Ganho',   color: '#22c55e', Icon: TrendingUp };
  if (deal.status === 'lost') return { label: 'Perdido',  color: '#ef4444', Icon: TrendingDown };
  return null;
}

// ---------------------------------------------------------------------------
// ContactDetailContent — inner panel, usable standalone or embedded
// ---------------------------------------------------------------------------

export function ContactDetailContent({ contactId, onUpdated, onWhatsApp }: ContactDetailContentProps) {
  const supabase = createClient();
  const { accountId, defaultCurrency } = useAuth();

  const [contact, setContact] = useState<Contact | null>(null);
  const [trackingLink, setTrackingLink] = useState<TrackingLink | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);
const [showScheduleModal, setShowScheduleModal] = useState(false);

  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);

  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [contactTagIds, setContactTagIds] = useState<string[]>([]);
  const [savingTags, setSavingTags] = useState(false);

  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [loadingNotes, setLoadingNotes] = useState(false);

  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [savingCustom, setSavingCustom] = useState(false);
  const [loadingCustom, setLoadingCustom] = useState(false);

  const [deals, setDeals] = useState<Deal[]>([]);
  const [loadingDeals, setLoadingDeals] = useState(false);

  // ── Fetchers ──────────────────────────────────────────────────────────────

  const fetchContact = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('contacts').select('*').eq('id', contactId).single();
    if (data) {
      setContact(data);
      setEditName(data.name ?? '');
      setEditPhone(data.phone);
      setEditEmail(data.email ?? '');
      setEditCompany(data.company ?? '');
      if (data.tracking_link_id) {
        const { data: tlData } = await supabase.from('tracking_links').select('*').eq('id', data.tracking_link_id).single();
        setTrackingLink(tlData ?? null);
      } else {
        setTrackingLink(null);
      }
    }
    setLoading(false);
  }, [contactId, supabase]);

  const fetchTags = useCallback(async () => {
    const [tagsRes, contactTagsRes] = await Promise.all([
      supabase.from('tags').select('*').order('name'),
      supabase.from('contact_tags').select('tag_id').eq('contact_id', contactId),
    ]);
    if (tagsRes.data) setAllTags(tagsRes.data);
    if (contactTagsRes.data) setContactTagIds(contactTagsRes.data.map((ct) => ct.tag_id));
  }, [contactId, supabase]);

  const fetchNotes = useCallback(async () => {
    setLoadingNotes(true);
    const { data } = await supabase
      .from('contact_notes')
      .select('*')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false });
    if (data) setNotes(data);
    setLoadingNotes(false);
  }, [contactId, supabase]);

  const fetchCustomFields = useCallback(async () => {
    setLoadingCustom(true);
    const [fieldsRes, valuesRes] = await Promise.all([
      supabase.from('custom_fields').select('*').eq('entity_type', 'contact').order('field_name'),
      supabase.from('contact_custom_values').select('*').eq('contact_id', contactId),
    ]);
    if (fieldsRes.data) setCustomFields(fieldsRes.data as CustomField[]);
    if (valuesRes.data) {
      const map: Record<string, string> = {};
      valuesRes.data.forEach((v) => { map[v.custom_field_id] = v.value ?? ''; });
      setCustomValues(map);
    }
    setLoadingCustom(false);
  }, [contactId, supabase]);

  const fetchDeals = useCallback(async () => {
    setLoadingDeals(true);
    const { data } = await supabase
      .from('deals')
      .select('*, stage:pipeline_stages(*)')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false });
    setDeals((data ?? []) as Deal[]);
    setLoadingDeals(false);
  }, [contactId, supabase]);

  useEffect(() => {
    fetchContact();
    fetchTags();
    fetchNotes();
    fetchCustomFields();
    fetchDeals();
  }, [fetchContact, fetchTags, fetchNotes, fetchCustomFields, fetchDeals]);

  // ── Actions ───────────────────────────────────────────────────────────────

  async function copyPhone() {
    if (!contact) return;
    await navigator.clipboard.writeText(contact.phone);
    setCopiedPhone(true);
    setTimeout(() => setCopiedPhone(false), 2000);
  }

  async function saveDetails() {
    if (!editPhone.trim()) {
      toast.error('Número de telefone é obrigatório');
      return;
    }
    setSavingDetails(true);
    const res = await fetch(`/api/contacts/${contactId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: editName.trim() || null,
        phone: editPhone.trim(),
        email: editEmail.trim() || null,
        company: editCompany.trim() || null,
      }),
    });
    if (!res.ok) {
      toast.error('Falha ao atualizar contato');
    } else {
      toast.success('Contato atualizado');
      fetchContact();
      onUpdated();
    }
    setSavingDetails(false);
  }

  async function toggleTag(tagId: string) {
    setSavingTags(true);
    const isSelected = contactTagIds.includes(tagId);
    const method = isSelected ? 'DELETE' : 'POST';
    const res = await fetch(`/api/contacts/${contactId}/tags`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tag_id: tagId }),
    });
    if (res.ok) {
      setContactTagIds((prev) =>
        isSelected ? prev.filter((id) => id !== tagId) : [...prev, tagId]
      );
      onUpdated();
    }
    setSavingTags(false);
  }

  async function addNote() {
    if (!newNote.trim()) return;
    setSavingNote(true);
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user || !accountId) { toast.error('Não autenticado'); setSavingNote(false); return; }
    const { error } = await supabase.from('contact_notes').insert({
      contact_id: contactId,
      account_id: accountId,
      user_id: user.id,
      note_text: newNote.trim(),
    });
    if (error) { toast.error('Falha ao adicionar nota'); }
    else { setNewNote(''); fetchNotes(); toast.success('Nota adicionada'); }
    setSavingNote(false);
  }

  async function deleteNote(noteId: string) {
    const { error } = await supabase.from('contact_notes').delete().eq('id', noteId);
    if (error) toast.error('Falha ao excluir nota');
    else { setNotes((prev) => prev.filter((n) => n.id !== noteId)); toast.success('Nota excluída'); }
  }

  async function saveCustomFields() {
    setSavingCustom(true);
    try {
      await supabase.from('contact_custom_values').delete().eq('contact_id', contactId);
      const rows = Object.entries(customValues)
        .filter(([, val]) => val.trim())
        .map(([fieldId, val]) => ({ contact_id: contactId, custom_field_id: fieldId, value: val.trim() }));
      if (rows.length > 0) {
        const { error } = await supabase.from('contact_custom_values').insert(rows);
        if (error) throw error;
      }
      toast.success('Campos personalizados salvos');
    } catch { toast.error('Falha ao salvar campos personalizados'); }
    setSavingCustom(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading || !contact) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-border/60 shrink-0">
        <div className="flex items-center gap-4">
          <Avatar className="size-14 shrink-0">
            <AvatarFallback className="bg-primary/15 text-primary text-base font-semibold">
              {getInitials(contact.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-foreground text-base font-semibold truncate leading-tight">
                {contact.name || 'Desconhecido'}
              </p>
              {onWhatsApp && (
                <button
                  type="button"
                  onClick={onWhatsApp}
                  title="Abrir conversa no WhatsApp"
                  className="shrink-0 flex items-center justify-center rounded-full p-1 text-[#25D366] hover:bg-[#25D366]/10 transition-colors"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
                  </svg>
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowScheduleModal(true)}
                title="Agendar evento"
                className="shrink-0 flex items-center justify-center rounded-full p-1 text-primary hover:bg-primary/10 transition-colors"
              >
                <CalendarPlus className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
              <button
                onClick={copyPhone}
                className="group flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                <Phone className="size-3 shrink-0" />
                <span>{contact.phone}</span>
                {copiedPhone
                  ? <Check className="size-3 text-primary" />
                  : <Copy className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                }
              </button>
              {contact.email && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Mail className="size-3 shrink-0" />
                  <span className="truncate max-w-[160px]">{contact.email}</span>
                </span>
              )}
              {contact.company && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Building2 className="size-3 shrink-0" />
                  <span className="truncate max-w-[140px]">{contact.company}</span>
                </span>
              )}
              {trackingLink && (
                <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
                  <Megaphone className="size-3 shrink-0" />
                  <span className="truncate max-w-[160px]">{trackingLink.name}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Inner tabs */}
      <Tabs defaultValue="details" className="flex flex-col flex-1 min-h-0">
        <div className="border-b border-border/60 shrink-0">
          <TabsList className="bg-transparent h-10 gap-0 w-full rounded-none px-0">
            {[
              { value: 'details', label: 'Detalhes' },
              { value: 'tags',    label: 'Tags' },
              { value: 'notes',   label: 'Notas' },
              { value: 'custom',  label: 'Personalizados' },
              { value: 'deals',   label: 'Negócios' },
            ].map(({ value, label }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="flex-1 rounded-none h-10 px-1 text-xs font-medium text-muted-foreground whitespace-nowrap
                  border-b-2 border-transparent
                  data-[state=active]:border-primary data-[state=active]:text-primary
                  hover:text-foreground transition-colors bg-transparent"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* Detalhes */}
        <TabsContent value="details" className="flex-1 overflow-y-auto px-5 py-4 mt-0">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Nome</Label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)}
                  className="bg-muted/60 border-border text-foreground h-9 text-sm" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">
                  Telefone <span className="text-red-400">*</span>
                </Label>
                <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)}
                  className="bg-muted/60 border-border text-foreground h-9 text-sm" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">E-mail</Label>
                <Input value={editEmail} onChange={(e) => setEditEmail(e.target.value)}
                  className="bg-muted/60 border-border text-foreground h-9 text-sm" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Empresa</Label>
                <Input value={editCompany} onChange={(e) => setEditCompany(e.target.value)}
                  className="bg-muted/60 border-border text-foreground h-9 text-sm" />
              </div>
            </div>
            <Button onClick={saveDetails} disabled={savingDetails}
              className="bg-primary hover:bg-primary/90 text-primary-foreground w-full" size="sm">
              {savingDetails ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              Salvar Alterações
            </Button>
          </div>
        </TabsContent>

        {/* Tags */}
        <TabsContent value="tags" className="flex-1 overflow-y-auto px-5 py-4 mt-0">
          {allTags.length === 0 ? (
            <EmptyState
              icon={<TagIcon className="size-8 text-muted-foreground/40" />}
              title="Nenhuma tag disponível"
              description="Crie tags em Configurações para organizar seus contatos."
            />
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Clique para adicionar ou remover uma tag deste contato.
              </p>
              <div className="flex flex-wrap gap-2">
                {allTags.map((tag) => {
                  const selected = contactTagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => toggleTag(tag.id)}
                      disabled={savingTags}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all cursor-pointer ${
                        selected ? 'ring-2 ring-offset-1 ring-offset-popover shadow-sm' : 'opacity-50 hover:opacity-80'
                      }`}
                      style={{ backgroundColor: tag.color + '22', color: tag.color }}
                    >
                      {selected && <Check className="size-3" />}
                      <span className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </TabsContent>

        {/* Notas */}
        <TabsContent value="notes" className="flex-1 flex flex-col min-h-0 px-5 py-4 mt-0 gap-3">
          <div className="space-y-2 shrink-0">
            <Textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Escreva uma nota..."
              className="bg-muted/60 border-border text-foreground placeholder:text-muted-foreground min-h-[72px] text-sm resize-none"
            />
            <Button onClick={addNote} disabled={!newNote.trim() || savingNote}
              className="bg-primary hover:bg-primary/90 text-primary-foreground w-full" size="sm">
              {savingNote ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              Adicionar Nota
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2">
            {loadingNotes ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : notes.length === 0 ? (
              <EmptyState
                icon={<FileText className="size-8 text-muted-foreground/40" />}
                title="Nenhuma nota ainda"
                description="Adicione notas para registrar informações importantes sobre este contato."
              />
            ) : (
              notes.map((note) => (
                <div key={note.id} className="rounded-lg bg-muted/40 border border-border/50 p-3 group">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-foreground/80 whitespace-pre-wrap flex-1 leading-relaxed">
                      {note.note_text}
                    </p>
                    <button
                      onClick={() => deleteNote(note.id)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all cursor-pointer shrink-0 mt-0.5"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground/60 mt-2 flex items-center gap-1">
                    <CalendarDays className="size-3" />
                    {new Date(note.created_at).toLocaleDateString('pt-BR', {
                      day: 'numeric', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        {/* Campos personalizados */}
        <TabsContent value="custom" className="flex-1 overflow-y-auto px-5 py-4 mt-0">
          {loadingCustom ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : customFields.length === 0 ? (
            <EmptyState
              icon={<SlidersHorizontal className="size-8 text-muted-foreground/40" />}
              title="Nenhum campo personalizado"
              description="Crie campos em Configurações → Campos Personalizados."
            />
          ) : (
            <div className="space-y-4">
              {customFields.map((field) => (
                <div key={field.id} className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground capitalize">
                    {field.field_name}
                  </Label>
                  <CustomFieldInput
                    field={field}
                    value={customValues[field.id] ?? ''}
                    onChange={(val) => setCustomValues((prev) => ({ ...prev, [field.id]: val }))}
                  />
                </div>
              ))}
              <Button onClick={saveCustomFields} disabled={savingCustom}
                className="bg-primary hover:bg-primary/90 text-primary-foreground w-full" size="sm">
                {savingCustom ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                Salvar Campos
              </Button>
            </div>
          )}
        </TabsContent>

        {/* Negócios */}
        <TabsContent value="deals" className="flex-1 overflow-y-auto px-5 py-4 mt-0">
          {loadingDeals ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-primary" />
            </div>
          ) : deals.length === 0 ? (
            <EmptyState
              icon={<Briefcase className="size-8 text-muted-foreground/40" />}
              title="Nenhum negócio"
              description="Este contato ainda não tem negócios associados na pipeline."
            />
          ) : (
            <div className="space-y-2">
              {deals.map((deal) => {
                const statusMeta = dealStatusMeta(deal);
                const stage = (deal as Deal & { stage?: { name: string; color: string } }).stage;
                return (
                  <DealCard
                    key={deal.id}
                    title={deal.title}
                    value={formatCurrency(deal.value ?? 0, deal.currency || defaultCurrency)}
                    stage={stage}
                    statusMeta={statusMeta}
                    createdAt={deal.created_at}
                  />
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ScheduleEventModal
        open={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        contactId={contactId}
        contactName={contact?.name ?? undefined}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ContactDetailView — Sheet wrapper (standalone use)
// ---------------------------------------------------------------------------

export function ContactDetailView({
  open,
  onOpenChange,
  contactId,
  onUpdated,
}: ContactDetailViewProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="bg-popover border-border text-popover-foreground sm:max-w-2xl w-full p-0 flex flex-col"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Detalhes do contato</SheetTitle>
          <SheetDescription>Veja e edite as informações deste contato.</SheetDescription>
        </SheetHeader>
        {open && contactId && (
          <ContactDetailContent contactId={contactId} onUpdated={onUpdated} />
        )}
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <div className="mb-1">{icon}</div>
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <p className="text-xs text-muted-foreground/70 max-w-[220px] leading-relaxed">{description}</p>
    </div>
  );
}

function DealCard({
  title,
  value,
  stage,
  statusMeta,
  createdAt,
}: {
  title: string;
  value: string;
  stage?: { name: string; color: string } | null;
  statusMeta: { label: string; color: string; Icon: React.ElementType } | null;
  createdAt?: string | null;
}) {
  const stageColor = stage?.color ?? '#6b7280';

  return (
    <div
      className="rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors overflow-hidden"
      style={{ borderLeftColor: stageColor, borderLeftWidth: 3 }}
    >
      <div className="px-3 py-2.5">
        <div className="flex items-start justify-between gap-2 mb-2">
          <p className="text-sm font-medium text-foreground leading-snug flex-1">{title}</p>
          {stage && (
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{ backgroundColor: `${stageColor}22`, color: stageColor }}
            >
              {stage.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <DollarSign className="size-3" />
            {value}
          </span>
          {statusMeta && (
            <span className="flex items-center gap-0.5 ml-1 font-medium" style={{ color: statusMeta.color }}>
              <statusMeta.Icon className="size-3" />
              {statusMeta.label}
            </span>
          )}
          {createdAt && (
            <span className="ml-auto flex items-center gap-1 text-muted-foreground/60">
              <CalendarDays className="size-3" />
              {new Date(createdAt).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
