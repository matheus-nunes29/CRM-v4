"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface LotOption {
  id: string;
  lot_number: string;
  quantity_remaining: number;
}

// Manual stock adjustment — the escape hatch for anything that isn't a
// patient-record deduction: breakage, expired product discarded, or a
// physical count that doesn't match the system. Always an explicit
// stock_movements insert with a required reason; never edits the lot
// record directly.
export function StockAdjustmentDialog({
  open,
  onOpenChange,
  productId,
  lots,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  lots: LotOption[];
  onCreated: () => void;
}) {
  const supabase = createClient();
  const { accountId, profile } = useAuth();

  const [lotId, setLotId] = useState<string>("");
  const [adjustmentType, setAdjustmentType] = useState<"ajuste_perda" | "ajuste_contagem">(
    "ajuste_perda",
  );
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setLotId("");
    setAdjustmentType("ajuste_perda");
    setAmount("");
    setReason("");
  }

  async function handleSave() {
    if (!lotId) {
      toast.error("Selecione o lote");
      return;
    }
    const parsed = Number(amount.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed === 0) {
      toast.error("Informe uma quantidade válida");
      return;
    }
    if (!reason.trim()) {
      toast.error("Descreva o motivo do ajuste");
      return;
    }
    if (!accountId) return;

    // Perda sempre reduz o saldo (o campo pede "quantidade perdida", um
    // número positivo, invertido aqui); contagem aceita o delta com o
    // sinal que o usuário já digitou (pode ser pra mais ou pra menos).
    const quantity = adjustmentType === "ajuste_perda" ? -Math.abs(parsed) : parsed;

    setSaving(true);
    try {
      const { error } = await supabase.from("stock_movements").insert({
        account_id: accountId,
        product_id: productId,
        lot_id: lotId,
        movement_type: adjustmentType,
        quantity,
        reason: reason.trim(),
        created_by: profile?.id ?? null,
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("Ajuste registrado");
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
          <DialogTitle>Ajuste de estoque</DialogTitle>
          <DialogDescription>
            Pra perda, quebra, produto vencido descartado, ou correção de
            contagem física — nunca edita o lote diretamente.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="adj-lot">Lote</Label>
            <Select value={lotId} onValueChange={(v) => v && setLotId(v)}>
              <SelectTrigger id="adj-lot">
                <SelectValue placeholder="Selecione o lote" />
              </SelectTrigger>
              <SelectContent>
                {lots.map((lot) => (
                  <SelectItem key={lot.id} value={lot.id}>
                    Lote {lot.lot_number} ({lot.quantity_remaining} restantes)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adj-type">Tipo de ajuste</Label>
            <Select
              value={adjustmentType}
              onValueChange={(v) => v && setAdjustmentType(v as typeof adjustmentType)}
            >
              <SelectTrigger id="adj-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ajuste_perda">Perda / quebra / vencido</SelectItem>
                <SelectItem value="ajuste_contagem">Correção de contagem</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adj-amount">
              {adjustmentType === "ajuste_perda"
                ? "Quantidade perdida"
                : "Diferença encontrada (use - para menos)"}
            </Label>
            <Input
              id="adj-amount"
              type="number"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adj-reason">Motivo</Label>
            <Textarea
              id="adj-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: frasco quebrou ao abrir, validade vencida em 10/07..."
              className="min-h-[70px] resize-none"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Registrar ajuste
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
