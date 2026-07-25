"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Search, X } from "lucide-react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ProductOption {
  id: string;
  name: string;
  unit: string;
}

interface EntryRow {
  key: string;
  product: ProductOption | null;
  query: string;
  showDropdown: boolean;
  lotNumber: string;
  expirationDate: string;
  quantity: string;
}

function blankRow(): EntryRow {
  return {
    key:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2),
    product: null,
    query: "",
    showDropdown: false,
    lotNumber: "",
    expirationDate: "",
    quantity: "",
  };
}

function rowIsEmpty(r: EntryRow) {
  return !r.product && !r.lotNumber.trim() && !r.quantity.trim();
}

function rowIsComplete(r: EntryRow) {
  const qty = Number(r.quantity.replace(",", "."));
  return !!r.product && !!r.lotNumber.trim() && Number.isFinite(qty) && qty > 0;
}

// Same ledger discipline as the single-product entry dialog — a lot row
// plus its matching "entrada" stock_movements row per item, just several
// items in one go so a whole purchase can be lançada without opening each
// product's page one by one.
export function StockBulkEntryDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const supabase = createClient();
  const { accountId } = useAuth();

  const [rows, setRows] = useState<EntryRow[]>([blankRow()]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !accountId) return;
    supabase
      .from("products")
      .select("id, name, unit")
      .eq("tracks_stock", true)
      .order("name")
      .then(({ data }) => setProducts((data as ProductOption[]) ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, accountId]);

  function reset() {
    setRows([blankRow()]);
  }

  function updateRow(key: string, patch: Partial<EntryRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, blankRow()]);
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  }

  async function handleSave() {
    if (!accountId) return;

    const nonEmpty = rows.filter((r) => !rowIsEmpty(r));
    if (nonEmpty.length === 0) {
      toast.error("Adicione ao menos um item");
      return;
    }
    const incomplete = nonEmpty.find((r) => !rowIsComplete(r));
    if (incomplete) {
      toast.error(
        `Complete o item "${incomplete.product?.name ?? incomplete.lotNumber ?? "sem produto"}" (produto, lote e quantidade) antes de salvar`,
      );
      return;
    }

    setSaving(true);
    try {
      for (const row of nonEmpty) {
        const qty = Number(row.quantity.replace(",", "."));
        const { data: lot, error: lotError } = await supabase
          .from("product_stock_lots")
          .insert({
            account_id: accountId,
            product_id: row.product!.id,
            lot_number: row.lotNumber.trim(),
            expiration_date: row.expirationDate || null,
            quantity_received: qty,
          })
          .select("id")
          .single();

        if (lotError || !lot) {
          toast.error(`Falha ao criar lote de ${row.product!.name}: ${lotError?.message ?? "erro desconhecido"}`);
          return;
        }

        const { error: movementError } = await supabase.from("stock_movements").insert({
          account_id: accountId,
          product_id: row.product!.id,
          lot_id: lot.id,
          movement_type: "entrada",
          quantity: qty,
        });

        if (movementError) {
          toast.error(`Falha ao registrar movimento de ${row.product!.name}: ${movementError.message}`);
          return;
        }
      }

      toast.success(
        `${nonEmpty.length} entrada${nonEmpty.length === 1 ? "" : "s"} registrada${nonEmpty.length === 1 ? "" : "s"}`,
      );
      reset();
      onOpenChange(false);
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nova entrada de estoque</DialogTitle>
          <DialogDescription>
            Registre vários produtos de uma vez — útil pra lançar uma compra
            inteira sem entrar produto por produto.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] space-y-3 overflow-y-auto py-2">
          {rows.map((row, i) => (
            <div key={row.key} className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Item {i + 1}</Label>
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(row.key)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={`Remover item ${i + 1}`}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Produto</Label>
                {row.product ? (
                  <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                    <span>{row.product.name}</span>
                    <button
                      type="button"
                      onClick={() => updateRow(row.key, { product: null, query: "" })}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={row.query}
                      onChange={(e) => updateRow(row.key, { query: e.target.value, showDropdown: true })}
                      onFocus={() => updateRow(row.key, { showDropdown: true })}
                      onBlur={() => setTimeout(() => updateRow(row.key, { showDropdown: false }), 150)}
                      placeholder="Buscar produto..."
                      className="pl-8"
                    />
                    {row.showDropdown && row.query.trim() && (
                      <div className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-border bg-popover shadow-md">
                        {products
                          .filter((p) => p.name.toLowerCase().includes(row.query.toLowerCase()))
                          .map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onMouseDown={() => updateRow(row.key, { product: p, query: p.name, showDropdown: false })}
                              className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                            >
                              {p.name}
                            </button>
                          ))}
                        {products.filter((p) => p.name.toLowerCase().includes(row.query.toLowerCase())).length === 0 && (
                          <p className="px-3 py-2 text-xs text-muted-foreground">Nenhum produto encontrado</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Lote</Label>
                  <Input
                    value={row.lotNumber}
                    onChange={(e) => updateRow(row.key, { lotNumber: e.target.value })}
                    placeholder="Ex: L2026-045"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Validade</Label>
                  <Input
                    type="date"
                    value={row.expirationDate}
                    onChange={(e) => updateRow(row.key, { expirationDate: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Quantidade{row.product ? ` (${row.product.unit})` : ""}</Label>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={row.quantity}
                    onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                    placeholder="0"
                  />
                </div>
              </div>
            </div>
          ))}

          <Button variant="outline" size="sm" onClick={addRow} className="w-full">
            <Plus className="size-4" />
            Adicionar item
          </Button>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {rows.filter((r) => !rowIsEmpty(r)).length > 1 ? "Registrar entradas" : "Registrar entrada"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
