'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { useCan } from '@/hooks/use-can'
import { toast } from 'sonner'
import { Package, Plus, Pencil, Trash2, X, Check, ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SettingsPanelHead } from './settings-panel-head'
import { cn } from '@/lib/utils'

interface Product {
  id: string
  name: string
  description: string | null
  type: 'product' | 'service'
  default_price: number | null
  created_at: string
}

const TYPE_META = {
  product: { label: 'Produto', icon: Package, className: 'bg-blue-500/10 text-blue-500' },
  service: { label: 'Serviço', icon: ShoppingCart, className: 'bg-violet-500/10 text-violet-500' },
}

function fmtPrice(v: number | null) {
  if (v === null || v === undefined) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(v)
}

interface FormState {
  name: string
  description: string
  type: 'product' | 'service'
  default_price: string
}

const EMPTY_FORM: FormState = { name: '', description: '', type: 'product', default_price: '' }

export function ProductsPanel() {
  const supabase = createClient()
  const { accountId } = useAuth()
  const canEdit = useCan('edit-settings')

  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('products')
      .select('*')
      .order('name', { ascending: true })
    setProducts((data ?? []) as Product[])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  function openNew() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormOpen(true)
  }

  function openEdit(p: Product) {
    setEditing(p)
    setForm({
      name: p.name,
      description: p.description ?? '',
      type: p.type,
      default_price: p.default_price != null ? String(p.default_price) : '',
    })
    setFormOpen(true)
  }

  function closeForm() {
    setFormOpen(false)
    setEditing(null)
    setForm(EMPTY_FORM)
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Nome obrigatório'); return }
    if (!accountId) return
    setSaving(true)

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      type: form.type,
      default_price: form.default_price !== '' ? parseFloat(form.default_price.replace(',', '.')) : null,
      account_id: accountId,
    }

    if (editing) {
      const { error } = await supabase.from('products').update(payload).eq('id', editing.id)
      if (error) { toast.error('Falha ao atualizar'); setSaving(false); return }
      toast.success('Atualizado')
    } else {
      const { error } = await supabase.from('products').insert(payload)
      if (error) { toast.error('Falha ao criar'); setSaving(false); return }
      toast.success('Criado')
    }

    setSaving(false)
    closeForm()
    load()
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    const { error } = await supabase.from('products').delete().eq('id', id)
    if (error) toast.error('Falha ao excluir')
    else { toast.success('Excluído'); load() }
    setDeletingId(null)
  }

  return (
    <section className="max-w-3xl animate-in fade-in-50 space-y-4 duration-200">
      <SettingsPanelHead
        title="Produtos e Serviços"
        description="Cadastre os itens que compõem o valor dos seus negócios. O preço padrão é opcional e pode ser ajustado por negócio."
      />

      {/* Form */}
      {formOpen && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{editing ? 'Editar' : 'Novo produto ou serviço'}</h3>
            <button type="button" onClick={closeForm} className="text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
          </div>

          {/* Type toggle */}
          <div className="flex gap-2">
            {(['product', 'service'] as const).map(t => {
              const meta = TYPE_META[t]
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, type: t }))}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                    form.type === t
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-border hover:text-foreground',
                  )}
                >
                  <meta.icon className="size-3.5" />
                  {meta.label}
                </button>
              )
            })}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="p-name">Nome *</Label>
              <Input
                id="p-name"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Consultoria mensal"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-price">Preço padrão (opcional)</Label>
              <Input
                id="p-price"
                value={form.default_price}
                onChange={e => setForm(f => ({ ...f, default_price: e.target.value }))}
                placeholder="0,00"
                inputMode="decimal"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-desc">Descrição (opcional)</Label>
              <Input
                id="p-desc"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Breve descrição"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={closeForm}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Criar'}
            </Button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold text-foreground">
            {loading ? 'Carregando...' : `${products.length} item${products.length !== 1 ? 's' : ''}`}
          </p>
          {canEdit && !formOpen && (
            <Button size="sm" onClick={openNew} className="gap-1.5">
              <Plus className="size-3.5" /> Novo item
            </Button>
          )}
        </div>

        {!loading && products.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Package className="size-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Nenhum produto ou serviço cadastrado.</p>
            {canEdit && (
              <Button size="sm" variant="outline" onClick={openNew} className="mt-1 gap-1.5">
                <Plus className="size-3.5" /> Criar primeiro item
              </Button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {products.map(p => {
              const meta = TYPE_META[p.type]
              return (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide shrink-0', meta.className)}>
                    <meta.icon className="size-2.5" />
                    {meta.label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                    {p.description && <p className="truncate text-xs text-muted-foreground">{p.description}</p>}
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                    {fmtPrice(p.default_price)}
                  </span>
                  {canEdit && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(p)}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(p.id)}
                        disabled={deletingId === p.id}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-40"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
