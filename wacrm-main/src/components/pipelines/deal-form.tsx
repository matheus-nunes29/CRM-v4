"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { CURRENCIES } from "@/lib/currency";
import type {
  Contact,
  CustomField,
  Deal,
  DealStatus,
  LossReason,
  PipelineStage,
  Profile,
} from "@/types";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ContactDetailContent } from "@/components/contacts/contact-detail-view";
import { CustomFieldInput } from "@/components/shared/custom-field-input";
import {
  Check,
  X,
  Trash2,
  TrendingUp,
  TrendingDown,
  RotateCcw,
  Loader2,
  User,
  Tag,
  CalendarDays,
  AlignLeft,
  ChevronDown,
  MessageCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface DealFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal?: Deal | null;
  pipelineId: string;
  stages: PipelineStage[];
  defaultStageId?: string;
  onSaved: () => void;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60">
      {children}
    </p>
  );
}

function FieldGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("space-y-1.5", className)}>{children}</div>;
}

function FieldLabel({
  children,
  required,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <Label className="flex items-center gap-1.5 text-[13px] font-medium text-foreground/75">
      {children}
      {required && <span className="text-primary">*</span>}
    </Label>
  );
}

function SelectField({
  value,
  onChange,
  children,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full appearance-none rounded-lg border border-border bg-muted/60 px-3 pr-8 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 cursor-pointer"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

function StatusBadge({ status }: { status: DealStatus | undefined }) {
  if (!status || status === "open") {
    return (
      <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-500">
        Em aberto
      </span>
    );
  }
  if (status === "won") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-500">
        <Check className="h-2.5 w-2.5" />
        Ganho
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-400">
      <X className="h-2.5 w-2.5" />
      Perdido
    </span>
  );
}

function currencySymbol(code: string) {
  if (code === "BRL") return "R$";
  if (code === "USD") return "$";
  if (code === "EUR") return "€";
  return "";
}

function formatCurrencyDisplay(raw: string): string {
  // Strip thousand dots so we work with digits + optional comma
  const stripped = raw.replace(/\./g, "");
  const hasComma = stripped.includes(",");
  const [intRaw, decRaw = ""] = stripped.split(",");
  const digits = intRaw.replace(/\D/g, "");
  const formatted = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  if (hasComma) return formatted + "," + decRaw.replace(/\D/g, "").slice(0, 2);
  return formatted;
}

function parseCurrencyDisplay(display: string): number {
  if (!display) return 0;
  return parseFloat(display.replace(/\./g, "").replace(",", ".")) || 0;
}

export function DealForm({
  open,
  onOpenChange,
  deal,
  pipelineId,
  stages,
  defaultStageId,
  onSaved,
}: DealFormProps) {
  const supabase = createClient();
  const { accountId, defaultCurrency } = useAuth();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [contactId, setContactId] = useState("");
  const [stageId, setStageId] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [notes, setNotes] = useState("");

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [dealFields, setDealFields] = useState<CustomField[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});

  const [saving, setSaving] = useState(false);
  const [statusAction, setStatusAction] = useState<DealStatus | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [outerTab, setOuterTab] = useState<'deal' | 'contact'>('deal');

  // Loss reason picker — shown when user clicks "Marcar como Perdido"
  const [lossReasons, setLossReasons] = useState<LossReason[]>([]);
  const [showLossPicker, setShowLossPicker] = useState(false);
  const [selectedLossReasonId, setSelectedLossReasonId] = useState<string>("");

  const openInboxForContact = useCallback(async () => {
    if (!contactId) return;
    const { data } = await supabase
      .from("conversations")
      .select("id")
      .eq("contact_id", contactId)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .single();
    if (data?.id) {
      onOpenChange(false);
      router.push(`/inbox?c=${data.id}`);
    } else {
      toast.error("Nenhuma conversa encontrada para este contato");
    }
  }, [contactId, supabase, router, onOpenChange]);

  // Reset the form fields every time the sheet opens or its input
  // props change. This is a legitimate prop-driven sync; the rule is
  // over-cautious here, hence the block-level disable.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);
    setOuterTab('deal');
    if (deal) {
      setTitle(deal.title);
      // Format stored number back into display string (e.g. 1500.5 → "1.500,50")
      const raw = deal.value ?? 0;
      if (raw === 0) {
        setValue("");
      } else {
        const hasCents = raw % 1 !== 0;
        const [intStr, decStr = ""] = raw.toFixed(hasCents ? 2 : 0).split(".");
        const formattedInt = intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
        setValue(hasCents ? formattedInt + "," + decStr : formattedInt);
      }
      setCurrency(deal.currency || defaultCurrency);
      // contact_id is nullable when the contact has been deleted
      // (migration 004: ON DELETE SET NULL). "" means "no selection".
      setContactId(deal.contact_id ?? "");
      setStageId(deal.stage_id);
      setAssignedTo(deal.assigned_to ?? "");
      setExpectedCloseDate(deal.expected_close_date ?? "");
      setNotes(deal.notes ?? "");
    } else {
      setTitle("");
      setValue("");
      setCurrency(defaultCurrency);
      setContactId("");
      setStageId(defaultStageId || stages[0]?.id || "");
      setAssignedTo("");
      setExpectedCloseDate("");
      setNotes("");
      setCustomValues({});
    }
  }, [open, deal, defaultStageId, stages, defaultCurrency]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Load supporting data once the sheet is open
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const [c, p, f, lr] = await Promise.all([
        supabase.from("contacts").select("*").order("name"),
        supabase.from("profiles").select("*").order("full_name"),
        supabase.from("custom_fields").select("*").eq("entity_type", "deal").order("field_name"),
        supabase.from("loss_reasons").select("*").order("position"),
      ]);
      if (cancelled) return;
      setContacts((c.data ?? []) as Contact[]);
      setProfiles((p.data ?? []) as Profile[]);
      setDealFields((f.data ?? []) as CustomField[]);
      setLossReasons((lr.data ?? []) as LossReason[]);
      setShowLossPicker(false);
      setSelectedLossReasonId("");

      // If editing, load existing custom values for this deal
      if (deal?.id) {
        const { data: vals } = await supabase
          .from("deal_custom_values")
          .select("custom_field_id, value")
          .eq("deal_id", deal.id);
        if (!cancelled && vals) {
          const valMap: Record<string, string> = {};
          vals.forEach((v: { custom_field_id: string; value?: string | null }) => {
            valMap[v.custom_field_id] = v.value ?? "";
          });
          setCustomValues(valMap);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, deal?.id, supabase]);

  async function handleSave() {
    if (!title.trim() || !contactId || !stageId) {
      toast.error("Título, contato e etapa são obrigatórios");
      return;
    }
    setSaving(true);

    const payload = {
      title: title.trim(),
      value: parseCurrencyDisplay(value),
      currency,
      contact_id: contactId,
      pipeline_id: pipelineId,
      stage_id: stageId,
      assigned_to: assignedTo || null,
      notes: notes.trim() || null,
      expected_close_date: expectedCloseDate || null,
    };

    let savedDealId: string | null = deal?.id ?? null;

    if (deal) {
      const { error } = await supabase
        .from("deals")
        .update(payload)
        .eq("id", deal.id);
      if (error) {
        toast.error("Falha ao salvar negócio");
        setSaving(false);
        return;
      }
    } else {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        toast.error("Não autenticado");
        setSaving(false);
        return;
      }
      if (!accountId) {
        toast.error("Seu perfil não está vinculado a uma conta.");
        setSaving(false);
        return;
      }
      const { data: newDeal, error } = await supabase
        .from("deals")
        .insert({ ...payload, user_id: user.id, account_id: accountId, status: "open" })
        .select("id")
        .single();
      if (error || !newDeal) {
        toast.error("Falha ao criar negócio");
        setSaving(false);
        return;
      }
      savedDealId = newDeal.id;
    }

    // Save deal custom field values
    if (savedDealId && dealFields.length > 0) {
      const toUpsert = dealFields
        .filter((f) => (customValues[f.id] ?? "").trim())
        .map((f) => ({ deal_id: savedDealId!, custom_field_id: f.id, value: customValues[f.id].trim() }));
      const toClear = dealFields
        .filter((f) => !(customValues[f.id] ?? "").trim())
        .map((f) => f.id);

      await Promise.all([
        toUpsert.length > 0
          ? supabase.from("deal_custom_values").upsert(toUpsert, { onConflict: "deal_id,custom_field_id" })
          : Promise.resolve(),
        toClear.length > 0 && deal
          ? supabase.from("deal_custom_values").delete().eq("deal_id", savedDealId).in("custom_field_id", toClear)
          : Promise.resolve(),
      ]);
    }

    setSaving(false);
    toast.success(deal ? "Negócio atualizado" : "Negócio criado");
    onOpenChange(false);
    onSaved();
  }

  async function handleStatusChange(status: DealStatus, lossReasonId?: string | null) {
    if (!deal) return;
    setStatusAction(status);
    const res = await fetch(`/api/deals/${deal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...(status === "lost" ? { loss_reason_id: lossReasonId ?? null } : {}) }),
    });
    setStatusAction(null);
    if (!res.ok) {
      toast.error("Falha ao atualizar status do negócio");
      return;
    }
    toast.success(
      status === "won"
        ? "Marcado como ganho"
        : status === "lost"
          ? "Marcado como perdido"
          : "Negócio reaberto",
    );
    onOpenChange(false);
    onSaved();
  }

  async function handleConfirmLost() {
    setShowLossPicker(false);
    await handleStatusChange("lost", selectedLossReasonId || null);
  }

  async function handleDelete() {
    if (!deal) return;
    setDeleting(true);
    const { error } = await supabase.from("deals").delete().eq("id", deal.id);
    setDeleting(false);
    if (error) {
      toast.error("Falha ao excluir negócio");
      return;
    }
    toast.success("Negócio excluído");
    setConfirmDelete(false);
    onOpenChange(false);
    onSaved();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="bg-popover border-border text-popover-foreground sm:max-w-[420px] w-full p-0 flex flex-col"
      >
        {/* ── Header ─────────────────────────────────────── */}
        <SheetHeader className="shrink-0 border-b border-border/50 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-base font-semibold text-foreground leading-tight">
                {deal ? "Editar Negócio" : "Novo Negócio"}
              </SheetTitle>
              {deal && (
                <div className="mt-1.5">
                  <StatusBadge status={deal.status} />
                </div>
              )}
            </div>
          </div>
        </SheetHeader>

        {/* ── Outer tab switcher (only when editing with a contact) ── */}
        {deal && contactId && (
          <div className="shrink-0 border-b border-border/50 flex">
            {(["deal", "contact"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setOuterTab(tab)}
                className={cn(
                  "flex-1 py-2.5 text-xs font-medium transition-colors border-b-2",
                  outerTab === tab
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {tab === "deal" ? "Negócio" : "Contato"}
              </button>
            ))}
          </div>
        )}

        {/* ── Contato tab ─────────────────────────────────── */}
        {outerTab === "contact" && deal && contactId ? (
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <div className="shrink-0 flex justify-end px-4 pt-3">
              <button
                type="button"
                onClick={openInboxForContact}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-600 hover:bg-emerald-500/20 transition-colors"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                Abrir no WhatsApp
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              <ContactDetailContent contactId={contactId} onUpdated={onSaved} />
            </div>
          </div>
        ) : (
        <>{/* ── Scrollable body ─────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">

          {/* Detalhes */}
          <div className="px-5 pt-5 pb-4 space-y-4">
            <SectionLabel>Detalhes</SectionLabel>

            <FieldGroup>
              <FieldLabel required>Título</FieldLabel>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Plano Pro — Empresa XPTO"
                className="border-border bg-muted/60 text-foreground placeholder:text-muted-foreground/40 focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </FieldGroup>

            <FieldGroup>
              <FieldLabel required>
                <Tag className="h-3 w-3" />
                Etapa
              </FieldLabel>
              <SelectField value={stageId} onChange={setStageId}>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </SelectField>
            </FieldGroup>
          </div>

          {/* Contato — só em negócios novos; ao editar fica na aba "Contato" */}
          {!deal && (
            <>
              <div className="mx-5 border-t border-border/40" />
              <div className="px-5 pt-4 pb-4 space-y-4">
                <SectionLabel>Contato</SectionLabel>
                <FieldGroup>
                  <div className="flex items-center justify-between">
                    <FieldLabel required>
                      <User className="h-3 w-3" />
                      Contato
                    </FieldLabel>
                    {contactId && deal && (
                      <button
                        type="button"
                        onClick={openInboxForContact}
                        title="Abrir conversa no WhatsApp"
                        className="flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium text-emerald-600 hover:bg-emerald-500/10 transition-colors"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        WhatsApp
                      </button>
                    )}
                  </div>
                  <SelectField value={contactId} onChange={setContactId}>
                    <option value="">Selecionar contato</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name || c.phone}
                      </option>
                    ))}
                  </SelectField>
                </FieldGroup>
              </div>
            </>
          )}

          <div className="mx-5 border-t border-border/40" />

          {/* Financeiro */}
          <div className="px-5 pt-4 pb-4 space-y-4">
            <SectionLabel>Financeiro</SectionLabel>

            <FieldGroup>
              <FieldLabel>Valor</FieldLabel>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground select-none">
                    {currencySymbol(currency)}
                  </span>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={value}
                    onChange={(e) => setValue(formatCurrencyDisplay(e.target.value))}
                    placeholder="0"
                    className="border-border bg-muted/60 pl-8 text-foreground placeholder:text-muted-foreground/40 focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
                <SelectField
                  value={currency}
                  onChange={setCurrency}
                  className="w-[90px] shrink-0"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code}
                    </option>
                  ))}
                </SelectField>
              </div>
            </FieldGroup>

            <FieldGroup>
              <FieldLabel>
                <CalendarDays className="h-3 w-3" />
                Previsão de Fechamento
              </FieldLabel>
              <Input
                type="date"
                value={expectedCloseDate}
                onChange={(e) => setExpectedCloseDate(e.target.value)}
                className="border-border bg-muted/60 text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </FieldGroup>
          </div>

          <div className="mx-5 border-t border-border/40" />

          {/* Equipe & Notas */}
          <div className="px-5 pt-4 pb-4 space-y-4">
            <SectionLabel>Equipe & Notas</SectionLabel>

            <FieldGroup>
              <FieldLabel>Responsável</FieldLabel>
              <SelectField value={assignedTo} onChange={setAssignedTo}>
                <option value="">Sem responsável</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || p.email}
                  </option>
                ))}
              </SelectField>
            </FieldGroup>

            <FieldGroup>
              <FieldLabel>
                <AlignLeft className="h-3 w-3" />
                Observações
              </FieldLabel>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Adicionar observações sobre este negócio..."
                className="min-h-[88px] resize-none border-border bg-muted/60 text-foreground placeholder:text-muted-foreground/40 focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </FieldGroup>
          </div>

          {/* Deal custom fields */}
          {dealFields.length > 0 && (
            <>
              <div className="mx-5 border-t border-border/40" />
              <div className="px-5 pt-4 pb-4 space-y-4">
                <SectionLabel>Campos Personalizados</SectionLabel>
                {dealFields.map((field) => (
                  <FieldGroup key={field.id}>
                    <FieldLabel>{field.field_name}</FieldLabel>
                    <CustomFieldInput
                      field={field}
                      value={customValues[field.id] ?? ""}
                      onChange={(val) =>
                        setCustomValues((prev) => ({ ...prev, [field.id]: val }))
                      }
                    />
                  </FieldGroup>
                ))}
              </div>
            </>
          )}

          {/* Status — only when editing */}
          {deal && (
            <>
              <div className="mx-5 border-t border-border/40" />

              <div className="px-5 pt-4 pb-5 space-y-3">
                <SectionLabel>Status do Negócio</SectionLabel>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleStatusChange("won")}
                    disabled={!!statusAction || deal.status === "won"}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-sm font-medium transition-all cursor-pointer",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      deal.status === "won"
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500 cursor-default"
                        : "border-border bg-muted/40 text-muted-foreground hover:border-emerald-500/30 hover:bg-emerald-500/8 hover:text-emerald-500",
                      !!statusAction && deal.status !== "won" && "opacity-50 cursor-not-allowed",
                    )}
                  >
                    {statusAction === "won" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <TrendingUp className="h-4 w-4" />
                    )}
                    <span className="text-xs leading-tight text-center">Marcar como Ganho</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (deal.status === "lost" || !!statusAction) return;
                      setSelectedLossReasonId("");
                      setShowLossPicker(true);
                    }}
                    disabled={!!statusAction || deal.status === "lost"}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-sm font-medium transition-all cursor-pointer",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      deal.status === "lost"
                        ? "border-red-500/40 bg-red-500/10 text-red-400 cursor-default"
                        : "border-border bg-muted/40 text-muted-foreground hover:border-red-500/30 hover:bg-red-500/8 hover:text-red-400",
                      !!statusAction && deal.status !== "lost" && "opacity-50 cursor-not-allowed",
                    )}
                  >
                    {statusAction === "lost" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <TrendingDown className="h-4 w-4" />
                    )}
                    <span className="text-xs leading-tight text-center">Marcar como Perdido</span>
                  </button>
                </div>

                {/* Loss reason picker */}
                {showLossPicker && (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 space-y-2.5">
                    <p className="text-xs font-medium text-red-400">Motivo da perda</p>
                    <select
                      value={selectedLossReasonId}
                      onChange={(e) => setSelectedLossReasonId(e.target.value)}
                      className="h-9 w-full rounded-lg border border-border bg-muted/60 px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    >
                      <option value="">Selecione um motivo (opcional)</option>
                      {lossReasons.map((r) => (
                        <option key={r.id} value={r.id}>{r.label}</option>
                      ))}
                    </select>
                    {lossReasons.length === 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        Configure motivos em Configurações → Negócios.
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setShowLossPicker(false)}
                        className="flex-1 rounded-lg border border-border py-1.5 text-xs text-muted-foreground hover:bg-muted"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmLost}
                        disabled={!!statusAction}
                        className="flex-1 rounded-lg bg-red-600 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {statusAction === "lost" ? (
                          <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" />
                        ) : (
                          "Confirmar perda"
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {deal.status && deal.status !== "open" && (
                  <button
                    type="button"
                    onClick={() => handleStatusChange("open")}
                    disabled={!!statusAction}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50 cursor-pointer"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Reabrir negócio
                  </button>
                )}
              </div>
            </>
          )}

          <div className="h-2" />
        </div>

        {/* ── Footer ─────────────────────────────────────── */}
        <div className="shrink-0 border-t border-border/50 bg-popover px-5 py-4 space-y-3">
          <div className="flex gap-2.5">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1 border-border bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !title.trim() || !contactId || !stageId}
              className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Salvando…
                </>
              ) : deal ? (
                "Salvar Alterações"
              ) : (
                "Criar Negócio"
              )}
            </Button>
          </div>

          {deal &&
            (confirmDelete ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-red-500/25 bg-red-500/8 px-3 py-2.5">
                <span className="text-xs text-red-400">Excluir permanentemente?</span>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    disabled={deleting}
                    className="rounded-md px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50 cursor-pointer"
                  >
                    {deleting ? "Excluindo…" : "Excluir"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="flex w-full items-center justify-center gap-1.5 text-xs text-red-400/60 transition-colors hover:text-red-400 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Excluir Negócio
              </button>
            ))}
        </div>
        </>)}
      </SheetContent>
    </Sheet>
  );
}
