'use client';

import type { CustomField } from '@/types';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { ChevronDown } from 'lucide-react';

interface CustomFieldInputProps {
  field: CustomField;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const BASE_INPUT =
  'bg-muted/60 border-border text-foreground placeholder:text-muted-foreground h-9 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary';

export function CustomFieldInput({ field, value, onChange, disabled }: CustomFieldInputProps) {
  const options = (field.field_options as { options?: string[] } | undefined)?.options ?? [];

  switch (field.field_type) {
    case 'textarea':
      return (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Inserir ${field.field_name}…`}
          disabled={disabled}
          className="bg-muted/60 border-border text-foreground placeholder:text-muted-foreground text-sm resize-none min-h-[80px]"
        />
      );

    case 'number':
      return (
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          disabled={disabled}
          className={BASE_INPUT}
        />
      );

    case 'currency':
      return (
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground select-none">
            R$
          </span>
          <Input
            type="text"
            inputMode="decimal"
            value={value}
            onChange={(e) => onChange(formatBRL(e.target.value))}
            placeholder="0,00"
            disabled={disabled}
            className={`${BASE_INPUT} pl-9`}
          />
        </div>
      );

    case 'list':
      return (
        <div className="relative">
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className="h-9 w-full appearance-none rounded-lg border border-border bg-muted/60 px-3 pr-8 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 cursor-pointer disabled:opacity-50"
          >
            <option value="">Selecionar…</option>
            {options.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>
      );

    case 'date':
      return (
        <Input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={BASE_INPUT}
        />
      );

    case 'checkbox':
      return (
        <div className="flex items-center gap-3 py-1">
          <Switch
            checked={value === 'true'}
            onCheckedChange={(checked) => onChange(checked ? 'true' : 'false')}
            disabled={disabled}
          />
          <span className="text-sm text-muted-foreground">
            {value === 'true' ? 'Sim' : 'Não'}
          </span>
        </div>
      );

    default: // 'text'
      return (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Inserir ${field.field_name}…`}
          disabled={disabled}
          className={BASE_INPUT}
        />
      );
  }
}

// Formats a raw string to Brazilian currency display (e.g. "1500,50")
function formatBRL(raw: string): string {
  const stripped = raw.replace(/\./g, '');
  const hasComma = stripped.includes(',');
  const [intRaw, decRaw = ''] = stripped.split(',');
  const digits = intRaw.replace(/\D/g, '');
  const formatted = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  if (hasComma) return formatted + ',' + decRaw.replace(/\D/g, '').slice(0, 2);
  return formatted;
}

/** Returns a human-readable display value for a custom field (used in read-only contexts). */
export function formatCustomFieldValue(field: CustomField, raw: string | null | undefined): string {
  if (!raw) return '—';
  switch (field.field_type) {
    case 'checkbox': return raw === 'true' ? 'Sim' : 'Não';
    case 'currency': return `R$ ${raw}`;
    case 'date': {
      const d = new Date(raw + 'T00:00:00');
      return isNaN(d.getTime()) ? raw : d.toLocaleDateString('pt-BR');
    }
    default: return raw;
  }
}
