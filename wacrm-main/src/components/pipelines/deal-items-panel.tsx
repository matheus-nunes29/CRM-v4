'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import {
  Package, Plus, Search, Trash2, ShoppingCart, Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Product {
  id: string
  name: string
  description: string | null
  type: 'product' | 'service'
  default_price: number | null
}

interface DealItem {
  id: string
  deal_id: string
  product_id: string | null
  name: string
  price: number
  quantity: number
}

interface Props {
  dealId: string
  currency?: string
  onValueChange?: (total: number) => void
}

function fmtCurrency(v: number, currency = 'BRL') {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(v)
}

const TYPE_ICON = {
  product: Package,
  service: ShoppingCart,
}

export function DealItemsPanel({ dealId, currency = 'BRL', onValueChange }: Props) {
  const supabase = createClient()
  const { accountId } = useAuth()

  const [items, setItems] = useState<DealItem[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)

  // Search/add state
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [productsLoading, setProductsLoading] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  // Inline edit state per item
  const [editingItem, setEditingItem] = useState<{ id: string; qty: string; price: string } | null>(null)

  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0)

  const loadItems = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('deal_items')
      .select('*')
      .eq('deal_id', dealId)
      .order('created_at', { ascending: true })
    setItems((data ?? []) as DealItem[])
    setLoading(false)
  }, [dealId, supabase])

  useEffect(() => { loadItems() }, [loadItems])

  useEffect(() => { onValueChange?.(total) }, [total, onValueChange])

  // Load products for search
  useEffect(() => {
    if (!searchOpen) return
    setProductsLoading(true)
    supabase
      .from('products')
      .select('*')
      .order('name', { ascending: true })
      .then(({ data }) => {
        setProducts((data ?? []) as Product[])
        setProductsLoading(false)
      })
  }, [searchOpen, supabase])

  // Focus search input when panel opens
  useEffect(() => {
    if (searchOpen) setTimeout(() => searchRef.current?.focus(), 50)
  }, [searchOpen])

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  async function addProduct(product: Product) {
    if (!accountId) return
    setAdding(true)
    const { error } = await supabase.from('deal_items').insert({
      deal_id: dealId,
      account_id: accountId,
      product_id: product.id,
      name: product.name,
      price: product.default_price ?? 0,
      quantity: 1,
    })
    if (error) { toast.error('Falha ao adicionar item'); setAdding(false); return }
    setSearchOpen(false)
    setSearchQuery('')
    setAdding(false)
    await loadItems()
  }

  async function removeItem(id: string) {
    const { error } = await supabase.from('deal_items').delete().eq('id', id)
    if (error) { toast.error('Falha ao remover'); return }
    setItems(prev => prev.filter(i => i.id !== id))
  }

  function startEdit(item: DealItem) {
    setEditingItem({
      id: item.id,
      qty: String(item.quantity),
      price: String(item.price),
    })
  }

  async function saveEdit() {
    if (!editingItem) return
    const qty = parseFloat(editingItem.qty.replace(',', '.'))
    const price = parseFloat(editingItem.price.replace(',', '.'))
    if (isNaN(qty) || qty <= 0 || isNaN(price) || price < 0) {
      toast.error('Valores inválidos')
      return
    }
    const { error } = await supabase
      .from('deal_items')
      .update({ quantity: qty, price })
      .eq('id', editingItem.id)
    if (error) { toast.error('Falha ao salvar'); return }
    setItems(prev => prev.map(i => i.id === editingItem.id ? { ...i, quantity: qty, price } : i))
    setEditingItem(null)
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Package className="size-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Itens</span>
        </div>
        <button
          type="button"
          onClick={() => { setSearchOpen(true); setSearchQuery('') }}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="size-3.5" />
          Adicionar
        </button>
      </div>

      {/* Product search panel */}
      {searchOpen && (
        <div className="border-b border-border bg-muted/20 p-3 space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              ref={searchRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar produto ou serviço..."
              className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-3 text-sm outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="max-h-52 overflow-y-auto rounded-lg border border-border bg-background divide-y divide-border">
            {productsLoading ? (
              <p className="py-4 text-center text-xs text-muted-foreground">Carregando...</p>
            ) : filteredProducts.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                {searchQuery ? 'Nenhum resultado' : 'Nenhum produto cadastrado'}
              </p>
            ) : filteredProducts.map(p => {
              const Icon = TYPE_ICON[p.type]
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={adding}
                  onClick={() => addProduct(p)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors disabled:opacity-50"
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                    {p.description && <p className="truncate text-xs text-muted-foreground">{p.description}</p>}
                  </div>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                    {p.default_price != null ? fmtCurrency(p.default_price, currency) : 'Sem preço'}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => { setSearchOpen(false); setSearchQuery('') }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Items list */}
      {loading ? (
        <div className="py-8 text-center text-xs text-muted-foreground">Carregando...</div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-8 text-center">
          <Package className="size-7 text-muted-foreground/30" />
          <p className="text-xs text-muted-foreground">Nenhum item adicionado.</p>
        </div>
      ) : (
        <div>
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_80px_100px_80px_32px] gap-2 border-b border-border px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Item</span>
            <span className="text-right">Qtd</span>
            <span className="text-right">Preço unit.</span>
            <span className="text-right">Subtotal</span>
            <span />
          </div>

          {items.map(item => {
            const isEditing = editingItem?.id === item.id
            const subtotal = item.price * item.quantity

            return (
              <div
                key={item.id}
                className="grid grid-cols-[1fr_80px_100px_80px_32px] items-center gap-2 border-b border-border/50 last:border-0 px-4 py-2.5"
              >
                <span className="truncate text-sm font-medium text-foreground">{item.name}</span>

                {/* Qty */}
                {isEditing ? (
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editingItem.qty}
                    onChange={e => setEditingItem(prev => prev ? { ...prev, qty: e.target.value } : null)}
                    className="w-full rounded border border-primary bg-background px-1.5 py-0.5 text-right text-xs tabular-nums outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => startEdit(item)}
                    className="text-right text-xs tabular-nums text-foreground hover:text-primary transition-colors"
                    title="Clique para editar"
                  >
                    {item.quantity % 1 === 0 ? item.quantity.toFixed(0) : item.quantity}
                  </button>
                )}

                {/* Price */}
                {isEditing ? (
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editingItem.price}
                    onChange={e => setEditingItem(prev => prev ? { ...prev, price: e.target.value } : null)}
                    className="w-full rounded border border-primary bg-background px-1.5 py-0.5 text-right text-xs tabular-nums outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => startEdit(item)}
                    className="text-right text-xs tabular-nums text-foreground hover:text-primary transition-colors"
                    title="Clique para editar"
                  >
                    {fmtCurrency(item.price, currency)}
                  </button>
                )}

                {/* Subtotal */}
                <span className="text-right text-xs font-semibold tabular-nums text-foreground">
                  {fmtCurrency(subtotal, currency)}
                </span>

                {/* Actions */}
                <div className="flex items-center justify-end gap-0.5">
                  {isEditing ? (
                    <button
                      type="button"
                      onClick={saveEdit}
                      className="flex size-6 items-center justify-center rounded text-emerald-500 hover:bg-emerald-500/10 transition-colors"
                    >
                      <Check className="size-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}

          {/* Total row */}
          <div className="flex items-center justify-between border-t border-border bg-muted/20 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total</span>
            <span className="text-sm font-bold tabular-nums text-foreground">{fmtCurrency(total, currency)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
