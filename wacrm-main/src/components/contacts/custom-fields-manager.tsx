'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';
import type { CustomField } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ChevronDown, Loader2, Plus, Trash2, Check, X, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Field type config ──────────────────────────────────────────────────────

type FieldType = 'text' | 'textarea' | 'number' | 'currency' | 'list' | 'date' | 'checkbox';

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text',     label: 'Texto' },
  { value: 'textarea', label: 'Texto longo' },
  { value: 'number',   label: 'Número' },
  { value: 'currency', label: 'Moeda (R$)' },
  { value: 'list',     label: 'Lista' },
  { value: 'date',     label: 'Data' },
  { value: 'checkbox', label: 'Checkbox' },
];

function typeLabel(type: string) {
  return FIELD_TYPES.find((t) => t.value === type)?.label ?? type;
}

// ── Dialog wrapper ─────────────────────────────────────────────────────────

interface CustomFieldsManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CustomFieldsManager({ open, onOpenChange }: CustomFieldsManagerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-popover text-popover-foreground sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground">Campos personalizados</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Crie campos extras para contatos e negócios. Para negócios você pode
            escolher quais aparecem no card da pipeline.
          </DialogDescription>
        </DialogHeader>
        <CustomFieldsPanel />
      </DialogContent>
    </Dialog>
  );
}

// ── Panel ──────────────────────────────────────────────────────────────────

