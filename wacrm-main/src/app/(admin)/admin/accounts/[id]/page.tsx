"use client";

import { useEffect, useState, use as usePromise } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BUSINESS_TYPES, AVAILABLE_FEATURES } from "@/lib/auth/platform-accounts";

interface AdminAccountDetail {
  id: string;
  name: string;
  business_type: string;
  max_seats: number | null;
  status: "active" | "suspended" | "trial";
  enabled_features: string[];
}

interface Member {
  user_id: string;
  full_name: string | null;
  email: string | null;
  account_role: string;
}

export default function AdminAccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = usePromise(params);

  const [account, setAccount] = useState<AdminAccountDetail | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [businessType, setBusinessType] = useState("other");
  const [maxSeats, setMaxSeats] = useState("");
  const [status, setStatus] = useState("active");
  const [enabledFeatures, setEnabledFeatures] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/accounts/${id}`);
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || "Falha ao carregar conta");
        if (cancelled) return;

        const a = payload.account as AdminAccountDetail;
        setAccount(a);
        setBusinessType(a.business_type);
        setMaxSeats(a.max_seats != null ? String(a.max_seats) : "");
        setStatus(a.status);
        setEnabledFeatures(a.enabled_features ?? []);
        setMembers(payload.members ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Falha ao carregar conta");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  function toggleFeature(key: string, checked: boolean) {
    setEnabledFeatures((prev) =>
      checked ? [...prev, key] : prev.filter((k) => k !== key),
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/accounts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessType,
          maxSeats: maxSeats.trim() === "" ? null : Number(maxSeats),
          status,
          enabledFeatures,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload.error || "Falha ao salvar");
        return;
      }
      toast.success("Conta atualizada");
      setAccount(payload.account);
    } catch {
      toast.error("Falha de rede ao salvar");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (error || !account) {
    return <p className="text-sm text-destructive">{error ?? "Conta não encontrada"}</p>;
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Voltar
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{account.name}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configuração</CardTitle>
          <CardDescription>Tipo, limite de usuários, status e módulos.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="businessType">Tipo de negócio</Label>
            <Select value={businessType} onValueChange={(v) => v && setBusinessType(v)}>
              <SelectTrigger id="businessType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUSINESS_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="status">Status</Label>
            <Select value={status} onValueChange={(v) => v && setStatus(v)}>
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Ativa</SelectItem>
                <SelectItem value="trial">Trial</SelectItem>
                <SelectItem value="suspended">Suspensa</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="maxSeats">Limite de usuários (vazio = ilimitado)</Label>
            <Input
              id="maxSeats"
              type="number"
              min={1}
              value={maxSeats}
              onChange={(e) => setMaxSeats(e.target.value)}
            />
          </div>

          <div>
            <Label>Módulos habilitados</Label>
            <div className="mt-2 space-y-2">
              {AVAILABLE_FEATURES.map((feature) => (
                <div key={feature.key} className="flex items-center gap-2">
                  <Checkbox
                    id={`feature-${feature.key}`}
                    checked={enabledFeatures.includes(feature.key)}
                    onCheckedChange={(checked) =>
                      toggleFeature(feature.key, checked === true)
                    }
                  />
                  <Label htmlFor={`feature-${feature.key}`} className="font-normal">
                    {feature.label}
                    {!feature.implemented && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        (ainda não implementado)
                      </span>
                    )}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando…
              </>
            ) : (
              "Salvar"
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Membros ({members.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum membro ainda.</p>
          ) : (
            members.map((m) => (
              <div
                key={m.user_id}
                className="flex items-center justify-between border-b py-2 last:border-0"
              >
                <div>
                  <p className="text-sm font-medium">{m.full_name || m.email}</p>
                  {m.full_name && (
                    <p className="text-xs text-muted-foreground">{m.email}</p>
                  )}
                </div>
                <Badge variant="outline">{m.account_role}</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
