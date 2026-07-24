import { Crown, Shield, User, UserCog } from "lucide-react";
import type { AccountRole } from "@/lib/auth/roles";

export const ROLE_CHIP: Record<
  AccountRole,
  { icon: typeof Crown; label: string; className: string }
> = {
  owner: {
    icon: Crown,
    label: "Proprietário",
    className: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  },
  admin: {
    icon: Shield,
    label: "Administrador",
    className: "border-sidebar-primary/40 bg-sidebar-primary/10 text-sidebar-primary",
  },
  agent: {
    icon: UserCog,
    label: "Agente",
    className: "border-sidebar-border bg-sidebar-accent text-sidebar-foreground",
  },
  viewer: {
    icon: User,
    label: "Visualizador",
    className: "border-sidebar-border bg-sidebar-accent/50 text-sidebar-foreground",
  },
};

/** Small role badge — lives next to the logged-in user's name in the
 *  header. Shared so sidebar/header (or anywhere else) render the exact
 *  same chip instead of duplicating the map. */
export function RoleChip({ role }: { role: AccountRole }) {
  const meta = ROLE_CHIP[role];
  const Icon = meta.icon;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${meta.className}`}
    >
      <Icon className="size-3" />
      {meta.label}
    </span>
  );
}
