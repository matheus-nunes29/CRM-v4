'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { formatCurrency } from '@/lib/currency';
import { toast } from 'sonner';
import type { Contact, ContactNote, CustomField, Deal, TrackingLink, PatientRecord, PatientRecordProduct, PatientRecordPhoto } from '@/types';
import { CustomFieldInput } from '@/components/shared/custom-field-input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
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
  ChevronDown,
  Package,
  ShoppingCart,
  TrendingDown,
  Tag as TagIcon,
  CalendarDays,
  CalendarPlus,
  Megaphone,
  Stethoscope,
  ImagePlus,
  X,
  Syringe,
  ShieldAlert,
} from 'lucide-react';
import { ScheduleEventModal } from '@/components/calendar/schedule-event-modal';
import {
  uploadPatientRecordPhoto,
  getPatientRecordPhotoSignedUrls,
  PATIENT_RECORD_MEDIA_BUCKET,
} from '@/lib/storage/patient-record-media';
import { deleteAccountMedia } from '@/lib/storage/upload-media';

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
  const { accountId, defaultCurrency, hasFeature } = useAuth();

  const [contact, setContact] = useState<Contact | null>(null);
  const [trackingLink, setTrackingLink] = useState<TrackingLink | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);
const [showScheduleModal, setShowScheduleModal] = useState(false);

  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [editAssignedTo, setEditAssignedTo] = useState<string>('');
  const [savingDetails, setSavingDetails] = useState(false);

  const [members, setMembers] = useState<{ user_id: string; full_name: string }[]>([]);

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

  type DealItem = { id: string; name: string; price: number; quantity: number; product: { type: 'product' | 'service' } | null }
  type DealWithItems = Deal & { stage?: { name: string; color: string } | null; items?: DealItem[] }
  const [deals, setDeals] = useState<DealWithItems[]>([]);
  const [loadingDeals, setLoadingDeals] = useState(false);

  // ── Prontuário (patient records) ────────────────────────────────────────
  const [professionals, setProfessionals] = useState<{ id: string; full_name: string }[]>([]);
  const [patientRecords, setPatientRecords] = useState<PatientRecord[]>([]);
  const [loadingPatientRecords, setLoadingPatientRecords] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  const [recordDialogOpen, setRecordDialogOpen] = useState(false);
  const [savingRecord, setSavingRecord] = useState(false);
  const emptyRecordForm = () => ({
    occurredAt: new Date().toISOString().slice(0, 16), // datetime-local value
    professionalId: '',
    dealId: '',
    procedureDescription: '',
    treatedArea: '',
    observations: '',
    nextSessionAt: '',
    products: [] as PatientRecordProduct[],
    photos: [] as (PatientRecordPhoto & { previewUrl: string })[],
  });
  const [recordForm, setRecordForm] = useState(emptyRecordForm());
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // ── Fetchers ──────────────────────────────────────────────────────────────

  const fetchContact = useCallback(async () => {
    setLoading(true);
    const [contactRes, membersRes] = await Promise.all([
      supabase.from('contacts').select('*').eq('id', contactId).single(),
      supabase.from('profiles').select('user_id, full_name').order('full_name'),
    ]);
    if (contactRes.data) {
      const data = contactRes.data;
      setContact(data);
      setEditName(data.name ?? '');
      setEditPhone(data.phone);
      setEditEmail(data.email ?? '');
      setEditCompany(data.company ?? '');
      setEditAssignedTo(data.assigned_to ?? '');
      if (data.tracking_link_id) {
        const { data: tlData } = await supabase.from('tracking_links').select('*').eq('id', data.tracking_link_id).single();
        setTrackingLink(tlData ?? null);
      } else {
        setTrackingLink(null);
      }
    }
    if (membersRes.data) setMembers(membersRes.data as { user_id: string; full_name: string }[]);
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
      .select('*, stage:pipeline_stages(id,name,color), items:deal_items(id,name,price,quantity,product:products(type))')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false });
    setDeals((data ?? []) as DealWithItems[]);
    setLoadingDeals(false);
  }, [contactId, supabase]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchPatientRecords = useCallback(async () => {
    setLoadingPatientRecords(true);
    const [recordsRes, professionalsRes] = await Promise.all([
      supabase
        .from('patient_records')
        .select('*')
        .eq('contact_id', contactId)
        .order('occurred_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name').order('full_name'),
    ]);
    const records = (recordsRes.data ?? []) as PatientRecord[];
    setPatientRecords(records);
    if (professionalsRes.data) setProfessionals(professionalsRes.data as { id: string; full_name: string }[]);

    const allPaths = records.flatMap((r) => (r.photos ?? []).map((p) => p.path));
    if (allPaths.length > 0) {
      const urls = await getPatientRecordPhotoSignedUrls(allPaths);
      setPhotoUrls(urls);
    }
    setLoadingPatientRecords(false);
  }, [contactId, supabase]);

  useEffect(() => {
    fetchContact();
    fetchTags();
    fetchNotes();
    fetchCustomFields();
    fetchDeals();
    fetchPatientRecords();
  }, [fetchContact, fetchTags, fetchNotes, fetchCustomFields, fetchDeals, fetchPatientRecords]);

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
        assigned_to: editAssignedTo || null,
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

  // ── Prontuário actions ───────────────────────────────────────────────────

  function addProductRow() {
    setRecordForm((prev) => ({
      ...prev,
      products: [...prev.products, { name: '', lot: '', expiration: '', quantity: '' }],
    }));
  }

  function updateProductRow(index: number, field: keyof PatientRecordProduct, value: string) {
    setRecordForm((prev) => ({
      ...prev,
      products: prev.products.map((p, i) => (i === index ? { ...p, [field]: value } : p)),
    }));
  }

  // Sets product_id/lot_id alongside the display snapshot (name/lot/
  // expiration) when a stock-tracked product+lot is picked — see
  // StockProductPicker below. This is what makes 056's trigger fire an
  // automatic stock deduction on save; rows without these two ids keep
  // behaving exactly like the old free-text flow.
  function selectStockLotForRow(
    index: number,
    selection: { name: string; lot: string; expiration: string; product_id: string; lot_id: string },
  ) {
    setRecordForm((prev) => ({
      ...prev,
      products: prev.products.map((p, i) =>
        i === index
          ? {
              ...p,
              name: selection.name,
              lot: selection.lot,
              expiration: selection.expiration,
              product_id: selection.product_id,
              lot_id: selection.lot_id,
            }
          : p,
      ),
    }));
  }

  function removeProductRow(index: number) {
    setRecordForm((prev) => ({ ...prev, products: prev.products.filter((_, i) => i !== index) }));
  }

  async function handlePhotoPicked(file: File | undefined, type: 'before' | 'after') {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Foto muito grande (máx. 5MB)');
      return;
    }
    setUploadingPhoto(true);
    try {
      const { path } = await uploadPatientRecordPhoto(file);
      const previewUrl = URL.createObjectURL(file);
      setRecordForm((prev) => ({
        ...prev,
        photos: [...prev.photos, { path, type, marketing_consent: false, previewUrl }],
      }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao enviar foto');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function removeRecordPhoto(index: number) {
    const photo = recordForm.photos[index];
    setRecordForm((prev) => ({ ...prev, photos: prev.photos.filter((_, i) => i !== index) }));
    try {
      await deleteAccountMedia(PATIENT_RECORD_MEDIA_BUCKET, photo.path);
    } catch {
      // best-effort GC — an orphaned staged photo is a storage nit, not user-facing
    }
  }

  function togglePhotoConsent(index: number) {
    setRecordForm((prev) => ({
      ...prev,
      photos: prev.photos.map((p, i) => (i === index ? { ...p, marketing_consent: !p.marketing_consent } : p)),
    }));
  }

  async function saveRecord() {
    if (!recordForm.procedureDescription.trim()) {
      toast.error('Descreva o procedimento realizado');
      return;
    }
    if (!accountId) {
      toast.error('Não autenticado');
      return;
    }
    setSavingRecord(true);
    const { error } = await supabase.from('patient_records').insert({
      account_id: accountId,
      contact_id: contactId,
      deal_id: recordForm.dealId || null,
      professional_id: recordForm.professionalId || null,
      occurred_at: new Date(recordForm.occurredAt).toISOString(),
      procedure_description: recordForm.procedureDescription.trim(),
      treated_area: recordForm.treatedArea.trim() || null,
      products_used: recordForm.products.filter((p) => p.name.trim()),
      observations: recordForm.observations.trim() || null,
      next_session_recommended_at: recordForm.nextSessionAt || null,
      photos: recordForm.photos.map(({ path, type, marketing_consent }) => ({ path, type, marketing_consent })),
    });
    if (error) {
      // Estoque insuficiente (056/apply_stock_movement) chega aqui como
      // um erro de banco comum — mensagem dedicada em vez do genérico,
      // já que agora salvar pode falhar por causa do estoque, não só de
      // conexão/validação.
      if (error.message.includes('Estoque insuficiente')) {
        toast.error(error.message);
      } else {
        toast.error('Falha ao salvar evolução');
      }
    } else {
      toast.success('Evolução registrada no prontuário');
      setRecordForm(emptyRecordForm());
      setRecordDialogOpen(false);
      fetchPatientRecords();
    }
    setSavingRecord(false);
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
                <span>{contact.is_group ? "Grupo" : contact.phone}</span>
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
              {contact.created_at && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarDays className="size-3 shrink-0" />
                  <span>
                    {new Date(contact.created_at).toLocaleDateString('pt-BR', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
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
              { value: 'details',    label: 'Detalhes' },
              { value: 'tags',       label: 'Tags' },
              { value: 'notes',      label: 'Notas' },
              { value: 'custom',     label: 'Personalizados' },
              { value: 'deals',      label: 'Negócios' },
              // Gated by the account's enabled_features (050) — only
              // rendered at all for accounts with 'prontuario' switched
              // on, so RLS on patient_records (052) is never even hit
              // for accounts without the module.
              ...(hasFeature('prontuario')
                ? [{ value: 'prontuario', label: 'Prontuário' }]
                : []),
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
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Responsável</Label>
                <div className="relative">
                  <select
                    value={editAssignedTo}
                    onChange={(e) => setEditAssignedTo(e.target.value)}
                    className="h-9 w-full appearance-none rounded-lg border border-border bg-muted/60 px-3 pr-8 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 cursor-pointer"
                  >
                    <option value="">Sem responsável</option>
                    {members.map((m) => (
                      <option key={m.user_id} value={m.user_id}>{m.full_name}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                </div>
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
                return (
                  <DealCard
                    key={deal.id}
                    title={deal.title}
                    value={formatCurrency(deal.value ?? 0, deal.currency || defaultCurrency)}
                    stage={deal.stage}
                    statusMeta={statusMeta}
                    createdAt={deal.created_at}
                    items={deal.items}
                    currency={deal.currency || defaultCurrency}
                  />
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Prontuário — only mounted for accounts with the feature on
            (050/052), so the query is never even attempted for accounts
            without it (RLS on patient_records would block it anyway,
            but this avoids the round trip and any confusing error
            state). */}
        {hasFeature('prontuario') && (
          <TabsContent value="prontuario" className="flex-1 flex flex-col min-h-0 px-5 py-4 mt-0 gap-3">
            <div className="flex items-center justify-between shrink-0 gap-2">
              <p className="text-[11px] text-muted-foreground leading-relaxed flex items-start gap-1.5">
                <ShieldAlert className="size-3.5 shrink-0 mt-0.5 text-amber-500" />
                Registro clínico — cada evolução é permanente e não pode ser editada ou excluída depois de salva.
              </p>
              <Button
                onClick={() => { setRecordForm(emptyRecordForm()); setRecordDialogOpen(true); }}
                size="sm"
                className="bg-primary hover:bg-primary/90 text-primary-foreground shrink-0"
              >
                <Plus className="size-3.5" />
                Nova evolução
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2">
              {loadingPatientRecords ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : patientRecords.length === 0 ? (
                <EmptyState
                  icon={<Stethoscope className="size-8 text-muted-foreground/40" />}
                  title="Nenhuma evolução registrada"
                  description="Registre procedimentos, observações clínicas e fotos de acompanhamento deste paciente."
                />
              ) : (
                patientRecords.map((record) => (
                  <PatientRecordCard
                    key={record.id}
                    record={record}
                    professionalName={professionals.find((p) => p.id === record.professional_id)?.full_name}
                    photoUrls={photoUrls}
                  />
                ))
              )}
            </div>
          </TabsContent>
        )}
      </Tabs>

      {/* Nova evolução */}
      <Dialog open={recordDialogOpen} onOpenChange={setRecordDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-card sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Syringe className="size-4 text-primary" />
              Nova evolução
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              Esse registro entra no prontuário do paciente de forma permanente — revise antes de salvar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Data/hora do atendimento</Label>
                <Input
                  type="datetime-local"
                  value={recordForm.occurredAt}
                  onChange={(e) => setRecordForm((p) => ({ ...p, occurredAt: e.target.value }))}
                  className="bg-muted/60 border-border text-foreground h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Profissional responsável</Label>
                <div className="relative">
                  <select
                    value={recordForm.professionalId}
                    onChange={(e) => setRecordForm((p) => ({ ...p, professionalId: e.target.value }))}
                    className="h-9 w-full appearance-none rounded-lg border border-border bg-muted/60 px-3 pr-8 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 cursor-pointer"
                  >
                    <option value="">Selecionar...</option>
                    {professionals.map((p) => (
                      <option key={p.id} value={p.id}>{p.full_name}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Negócio vinculado (opcional)</Label>
              <div className="relative">
                <select
                  value={recordForm.dealId}
                  onChange={(e) => setRecordForm((p) => ({ ...p, dealId: e.target.value }))}
                  className="h-9 w-full appearance-none rounded-lg border border-border bg-muted/60 px-3 pr-8 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 cursor-pointer"
                >
                  <option value="">Nenhum</option>
                  {deals.map((d) => (
                    <option key={d.id} value={d.id}>{d.title}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                Procedimento realizado <span className="text-red-400">*</span>
              </Label>
              <Textarea
                value={recordForm.procedureDescription}
                onChange={(e) => setRecordForm((p) => ({ ...p, procedureDescription: e.target.value }))}
                placeholder="Ex: Toxina botulínica — terço superior da face"
                className="bg-muted/60 border-border text-foreground placeholder:text-muted-foreground min-h-[60px] text-sm resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Área tratada</Label>
              <Input
                value={recordForm.treatedArea}
                onChange={(e) => setRecordForm((p) => ({ ...p, treatedArea: e.target.value }))}
                placeholder="Ex: Glabela, fronte e pés de galinha"
                className="bg-muted/60 border-border text-foreground h-9 text-sm"
              />
            </div>

            {/* Produtos/lotes */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-muted-foreground">Produtos utilizados (lote/validade)</Label>
                <button type="button" onClick={addProductRow} className="text-xs text-primary hover:underline cursor-pointer">
                  + adicionar
                </button>
              </div>
              {recordForm.products.length > 0 && (
                <div className="space-y-2">
                  {recordForm.products.map((product, i) => (
                    hasFeature('estoque') ? (
                      <div key={i} className="grid grid-cols-[2fr_1fr_auto_auto] gap-1.5 items-center">
                        <StockProductPicker
                          label={product.product_id ? `${product.name} — lote ${product.lot}` : 'Selecionar produto'}
                          onSelect={(selection) => selectStockLotForRow(i, selection)}
                        />
                        <Input
                          type="number"
                          step="any"
                          min="0"
                          value={product.quantity ?? ''}
                          onChange={(e) => updateProductRow(i, 'quantity', e.target.value)}
                          placeholder="Qtd"
                          disabled={!product.product_id}
                          className="bg-muted/60 border-border text-foreground h-8 text-xs"
                        />
                        <span className="text-[10px] text-muted-foreground w-16 truncate" title={product.expiration || undefined}>
                          {product.expiration ? `val. ${product.expiration}` : ''}
                        </span>
                        <button type="button" onClick={() => removeProductRow(i)} className="text-muted-foreground hover:text-red-400 cursor-pointer">
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto_auto] gap-1.5 items-center">
                        <Input
                          value={product.name}
                          onChange={(e) => updateProductRow(i, 'name', e.target.value)}
                          placeholder="Produto"
                          className="bg-muted/60 border-border text-foreground h-8 text-xs"
                        />
                        <Input
                          value={product.lot ?? ''}
                          onChange={(e) => updateProductRow(i, 'lot', e.target.value)}
                          placeholder="Lote"
                          className="bg-muted/60 border-border text-foreground h-8 text-xs"
                        />
                        <Input
                          type="date"
                          value={product.expiration ?? ''}
                          onChange={(e) => updateProductRow(i, 'expiration', e.target.value)}
                          className="bg-muted/60 border-border text-foreground h-8 text-xs"
                        />
                        <Input
                          value={product.quantity ?? ''}
                          onChange={(e) => updateProductRow(i, 'quantity', e.target.value)}
                          placeholder="Qtd"
                          className="bg-muted/60 border-border text-foreground h-8 text-xs w-14"
                        />
                        <button type="button" onClick={() => removeProductRow(i)} className="text-muted-foreground hover:text-red-400 cursor-pointer">
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    )
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Observações clínicas</Label>
              <Textarea
                value={recordForm.observations}
                onChange={(e) => setRecordForm((p) => ({ ...p, observations: e.target.value }))}
                placeholder="Reação, orientações passadas, intercorrências..."
                className="bg-muted/60 border-border text-foreground placeholder:text-muted-foreground min-h-[60px] text-sm resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Retorno recomendado</Label>
              <Input
                type="date"
                value={recordForm.nextSessionAt}
                onChange={(e) => setRecordForm((p) => ({ ...p, nextSessionAt: e.target.value }))}
                className="bg-muted/60 border-border text-foreground h-9 text-sm"
              />
            </div>

            {/* Fotos */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Fotos antes/depois</Label>
              <div className="flex gap-2">
                <PhotoPickerButton label="Antes" disabled={uploadingPhoto} onPick={(f) => handlePhotoPicked(f, 'before')} />
                <PhotoPickerButton label="Depois" disabled={uploadingPhoto} onPick={(f) => handlePhotoPicked(f, 'after')} />
                {uploadingPhoto && <Loader2 className="size-4 animate-spin text-muted-foreground self-center" />}
              </div>
              {recordForm.photos.length > 0 && (
                <div className="grid grid-cols-3 gap-2 pt-1">
                  {recordForm.photos.map((photo, i) => (
                    <div key={i} className="relative rounded-lg overflow-hidden border border-border group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.previewUrl} alt={photo.type} className="w-full h-16 object-cover" />
                      <span className="absolute top-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-medium text-white">
                        {photo.type === 'before' ? 'Antes' : 'Depois'}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeRecordPhoto(i)}
                        className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      >
                        <X className="size-3" />
                      </button>
                      <label className="absolute bottom-0 inset-x-0 flex items-center gap-1 bg-black/60 px-1.5 py-0.5 text-[9px] text-white cursor-pointer">
                        <input
                          type="checkbox"
                          checked={photo.marketing_consent}
                          onChange={() => togglePhotoConsent(i)}
                          className="size-2.5"
                        />
                        Uso em marketing
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRecordDialogOpen(false)} disabled={savingRecord}>
              Cancelar
            </Button>
            <Button
              onClick={saveRecord}
              disabled={savingRecord || uploadingPhoto || !recordForm.procedureDescription.trim()}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {savingRecord ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              Salvar no prontuário
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
// ContactDetailView — centered popup wrapper (standalone use), same shell
// as the deal popup's own "Contato" tab (deal-modal.tsx) so a contact
// looks identical whether opened from a deal or from /contacts directly.
// ---------------------------------------------------------------------------

export function ContactDetailView({
  open,
  onOpenChange,
  contactId,
  onUpdated,
}: ContactDetailViewProps) {
  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpenChange(false); };
    window.addEventListener('keydown', fn);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', fn); document.body.style.overflow = ''; };
  }, [open, onOpenChange]);

  if (!open) return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[45] bg-black/50 backdrop-blur-[3px] animate-in fade-in duration-200"
        onClick={() => onOpenChange(false)}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4"
      >
        <div className="relative flex w-full flex-col bg-background shadow-2xl sm:max-w-3xl sm:rounded-2xl h-[95dvh] sm:h-[85vh] max-h-[95dvh] sm:max-h-[90vh] animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-250">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Fechar"
            className="absolute right-3 top-3 z-10 flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="size-4" />
          </button>
          {contactId && (
            <ContactDetailContent contactId={contactId} onUpdated={onUpdated} />
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// StockProductPicker — two-step product → lot picker for a "produtos
// utilizados" row when the account has 'estoque'. Same search-and-click
// pattern as deal-items-panel.tsx (no native <select>), just with a
// second step to choose which lot. Lots are ordered soonest-expiring
// first (FEFO) so staff naturally reaches for stock closest to expiry.
// ---------------------------------------------------------------------------

interface StockProductOption {
  id: string;
  name: string;
}

interface StockLotOption {
  id: string;
  lot_number: string;
  expiration_date: string | null;
  quantity_remaining: number;
}

function StockProductPicker({
  label,
  onSelect,
}: {
  label: string;
  onSelect: (selection: {
    name: string;
    lot: string;
    expiration: string;
    product_id: string;
    lot_id: string;
  }) => void;
}) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'product' | 'lot'>('product');
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<StockProductOption[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<StockProductOption | null>(null);
  const [lots, setLots] = useState<StockLotOption[]>([]);

  async function openPicker() {
    setOpen(true);
    setStep('product');
    setQuery('');
    setLoading(true);
    const { data } = await supabase
      .from('products')
      .select('id, name')
      .eq('tracks_stock', true)
      .order('name');
    setProducts((data ?? []) as StockProductOption[]);
    setLoading(false);
  }

  async function pickProduct(p: StockProductOption) {
    setSelectedProduct(p);
    setStep('lot');
    setLoading(true);
    const { data } = await supabase
      .from('product_stock_lots')
      .select('id, lot_number, expiration_date, quantity_remaining')
      .eq('product_id', p.id)
      .gt('quantity_remaining', 0)
      .order('expiration_date', { ascending: true, nullsFirst: false });
    setLots((data ?? []) as StockLotOption[]);
    setLoading(false);
  }

  function pickLot(lot: StockLotOption) {
    if (!selectedProduct) return;
    onSelect({
      name: selectedProduct.name,
      lot: lot.lot_number,
      expiration: lot.expiration_date ?? '',
      product_id: selectedProduct.id,
      lot_id: lot.id,
    });
    setOpen(false);
  }

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={openPicker}
        className="flex h-8 w-full items-center gap-1.5 truncate rounded-md border border-border bg-muted/60 px-2 text-left text-xs text-foreground hover:border-primary"
      >
        <Package className="size-3 shrink-0 text-muted-foreground" />
        <span className="truncate">{label}</span>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-72 rounded-md border border-border bg-popover p-2 shadow-md">
          {step === 'product' ? (
            <>
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar produto..."
                className="h-7 text-xs mb-1.5"
              />
              <div className="max-h-48 overflow-y-auto space-y-0.5">
                {loading ? (
                  <p className="px-2 py-2 text-xs text-muted-foreground">Carregando...</p>
                ) : filteredProducts.length === 0 ? (
                  <p className="px-2 py-2 text-xs text-muted-foreground">
                    Nenhum produto com controle de estoque.
                  </p>
                ) : (
                  filteredProducts.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => pickProduct(p)}
                      className="block w-full truncate rounded px-2 py-1.5 text-left text-xs text-foreground hover:bg-muted"
                    >
                      {p.name}
                    </button>
                  ))
                )}
              </div>
            </>
          ) : (
            <>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="truncate text-xs font-medium text-foreground">{selectedProduct?.name}</span>
                <button
                  type="button"
                  onClick={() => setStep('product')}
                  className="shrink-0 text-[10px] text-primary hover:underline"
                >
                  Trocar produto
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-0.5">
                {loading ? (
                  <p className="px-2 py-2 text-xs text-muted-foreground">Carregando...</p>
                ) : lots.length === 0 ? (
                  <p className="px-2 py-2 text-xs text-muted-foreground">
                    Nenhum lote com saldo disponível.
                  </p>
                ) : (
                  lots.map((lot) => (
                    <button
                      key={lot.id}
                      type="button"
                      onClick={() => pickLot(lot)}
                      className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs text-foreground hover:bg-muted"
                    >
                      <span className="truncate">Lote {lot.lot_number}</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {lot.quantity_remaining} restantes
                        {lot.expiration_date ? ` · val. ${lot.expiration_date}` : ''}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-1.5 w-full rounded px-2 py-1 text-center text-[10px] text-muted-foreground hover:text-foreground"
          >
            Fechar
          </button>
        </div>
      )}
    </div>
  );
}

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
  items,
  currency = 'BRL',
}: {
  title: string;
  value: string;
  stage?: { name: string; color: string } | null;
  statusMeta: { label: string; color: string; Icon: React.ElementType } | null;
  createdAt?: string | null;
  items?: { id: string; name: string; price: number; quantity: number; product: { type: 'product' | 'service' } | null }[];
  currency?: string;
}) {
  const stageColor = stage?.color ?? '#6b7280';
  const hasItems = items && items.length > 0;

  return (
    <div
      className="rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors overflow-hidden"
      style={{ borderLeftColor: stageColor, borderLeftWidth: 3 }}
    >
      <div className="px-3 py-2.5">
        {/* Header */}
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

        {/* Items list */}
        {hasItems && (
          <div className="mb-2 space-y-1">
            {items!.map((item) => {
              const isService = item.product?.type === 'service';
              const subtotal = item.price * item.quantity;
              return (
                <div key={item.id} className="flex items-center justify-between gap-2 rounded bg-muted/50 px-2 py-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {isService
                      ? <ShoppingCart className="size-3 shrink-0 text-muted-foreground" />
                      : <Package className="size-3 shrink-0 text-muted-foreground" />
                    }
                    <span className="truncate text-xs text-foreground">{item.name}</span>
                    {item.quantity > 1 && (
                      <span className="shrink-0 text-[10px] text-muted-foreground">×{item.quantity}</span>
                    )}
                  </div>
                  <span className="shrink-0 text-xs font-medium tabular-nums text-foreground">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(subtotal)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1 font-medium text-foreground">
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

function PhotoPickerButton({
  label,
  disabled,
  onPick,
}: {
  label: string;
  disabled?: boolean;
  onPick: (file: File | undefined) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/heic"
        disabled={disabled}
        className="hidden"
        onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = ''; }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        <ImagePlus className="size-3.5" />
        {label}
      </Button>
    </>
  );
}

function PatientRecordCard({
  record,
  professionalName,
  photoUrls,
}: {
  record: PatientRecord;
  professionalName?: string;
  photoUrls: Record<string, string>;
}) {
  const beforePhotos = record.photos.filter((p) => p.type === 'before');
  const afterPhotos = record.photos.filter((p) => p.type === 'after');

  return (
    <div className="rounded-lg bg-muted/40 border border-border/50 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-foreground leading-snug flex-1">
          {record.procedure_description}
        </p>
        <span className="shrink-0 text-[10px] text-muted-foreground flex items-center gap-1">
          <CalendarDays className="size-3" />
          {new Date(record.occurred_at).toLocaleDateString('pt-BR', {
            day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
          })}
        </span>
      </div>

      {(record.treated_area || professionalName) && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {record.treated_area && <span>Área: {record.treated_area}</span>}
          {professionalName && <span>Profissional: {professionalName}</span>}
        </div>
      )}

      {record.products_used.length > 0 && (
        <div className="space-y-1">
          {record.products_used.map((product, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-muted/50 rounded px-2 py-1">
              <Syringe className="size-3 shrink-0" />
              <span className="text-foreground">{product.name}</span>
              {product.lot && <span>· lote {product.lot}</span>}
              {product.expiration && <span>· val. {new Date(product.expiration).toLocaleDateString('pt-BR')}</span>}
              {product.quantity && <span>· qtd {product.quantity}</span>}
            </div>
          ))}
        </div>
      )}

      {record.observations && (
        <p className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">{record.observations}</p>
      )}

      {(beforePhotos.length > 0 || afterPhotos.length > 0) && (
        <div className="flex gap-3">
          {beforePhotos.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground">Antes</p>
              <div className="flex gap-1">
                {beforePhotos.map((photo, i) => (
                  photoUrls[photo.path]
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img key={i} src={photoUrls[photo.path]} alt="Antes" className="size-14 rounded object-cover border border-border" />
                    : <div key={i} className="size-14 rounded bg-muted animate-pulse" />
                ))}
              </div>
            </div>
          )}
          {afterPhotos.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground">Depois</p>
              <div className="flex gap-1">
                {afterPhotos.map((photo, i) => (
                  photoUrls[photo.path]
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img key={i} src={photoUrls[photo.path]} alt="Depois" className="size-14 rounded object-cover border border-border" />
                    : <div key={i} className="size-14 rounded bg-muted animate-pulse" />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {record.next_session_recommended_at && (
        <p className="text-[10px] text-primary flex items-center gap-1 pt-1 border-t border-border/40">
          <CalendarPlus className="size-3" />
          Retorno recomendado: {new Date(record.next_session_recommended_at).toLocaleDateString('pt-BR')}
        </p>
      )}
    </div>
  );
}
