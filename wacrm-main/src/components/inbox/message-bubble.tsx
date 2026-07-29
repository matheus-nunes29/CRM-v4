"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Message, MessageReaction } from "@/types";
import {
  Clock,
  Check,
  CheckCheck,
  XCircle,
  FileText,
  MapPin,
  LayoutTemplate,
  ImageOff,
  CornerDownLeft,
  Bot,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { ReplyQuote } from "./reply-quote";
import { MessageReactions } from "./message-reactions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { linkifyText } from "@/lib/inbox/linkify";

interface MessageBubbleProps {
  message: Message;
  /** Pre-computed quote info for messages that reply to another. */
  reply?: { authorLabel: string; preview: string } | null;
  reactions?: MessageReaction[];
  currentUserId?: string;
  onToggleReaction?: (emoji: string) => void;
  /** Needed only to file a correction (POST /api/ai-agent/corrections)
   *  on messages the AI agent sent — see `message.ai_generated`. */
  conversationId?: string;
}

/** "Corrigir resposta" affordance + dialog, shown under AI-agent bubbles
 *  only. Kept local to the bubble rather than wired into <MessageActions>'
 *  hover toolbar — this is rare enough (flagging a bad reply) that it
 *  doesn't need to compete for space with reply/react on every message. */
function CorrectResponseAction({
  message,
  conversationId,
}: {
  message: Message;
  conversationId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [correctedResponse, setCorrectedResponse] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!correctedResponse.trim()) {
      toast.error("Escreva a resposta correta");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/ai-agent/corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId,
          message_id: message.id,
          original_response: message.content_text ?? "",
          corrected_response: correctedResponse.trim(),
          note: note.trim(),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload.error || "Falha ao salvar correção");
        return;
      }
      toast.success("Correção salva — o agente vai usar isso da próxima vez");
      setOpen(false);
      setCorrectedResponse("");
      setNote("");
    } catch {
      toast.error("Falha de rede ao salvar correção");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-0.5 flex items-center gap-1 self-end text-[10px] text-muted-foreground hover:text-foreground hover:underline"
      >
        <Bot className="h-3 w-3" />
        Corrigir resposta
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="border-border bg-popover">
          <DialogHeader>
            <DialogTitle>Corrigir resposta do agente</DialogTitle>
            <DialogDescription>
              A correção vira automaticamente um item na base de conhecimento — o agente evita repetir o erro.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Resposta certa</Label>
              <Textarea
                rows={3}
                value={correctedResponse}
                onChange={(e) => setCorrectedResponse(e.target.value)}
                placeholder="O que o agente deveria ter respondido"
              />
            </div>
            <div>
              <Label>Nota (opcional)</Label>
              <Textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Contexto extra, se ajudar"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar correção
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatusIcon({ status }: { status: Message["status"] }) {
  switch (status) {
    case "sending":
      return <Clock className="h-3 w-3 text-muted-foreground" />;
    case "sent":
      return <Check className="h-3 w-3 text-muted-foreground" />;
    case "delivered":
      return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
    case "read":
      return <CheckCheck className="h-3 w-3 text-blue-400" />;
    case "failed":
      return <XCircle className="h-3 w-3 text-red-400" />;
    default:
      return null;
  }
}

function MediaUnavailable({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <ImageOff className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span>{label} indisponível</span>
    </div>
  );
}

function MediaImage({
  url,
  alt,
  sizeVariant = "default",
}: {
  url: string;
  alt: string;
  sizeVariant?: "default" | "sticker";
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  // Stickers are small decorative assets — only full photos open a
  // fullscreen preview on click.
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const canOpenLightbox = sizeVariant !== "sticker";
  // Stickers are already small, transparent, borderless assets (like in
  // WhatsApp itself) — render at 60% of a regular photo's footprint.
  const boxSize = sizeVariant === "sticker" ? "h-24 w-36" : "h-40 w-60";
  const imgSize = sizeVariant === "sticker" ? "max-h-[154px] max-w-[144px]" : "max-h-64 max-w-60";

  const loadImage = useCallback(async () => {
    if (!url) return;

    // Proxy URLs need auth fetch to create blob URL
    if (url.startsWith("/api/whatsapp/media/")) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to load media");
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        setSrc(blobUrl);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    } else {
      setSrc(url);
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    loadImage();
    return () => {
      if (src?.startsWith("blob:")) {
        URL.revokeObjectURL(src);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadImage]);

  if (error) {
    return (
      <div className={cn("flex items-center justify-center rounded-lg bg-muted", boxSize)}>
        <ImageOff className="h-8 w-8 text-muted-foreground" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className={cn("flex items-center justify-center rounded-lg bg-muted", boxSize)}>
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      <img
        src={src ?? ""}
        alt={alt}
        className={cn(
          imgSize,
          sizeVariant === "sticker" ? "object-contain" : "cursor-pointer rounded-lg object-cover",
        )}
        onClick={canOpenLightbox ? () => setLightboxOpen(true) : undefined}
        onError={() => setError(true)}
      />
      {canOpenLightbox && (
        <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
          <DialogContent
            showCloseButton
            className="w-auto max-w-[calc(100%-2rem)] border-none bg-transparent p-0 shadow-none ring-0 sm:max-w-[calc(100%-2rem)]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src ?? ""}
              alt={alt}
              className="max-h-[85vh] max-w-full rounded-lg object-contain"
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function MessageContent({ message }: { message: Message }) {
  switch (message.content_type) {
    case "text":
      return (
        <p className="whitespace-pre-wrap break-words text-sm">
          {linkifyText(message.content_text ?? "")}
        </p>
      );

    case "image":
      return (
        <div>
          {message.media_url ? (
            <MediaImage url={message.media_url} alt="Imagem compartilhada" />
          ) : (
            <MediaUnavailable label="Image" />
          )}
          {message.content_text && (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm">
              {linkifyText(message.content_text)}
            </p>
          )}
        </div>
      );

    case "sticker":
      return message.media_url ? (
        <MediaImage url={message.media_url} alt="Figurinha" sizeVariant="sticker" />
      ) : (
        <MediaUnavailable label="Sticker" />
      );

    case "video":
      return (
        <div>
          {message.media_url ? (
            <video
              src={message.media_url}
              controls
              className="max-h-64 max-w-60 rounded-lg"
            />
          ) : (
            <MediaUnavailable label="Video" />
          )}
          {message.content_text && (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm">
              {linkifyText(message.content_text)}
            </p>
          )}
        </div>
      );

    case "audio":
      return (
        <div>
          {message.media_url ? (
            <audio src={message.media_url} controls className="max-w-60" />
          ) : (
            <MediaUnavailable label="Audio" />
          )}
        </div>
      );

    case "document":
      if (!message.media_url) {
        return <MediaUnavailable label={message.content_text || "Documento"} />;
      }
      return (
        <a
          href={message.media_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm hover:bg-muted"
        >
          <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
          <span className="truncate">
            {message.content_text || "Documento"}
          </span>
        </a>
      );

    case "template":
      return (
        <div>
          <span className="mb-1 inline-flex items-center gap-1 rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            <LayoutTemplate className="h-3 w-3" />
            Template
          </span>
          {message.content_text && (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm">
              {linkifyText(message.content_text)}
            </p>
          )}
        </div>
      );

    case "location":
      return (
        <div className="flex items-center gap-2 text-sm">
          <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span>{message.content_text || "Localização compartilhada"}</span>
        </div>
      );

    case "interactive": {
      // Customer tapped a reply button or list row on a message the bot
      // sent. We show the tapped option's title (already in content_text,
      // set by parseMessageContent in the webhook) with a small affordance
      // so agents reading the inbox can tell at a glance that this is a
      // tap rather than the customer typing the same words.
      return (
        <div className="flex flex-col gap-0.5">
          <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <CornerDownLeft className="h-3 w-3" />
            Resposta de botão
          </span>
          <p className="whitespace-pre-wrap break-words text-sm">
            {message.content_text ? linkifyText(message.content_text) : "[Resposta interativa]"}
          </p>
        </div>
      );
    }

    default:
      return (
        <p className="whitespace-pre-wrap break-words text-sm">
          {message.content_text ? linkifyText(message.content_text) : "[Tipo de mensagem não suportado]"}
        </p>
      );
  }
}

export function MessageBubble({
  message,
  reply,
  reactions,
  currentUserId,
  onToggleReaction,
  conversationId,
}: MessageBubbleProps) {
  const isAgent = message.sender_type === "agent" || message.sender_type === "bot";
  const time = format(new Date(message.created_at), "HH:mm");
  const groupSender = !isAgent ? (message.group_sender_name || message.group_sender_phone) : null;

  // Row alignment + width cap are owned by <MessageActions> so its hover
  // group matches the bubble's content area, not the full row.
  return (
    <div
      className={cn(
        "flex flex-col",
        isAgent ? "items-end" : "items-start",
      )}
    >
      {groupSender && (
        <span className="mb-0.5 ml-1 text-[10px] font-semibold text-primary/80">
          {groupSender}
        </span>
      )}
      <div
        className={cn(
          "relative",
          // Stickers are borderless transparent art, same as in WhatsApp
          // itself — no bubble fill/padding, just the sticker + timestamp.
          message.content_type === "sticker"
            ? ""
            : cn(
                "rounded-2xl px-3 py-2",
                isAgent
                  ? "rounded-br-md bg-primary text-primary-foreground"
                  : "rounded-bl-md bg-muted text-foreground",
              ),
        )}
      >
        {reply && (
          <ReplyQuote
            authorLabel={reply.authorLabel}
            preview={reply.preview}
            onPrimary={isAgent}
          />
        )}
        <MessageContent message={message} />
        <div
          className={cn(
            "mt-1 flex items-center gap-1",
            isAgent ? "justify-end" : "justify-start",
          )}
        >
          <span
            className={cn(
              "text-[10px]",
              // Outbound bubbles sit on the primary fill, so the
              // timestamp must read against that (not the neutral
              // foreground) — otherwise it goes low-contrast in light
              // mode. Inbound bubbles use the muted surface. Stickers
              // have no fill either way, so always use the neutral tone.
              message.content_type === "sticker"
                ? "text-muted-foreground"
                : isAgent
                  ? "text-primary-foreground/70"
                  : "text-muted-foreground",
            )}
          >
            {time}
          </span>
          {isAgent && <StatusIcon status={message.status} />}
        </div>
      </div>
      {reactions && reactions.length > 0 && onToggleReaction && (
        <MessageReactions
          reactions={reactions}
          currentUserId={currentUserId}
          onToggle={onToggleReaction}
        />
      )}
      {message.ai_generated && (
        <CorrectResponseAction message={message} conversationId={conversationId} />
      )}
    </div>
  );
}