export function CustomFieldsPanel() {
  const supabase = createClient();
  const { user, accountId } = useAuth();

  const [allFields, setAllFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'contact' | 'deal'>('contact');

  // Create form state
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<FieldType>('text');
  const [newOptions, setNewOptions] = useState('');
  const [creating, setCreating] = useState(false);

  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchFields = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const { data } = await supabase.from('custom_fields').select('*').order('field_name');
    setAllFields((data as CustomField[] | null) ?? []);
    setLoading(false);
  }, [supabase, accountId]);

  useEffect(() => {
    if (accountId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchFields();
    }
  }, [accountId, fetchFields]);

  const fields = allFields.filter((f) => (f.entity_type ?? 'contact') === activeTab);

  function isDuplicate(name: string, entityType: string, exceptId?: string): boolean {
    const lower = name.toLowerCase();
    return allFields.some(
      (f) =>
        f.id !== exceptId &&
        f.field_name.toLowerCase() === lower &&
        (f.entity_type ?? 'contact') === entityType
    );
  }

  function resetCreateForm() {
    setNewName('');
    setNewType('text');
    setNewOptions('');
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    if (!accountId || !user) {
      toast.error('Seu perfil não está vinculado a uma conta.');
      return;
    }
    if (isDuplicate(name, activeTab)) {
      toast.error(`Já existe um campo chamado "${name}".`);
      return;
    }

    const fieldOptions =
      newType === 'list'
        ? { options: newOptions.split(',').map((s) => s.trim()).filter(Boolean) }
        : undefined;

    setCreating(true);
    const { error } = await supabase.from('custom_fields').insert({
      field_name: name,
      field_type: newType,
      field_options: fieldOptions,
      entity_type: activeTab,
      user_id: user.id,
      account_id: accountId,
    });
    setCreating(false);

    if (error) {
      toast.error('Não foi possível criar o campo. Você pode não ter permissão.');
      return;
    }
    toast.success(`Campo "${name}" criado.`);
    resetCreateForm();
    await fetchFields();
  }

  async function handleRename(field: CustomField, nextName: string): Promise<boolean> {
    const name = nextName.trim();
    if (!name || name === field.field_name) return true;
    if (isDuplicate(name, field.entity_type ?? 'contact', field.id)) {
      toast.error(`Já existe um campo chamado "${name}".`);
      return false;
    }
    setBusyId(field.id);
    const { error } = await supabase.from('custom_fields').update({ field_name: name }).eq('id', field.id);
    setBusyId(null);
    if (error) { toast.error('Não foi possível renomear o campo.'); return false; }
    await fetchFields();
    return true;
  }

  async function handleSaveOptions(field: CustomField, rawOptions: string) {
    const options = rawOptions.split(',').map((s) => s.trim()).filter(Boolean);
    setBusyId(field.id);
    const { error } = await supabase
      .from('custom_fields')
      .update({ field_options: { options } })
      .eq('id', field.id);
    setBusyId(null);
    if (error) { toast.error('Não foi possível salvar as opções.'); return; }
    toast.success('Opções salvas.');
    await fetchFields();
  }

  async function handleToggleShowOnCard(field: CustomField) {
    setBusyId(field.id);
    const { error } = await supabase
      .from('custom_fields')
      .update({ show_on_card: !field.show_on_card })
      .eq('id', field.id);
    setBusyId(null);
    if (error) { toast.error('Não foi possível atualizar o campo.'); return; }
    setAllFields((prev) =>
      prev.map((f) => (f.id === field.id ? { ...f, show_on_card: !field.show_on_card } : f))
    );
  }

  function handleDelete(field: CustomField) {
    setBusyId(`confirm-${field.id}`);
  }

  async function confirmDelete(field: CustomField) {
    setBusyId(field.id);
    const { error } = await supabase.from('custom_fields').delete().eq('id', field.id);
    setBusyId(null);
    if (error) { toast.error('Não foi possível excluir o campo.'); return; }
    toast.success(`Campo "${field.field_name}" excluído.`);
    await fetchFields();
  }

  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => {
        setActiveTab(v as 'contact' | 'deal');
        resetCreateForm();
      }}
    >
      <TabsList className="w-full">
        <TabsTrigger value="contact" className="flex-1">Contatos</TabsTrigger>
        <TabsTrigger value="deal" className="flex-1">Negócios</TabsTrigger>
      </TabsList>

      {(['contact', 'deal'] as const).map((tab) => (
        <TabsContent key={tab} value={tab} className="mt-4 space-y-4">

          {/* ── Create form ── */}
          <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3">
            <div className="flex gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleCreate(); } }}
                placeholder="Nome do campo…"
                className="bg-muted text-foreground flex-1"
              />
              <TypeSelect value={newType} onChange={setNewType} />
            </div>

            {newType === 'list' && (
              <Input
                value={newOptions}
                onChange={(e) => setNewOptions(e.target.value)}
                placeholder="Opções separadas por vírgula: Sim, Não, Talvez"
                className="bg-muted text-foreground"
              />
            )}

            <Button
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className="bg-primary hover:bg-primary/90 text-primary-foreground w-full"
              size="sm"
            >
              {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              Adicionar campo
            </Button>
          </div>

          {tab === 'deal' && (
            <p className="text-xs text-muted-foreground">
              Ative &ldquo;exibir no card&rdquo; para que o valor apareça nos cards da pipeline.
            </p>
          )}

          {/* ── Field list ── */}
          <div className="max-h-72 overflow-y-auto rounded-md border border-border">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />Carregando…
              </div>
            ) : fields.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhum campo personalizado ainda.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {fields.map((field) => (
                  <FieldRow
                    key={field.id}
                    field={field}
                    showCardToggle={tab === 'deal'}
                    confirmingDelete={busyId === `confirm-${field.id}`}
                    busy={busyId === field.id}
                    onRename={handleRename}
                    onDelete={handleDelete}
                    onConfirmDelete={confirmDelete}
                    onCancelDelete={() => setBusyId(null)}
                    onToggleShowOnCard={handleToggleShowOnCard}
                    onSaveOptions={handleSaveOptions}
                  />
                ))}
              </ul>
            )}
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}

// ── TypeSelect ─────────────────────────────────────────────────────────────

