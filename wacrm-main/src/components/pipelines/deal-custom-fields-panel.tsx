'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { CustomField } from '@/types'
import { CustomFieldInput } from '@/components/shared/custom-field-input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Loader2, Save, SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface DealCustomFieldsPanelProps {
  dealId: string
  className?: string
}

export function DealCustomFieldsPanel({ dealId, className }: DealCustomFieldsPanelProps) {
  const supabase = createClient()

  const [fields, setFields] = useState<CustomField[]>([])
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [fieldsRes, valuesRes] = await Promise.all([
      supabase.from('custom_fields').select('*').eq('entity_type', 'deal').order('field_name'),
      supabase.from('deal_custom_values').select('*').eq('deal_id', dealId),
    ])
    if (fieldsRes.data) setFields(fieldsRes.data as CustomField[])
    if (valuesRes.data) {
      const map: Record<string, string> = {}
      valuesRes.data.forEach((v) => { map[v.custom_field_id] = v.value ?? '' })
      setValues(map)
    }
    setLoading(false)
  }, [dealId, supabase])

  useEffect(() => { fetchData() }, [fetchData])

  async function save() {
    setSaving(true)
    try {
      await supabase.from('deal_custom_values').delete().eq('deal_id', dealId)
      const rows = Object.entries(values)
        .filter(([, val]) => val.trim())
        .map(([fieldId, val]) => ({ deal_id: dealId, custom_field_id: fieldId, value: val.trim() }))
      if (rows.length > 0) {
        const { error } = await supabase
          .from('deal_custom_values')
          .upsert(rows, { onConflict: 'deal_id,custom_field_id' })
        if (error) throw error
      }
      toast.success('Campos personalizados salvos')
    } catch {
      toast.error('Falha ao salvar campos personalizados')
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className={cn('flex justify-center py-6', className)}>
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (fields.length === 0) return null

  return (
    <div className={cn('rounded-xl border border-border bg-card p-4 space-y-4', className)}>
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="size-4 text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">Campos personalizados</p>
      </div>

      <div className="space-y-3">
        {fields.map((field) => (
          <div key={field.id} className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground capitalize">
              {field.field_name}
            </Label>
            <CustomFieldInput
              field={field}
              value={values[field.id] ?? ''}
              onChange={(val) => setValues((prev) => ({ ...prev, [field.id]: val }))}
            />
          </div>
        ))}
      </div>

      <Button
        onClick={save}
        disabled={saving}
        size="sm"
        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
      >
        {saving ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : <Save className="size-3.5 mr-1.5" />}
        Salvar campos
      </Button>
    </div>
  )
}
