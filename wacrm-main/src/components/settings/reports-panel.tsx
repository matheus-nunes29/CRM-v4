'use client';

import { useState } from 'react';
import { Download, FileJson, MessageSquare, Users, TrendingUp, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

async function downloadBlob(url: string, filename: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Falha ao gerar relatório');
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(href);
}

function ReportCard({
  icon: Icon,
  title,
  description,
  badge,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            {badge && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                {badge}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

export function ReportsPanel() {
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [convFrom, setConvFrom] = useState(thirtyDaysAgo);
  const [convTo, setConvTo]     = useState(today);
  const [loadingConv, setLoadingConv] = useState(false);

  const [loadingContacts, setLoadingContacts] = useState(false);
  const [loadingGclid, setLoadingGclid]       = useState(false);

  async function handleConvDownload() {
    setLoadingConv(true);
    try {
      const params = new URLSearchParams();
      if (convFrom) params.set('from', convFrom);
      if (convTo)   params.set('to', convTo);
      const filename = `conversas_${convFrom ?? 'all'}_${convTo ?? 'all'}.json`;
      await downloadBlob(`/api/reports/conversations?${params}`, filename);
      toast.success('Download iniciado');
    } catch {
      toast.error('Falha ao gerar relatório de conversas');
    } finally {
      setLoadingConv(false);
    }
  }

  async function handleContactsDownload() {
    setLoadingContacts(true);
    try {
      const filename = `contatos_${today}.csv`;
      await downloadBlob('/api/reports/contacts', filename);
      toast.success('Download iniciado');
    } catch {
      toast.error('Falha ao gerar relatório de contatos');
    } finally {
      setLoadingContacts(false);
    }
  }

  async function handleGclidDownload() {
    setLoadingGclid(true);
    try {
      const filename = `google_ads_conversions_${today}.csv`;
      await downloadBlob('/api/reports/gclid', filename);
      toast.success('Download iniciado');
    } catch {
      toast.error('Falha ao gerar relatório Google Ads');
    } finally {
      setLoadingGclid(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">Exportar dados</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Baixe seus dados para análise externa — integre com Claude, planilhas ou ferramentas de BI.
        </p>
      </div>

      {/* Conversations JSON — main report */}
      <ReportCard
        icon={MessageSquare}
        title="Conversas completas"
        description="Exporta todas as conversas com mensagens, horários, atendente responsável e posição do negócio na pipeline. Ideal para análise de atendimento com IA."
        badge="JSON"
      >
        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs text-muted-foreground">De</Label>
              <Input
                type="date"
                value={convFrom}
                onChange={(e) => setConvFrom(e.target.value)}
                className="h-8 border-border bg-muted/60 text-sm"
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs text-muted-foreground">Até</Label>
              <Input
                type="date"
                value={convTo}
                onChange={(e) => setConvTo(e.target.value)}
                className="h-8 border-border bg-muted/60 text-sm"
              />
            </div>
          </div>

          <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5 space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Campos incluídos</p>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {[
                'conversa_id', 'status', 'criada_em', 'ultima_mensagem_em',
                'contato (nome, tel, email, empresa)',
                'origem UTM + GCLID',
                'atendente (nome, email)',
                'negócio (título, valor, etapa, pipeline)',
                'mensagens (texto, horário, remetente)',
              ].map((field) => (
                <span key={field} className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  {field}
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <p className="text-xs text-primary/80">
              Cole o JSON no Claude com o prompt: <em>"Analise a qualidade destes atendimentos e identifique os pontos de melhoria."</em>
            </p>
          </div>

          <Button
            onClick={handleConvDownload}
            disabled={loadingConv}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loadingConv ? (
              'Gerando…'
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Baixar conversas.json
              </>
            )}
          </Button>
        </div>
      </ReportCard>

      {/* Other existing reports */}
      <div className="grid gap-4 sm:grid-cols-2">
        <ReportCard
          icon={Users}
          title="Contatos + UTM"
          description="Todos os contatos com origem UTM, GCLID e dados de atribuição."
          badge="CSV"
        >
          <Button
            variant="outline"
            onClick={handleContactsDownload}
            disabled={loadingContacts}
            className="w-full border-border bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            {loadingContacts ? (
              'Gerando…'
            ) : (
              <>
                <FileJson className="mr-2 h-4 w-4" />
                Baixar contatos.csv
              </>
            )}
          </Button>
        </ReportCard>

        <ReportCard
          icon={TrendingUp}
          title="Google Ads offline"
          description="Conversões no formato de importação do Google Ads para rastrear vendas offline."
          badge="CSV"
        >
          <Button
            variant="outline"
            onClick={handleGclidDownload}
            disabled={loadingGclid}
            className="w-full border-border bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            {loadingGclid ? (
              'Gerando…'
            ) : (
              <>
                <FileJson className="mr-2 h-4 w-4" />
                Baixar google_ads.csv
              </>
            )}
          </Button>
        </ReportCard>
      </div>
    </div>
  );
}
