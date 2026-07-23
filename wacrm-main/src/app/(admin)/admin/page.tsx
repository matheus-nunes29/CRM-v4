"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Plus } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { BUSINESS_TYPES } from "@/lib/auth/platform-accounts";

interface AdminAccount {
  id: string;
  name: string;
  business_type: string;
  max_seats: number | null;
  status: "active" | "suspended" | "trial";
  enabled_features: string[];
  created_at: string;
  seatsUsed: number;
}

function businessTypeLabel(value: string): string {
  return BUSINESS_TYPES.find((t) => t.value === value)?.label ?? value;
}

function statusBadgeVariant(status: string): "default" | "destructive" | "secondary" {
  if (status === "suspended") return "destructive";
  if (status === "trial") return "secondary";
  return "default";
}

export default function AdminAccountsPage() {
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/accounts");
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || "Failed to load accounts");
        if (!cancelled) setAccounts(payload.accounts ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load accounts");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Contas de clientes</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie os acessos, limites de usuários e módulos habilitados
            para cada cliente.
          </p>
        </div>
        {/* buttonVariants applied directly to the anchor rather than
            <Button asChild> — the wacrm Button is the Base UI
            ButtonPrimitive, no Radix-style asChild slot. */}
        <Link href="/admin/accounts/new" className={buttonVariants({})}>
          <Plus className="mr-2 h-4 w-4" />
          Criar conta
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contas</CardTitle>
          <CardDescription>
            {loading ? "Carregando…" : `${accounts.length} conta(s)`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : error ? (
            <p className="py-6 text-sm text-destructive">{error}</p>
          ) : accounts.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              Nenhuma conta criada ainda.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Seats</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Criada em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell className="font-medium">{account.name}</TableCell>
                    <TableCell>{businessTypeLabel(account.business_type)}</TableCell>
                    <TableCell>
                      {account.seatsUsed}
                      {account.max_seats != null ? ` / ${account.max_seats}` : " / ∞"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(account.status)}>
                        {account.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(account.created_at).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/admin/accounts/${account.id}`}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        Editar
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
