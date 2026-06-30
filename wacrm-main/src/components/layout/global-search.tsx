"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, User, Briefcase, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";

interface SearchResult {
  type: "contact" | "deal";
  id: string;
  label: string;
  sub?: string;
  href: string;
}

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const router = useRouter();
  const supabase = createClient();
  const { accountId } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const search = useCallback(
    async (q: string) => {
      if (!q.trim() || !accountId) {
        setResults([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      const like = `%${q.trim()}%`;

      const [contactsRes, dealsRes] = await Promise.all([
        supabase
          .from("contacts")
          .select("id, name, phone")
          .eq("account_id", accountId)
          .or(`name.ilike.${like},phone.ilike.${like}`)
          .limit(5),
        supabase
          .from("deals")
          .select("id, title, status")
          .eq("account_id", accountId)
          .ilike("title", like)
          .limit(5),
      ]);

      const contactResults: SearchResult[] = (contactsRes.data ?? []).map(
        (c) => ({
          type: "contact",
          id: c.id,
          label: c.name ?? c.phone ?? "Contato",
          sub: c.phone ?? undefined,
          href: `/contacts/${c.id}`,
        }),
      );

      const dealResults: SearchResult[] = (dealsRes.data ?? []).map((d) => ({
        type: "deal",
        id: d.id,
        label: d.title ?? "Negócio",
        sub:
          d.status === "won"
            ? "Ganho"
            : d.status === "lost"
              ? "Perdido"
              : "Aberto",
        href: `/negocios`,
      }));

      setResults([...contactResults, ...dealResults]);
      setLoading(false);
    },
    [supabase, accountId],
  );

  useEffect(() => {
    const timer = setTimeout(() => search(query), 280);
    return () => clearTimeout(timer);
  }, [query, search]);

  // ⌘K / Ctrl+K opens search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const navigate = (result: SearchResult) => {
    router.push(result.href);
    setOpen(false);
    setQuery("");
    setResults([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      navigate(results[activeIndex]);
    }
  };

  const contacts = results.filter((r) => r.type === "contact");
  const deals = results.filter((r) => r.type === "deal");
  const showDropdown = open && query.length > 0;

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Buscar contato ou negócio..."
          className="h-9 w-full rounded-lg border border-border bg-muted/50 pl-9 pr-16 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-all focus:border-primary focus:bg-background focus:ring-1 focus:ring-primary"
        />
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {query ? (
            <button
              onClick={() => {
                setQuery("");
                setResults([]);
                inputRef.current?.focus();
              }}
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">
              ⌘K
            </kbd>
          )}
        </div>
      </div>

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
          {loading && (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              Buscando...
            </p>
          )}

          {!loading && results.length === 0 && (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              Nenhum resultado para &quot;{query}&quot;
            </p>
          )}

          {!loading && contacts.length > 0 && (
            <div>
              <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Contatos
              </p>
              {contacts.map((r) => {
                const idx = results.indexOf(r);
                return (
                  <button
                    key={r.id}
                    onClick={() => navigate(r)}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
                      idx === activeIndex
                        ? "bg-accent"
                        : "hover:bg-accent/60"
                    }`}
                  >
                    <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">
                        {r.label}
                      </p>
                      {r.sub && (
                        <p className="truncate text-xs text-muted-foreground">
                          {r.sub}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {!loading && deals.length > 0 && (
            <div
              className={
                contacts.length > 0 ? "border-t border-border" : ""
              }
            >
              <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Negócios
              </p>
              {deals.map((r) => {
                const idx = results.indexOf(r);
                return (
                  <button
                    key={r.id}
                    onClick={() => navigate(r)}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
                      idx === activeIndex
                        ? "bg-accent"
                        : "hover:bg-accent/60"
                    }`}
                  >
                    <Briefcase className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">
                        {r.label}
                      </p>
                      {r.sub && (
                        <p className="truncate text-xs text-muted-foreground">
                          {r.sub}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <div className="border-t border-border px-3 py-1.5">
            <p className="text-[10px] text-muted-foreground">
              ↑↓ navegar · Enter selecionar · Esc fechar
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
