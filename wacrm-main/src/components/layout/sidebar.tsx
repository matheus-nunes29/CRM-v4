"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useTotalUnread } from "@/hooks/use-total-unread";
import { PyvoLogo } from "@/components/pyvo-logo";
import {
  Briefcase,
  CalendarDays,
  Crown,
  GitBranch,
  LayoutDashboard,
  MessageSquare,
  Radio,
  Settings,
  Shield,
  User,
  UserCog,
  Users,
  UsersRound,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import type { AccountRole } from "@/lib/auth/roles";

const ROLE_CHIP: Record<
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

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  beta?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

// Grouped by moment-of-use rather than feature type, so the sections
// used constantly (Atendimento) sit above the ones configured once and
// left running (Automação).
const navGroups: NavGroup[] = [
  {
    label: "Visão geral",
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Atendimento",
    items: [
      { href: "/inbox", label: "Caixa de entrada", icon: MessageSquare },
      { href: "/contacts", label: "Contatos", icon: Users },
      { href: "/agenda", label: "Agenda", icon: CalendarDays },
    ],
  },
  {
    label: "Vendas",
    items: [
      { href: "/negocios", label: "Negócios", icon: Briefcase },
      { href: "/pipelines", label: "Pipelines", icon: GitBranch },
    ],
  },
  {
    label: "Automação",
    items: [
      { href: "/broadcasts", label: "Disparos", icon: Radio },
      { href: "/automations", label: "Automações", icon: Zap },
      { href: "/flows", label: "Fluxos", icon: Workflow, beta: true },
    ],
  },
];

const bottomNavItems = [
  { href: "/settings", label: "Configurações", icon: Settings },
];

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { profile, profileLoading, account, accountRole } = useAuth();
  const totalUnread = useTotalUnread();

  const showAccountStrip =
    !profileLoading &&
    !!account?.name &&
    account.name !== profile?.full_name;

  useEffect(() => {
    onClose?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <>
      <button
        type="button"
        aria-label="Fechar menu"
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-30 bg-background/70 backdrop-blur-sm transition-opacity lg:hidden",
          open
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0",
        )}
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex h-full w-64 flex-col border-r border-sidebar-border bg-sidebar",
          "transition-transform duration-200 ease-out will-change-transform",
          open ? "translate-x-0" : "-translate-x-full",
          "lg:static lg:z-0 lg:w-60 lg:translate-x-0 lg:transition-none",
        )}
        aria-label="Navegação principal"
      >
        {/* Logo row */}
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-sidebar-border px-4">
          <Link href="/dashboard" className="flex items-center">
            <PyvoLogo className="h-10 w-auto text-sidebar-primary" />
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar menu"
            className="flex h-9 w-9 items-center justify-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-primary lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Main navigation */}
        <nav className="flex-1 overflow-y-auto py-4">
          {navGroups.map((group, groupIndex) => (
            <div
              key={group.label}
              className={cn(groupIndex > 0 && "mt-4")}
            >
              <p className="px-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/50">
                {group.label}
              </p>
              <ul className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/dashboard" && pathname.startsWith(item.href));

                  const showUnreadDot =
                    item.href === "/inbox" && totalUnread > 0 && !isActive;

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center gap-3 border-l-2 px-4 py-2.5 text-sm font-medium transition-colors lg:py-2",
                          isActive
                            ? "border-sidebar-primary bg-sidebar-accent text-sidebar-primary"
                            : "border-transparent text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-primary",
                        )}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span className="flex-1">{item.label}</span>
                        {item.beta && (
                          <span
                            aria-label="Funcionalidade beta"
                            className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-300"
                          >
                            Beta
                          </span>
                        )}
                        {showUnreadDot && (
                          <span
                            aria-label={`${totalUnread} conversa${totalUnread === 1 ? "" : "s"} não lida${totalUnread === 1 ? "" : "s"}`}
                            className="relative flex h-2 w-2"
                          >
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sidebar-primary opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-sidebar-primary" />
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          <div className="my-3 mx-4 border-t border-sidebar-border" />

          <ul className="flex flex-col gap-0.5">
            {bottomNavItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 border-l-2 px-4 py-2.5 text-sm font-medium transition-colors lg:py-2",
                      isActive
                        ? "border-sidebar-primary bg-sidebar-accent text-sidebar-primary"
                        : "border-transparent text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-primary",
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Account strip — only the user's name/avatar lives in the header
            now (top-right); this just surfaces the account name + role
            when it differs from the person, which the header doesn't show. */}
        {showAccountStrip && account?.name ? (
          <div className="shrink-0 border-t border-sidebar-border p-3">
            <div className="flex items-center gap-2 px-3 text-xs text-sidebar-foreground">
              <UsersRound className="size-3.5 shrink-0" />
              <span className="truncate" title={account.name}>
                {account.name}
              </span>
              {accountRole ? (
                (() => {
                  const meta = ROLE_CHIP[accountRole];
                  const Icon = meta.icon;
                  return (
                    <span
                      className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${meta.className}`}
                    >
                      <Icon className="size-3" />
                      {meta.label}
                    </span>
                  );
                })()
              ) : null}
            </div>
          </div>
        ) : null}
      </aside>
    </>
  );
}
