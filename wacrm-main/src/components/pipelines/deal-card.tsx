"use client";

import type { Deal, PipelineStage } from "@/types";
import { Calendar, CalendarDays, Check, X } from "lucide-react";
import { formatCurrency } from "@/lib/currency";

export interface NextEventInfo {
  title: string;
  start_at: string;
}

interface DealCardProps {
  deal: Deal;
  stage: PipelineStage | null;
  onEdit: (deal: Deal) => void;
  isOverlay?: boolean;
  nextEvent?: NextEventInfo;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("pt-BR", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function initials(name?: string, fallback?: string) {
  const source = (name || fallback || "?").trim();
  if (!source) return "?";
  return source.charAt(0).toUpperCase();
}

function fmtNextEventDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (sameDay(d, today)) return `hoje · ${time}`;
  if (sameDay(d, tomorrow)) return `amanhã · ${time}`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) + ` · ${time}`;
}

export function DealCard({ deal, stage, onEdit, isOverlay, nextEvent }: DealCardProps) {
  const contactLabel = deal.contact?.name || deal.contact?.phone || "Sem contato";
  const assigneeLabel = deal.assignee?.full_name || null;

  return (
    <button
      type="button"
      onClick={(e) => {
        // `onClick` still fires after a non-drag tap because the PointerSensor
        // requires 5px movement before it counts as a drag.
        if (isOverlay) return;
        e.stopPropagation();
        onEdit(deal);
      }}
      className={`group relative w-full cursor-pointer rounded-xl border border-border/50 bg-muted/70 pl-4 pr-3 py-3 text-left shadow-sm transition-all ${
        isOverlay
          ? "shadow-xl"
          : "hover:-translate-y-0.5 hover:border-border hover:bg-muted hover:shadow-lg"
      }`}
    >
      {/* 4px left accent bar using stage color */}
      <span
        aria-hidden
        className="absolute left-0 top-0 h-full w-1 rounded-l-xl"
        style={{ backgroundColor: stage?.color ?? "#94a3b8" }}
      />

      <div className="flex items-start justify-between gap-2">
        <h4 className="flex-1 text-sm font-semibold leading-snug text-foreground break-words">
          {deal.title}
        </h4>
        {deal.status === "won" && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
            <Check className="h-3 w-3" />
            Ganho
          </span>
        )}
        {deal.status === "lost" && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-400">
            <X className="h-3 w-3" />
            Perdido
          </span>
        )}
      </div>

      {/* Contact row */}
      <div className="mt-2 flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground">
          {initials(deal.contact?.name, deal.contact?.phone)}
        </span>
        <span className="truncate text-xs text-muted-foreground">{contactLabel}</span>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm font-bold text-primary">
          {formatCurrency(deal.value, deal.currency)}
        </span>
        {deal.expected_close_date && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {formatDate(deal.expected_close_date)}
          </span>
        )}
      </div>

      {/* Contact tags */}
      {deal.contact?.tags && deal.contact.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {deal.contact.tags.slice(0, 3).map((tag) => (
            <span
              key={tag.id}
              title={tag.name}
              className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: tag.color + "22",
                color: tag.color,
                border: `1px solid ${tag.color}44`,
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full shrink-0"
                style={{ backgroundColor: tag.color }}
              />
              {tag.name}
            </span>
          ))}
          {deal.contact.tags.length > 3 && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              +{deal.contact.tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Deal custom fields marked show_on_card */}
      {deal.custom_values && deal.custom_values.filter((cv) => cv.field.show_on_card && cv.value).length > 0 && (
        <div className="mt-2 flex flex-col gap-0.5">
          {deal.custom_values
            .filter((cv) => cv.field.show_on_card && cv.value)
            .map((cv) => (
              <div key={cv.field.id} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="font-medium text-foreground/60">{cv.field.field_name}:</span>
                <span className="truncate">{cv.value}</span>
              </div>
            ))}
        </div>
      )}

      {nextEvent && (
        <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-2 py-1.5">
          <CalendarDays className="h-3 w-3 shrink-0 text-primary/70" />
          <span className="flex-1 truncate text-[10px] font-medium text-foreground/80 leading-tight">
            {nextEvent.title}
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
            {fmtNextEventDate(nextEvent.start_at)}
          </span>
        </div>
      )}

      {assigneeLabel && (
        <div className="mt-2 flex items-center justify-end">
          <span
            title={assigneeLabel}
            className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary"
          >
            {initials(assigneeLabel)}
          </span>
        </div>
      )}
    </button>
  );
}
