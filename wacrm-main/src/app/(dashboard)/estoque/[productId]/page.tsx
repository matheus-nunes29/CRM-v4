"use client";

import { useCallback, useEffect, useState, use as usePromise } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2, Plus, Wrench } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StockEntryDialog } from "@/components/estoque/stock-entry-dialog";
import { StockAdjustmentDialog } from "@/components/estoque/stock-adjustment-dialog";

interface ProductInfo {
  id: string;
  name: string;
  unit: string;
  min_stock_threshold: number | null;
}

/** Same rule as the Estoque list page: red at/below the minimum, amber
 *  up to twice the minimum, normal above — no threshold means no alert. */
function stockLevel(remaining: number, threshold: number | null): "critical" | "low" | "ok" {
  if (threshold == null) return "ok";
  if (remaining <= threshold) return "critical";
  if (remaining <= threshold * 2) return "low";
  return "ok";
}

interface Lot {
  id: string;
  lot_number: string;
  expiration_date: string | null;
  quantity_received: number;
  quantity_remaining: number;
}

interface Movement {
  id: string;
  movement_type: string;
  quantity: number;
  reason: string | null;
  patient_record_id: string | null;
  created_at: string;
  lot_id: string;
}

const MOVEMENT_LABEL: Record<string, string> = {
  entrada: "Entrada",
  uso_clinico: "Uso clínico",
  ajuste_perda: "Perda/quebra",
  ajuste_contagem: "Correção de contagem",
};

export default function ProductStockPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = usePromise(params);

  const [product, setProduct] = useState<ProductInfo | null>(null);
  const [lots, setLots] = useState<Lot[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [entryOpen, setEntryOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    setLoading(true);
    const [productRes, lotsRes, movementsRes] = await Promise.all([
      supabase.from("products").select("id, name, unit, min_stock_threshold").eq("id", productId).maybeSingle(),
      supabase
        .from("product_stock_lots")
        .select("id, lot_number, expiration_date, quantity_received, quantity_remaining")
        .eq("product_id", productId)
        .order("expiration_date", { ascending: true, nullsFirst: false }),
      supabase
        .from("stock_movements")
        .select("id, movement_type, quantity, reason, patient_record_id, created_at, lot_id")
        .eq("product_id", productId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    setProduct((productRes.data as ProductInfo) ?? null);
    setLots((lotsRes.data as Lot[]) ?? []);
    setMovements((movementsRes.data as Movement[]) ?? []);
    setLoading(false);
  }, [productId]);

  useEffect(() => {
    load();
  }, [load]);

  const totalRemaining = lots.reduce((sum, l) => sum + Number(l.quantity_remaining), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!product) {
    return <p className="text-sm text-destructive">Produto não encontrado.</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/estoque" className="text-sm text-muted-foreground hover:underline">
          ← Estoque
        </Link>
        <div className="mt-2 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{product.name}</h1>
            {(() => {
              const threshold = product.min_stock_threshold != null ? Number(product.min_stock_threshold) : null;
              const level = stockLevel(totalRemaining, threshold);
              return (
                <p
                  className={cn(
                    "flex items-center gap-1.5 text-sm",
                    level === "ok" && "text-muted-foreground",
                    level === "critical" && "font-medium text-destructive",
                    level === "low" && "font-medium text-amber-600 dark:text-amber-400",
                  )}
                >
                  {level !== "ok" && <AlertTriangle className="size-3.5 shrink-0" />}
                  Saldo total: {totalRemaining} {product.unit}
                </p>
              );
            })()}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setAdjustOpen(true)} disabled={lots.length === 0}>
              <Wrench className="mr-2 h-4 w-4" />
              Ajuste
            </Button>
            <Button onClick={() => setEntryOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nova entrada
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lotes</CardTitle>
          <CardDescription>Ordenados pelo mais próximo de vencer.</CardDescription>
        </CardHeader>
        <CardContent>
          {lots.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">Nenhum lote cadastrado ainda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lote</TableHead>
                  <TableHead>Validade</TableHead>
                  <TableHead>Recebido</TableHead>
                  <TableHead>Restante</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lots.map((lot) => (
                  <TableRow key={lot.id}>
                    <TableCell className="font-medium">{lot.lot_number}</TableCell>
                    <TableCell>{lot.expiration_date ?? "—"}</TableCell>
                    <TableCell>{lot.quantity_received}</TableCell>
                    <TableCell>{lot.quantity_remaining}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Movimentações</CardTitle>
          <CardDescription>Últimas 50 — entrada, uso clínico e ajustes.</CardDescription>
        </CardHeader>
        <CardContent>
          {movements.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">Nenhuma movimentação ainda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Quantidade</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-muted-foreground">
                      {new Date(m.created_at).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell>{MOVEMENT_LABEL[m.movement_type] ?? m.movement_type}</TableCell>
                    <TableCell className={m.quantity < 0 ? "text-destructive" : "text-foreground"}>
                      {m.quantity > 0 ? "+" : ""}
                      {m.quantity}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {m.reason ?? (m.patient_record_id ? "Evolução de prontuário" : "—")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <StockEntryDialog
        open={entryOpen}
        onOpenChange={setEntryOpen}
        productId={productId}
        onCreated={load}
      />
      <StockAdjustmentDialog
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        productId={productId}
        lots={lots.filter((l) => l.quantity_remaining > 0)}
        onCreated={load}
      />
    </div>
  );
}
