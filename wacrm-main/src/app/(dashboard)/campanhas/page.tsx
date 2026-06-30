'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loader2, Megaphone, MousePointerClick, Users, Briefcase, Trophy, Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CampaignStat {
  id: string
  name: string
  code: string
  utm_source: string | null
  utm_campaign: string | null
  click_count: number
  leads_total: number
  deals_total: number
  deals_won: number
  revenue_won: number
}

function StatCard({ label, value, icon: Icon, className }: { label: string; value: string | number; icon: React.ElementType; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-1 rounded-xl border border-border bg-card px-4 py-3', className)}>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="ml-1 inline-flex items-center justify-center rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
      title="Copiar link"
    >
      {copied ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
    </button>
  )
}

function fmtCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function convRate(won: number, total: number) {
  if (total === 0) return '—'
  return `${Math.round((won / total) * 100)}%`
}

export default function CampanhasPage() {
  const supabase = createClient()
  const [stats, setStats] = useState<CampaignStat[]>([])
  const [loading, setLoading] = useState(true)

  const fetchStats = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('campaign_stats')
    if (!error && data) {
      setStats(data as CampaignStat[])
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  const totals = stats.reduce(
    (acc, s) => ({
      clicks: acc.clicks + s.click_count,
      leads: acc.leads + s.leads_total,
      deals: acc.deals + s.deals_total,
      won: acc.won + s.deals_won,
      revenue: acc.revenue + Number(s.revenue_won),
    }),
    { clicks: 0, leads: 0, deals: 0, won: 0, revenue: 0 },
  )

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Campanhas</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {loading ? 'Carregando...' : `${stats.length} campanha${stats.length !== 1 ? 's' : ''} ativas`}
        </p>
      </div>

      {/* Totals */}
      {!loading && stats.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Cliques totais" value={totals.clicks.toLocaleString('pt-BR')} icon={MousePointerClick} />
          <StatCard label="Leads gerados" value={totals.leads.toLocaleString('pt-BR')} icon={Users} />
          <StatCard label="Negócios abertos" value={totals.deals.toLocaleString('pt-BR')} icon={Briefcase} />
          <StatCard label="Receita ganha" value={fmtCurrency(totals.revenue)} icon={Trophy} />
        </div>
      )}

      {/* Campaigns table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : stats.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <Megaphone className="size-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Nenhuma campanha criada ainda.</p>
            <p className="text-xs text-muted-foreground">Crie links rastreáveis em Configurações → Links de campanha.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Campanha</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Cliques</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Leads</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Negócios</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Ganhos</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground hidden md:table-cell">Conversão</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground hidden lg:table-cell">Receita</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s, i) => {
                const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
                const link = `${baseUrl}/r/${s.code}`
                return (
                  <tr key={s.id} className={cn('border-b border-border last:border-0', i % 2 === 0 ? '' : 'bg-muted/20')}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground truncate max-w-[200px]">{s.name}</p>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-0.5 mt-0.5">
                        /r/{s.code}
                        <CopyButton text={link} />
                        {s.utm_source && (
                          <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">{s.utm_source}</span>
                        )}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">{s.click_count.toLocaleString('pt-BR')}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">{s.leads_total.toLocaleString('pt-BR')}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">{s.deals_total.toLocaleString('pt-BR')}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className={cn('font-medium', s.deals_won > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
                        {s.deals_won.toLocaleString('pt-BR')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground hidden md:table-cell">
                      {convRate(s.deals_won, s.deals_total)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums hidden lg:table-cell">
                      <span className={cn('font-medium', Number(s.revenue_won) > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
                        {fmtCurrency(Number(s.revenue_won))}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