function TypeSelect({ value, onChange }: { value: FieldType; onChange: (v: FieldType) => void }) {
  return (
    <div className="relative w-36 shrink-0">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as FieldType)}
        className="h-9 w-full appearance-none rounded-lg border border-border bg-muted px-3 pr-7 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 cursor-pointer"
      >
        {FIELD_TYPES.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

// ── FieldRow ───────────────────────────────────────────────────────────────

function FieldRow({
  field,
  showCardToggle,
  confirmingDelete,
  busy,
  onRename,
  onDelete,
  onConfirmDelete,
  onCancelDelete,
  onToggleShowOnCard,
  onSaveOptions,
}: {
  field: CustomField;
  showCardToggle: boolean;
  confirmingDelete: boolean;
  busy: boolean;
  onRename: (field: CustomField, name: string) => Promise<boolean>;
  onDelete: (field: CustomField) => void;
  onConfirmDelete: (field: CustomField) => void;
  onCancelDelete: () => void;
  onToggleShowOnCard: (field: CustomField) => void;
  onSaveOptions: (field: CustomField, raw: string) => void;
}) {
  const [name, setName] = useState(field.field_name);
  const [editingOptions, setEditingOptions] = useState(false);
  const [optionsRaw, setOptionsRaw] = useState(
    () => ((field.field_options as { options?: string[] } | undefined)?.options ?? []).join(', ')
  );

  async function commitName() {
    if (name.trim() === field.field_name) { setName(field.field_name); return; }
    const ok = await onRename(field, name);
    if (!ok) setName(field.field_name);
  }

  if (confirmingDelete) {
    return (
      <li className="flex items-center gap-2 px-3 py-2">
        <span className="flex-1 truncate text-sm text-foreground/80">
          Excluir <strong>&ldquo;{field.field_name}&rdquo;</strong>? Esta ação não pode ser desfeita.
        </span>
        <Button variant="ghost" size="icon-sm" onClick={() => onConfirmDelete(field)}
          className="shrink-0 text-red-400 hover:text-red-500" title="Confirmar exclusão">
          <Check className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onCancelDelete}
          className="shrink-0 text-muted-foreground hover:text-foreground" title="Cancelar">
          <X className="size-4" />
        </Button>
      </li>
    );
  }

  return (
    <li className="px-3 py-2 space-y-1.5">
      {/* Main row */}
      <div className="flex items-center gap-2">
        <Input
          value={name}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          aria-label={`Renomear ${field.field_name}`}
          className="focus:border-primary h-8 border-transparent bg-transparent text-foreground hover:border-border flex-1"
        />

        {/* Type badge */}
        <span className="shrink-0 rounded-full border border-border/60 bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground whitespace-nowrap">
          {typeLabel(field.field_type)}
        </span>

        {/* List options edit button */}
        {field.field_type === 'list' && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setEditingOptions((v) => !v)}
            title="Editar opções"
            className={cn('shrink-0', editingOptions ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}
          >
            <Pencil className="size-3.5" />
          </Button>
        )}

        {/* Show on card toggle (deal fields only) */}
        {showCardToggle && (
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">no card</span>
            <Switch
              checked={!!field.show_on_card}
              disabled={busy}
              onCheckedChange={() => onToggleShowOnCard(field)}
              aria-label={`Exibir "${field.field_name}" no card`}
            />
          </div>
        )}

        {/* Delete */}
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={busy}
          onClick={() => onDelete(field)}
          title="Excluir campo"
          className="shrink-0 text-muted-foreground hover:text-red-400"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
        </Button>
      </div>

      {/* Options editor (list type only, expandable) */}
      {field.field_type === 'list' && editingOptions && (
        <div className="flex gap-2 pl-1">
          <Input
            value={optionsRaw}
            onChange={(e) => setOptionsRaw(e.target.value)}
            placeholder="Opção A, Opção B, Opção C"
            className="h-8 bg-muted/60 border-border text-foreground text-xs flex-1"
          />
          <Button
            size="sm"
            className="shrink-0 h-8 bg-primary hover:bg-primary/90 text-primary-foreground text-xs"
            onClick={() => { onSaveOptions(field, optionsRaw); setEditingOptions(false); }}
            disabled={busy}
          >
            Salvar
          </Button>
        </div>
      )}
    </li>
  );
}
