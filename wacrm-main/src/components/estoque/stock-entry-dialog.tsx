"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
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

// Creates a new lot ("entrada" — received a new batch) plus its matching
// stock_movements audit row, in the same spirit as every other stock
// change: nothing mutates quantity_remaining except a row in the ledger.
export function StockEntryDialog({
  open,
  onOpenChange,
  productId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  onCreated: () => void;
}) {
  const supabase = createClient();
  const { accountId } = useAuth();

  const [lotNumber, setLotNumber] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [quantity, setQuantity] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setLotNumber("");
    setExpirationDate("");
    setQuantity("");
  }

  async function handleSave() {
    const qty = Number(quantity.replace(",", "."));
    if (!lotNumber.trim()) {
      toast.error("Número do lote é obrigatório");
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("Quantidade recebida deve ser maior que zero");
      return;
    }
    if (!accountId) return;

    setSaving(true);
    try {
      const { data: lot, error: lotError } = await supabase
        .from("product_stock_lots")
        .insert({
          account_id: accountId,
          product_id: productId,
          lot_number: lotNumber.trim(),
          expiration_date: expirationDate || null,
          quantity_received: qty,
        })
        .select("id")
        .single();

      if (lotError || !lot) {
        toast.error(lotError?.message ?? "Falha ao criar lote");
        return;
      }

      const { error: movementError } = await supabase.from("stock_movements").insert({
        account_id: accountId,
        product_id: productId,
        lot_id: lot.id,
        movement_type: "entrada",
        quantity: qty,
      });

      if (movementError) {
        toast.error(movementError.message);
        return;
      }

      toast.success("Entrada registrada");
      reset();
      onOpenChange(false);
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova entrada de estoque</DialogTitle>
          <DialogDescription>
            Registra um lote recebido — a quantidade entra no saldo assim que
            salva.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="lot-number">Número do lote</Label>
            <Input
              id="lot-number"
              value={lotNumber}
              onChange={(e) => setLotNumber(e.target.value)}
              placeholder="Ex: L2026-045"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lot-expiration">Validade (opcional)</Label>
            <Input
              id="lot-expiration"
              type="date"
              value={expirationDate}
              onChange={(e) => setExpirationDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lot-quantity">Quantidade recebida</Label>
            <Input
              id="lot-quantity"
              type="number"
              step="any"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Registrar entrada
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
