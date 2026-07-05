'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CustomField, Tag } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Users, Tags, Filter, Upload, Loader2,
  ArrowRight, ArrowLeft, X, Download, FileSpreadsheet, AlertCircle,
} from 'lucide-react';

type AudienceType = 'all' | 'tags' | 'custom_field' | 'csv';
type CustomFieldOperator = 'is' | 'is_not' | 'contains';

interface CustomFieldFilter {
  fieldId: string;
  operator: CustomFieldOperator;
  value: string;
}

export interface CsvContact {
  phone: string;
  name?: string;
  company?: string;
}

interface AudienceConfig {
  type: AudienceType;
  tagIds?: string[];
  customField?: CustomFieldFilter;
  csvContacts?: CsvContact[];
  excludeTagIds?: string[];
}

interface Step2Props {
  audience: AudienceConfig;
  onUpdate: (audience: AudienceConfig) => void;
  onNext: () => void;
  onBack: () => void;
}

const audienceOptions: { type: AudienceType; label: string; description: string; icon: typeof Users }[] = [
  { type: 'all',          label: 'Todos os Contatos',    description: 'Enviar para todos os contatos do seu banco de dados', icon: Users },
  { type: 'tags',         label: 'Filtrar por Tags',     description: 'Segmentar contatos com tags específicas',             icon: Tags },
  { type: 'custom_field', label: 'Campo Personalizado',  description: 'Filtrar por valor de campo personalizado',            icon: Filter },
  { type: 'csv',          label: 'Importar Planilha',    description: 'Carregar lista via arquivo .xlsx ou .csv',            icon: Upload },
];

const OPERATOR_OPTIONS: { value: CustomFieldOperator; label: string }[] = [
  { value: 'is',       label: 'é' },
  { value: 'is_not',   label: 'não é' },
  { value: 'contains', label: 'contém' },
];

// ── XLSX helpers (lazy import to avoid SSR bundle bloat) ─────────────────────

async function parseSpreadsheet(file: File): Promise<CsvContact[]> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  return rows
    .map((row) => {
      // Accept common column name variants (case-insensitive)
      const get = (keys: string[]) => {
        for (const k of Object.keys(row)) {
          if (keys.some(key => k.trim().toLowerCase() === key.toLowerCase())) {
            return String(row[k]).trim();
          }
        }
        return '';
      };
      const phone   = get(['telefone', 'phone', 'celular', 'whatsapp', 'tel']);
      const name    = get(['nome', 'name', 'contato']);
      const company = get(['empresa', 'company', 'organização', 'organizacao']);
      return { phone, name: name || undefined, company: company || undefined };
    })
    .filter((r) => r.phone.length > 0);
}

