'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { Contact, Tag, ContactTag, TrackingLink } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Search,
  Plus,
  Upload,
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
  Users,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Filter,
  X,
  Tags,
  Megaphone,
} from 'lucide-react';
import { ContactForm } from '@/components/contacts/contact-form';
import { ContactDetailView } from '@/components/contacts/contact-detail-view';
import { ImportModal } from '@/components/contacts/import-modal';
import { CustomFieldsManager } from '@/components/contacts/custom-fields-manager';
import { useCan } from '@/hooks/use-can';
import { GatedButton } from '@/components/ui/gated-button';
import { Checkbox } from '@/components/ui/checkbox';

const PAGE_SIZE = 25;

interface ContactWithTags extends Contact {
  tags?: Tag[];
}

export default function ContactsPage() {
  const supabase = createClient();
  const canEdit = useCan('send-messages');
  const canEditSettings = useCan('edit-settings');
  const searchParams = useSearchParams();
  const router = useRouter();

  const [contacts, setContacts] = useState<ContactWithTags[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  // Tag filter — contacts shown must have ANY of these tags (OR).
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  // Campaign filter — contacts from a specific tracking link.
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [trackingLinks, setTrackingLinks] = useState<TrackingLink[]>([]);

  // Modals
  const [formOpen, setFormOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [editContactTags, setEditContactTags] = useState<ContactTag[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailContactId, setDetailContactId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [customFieldsOpen, setCustomFieldsOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Bulk selection (page-scoped — only the loaded rows are selectable)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkTagsToAdd, setBulkTagsToAdd] = useState<Set<string>>(new Set());
  const [bulkTagsToRemove, setBulkTagsToRemove] = useState<Set<string>>(new Set());
  const [bulkField, setBulkField] = useState<{ field: 'company' | 'email' | ''; value: string }>({ field: '', value: '' });
  const [bulkEditing, setBulkEditing] = useState(false);

  // All tags for display
  const [tagsMap, setTagsMap] = useState<Record<string, Tag>>({});

  // Open sheet from ?open=id (search results, external links)
  useEffect(() => {
    const id = searchParams.get('open');
    if (id) {
      setDetailContactId(id);
      setDetailOpen(true);
    }
  }, [searchParams]);

  // Guards against out-of-order fetch responses: each fetchContacts run
  // claims a sequence number and only the latest is allowed to commit its
  // results. Without this, rapidly toggling tag filters could let a slower
  // earlier request resolve last and render stale rows.
  const fetchSeq = useRef(0);

  const fetchTags = useCallback(async () => {
    const { data } = await supabase.from('tags').select('*');
    if (data) {
      const map: Record<string, Tag> = {};
      data.forEach((t) => (map[t.id] = t));
      setTagsMap(map);
      // Drop any filter selections whose tag no longer exists (e.g. a tag
      // deleted elsewhere) so it can't linger invisibly in the query.
      setSelectedTagIds((prev) => {
        const pruned = prev.filter((id) => map[id]);
        return pruned.length === prev.length ? prev : pruned;
      });
    }
  }, [supabase]);

  const fetchTrackingLinks = useCallback(async () => {
    const { data } = await supabase.from('tracking_links').select('*').order('created_at', { ascending: false });
    setTrackingLinks(data ?? []);
  }, [supabase]);

  const fetchContacts = useCallback(async () => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    // The visible rows are about to change — drop any selection that
    // referred to the old page/search results so the bulk bar can't
    // act on rows the user can no longer see.
    setSelected(new Set());

    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const term = search.trim();

    let contactRows: Contact[];
    let count: number;

    if (selectedTagIds.length > 0) {
      // Tag filter active — resolve it server-side (join + distinct +
      // windowed total count + pagination) so a tag covering many
      // contacts can't silently truncate the result or overflow an IN
      // clause. See migration 025_filter_contacts_by_tags.
      const { data, error } = await supabase.rpc('filter_contacts_by_tags', {
        p_tag_ids: selectedTagIds,
        p_search: term || null,
        p_limit: PAGE_SIZE,
        p_offset: from,
      });
      if (seq !== fetchSeq.current) return; // superseded by a newer fetch
      if (error) {
        toast.error('Falha ao carregar contatos');
        setLoading(false);
        return;
      }
      const rows = (data ?? []) as { contact: Contact; total_count: number }[];
      let allRows = rows.map((r) => r.contact);
      // Apply campaign filter client-side when both active
      if (selectedCampaignId) allRows = allRows.filter((c) => c.tracking_link_id === selectedCampaignId);
      contactRows = allRows;
      count = rows.length > 0 ? Number(rows[0].total_count) : 0;
    } else {
      let query = supabase
        .from('contacts')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (term) {
        const like = `%${term}%`;
        query = query.or(`name.ilike.${like},phone.ilike.${like},email.ilike.${like}`);
      }

      if (selectedCampaignId) {
        query = query.eq('tracking_link_id', selectedCampaignId);
      }

      const { data, count: exactCount, error } = await query;
      if (seq !== fetchSeq.current) return; // superseded by a newer fetch
      if (error) {
        toast.error('Falha ao carregar contatos');
        setLoading(false);
        return;
      }
      contactRows = data ?? [];
      count = exactCount ?? 0;
    }

    setTotalCount(count);

    if (contactRows.length === 0) {
      setContacts([]);
      setLoading(false);
      return;
    }

    // Fetch tags for these contacts
    const contactIds = contactRows.map((c) => c.id);
    const { data: contactTags } = await supabase
      .from('contact_tags')
      .select('contact_id, tag_id')
      .in('contact_id', contactIds);
    if (seq !== fetchSeq.current) return; // superseded by a newer fetch

    const tagsByContact: Record<string, string[]> = {};
    contactTags?.forEach((ct) => {
      if (!tagsByContact[ct.contact_id]) tagsByContact[ct.contact_id] = [];
      tagsByContact[ct.contact_id].push(ct.tag_id);
    });

    const enriched: ContactWithTags[] = contactRows.map((c) => ({
      ...c,
      tags: (tagsByContact[c.id] ?? [])
        .map((tid) => tagsMap[tid])
        .filter(Boolean),
    }));

    setContacts(enriched);
    setLoading(false);
  }, [supabase, page, search, selectedTagIds, selectedCampaignId, tagsMap]);

  // Load-once-on-mount-ish data fetches. Each setter inside runs
  // inside an async promise completion (Supabase await), not
  // synchronously in the effect body, so the cascade the lint rule
  // warns about doesn't apply here.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchTags();
  }, [fetchTags]);

  useEffect(() => {
    fetchTrackingLinks();
  }, [fetchTrackingLinks]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchContacts();
  }, [fetchContacts]);

  function openAddForm() {
    setEditContact(null);
    setEditContactTags([]);
    setFormOpen(true);
  }

  async function openEditForm(contact: Contact) {
    const { data } = await supabase
      .from('contact_tags')
      .select('*')
      .eq('contact_id', contact.id);
    setEditContact(contact);
    setEditContactTags(data ?? []);
    setFormOpen(true);
  }

  function openDetail(contactId: string) {
    setDetailContactId(contactId);
    setDetailOpen(true);
  }

  function confirmDelete(contact: Contact) {
    setDeleteTarget(contact);
    setDeleteConfirmOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);

    const { error } = await supabase
      .from('contacts')
      .delete()
      .eq('id', deleteTarget.id);

    if (error) {
      toast.error('Falha ao excluir contato');
    } else {
      toast.success('Contato excluído');
      fetchContacts();
    }

    setDeleting(false);
    setDeleteConfirmOpen(false);
    setDeleteTarget(null);
  }

  const allOnPageSelected =
    contacts.length > 0 && contacts.every((c) => selected.has(c.id));
  const someOnPageSelected = contacts.some((c) => selected.has(c.id));

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        contacts.forEach((c) => next.delete(c.id));
      } else {
        contacts.forEach((c) => next.add(c.id));
      }
      return next;
    });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkEdit() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBulkEditing(true);

    try {
      const ops: Promise<{ error: unknown }>[] = [];

      // Add tags
      if (bulkTagsToAdd.size > 0) {
        const rows = ids.flatMap((contactId) =>
          [...bulkTagsToAdd].map((tagId) => ({ contact_id: contactId, tag_id: tagId }))
        );
        ops.push(supabase.from('contact_tags').upsert(rows, { onConflict: 'contact_id,tag_id', ignoreDuplicates: true }) as unknown as Promise<{ error: unknown }>);
      }

      // Remove tags
      if (bulkTagsToRemove.size > 0) {
        ops.push(
          supabase
            .from('contact_tags')
            .delete()
            .in('contact_id', ids)
            .in('tag_id', [...bulkTagsToRemove]) as unknown as Promise<{ error: unknown }>
        );
      }

      // Update field
      if (bulkField.field && bulkField.value.trim()) {
        ops.push(
          supabase
            .from('contacts')
            .update({ [bulkField.field]: bulkField.value.trim(), updated_at: new Date().toISOString() })
            .in('id', ids) as unknown as Promise<{ error: unknown }>
        );
      }

      await Promise.all(ops);

      const totalOps = (bulkTagsToAdd.size > 0 ? 1 : 0) + (bulkTagsToRemove.size > 0 ? 1 : 0) + (bulkField.field ? 1 : 0);
      if (totalOps === 0) {
        toast.info('Nenhuma alteração selecionada.');
      } else {
        toast.success(`${ids.length} contato${ids.length === 1 ? '' : 's'} atualizado${ids.length === 1 ? '' : 's'}.`);
        setSelected(new Set());
        fetchContacts();
        fetchTags();
      }
    } catch {
      toast.error('Erro ao editar contatos.');
    } finally {
      setBulkEditing(false);
      setBulkEditOpen(false);
      setBulkTagsToAdd(new Set());
      setBulkTagsToRemove(new Set());
      setBulkField({ field: '', value: '' });
    }
  }

  async function handleBulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setDeleting(true);

    const { error } = await supabase.from('contacts').delete().in('id', ids);

    if (error) {
      toast.error('Falha ao excluir contatos');
    } else {
      toast.success(`${ids.length} contato${ids.length === 1 ? '' : 's'} excluído${ids.length === 1 ? '' : 's'}`);
      setSelected(new Set());
      fetchContacts();
    }

    setDeleting(false);
    setBulkDeleteOpen(false);
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const hasNext = page < totalPages - 1;
  const hasPrev = page > 0;

  // Tag filter helpers. Every change resets to page 0 — the result set
  // shrinks/grows so page N may no longer be valid (mirrors the search box).
  const allTags = Object.values(tagsMap).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const hasActiveFilters = search.trim().length > 0 || selectedTagIds.length > 0 || !!selectedCampaignId;
  const trackingLinksMap = Object.fromEntries(trackingLinks.map((l) => [l.id, l]));
  const selectedCampaign = selectedCampaignId ? trackingLinksMap[selectedCampaignId] : null;

  function toggleTagFilter(tagId: string) {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    );
    setPage(0);
  }

  function clearTagFilters() {
    setSelectedTagIds([]);
    setPage(0);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Contatos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {totalCount > 0 ? `${totalCount} contatos no total.` : 'Gerencie sua lista de contatos.'}
          </p>
        </div>

        {selected.size > 0 ? (
          /* Bulk action bar — appears in the header when rows are selected */
          <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
            <span className="text-sm font-medium text-primary mr-1">
              {selected.size} {selected.size === 1 ? 'selecionado' : 'selecionados'}
            </span>
            <GatedButton
              variant="outline"
              size="sm"
              canAct={canEdit}
              gateReason="edit contacts"
              onClick={() => {
                setBulkTagsToAdd(new Set());
                setBulkTagsToRemove(new Set());
                setBulkField({ field: '', value: '' });
                setBulkEditOpen(true);
              }}
              className="border-border gap-1.5"
            >
              <Pencil className="size-3.5" />
              Editar em massa
            </GatedButton>
            <GatedButton
              variant="destructive"
              size="sm"
              canAct={canEdit}
              gateReason="delete contacts"
              onClick={() => setBulkDeleteOpen(true)}
              className="gap-1.5"
            >
              <Trash2 className="size-3.5" />
              Excluir selecionados
            </GatedButton>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelected(new Set())}
              className="text-muted-foreground hover:text-foreground"
            >
              Cancelar
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {canEditSettings && (
              <Button
                variant="outline"
                onClick={() => setCustomFieldsOpen(true)}
                className="border-border text-muted-foreground hover:bg-muted"
              >
                <SlidersHorizontal className="size-4" />
                Campos personalizados
              </Button>
            )}
            <GatedButton
              variant="outline"
              canAct={canEdit}
              gateReason="add or import contacts"
              onClick={() => setImportOpen(true)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              <Upload className="size-4" />
              Importar
            </GatedButton>
            <GatedButton
              canAct={canEdit}
              gateReason="add or import contacts"
              onClick={openAddForm}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <Plus className="size-4" />
              Adicionar Contato
            </GatedButton>
          </div>
        )}
      </div>

      {/* Search + tag filter */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                // Reset pagination when the query changes — the result
                // set shrinks/grows, page N may no longer be valid.
                setPage(0);
              }}
              placeholder="Pesquisar por nome, telefone ou e-mail..."
              className="pl-8 bg-card border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <Popover>
            <PopoverTrigger
              render={
                <Button
                  variant="outline"
                  className="border-border text-muted-foreground hover:bg-muted shrink-0"
                />
              }
            >
              <Filter className="size-4" />
              Filtrar por tags
              {selectedTagIds.length > 0 && (
                <span className="ml-1 inline-flex items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                  {selectedTagIds.length}
                </span>
              )}
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-0">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <span className="text-sm font-medium text-popover-foreground">
                  Filtrar por tags
                </span>
                {selectedTagIds.length > 0 && (
                  <button
                    onClick={clearTagFilters}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Limpar tudo
                  </button>
                )}
              </div>
              {allTags.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted-foreground text-center">
                  Nenhuma tag ainda.
                </p>
              ) : (
                <div className="max-h-64 overflow-y-auto py-1">
                  {allTags.map((tag) => (
                    <label
                      key={tag.id}
                      className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={selectedTagIds.includes(tag.id)}
                        onCheckedChange={() => toggleTagFilter(tag.id)}
                        aria-label={`Filtrar por ${tag.name}`}
                      />
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="text-sm text-popover-foreground truncate">
                        {tag.name}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </PopoverContent>
          </Popover>

          {/* Campaign filter */}
          <Popover>
            <PopoverTrigger
              render={
                <Button
                  variant="outline"
                  className="border-border text-muted-foreground hover:bg-muted shrink-0"
                />
              }
            >
              <Megaphone className="size-4" />
              Campanha
              {selectedCampaignId && (
                <span className="ml-1 inline-flex items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                  1
                </span>
              )}
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-0">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <span className="text-sm font-medium text-popover-foreground">Filtrar por campanha</span>
                {selectedCampaignId && (
                  <button
                    onClick={() => { setSelectedCampaignId(null); setPage(0); }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Limpar
                  </button>
                )}
              </div>
              {trackingLinks.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted-foreground text-center">Nenhuma campanha criada.</p>
              ) : (
                <div className="max-h-64 overflow-y-auto py-1">
                  {trackingLinks.map((link) => (
                    <label
                      key={link.id}
                      className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={selectedCampaignId === link.id}
                        onCheckedChange={() => {
                          setSelectedCampaignId((prev) => (prev === link.id ? null : link.id));
                          setPage(0);
                        }}
                        aria-label={`Filtrar por ${link.name}`}
                      />
                      <div className="min-w-0">
                        <p className="text-sm text-popover-foreground truncate">{link.name}</p>
                        <p className="text-[10px] text-muted-foreground">{link.click_count} cliques · /{link.code}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>

        {/* Active filter chips */}
        {(selectedTagIds.length > 0 || !!selectedCampaignId) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {selectedTagIds.map((id) => {
              const tag = tagsMap[id];
              if (!tag) return null;
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{
                    backgroundColor: tag.color + '20',
                    color: tag.color,
                  }}
                >
                  {tag.name}
                  <button
                    onClick={() => toggleTagFilter(id)}
                    aria-label={`Remover filtro ${tag.name}`}
                    className="hover:opacity-70"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              );
            })}
            {selectedCampaign && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                <Megaphone className="size-2.5" />
                {selectedCampaign.name}
                <button
                  onClick={() => { setSelectedCampaignId(null); setPage(0); }}
                  aria-label="Remover filtro de campanha"
                  className="hover:opacity-70"
                >
                  <X className="size-3" />
                </button>
              </span>
            )}
            <button
              onClick={() => { clearTagFilters(); setSelectedCampaignId(null); setPage(0); }}
              className="text-xs text-muted-foreground hover:text-foreground px-1"
            >
              Limpar tudo
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="w-10">
                <Checkbox
                  checked={allOnPageSelected}
                  indeterminate={!allOnPageSelected && someOnPageSelected}
                  onCheckedChange={toggleSelectAll}
                  disabled={contacts.length === 0}
                  aria-label="Selecionar todos os contatos nesta página"
                />
              </TableHead>
              <TableHead className="text-muted-foreground">Nome</TableHead>
              <TableHead className="text-muted-foreground">Telefone</TableHead>
              <TableHead className="text-muted-foreground hidden md:table-cell">E-mail</TableHead>
              <TableHead className="text-muted-foreground hidden lg:table-cell">Empresa</TableHead>
              <TableHead className="text-muted-foreground hidden xl:table-cell">Origem</TableHead>
              <TableHead className="text-muted-foreground hidden md:table-cell">Tags</TableHead>
              <TableHead className="text-muted-foreground hidden lg:table-cell">Criado em</TableHead>
              <TableHead className="text-muted-foreground w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow className="border-border">
                <TableCell colSpan={9} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="size-6 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Carregando contatos...</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : contacts.length === 0 ? (
              <TableRow className="border-border">
                <TableCell colSpan={9} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <Users className="size-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      {hasActiveFilters
                        ? 'Nenhum contato corresponde aos filtros.'
                        : 'Nenhum contato ainda.'}
                    </p>
                    {!hasActiveFilters && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={openAddForm}
                        className="mt-2 border-border text-muted-foreground hover:bg-muted"
                      >
                        <Plus className="size-3.5" />
                        Adicione seu primeiro contato
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              contacts.map((contact) => (
                <TableRow
                  key={contact.id}
                  className="border-border hover:bg-muted/50 cursor-pointer"
                  onClick={() => openDetail(contact.id)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.has(contact.id)}
                      onCheckedChange={() => toggleSelect(contact.id)}
                      aria-label={`Selecionar ${contact.name || contact.phone}`}
                    />
                  </TableCell>
                  <TableCell className="text-foreground font-medium">
                    {contact.name || <span className="text-muted-foreground italic">Sem nome</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">
                    {contact.phone}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden md:table-cell text-sm">
                    {contact.email || <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden lg:table-cell text-sm">
                    {contact.company || <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell">
                    {contact.tracking_link_id && trackingLinksMap[contact.tracking_link_id] ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        <Megaphone className="size-2.5" />
                        {trackingLinksMap[contact.tracking_link_id].name}
                      </span>
                    ) : contact.utm_source ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        {contact.utm_source}
                      </span>
                    ) : contact.gclid ? (
                      <span className="rounded-full bg-yellow-500/10 px-2 py-0.5 text-[10px] font-medium text-yellow-600 dark:text-yellow-400">
                        Google Ads
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {contact.tags && contact.tags.length > 0 ? (
                        contact.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag.id}
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                            style={{
                              backgroundColor: tag.color + '20',
                              color: tag.color,
                            }}
                          >
                            {tag.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                      {contact.tags && contact.tags.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">
                          +{contact.tags.length - 3}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs hidden lg:table-cell">
                    {new Date(contact.created_at).toLocaleDateString('pt-BR', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={(e) => e.stopPropagation()}
                          />
                        }
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="bg-popover border-border"
                      >
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditForm(contact);
                          }}
                          className="text-popover-foreground focus:bg-muted focus:text-foreground"
                        >
                          <Pencil className="size-4" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-border" />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            confirmDelete(contact);
                          }}
                        >
                          <Trash2 className="size-4" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Mostrando {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, totalCount)} de{' '}
            {totalCount}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!hasPrev}
              onClick={() => setPage((p) => p - 1)}
              className="border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-xs text-muted-foreground px-2">
              Página {page + 1} de {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!hasNext}
              onClick={() => setPage((p) => p + 1)}
              className="border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Contact Form Dialog */}
      <ContactForm
        open={formOpen}
        onOpenChange={setFormOpen}
        contact={editContact}
        contactTags={editContactTags}
        onSaved={() => {
          fetchContacts();
          fetchTags();
        }}
        onViewExisting={(id) => {
          setFormOpen(false);
          openDetail(id);
        }}
      />

      {/* Contact Detail Sheet */}
      <ContactDetailView
        open={detailOpen}
        onOpenChange={(o) => {
          setDetailOpen(o);
          if (!o && searchParams.get('open')) {
            const params = new URLSearchParams(searchParams.toString());
            params.delete('open');
            router.replace(`/contacts${params.size ? `?${params}` : ''}`);
          }
        }}
        contactId={detailContactId}
        onUpdated={fetchContacts}
      />

      {/* Import Modal */}
      <ImportModal
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={fetchContacts}
      />

      {/* Custom Fields Manager (admin+) */}
      {canEditSettings && (
        <CustomFieldsManager
          open={customFieldsOpen}
          onOpenChange={setCustomFieldsOpen}
        />
      )}

      {/* Delete Confirmation */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">Excluir Contato</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Tem certeza que deseja excluir{' '}
              <span className="text-popover-foreground font-medium">
                {deleteTarget?.name || deleteTarget?.phone}
              </span>
              ? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-popover border-border">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="size-4 animate-spin" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Edit Dialog */}
      <Dialog open={bulkEditOpen} onOpenChange={setBulkEditOpen}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">
              Editar {selected.size} {selected.size === 1 ? 'contato' : 'contatos'}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              As alterações abaixo serão aplicadas a todos os contatos selecionados.
              Deixe em branco o que não quiser alterar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Add tags */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground">Adicionar tags</p>
              {allTags.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma tag criada.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {allTags.map((tag) => {
                    const active = bulkTagsToAdd.has(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => {
                          setBulkTagsToAdd((prev) => {
                            const next = new Set(prev);
                            if (next.has(tag.id)) next.delete(tag.id); else next.add(tag.id);
                            return next;
                          });
                          setBulkTagsToRemove((prev) => { const next = new Set(prev); next.delete(tag.id); return next; });
                        }}
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 transition-all"
                        style={{
                          backgroundColor: active ? tag.color + '30' : 'transparent',
                          color: tag.color,
                          outline: `1px solid ${active ? tag.color : tag.color + '60'}`,
                        }}
                      >
                        {active && <span className="mr-1">✓</span>}
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Remove tags */}
            <div className="space-y-2 border-t border-border pt-4">
              <p className="text-xs font-medium text-foreground">Remover tags</p>
              {allTags.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma tag criada.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {allTags.map((tag) => {
                    const active = bulkTagsToRemove.has(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => {
                          setBulkTagsToRemove((prev) => {
                            const next = new Set(prev);
                            if (next.has(tag.id)) next.delete(tag.id); else next.add(tag.id);
                            return next;
                          });
                          setBulkTagsToAdd((prev) => { const next = new Set(prev); next.delete(tag.id); return next; });
                        }}
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 transition-all"
                        style={{
                          backgroundColor: active ? '#ef444430' : 'transparent',
                          color: active ? '#ef4444' : tag.color,
                          outline: `1px solid ${active ? '#ef4444' : tag.color + '60'}`,
                        }}
                      >
                        {active && <span className="mr-1">✕</span>}
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Update field */}
            <div className="space-y-2 border-t border-border pt-4">
              <p className="text-xs font-medium text-foreground">Atualizar campo</p>
              <div className="flex gap-2">
                <select
                  value={bulkField.field}
                  onChange={(e) => setBulkField({ field: e.target.value as 'company' | 'email' | '', value: '' })}
                  className="rounded-md border border-border bg-muted px-2 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none"
                >
                  <option value="">— campo —</option>
                  <option value="company">Empresa</option>
                  <option value="email">E-mail</option>
                </select>
                {bulkField.field && (
                  <Input
                    value={bulkField.value}
                    onChange={(e) => setBulkField((prev) => ({ ...prev, value: e.target.value }))}
                    placeholder={bulkField.field === 'company' ? 'Nome da empresa...' : 'email@exemplo.com'}
                    className="flex-1 bg-muted border-border text-foreground text-sm"
                  />
                )}
              </div>
              {bulkField.field && (
                <p className="text-[11px] text-muted-foreground">
                  Sobrescreve o campo &ldquo;{bulkField.field === 'company' ? 'Empresa' : 'E-mail'}&rdquo; em todos os {selected.size} contatos selecionados.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkEditOpen(false)} className="border-border" disabled={bulkEditing}>
              Cancelar
            </Button>
            <Button onClick={handleBulkEdit} disabled={bulkEditing || (bulkTagsToAdd.size === 0 && bulkTagsToRemove.size === 0 && !bulkField.value.trim())}>
              {bulkEditing && <Loader2 className="size-4 animate-spin" />}
              Aplicar a {selected.size} {selected.size === 1 ? 'contato' : 'contatos'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">
              Excluir {selected.size} {selected.size === 1 ? 'Contato' : 'Contatos'}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Tem certeza que deseja excluir{' '}
              <span className="text-popover-foreground font-medium">
                {selected.size} {selected.size === 1 ? 'contato' : 'contatos'}
              </span>
              ? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-popover border-border">
            <Button
              variant="outline"
              onClick={() => setBulkDeleteOpen(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="size-4 animate-spin" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
