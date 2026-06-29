"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Coins, Loader2, Plus, Trash2, AlertTriangle } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { CURRENCIES } from "@/lib/currency";
import type { LossReason } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { SettingsPanelHead } from "./settings-panel-head";

export function DealsSettings() {
  const supabase = createClient();
  const {
    accountId,
    defaultCurrency,
    canEditSettings,
    profileLoading,
    refreshProfile,
  } = useAuth();

  // ── Currency ─────────────────────────────────────────────────────────────
  const [selected, setSelected] = useState(defaultCurrency);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelected(defaultCurrency);
  }, [defaultCurrency]);

  const dirty = selected !== defaultCurrency;

  async function handleSaveCurrency() {
    if (!accountId || !dirty) return;
    setSaving(true);
    const { error } = await supabase
      .from("accounts")
      .update({ default_currency: selected })
      .eq("id", accountId);
    if (error) {
      toast.error("Falha ao salvar moeda padrão");
      setSaving(false);
      return;
    }
    await refreshProfile();
    setSaving(false);
    toast.success("Moeda padrão atualizada");
  }

  // ── Loss reasons ──────────────────────────────────────────────────────────
  const [reasons, setReasons] = useState<LossReason[]>([]);
  const [reasonsLoading, setReasonsLoading] = useState(true);
  const [newLabel, setNewLabel] = useState("");
  const [addingReason, setAddingReason] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchReasons = useCallback(async () => {
    if (!accountId) return;
    setReasonsLoading(true);
    const { data } = await supabase
      .from("loss_reasons")
      .select("*")
      .eq("account_id", accountId)
      .order("position", { ascending: true });
    setReasons((data as LossReason[]) ?? []);
    setReasonsLoading(false);
  }, [supabase, accountId]);

  useEffect(() => {
    fetchReasons();
  }, [fetchReasons]);

  async function handleAddReason() {
    const label = newLabel.trim();
    if (!label || !accountId) return;
    setAddingReason(true);
    const { data, error } = await supabase
      .from("loss_reasons")
      .insert({ account_id: accountId, label, position: reasons.length })
      .select()
      .single();
    setAddingReason(false);
    if (error) {
      toast.error("Falha ao adicionar motivo");
      return;
    }
    setReasons((prev) => [...prev, data as LossReason]);
    setNewLabel("");
  }

  async function handleDeleteReason(id: string) {
    setDeletingId(id);
    const { error } = await supabase
      .from("loss_reasons")
      .delete()
      .eq("id", id);
    setDeletingId(null);
    if (error) {
      toast.error("Falha ao excluir motivo");
      return;
    }
    setReasons((prev) => prev.filter((r) => r.id !== id));
    toast.success("Motivo removido");
  }

  const DEFAULT_REASONS = [
    "Preço",
    "Concorrente",
    "Timing",
    "Sem resposta",
    "Sem interesse",
    "Outro",
  ];

  async function handleSeedDefaults() {
    if (!accountId) return;
    const rows = DEFAULT_REASONS.filter(
      (label) => !reasons.some((r) => r.label.toLowerCase() === label.toLowerCase()),
    ).map((label, i) => ({ account_id: accountId, label, position: reasons.length + i }));
    if (rows.length === 0) {
      toast.info("Todos os motivos padrão já existem");
      return;
    }
    const { data, error } = await supabase
      .from("loss_reasons")
      .insert(rows)
      .select();
    if (error) {
      toast.error("Falha ao adicionar motivos padrão");
      return;
    }
    setReasons((prev) => [...prev, ...(data as LossReason[])]);
    toast.success(`${rows.length} motivo(s) adicionado(s)`);
  }

  return (
    <section className="max-w-2xl animate-in fade-in-50 duration-200 space-y-6">
      <SettingsPanelHead
        title="Negócios e moeda"
        description="Configure a moeda padrão e os motivos de perda de negócios."
      />

      {/* Currency */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Coins className="size-4 text-primary" />
            Moeda padrão
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Novos negócios usam esta moeda por padrão. Negócios existentes
            mantêm a moeda com que foram salvos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:max-w-xs">
            <Label className="text-muted-foreground">Moeda</Label>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={!canEditSettings || profileLoading}
              className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.label}
                </option>
              ))}
            </select>
            {!canEditSettings && (
              <p className="text-xs text-muted-foreground">
                Apenas administradores podem alterar a moeda padrão.
              </p>
            )}
          </div>
          {canEditSettings && (
            <Button
              onClick={handleSaveCurrency}
              disabled={saving || !dirty}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar"
              )}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Loss reasons */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <AlertTriangle className="size-4 text-primary" />
            Motivos de perda
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Ao marcar um negócio como perdido, o agente escolhe um destes
            motivos. Use para identificar padrões e melhorar conversões.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {reasonsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Carregando...
            </div>
          ) : (
            <>
              {reasons.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-4 text-center">
                  <p className="text-sm text-muted-foreground">
                    Nenhum motivo cadastrado ainda.
                  </p>
                  {canEditSettings && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={handleSeedDefaults}
                    >
                      Usar motivos padrão
                    </Button>
                  )}
                </div>
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {reasons.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center justify-between gap-3 px-4 py-2.5"
                    >
                      <span className="text-sm text-foreground">{r.label}</span>
                      {canEditSettings && (
                        <button
                          type="button"
                          aria-label={`Excluir motivo "${r.label}"`}
                          onClick={() => handleDeleteReason(r.id)}
                          disabled={deletingId === r.id}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-40"
                        >
                          {deletingId === r.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="size-3.5" />
                          )}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {canEditSettings && (
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Novo motivo de perda"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddReason();
                    }}
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddReason}
                    disabled={!newLabel.trim() || addingReason}
                    className="shrink-0"
                  >
                    {addingReason ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                    Adicionar
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
