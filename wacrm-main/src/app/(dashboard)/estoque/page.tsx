"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Boxes, Loader2, Plus } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StockBulkEntryDialog } from "@/components/estoque/stock-bulk-entry-dialog";

interface StockProductRow {
  id: string;
  name: string;
  unit: string;
  total_remaining: number;
  lot_count: number;
}

export default function EstoquePage() {
  const [products, setProducts] = useState<StockProductRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [entryOpen, setEntryOpen] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: trackedProducts, error: productsErr } = await supabase
      .from("products")
      .select("id, name, unit")
      .eq("tracks_stock", true)
      .order("name");

    if (productsErr) {
      setError(productsErr.message);
      return;
    }

    const { data: lots, error: lotsErr } = await supabase
      .from("product_stock_lots")
      .select("product_id, quantity_remaining");

    if (lotsErr) {
      setError(lotsErr.message);
      return;
    }

    const totals = new Map<string, { remaining: number; count: number }>();
    for (const lot of lots ?? []) {
      const prev = totals.get(lot.product_id) ?? { remaining: 0, count: 0 };
      totals.set(lot.product_id, {
        remaining: prev.remaining + Number(lot.quantity_remaining),
        count: prev.count + 1,
      });
    }

    setProducts(
      (trackedProducts ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        unit: p.unit,
        total_remaining: totals.get(p.id)?.remaining ?? 0,
        lot_count: totals.get(p.id)?.count ?? 0,
      })),
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Estoque</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Saldo por produto e histórico de entradas, uso clínico e ajustes.
            Produtos com controle de estoque são marcados em{" "}
            <Link href="/settings?tab=products" className="underline hover:text-foreground">
              Produtos e Serviços
            </Link>
            .
          </p>
        </div>
        <Button onClick={() => setEntryOpen(true)} className="shrink-0">
          <Plus className="size-4" />
          Nova entrada
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : products === null ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
          <Boxes className="size-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            Nenhum produto com controle de estoque ainda. Marque &quot;Controla
            estoque&quot; num produto em Configurações → Produtos e Serviços.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>Lotes ativos</TableHead>
                <TableHead>Saldo total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => (
                <TableRow
                  key={p.id}
                  className="cursor-pointer"
                  onClick={() => (window.location.href = `/estoque/${p.id}`)}
                >
                  <TableCell className="font-medium">
                    <Link href={`/estoque/${p.id}`}>{p.name}</Link>
                  </TableCell>
                  <TableCell>{p.lot_count}</TableCell>
                  <TableCell>
                    {p.total_remaining} {p.unit}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <StockBulkEntryDialog
        open={entryOpen}
        onOpenChange={setEntryOpen}
        onCreated={load}
      />
    </div>
  );
}