async function downloadTemplate() {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet([
    ['Telefone', 'Nome', 'Empresa'],
    ['+5511999999999', 'Maria Silva', 'Acme Ltda'],
    ['+5521988887777', 'João Costa', ''],
  ]);
  ws['!cols'] = [{ wch: 18 }, { wch: 22 }, { wch: 22 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Contatos');
  XLSX.writeFile(wb, 'template_disparo.xlsx');
}

// ── Component ─────────────────────────────────────────────────────────────────

export function Step2SelectAudience({ audience, onUpdate, onNext, onBack }: Step2Props) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [loadingFields, setLoadingFields] = useState(false);
  const [estimatedCount, setEstimatedCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);

  // XLSX / CSV upload state
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function fetchTags() {
      setLoadingTags(true);
      try {
        const supabase = createClient();
        const { data } = await supabase.from('tags').select('*').order('name');
        setTags(data ?? []);
      } finally { setLoadingTags(false); }
    }
    fetchTags();
  }, []);

  useEffect(() => {
    if (audience.type !== 'custom_field') return;
    async function fetchFields() {
      setLoadingFields(true);
      try {
        const supabase = createClient();
        const { data } = await supabase.from('custom_fields').select('*').eq('entity_type', 'contact').order('field_name');
        setCustomFields(data ?? []);
      } finally { setLoadingFields(false); }
    }
    fetchFields();
  }, [audience.type]);

  const fetchEstimatedCount = useCallback(async () => {
    setLoadingCount(true);
    try {
      const supabase = createClient();
      let baseIds: Set<string> | null = null;

      if (audience.type === 'all') {
        // handled below
      } else if (audience.type === 'tags' && audience.tagIds && audience.tagIds.length > 0) {
        const { data } = await supabase.from('contact_tags').select('contact_id').in('tag_id', audience.tagIds);
        baseIds = new Set((data ?? []).map((r) => r.contact_id));
      } else if (audience.type === 'custom_field' && audience.customField?.fieldId && audience.customField.value) {
        const { fieldId, operator, value } = audience.customField;
        let q = supabase.from('contact_custom_values').select('contact_id').eq('custom_field_id', fieldId);
        if (operator === 'is') q = q.eq('value', value);
        else if (operator === 'is_not') q = q.neq('value', value);
        else q = q.ilike('value', `%${value}%`);
        const { data } = await q;
        baseIds = new Set((data ?? []).map((r) => r.contact_id));
      } else if (audience.type === 'csv' && audience.csvContacts && audience.csvContacts.length > 0) {
        setEstimatedCount(audience.csvContacts.length);
        return;
      } else {
        setEstimatedCount(null);
        return;
      }

      let excludeSet: Set<string> | null = null;
      if (audience.excludeTagIds && audience.excludeTagIds.length > 0) {
        const { data: ex } = await supabase.from('contact_tags').select('contact_id').in('tag_id', audience.excludeTagIds);
        excludeSet = new Set((ex ?? []).map((r) => r.contact_id));
      }

      if (baseIds) {
        setEstimatedCount([...baseIds].filter(id => !excludeSet?.has(id)).length);
      } else {
        const { count } = await supabase.from('contacts').select('*', { count: 'exact', head: true });
        const total = count ?? 0;
        setEstimatedCount(excludeSet ? Math.max(0, total - excludeSet.size) : total);
      }
    } finally { setLoadingCount(false); }
  }, [audience.type, audience.tagIds, audience.customField, audience.csvContacts, audience.excludeTagIds]);

  useEffect(() => { fetchEstimatedCount(); }, [fetchEstimatedCount]);

  function toggleTag(tagId: string) {
    const current = audience.tagIds ?? [];
    onUpdate({ ...audience, tagIds: current.includes(tagId) ? current.filter(id => id !== tagId) : [...current, tagId] });
  }

  function toggleExcludeTag(tagId: string) {
    const current = audience.excludeTagIds ?? [];
    onUpdate({ ...audience, excludeTagIds: current.includes(tagId) ? current.filter(id => id !== tagId) : [...current, tagId] });
  }

  function updateCustomField(patch: Partial<CustomFieldFilter>) {
    const prev = audience.customField ?? { fieldId: '', operator: 'is' as CustomFieldOperator, value: '' };
    onUpdate({ ...audience, customField: { ...prev, ...patch } });
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);
    setParsing(true);
    try {
      const contacts = await parseSpreadsheet(file);
      if (contacts.length === 0) {
        setParseError('Nenhum contato encontrado. Verifique se a coluna "Telefone" está preenchida.');
      } else {
        onUpdate({ ...audience, csvContacts: contacts });
      }
    } catch {
      setParseError('Falha ao ler o arquivo. Use o template fornecido (.xlsx ou .csv).');
    } finally {
      setParsing(false);
      e.target.value = '';
    }
  }

  const isValid =
    audience.type === 'all' ||
    (audience.type === 'tags' && (audience.tagIds?.length ?? 0) > 0) ||
    (audience.type === 'custom_field' && !!audience.customField?.fieldId && audience.customField.value.length > 0) ||
    (audience.type === 'csv' && (audience.csvContacts?.length ?? 0) > 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Selecionar Audiência</h2>
        <p className="mt-1 text-sm text-muted-foreground">Escolha quem receberá este disparo.</p>
      </div>

      {/* Audience type selector */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {audienceOptions.map((option) => {
          const isSelected = audience.type === option.type;
          const Icon = option.icon;
          return (
            <button
              key={option.type}
              onClick={() => onUpdate({
                ...audience,
                type: option.type,
                tagIds:      option.type === 'tags'         ? audience.tagIds      : undefined,
                customField: option.type === 'custom_field' ? audience.customField : undefined,
                csvContacts: option.type === 'csv'          ? audience.csvContacts : undefined,
              })}
              className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all ${
                isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border bg-card/50 hover:border-border'
              }`}
            >
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isSelected ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{option.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{option.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Tags */}
      {audience.type === 'tags' && (
        <div className="rounded-xl border border-border bg-card/50 p-4">
          <p className="mb-3 text-sm font-medium text-foreground">Selecionar Tags</p>
          {loadingTags ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : tags.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma tag encontrada. Crie tags nas Configurações.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => {
                const isSelected = audience.tagIds?.includes(tag.id);
                return (
                  <button key={tag.id} onClick={() => toggleTag(tag.id)}
                    className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-all ${isSelected ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border bg-muted text-muted-foreground hover:border-border'}`}>
                    <span className="mr-1.5 h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} />
                    {tag.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Custom field */}
      {audience.type === 'custom_field' && (
        <div className="space-y-3 rounded-xl border border-border bg-card/50 p-4">
          <p className="text-sm font-medium text-foreground">Filtro de Campo Personalizado</p>
          {loadingFields ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : customFields.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum campo personalizado definido.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_140px_minmax(0,1fr)]">
              <select value={audience.customField?.fieldId ?? ''} onChange={(e) => updateCustomField({ fieldId: e.target.value })}
                className="h-9 rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary">
                <option value="">Selecionar campo…</option>
                {customFields.map((f) => <option key={f.id} value={f.id}>{f.field_name}</option>)}
              </select>
              <select value={audience.customField?.operator ?? 'is'} onChange={(e) => updateCustomField({ operator: e.target.value as CustomFieldOperator })}
                className="h-9 rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary">
                {OPERATOR_OPTIONS.map((op) => <option key={op.value} value={op.value}>{op.label}</option>)}
              </select>
              <input type="text" value={audience.customField?.value ?? ''} onChange={(e) => updateCustomField({ value: e.target.value })}
                placeholder="Valor"
                className="h-9 rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary" />
            </div>
          )}
        </div>
      )}

      {/* XLSX / CSV upload */}
      {audience.type === 'csv' && (
        <div className="space-y-3 rounded-xl border border-border bg-card/50 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">Importar planilha</p>
            <button
              type="button"
              onClick={downloadTemplate}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Baixar template
            </button>
          </div>

          <p className="text-xs text-muted-foreground">
            Aceita <strong className="text-foreground">.xlsx</strong> e <strong className="text-foreground">.csv</strong>.
            O arquivo deve ter as colunas: <code className="rounded bg-muted px-1">Telefone</code> (obrigatório), <code className="rounded bg-muted px-1">Nome</code> e <code className="rounded bg-muted px-1">Empresa</code> (opcionais).
            Baixe o template acima para começar.
          </p>

          {/* Drop zone */}
          {!audience.csvContacts?.length ? (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={parsing}
              className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border py-10 text-center transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:opacity-60"
            >
              {parsing ? (
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              ) : (
                <FileSpreadsheet className="h-8 w-8 text-muted-foreground/50" />
              )}
              <div>
                <p className="text-sm font-medium text-foreground">
                  {parsing ? 'Lendo arquivo…' : 'Clique para selecionar o arquivo'}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">.xlsx ou .csv</p>
              </div>
            </button>
          ) : (
            /* Preview */
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-foreground">
                  {audience.csvContacts.length} contatos importados
                </p>
                <button
                  type="button"
                  onClick={() => { onUpdate({ ...audience, csvContacts: undefined }); setParseError(null); }}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X className="h-3.5 w-3.5" /> Remover lista
                </button>
              </div>

              {/* First 5 rows preview */}
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/60">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Telefone</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Nome</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Empresa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {audience.csvContacts.slice(0, 5).map((c, i) => (
                      <tr key={i} className="bg-card">
                        <td className="px-3 py-2 font-mono text-foreground">{c.phone}</td>
                        <td className="px-3 py-2 text-muted-foreground">{c.name ?? '—'}</td>
                        <td className="px-3 py-2 text-muted-foreground">{c.company ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {audience.csvContacts.length > 5 && (
                  <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                    + {audience.csvContacts.length - 5} outros contatos
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="text-xs text-primary underline underline-offset-2 hover:opacity-80"
              >
                Substituir arquivo
              </button>
            </div>
          )}

          {/* Error */}
          {parseError && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              {parseError}
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileChange}
          />
        </div>
      )}

      {/* Exclude tags */}
      <div className="rounded-xl border border-border bg-card/50 p-4">
        <div className="mb-3 flex items-center gap-2">
          <X className="h-4 w-4 text-red-400" />
          <p className="text-sm font-medium text-foreground">Excluir contatos com estas tags</p>
          <span className="text-xs text-muted-foreground">(opcional)</span>
        </div>
        {tags.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma tag disponível.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => {
              const isExcluded = audience.excludeTagIds?.includes(tag.id);
              return (
                <button key={tag.id} onClick={() => toggleExcludeTag(tag.id)}
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-all ${isExcluded ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-border bg-muted text-muted-foreground hover:border-border'}`}>
                  <span className="mr-1.5 h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} />
                  {tag.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Audience summary */}
      <div className="rounded-xl border border-border bg-card/50 p-4">
        <p className="mb-2 text-sm font-medium text-foreground">Resumo da Audiência</p>
        {loadingCount ? (
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">Calculando…</span>
          </div>
        ) : estimatedCount !== null ? (
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <span className="text-sm text-foreground">{estimatedCount.toLocaleString()}</span>
            <span className="text-xs text-muted-foreground">destinatários estimados</span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Selecione um tipo de audiência para ver a estimativa.</p>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button variant="outline" onClick={onBack} className="border-border text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        <Button onClick={onNext} disabled={!isValid} className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          Próximo <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
