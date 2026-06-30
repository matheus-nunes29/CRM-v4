'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CalendarDays, CheckCircle2, ExternalLink, Loader2, LogOut, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSearchParams } from 'next/navigation'

interface Integration {
  id: string
  provider: string
  connected_email: string | null
  calendar_id: string
  updated_at: string
}

export function CalendarSettings() {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const [integration, setIntegration] = useState<Integration | null>(null)
  const [loading, setLoading] = useState(true)
  const [disconnecting, setDisconnecting] = useState(false)
  const justConnected = searchParams.get('connected') === '1' && searchParams.get('tab') === 'calendar'
  const authError = searchParams.get('error')

  useEffect(() => {
    const load = async () => {
      const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '').maybeSingle()
      if (!profile?.account_id) { setLoading(false); return }
      const { data } = await supabase.from('calendar_integrations').select('*').eq('account_id', profile.account_id).eq('provider', 'google').maybeSingle()
      setIntegration(data ?? null)
      setLoading(false)
    }
    load()
  }, [supabase])

  const disconnect = async () => {
    if (!integration) return
    if (!confirm('Desconectar o Google Calendar? Os eventos já criados não serão removidos.')) return
    setDisconnecting(true)
    await supabase.from('calendar_integrations').delete().eq('id', integration.id)
    setIntegration(null)
    setDisconnecting(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Agenda</h2>
        <p className="mt-1 text-sm text-muted-foreground">Conecte seu Google Calendar para criar e sincronizar compromissos diretamente do CRM.</p>
      </div>

      {justConnected && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-4 shrink-0" />
          Google Calendar conectado com sucesso!
        </div>
      )}

      {authError && !justConnected && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          Erro ao conectar: {authError}. Tente novamente.
        </div>
      )}

      {/* Google Calendar */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-background">
              <svg viewBox="0 0 24 24" className="size-5" fill="none">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="#4285F4" />
                <path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-3.73 0-6.86 2.55-7.74 6h2.16C7.24 7.48 9.44 6 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" fill="white" />
                <path d="M4.26 18A7.968 7.968 0 0 0 12 20c3.73 0 6.86-2.55 7.74-6h-2.16C16.76 16.52 14.56 18 12 18c-1.66 0-3.14-.69-4.22-1.78L11 13H4v7l.26-.26L4.26 18z" fill="white" />
                <path d="M4 13H2.26A9.82 9.82 0 0 0 2 14v.5c0 .17.01.33.02.5H4v-2z" fill="white" />
                <path d="M20 11h1.74c.01.17.02.33.02.5V12c0 .67-.07 1.32-.19 1.95-.01.02-.01.03-.02.05H20v-3z" fill="white" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Google Calendar</p>
              {integration ? (
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  <CheckCircle2 className="size-3 text-emerald-500" />
                  Conectado como {integration.connected_email ?? 'conta Google'}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-0.5">Não conectado</p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {integration ? (
              <Button variant="outline" size="sm" onClick={disconnect} disabled={disconnecting}>
                {disconnecting ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
                Desconectar
              </Button>
            ) : (
              <a href="/api/calendar/auth/google" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                <ExternalLink className="size-4" />
                Conectar
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <CalendarDays className="size-4 text-primary" />
          Como funciona
        </div>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2"><span className="mt-1 size-1.5 rounded-full bg-primary shrink-0" />Após conectar, crie compromissos diretamente na ficha do contato ou na página Agenda.</li>
          <li className="flex items-start gap-2"><span className="mt-1 size-1.5 rounded-full bg-primary shrink-0" />Os eventos são criados na sua agenda principal do Google Calendar.</li>
          <li className="flex items-start gap-2"><span className="mt-1 size-1.5 rounded-full bg-primary shrink-0" />Você pode criar links do Google Meet automaticamente ao agendar.</li>
          <li className="flex items-start gap-2"><span className="mt-1 size-1.5 rounded-full bg-primary shrink-0" />Convidados recebem o convite por e-mail diretamente do Google.</li>
        </ul>
      </div>
    </div>
  )
}
