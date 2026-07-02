/**
 * Shared status badge config for broadcasts + recipients.
 */

import type { BroadcastStatus, RecipientStatus } from "@/types";

export interface StatusDisplay {
  label: string;
  classes: string;
  pulse?: boolean;
}

export const broadcastStatusConfig: Record<BroadcastStatus, StatusDisplay> = {
  draft: {
    label: "Draft",
    classes: "bg-slate-500/10 text-muted-foreground border-slate-500/20",
  },
  scheduled: {
    label: "Scheduled",
    classes: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  },
  sending: {
    label: "Sending",
    classes: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    pulse: true,
  },
  paused: {
    label: "Pausado",
    classes: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  },
  cancelled: {
    label: "Cancelado",
    classes: "bg-slate-500/10 text-muted-foreground border-slate-500/20",
  },
  sent: {
    label: "Sent",
    classes: "bg-primary/10 text-primary border-primary/20",
  },
  failed: {
    label: "Failed",
    classes: "bg-red-500/10 text-red-400 border-red-500/20",
  },
};

export const recipientStatusConfig: Record<RecipientStatus, StatusDisplay> = {
  pending: {
    label: "Pending",
    classes: "bg-slate-500/10 text-muted-foreground border-slate-500/20",
  },
  sent: {
    label: "Sent",
    classes: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  },
  delivered: {
    label: "Delivered",
    classes: "bg-primary/10 text-primary border-primary/20",
  },
  read: {
    label: "Read",
    classes: "bg-primary/10 text-primary border-primary/20",
  },
  replied: {
    label: "Replied",
    classes: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  },
  failed: {
    label: "Failed",
    classes: "bg-red-500/10 text-red-400 border-red-500/20",
  },
  cancelled: {
    label: "Cancelado",
    classes: "bg-slate-500/10 text-muted-foreground border-slate-500/20",
  },
};

export function getBroadcastStatus(status: string): StatusDisplay {
  return (
    broadcastStatusConfig[status as BroadcastStatus] ??
    broadcastStatusConfig.draft
  );
}

export function getRecipientStatus(status: string): StatusDisplay {
  return (
    recipientStatusConfig[status as RecipientStatus] ??
    recipientStatusConfig.pending
  );
}
