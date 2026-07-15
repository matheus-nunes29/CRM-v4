'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Eye,
  EyeOff,
  Copy,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Zap,
  AlertTriangle,
  RotateCcw,
  RefreshCw,
  QrCode,
  Smartphone,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SettingsPanelHead } from './settings-panel-head';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import type { WhatsAppConfig as WhatsAppConfigType } from '@/types';

const MASKED_TOKEN = '••••••••••••••••';
const WAPI_WEBHOOK_URL = 'https://fkbwxhjjlsjgpwttgbdw.supabase.co/functions/v1/webhook-whatsapp';

type ConnectionStatus = 'connected' | 'disconnected' | 'unknown';
type ResetReason = 'token_corrupted' | 'meta_api_error' | null;

export function WhatsAppConfig() {
  const supabase = createClient();
  const { user, accountId, loading: authLoading, profileLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [config, setConfig] = useState<WhatsAppConfigType | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('unknown');
  const [resetReason, setResetReason] = useState<ResetReason>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');

  // ── Meta fields ──────────────────────────────────────────────────────
  const [showToken, setShowToken] = useState(false);
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [pin, setPin] = useState('');
  const [tokenEdited, setTokenEdited] = useState(false);

  const isRegistered = Boolean(config?.registered_at);
  const lastRegistrationError = config?.last_registration_error ?? null;

  const [verifyingRegistration, setVerifyingRegistration] = useState(false);
  type RegistrationProbe = {
    live: boolean;
    checks: Record<string, boolean | null>;
    errors?: string[];
    last_registration_error?: string | null;
    registered_at?: string | null;
    subscribed_apps_at?: string | null;
  };
  const [registrationProbe, setRegistrationProbe] = useState<RegistrationProbe | null>(null);

  // ── W-API state ──────────────────────────────────────────────────────
  const [wapiStatusLoading, setWapiStatusLoading] = useState(false);
  const [wapiActivating, setWapiActivating] = useState(false);
  const [wapiConnected, setWapiConnected] = useState(false);
  const [wapiPhone, setWapiPhone] = useState<string | null>(null);
  const [wapiQrLoading, setWapiQrLoading] = useState(false);
  const [wapiQrCode, setWapiQrCode] = useState<string | null>(null);

  // ── Evolution API state ─────────────────────────────────────────────
  const [evolutionStatusLoading, setEvolutionStatusLoading] = useState(false);
  const [evolutionActivating, setEvolutionActivating] = useState(false);
  const [evolutionConnected, setEvolutionConnected] = useState(false);
  const [evolutionPhone, setEvolutionPhone] = useState<string | null>(null);
  const [evolutionQrLoading, setEvolutionQrLoading] = useState(false);
  const [evolutionQrCode, setEvolutionQrCode] = useState<string | null>(null);
  const [evolutionPairingCode, setEvolutionPairingCode] = useState<string | null>(null);

  const metaWebhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/whatsapp/webhook`
      : '';

  const activeProvider = config?.provider ?? 'meta';

  const fetchConfig = useCallback(async (acctId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('whatsapp_config')
        .select('*')
        .eq('account_id', acctId)
        .maybeSingle();

      if (error) console.error('Failed to load config row:', error);

      if (data) {
        setConfig(data);
        setPhoneNumberId(data.phone_number_id || '');
        setWabaId(data.waba_id || '');
        setAccessToken(MASKED_TOKEN);
        setVerifyToken('');
        setPin('');
        setTokenEdited(false);
        // Seed W-API status from DB
        setWapiConnected(data.wapi_connected ?? false);
        setWapiPhone(data.wapi_connected_phone ?? null);
        // Seed Evolution API status from DB
        setEvolutionConnected(data.evolution_connected ?? false);
        setEvolutionPhone(data.evolution_connected_phone ?? null);
      } else {
        setConfig(null);
        setPhoneNumberId('');
        setWabaId('');
        setAccessToken('');
        setVerifyToken('');
        setPin('');
        setTokenEdited(false);
        setWapiConnected(false);
        setWapiPhone(null);
        setEvolutionConnected(false);
        setEvolutionPhone(null);
      }
      setRegistrationProbe(null);

      // Meta health check (only if provider is meta)
      if (data && (data.provider === 'meta' || !data.provider)) {
        try {
          const res = await fetch('/api/whatsapp/config', { method: 'GET' });
          const payload = await res.json();
          if (payload.connected) {
            setConnectionStatus('connected');
            setResetReason(null);
            setStatusMessage('');
          } else {
            setConnectionStatus('disconnected');
            setResetReason(
              payload.needs_reset ? 'token_corrupted' :
              payload.reason === 'meta_api_error' ? 'meta_api_error' : null
            );
            setStatusMessage(payload.message || '');
          }
        } catch {
          setConnectionStatus('disconnected');
        }
      } else {
        setConnectionStatus('unknown');
        setResetReason(null);
        setStatusMessage('');
      }
    } catch (err) {
      console.error('fetchConfig error:', err);
      toast.error('Falha ao carregar a configuração do WhatsApp');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (authLoading || profileLoading) return;
    if (!user || !accountId) { setLoading(false); return; }
    fetchConfig(accountId);
  }, [authLoading, profileLoading, user, accountId, fetchConfig]);

  // ── Meta handlers ─────────────────────────────────────────────────────

  async function handleSave() {
    if (!phoneNumberId.trim()) { toast.error('O ID do número de telefone é obrigatório'); return; }
    if (!config && (!accessToken.trim() || !tokenEdited)) {
      toast.error('O Token de Acesso é obrigatório para a configuração inicial'); return;
    }
    if (config && !tokenEdited) {
      toast.error('Por favor, insira novamente o Token de Acesso para salvar as alterações'); return;
    }
    try {
      setSaving(true);
      const res = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'meta',
          phone_number_id: phoneNumberId.trim(),
          waba_id: wabaId.trim() || null,
          verify_token: verifyToken.trim() || null,
          pin: pin.trim() || null,
          access_token: accessToken.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Falha ao salvar a configuração'); return; }
      if (data.registered === false && data.registration_error) {
        toast.error(`Salvo, mas o Meta não conseguiu registrar o número: ${data.registration_error}`, { duration: 12000 });
      } else if (data.registration_skipped) {
        toast.success('Credenciais salvas e verificadas. O registro de entrada foi ignorado (sem PIN).', { duration: 10000 });
        setPin('');
      } else {
        toast.success(
          data.phone_info?.verified_name
            ? `Ativo — ${data.phone_info.verified_name} já pode receber eventos.`
            : 'WhatsApp conectado.',
        );
        setPin('');
      }
      if (accountId) await fetchConfig(accountId);
    } catch {
      toast.error('Falha ao salvar a configuração');
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    try {
      setTesting(true);
      const res = await fetch('/api/whatsapp/config', { method: 'GET' });
      const payload = await res.json();
      if (payload.connected) {
        setConnectionStatus('connected');
        setResetReason(null);
        setStatusMessage('');
        toast.success(payload.phone_info?.verified_name ? `Conectado a ${payload.phone_info.verified_name}` : 'Conexão com a API bem-sucedida');
      } else {
        setConnectionStatus('disconnected');
        setResetReason(payload.needs_reset ? 'token_corrupted' : null);
        setStatusMessage(payload.message || '');
        toast.error(payload.message || 'Falha na conexão com a API');
      }
    } catch {
      setConnectionStatus('disconnected');
      toast.error('Teste de conexão falhou.');
    } finally {
      setTesting(false);
    }
  }

  async function handleVerifyRegistration() {
    setVerifyingRegistration(true);
    setRegistrationProbe(null);
    try {
      const res = await fetch('/api/whatsapp/config/verify-registration', { method: 'GET' });
      const data = (await res.json()) as RegistrationProbe;
      setRegistrationProbe(data);
      if (data.live) {
        toast.success('Número completamente configurado — o Meta está entregando eventos.');
      } else {
        toast.error('O número não está totalmente registrado.', { duration: 8000 });
      }
      if (accountId) await fetchConfig(accountId);
    } catch {
      toast.error('Não foi possível acessar o endpoint de verificação.');
    } finally {
      setVerifyingRegistration(false);
    }
  }

  async function handleReset() {
    if (!confirm('Isso excluirá a configuração atual do WhatsApp. Continuar?')) return;
    try {
      setResetting(true);
      const res = await fetch('/api/whatsapp/config', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Falha ao redefinir a configuração'); return; }
      toast.success('Configuração apagada.');
      setConfig(null);
      setPhoneNumberId(''); setWabaId(''); setAccessToken(''); setVerifyToken('');
      setTokenEdited(false);
      setConnectionStatus('disconnected'); setResetReason(null); setStatusMessage('');
      setWapiConnected(false); setWapiPhone(null); setWapiQrCode(null);
      setEvolutionConnected(false); setEvolutionPhone(null); setEvolutionQrCode(null); setEvolutionPairingCode(null);
    } catch {
      toast.error('Falha ao redefinir a configuração');
    } finally {
      setResetting(false);
    }
  }

  // ── W-API handlers ───────────────────────────────────────────────────

  async function handleWapiActivate() {
    try {
      setWapiActivating(true);
      const res = await fetch('/api/whatsapp/config/wapi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'activate' }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Falha ao ativar a API Não Oficial'); return; }
      toast.success('API Não Oficial ativada.');
      if (accountId) await fetchConfig(accountId);
      // Immediately check status
      await handleWapiCheckStatus();
    } catch {
      toast.error('Falha ao ativar a API Não Oficial');
    } finally {
      setWapiActivating(false);
    }
  }

  async function handleWapiCheckStatus() {
    try {
      setWapiStatusLoading(true);
      const res = await fetch('/api/whatsapp/config/wapi', { method: 'GET' });
      const data = await res.json();
      if (data.connected) {
        setWapiConnected(true);
        setWapiPhone(data.phone ?? null);
        toast.success('WhatsApp conectado via W-API.');
      } else {
        setWapiConnected(false);
        setWapiPhone(null);
        toast.info('WhatsApp não está conectado. Escaneie o QR code.');
      }
    } catch {
      toast.error('Falha ao verificar status da W-API');
    } finally {
      setWapiStatusLoading(false);
    }
  }

  async function handleWapiLoadQr() {
    try {
      setWapiQrLoading(true);
      setWapiQrCode(null);
      const res = await fetch('/api/whatsapp/config/wapi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'qr' }),
      });
      const data = await res.json();
      const qrData: string | null = data.qrcode ?? data.qr ?? data.base64 ?? null;
      if (qrData) {
        setWapiQrCode(qrData.startsWith('data:') ? qrData : `data:image/png;base64,${qrData}`);
      } else if (data.already_connected) {
        // W-API won't give a QR when already connected — auto-verify
        toast.info('Instância já conectada. Verificando status...');
        await handleWapiCheckStatus();
      } else {
        toast.error('QR code não disponível. Verifique o painel da W-API.');
      }
    } catch {
      toast.error('Falha ao carregar QR code');
    } finally {
      setWapiQrLoading(false);
    }
  }

  async function handleWapiDisconnect() {
    if (!confirm('Isso desconectará o WhatsApp da instância W-API. Continuar?')) return;
    try {
      const res = await fetch('/api/whatsapp/config/wapi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect' }),
      });
      if (res.ok) {
        setWapiConnected(false);
        setWapiPhone(null);
        setWapiQrCode(null);
        toast.success('WhatsApp desconectado.');
      } else {
        toast.error('Falha ao desconectar.');
      }
    } catch {
      toast.error('Falha ao desconectar.');
    }
  }

  // ── Evolution API handlers ───────────────────────────────────────────

  async function handleEvolutionActivate() {
    try {
      setEvolutionActivating(true);
      const res = await fetch('/api/whatsapp/config/evolution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'activate' }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Falha ao ativar o Evolution API'); return; }
      toast.success('Instância criada.');
      if (accountId) await fetchConfig(accountId);
      await handleEvolutionCheckStatus();
    } catch {
      toast.error('Falha ao ativar o Evolution API');
    } finally {
      setEvolutionActivating(false);
    }
  }

  async function handleEvolutionCheckStatus() {
    try {
      setEvolutionStatusLoading(true);
      const res = await fetch('/api/whatsapp/config/evolution', { method: 'GET' });
      const data = await res.json();
      if (data.connected) {
        setEvolutionConnected(true);
        setEvolutionPhone(data.phone ?? null);
        toast.success('WhatsApp conectado via Evolution API.');
      } else {
        setEvolutionConnected(false);
        setEvolutionPhone(null);
        toast.info('WhatsApp não está conectado. Escaneie o QR code.');
      }
    } catch {
      toast.error('Falha ao verificar status do Evolution API');
    } finally {
      setEvolutionStatusLoading(false);
    }
  }

  async function handleEvolutionLoadQr() {
    try {
      setEvolutionQrLoading(true);
      setEvolutionQrCode(null);
      setEvolutionPairingCode(null);
      const res = await fetch('/api/whatsapp/config/evolution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'qr' }),
      });
      const data = await res.json();
      const qrData: string | null = data.base64 ?? null;
      const pairingCode: string | null = data.code ?? data.pairingCode ?? null;
      if (qrData) {
        setEvolutionQrCode(qrData.startsWith('data:') ? qrData : `data:image/png;base64,${qrData}`);
        setEvolutionPairingCode(pairingCode);
      } else if (data.already_connected) {
        toast.info('Instância já conectada. Verificando status...');
        await handleEvolutionCheckStatus();
      } else {
        toast.error('QR code não disponível. Tente novamente em instantes.');
      }
    } catch {
      toast.error('Falha ao carregar QR code');
    } finally {
      setEvolutionQrLoading(false);
    }
  }

  async function handleEvolutionDisconnect() {
    if (!confirm('Isso desconectará o WhatsApp da instância Evolution API. Continuar?')) return;
    try {
      const res = await fetch('/api/whatsapp/config/evolution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect' }),
      });
      if (res.ok) {
        setEvolutionConnected(false);
        setEvolutionPhone(null);
        setEvolutionQrCode(null);
        setEvolutionPairingCode(null);
        toast.success('WhatsApp desconectado.');
      } else {
        toast.error('Falha ao desconectar.');
      }
    } catch {
      toast.error('Falha ao desconectar.');
    }
  }

  if (loading) {
    return (
      <section className="animate-in fade-in-50 duration-200">
        <SettingsPanelHead
          title="Conexão WhatsApp"
          description="Configure sua conexão com o WhatsApp para enviar e receber mensagens."
        />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      </section>
    );
  }

  const showResetBanner = resetReason === 'token_corrupted';

  return (
    <section className="animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title="Conexão WhatsApp"
        description="Escolha entre a API oficial do Meta ou a API não oficial para conectar o WhatsApp."
      />

      <Tabs
        defaultValue={activeProvider === 'wapi' ? 'wapi' : activeProvider === 'evolution' ? 'evolution' : 'meta'}
        className="space-y-6"
      >
        <TabsList className="bg-muted border border-border h-auto p-1 gap-1">
          <TabsTrigger
            value="meta"
            className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm text-muted-foreground gap-2"
          >
            API Oficial (Meta)
            {activeProvider === 'meta' && config && (
              <span className="ml-1 rounded-full bg-primary/20 text-primary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                Ativo
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="wapi"
            className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm text-muted-foreground gap-2"
          >
            API Não Oficial (W-API)
            {activeProvider === 'wapi' && (
              <span className="ml-1 rounded-full bg-primary/20 text-primary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                Ativo
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="evolution"
            className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm text-muted-foreground gap-2"
          >
            Evolution API
            {activeProvider === 'evolution' && (
              <span className="ml-1 rounded-full bg-primary/20 text-primary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                Ativo
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ─────────────── META TAB ─────────────── */}
        <TabsContent value="meta" className="mt-0">
          <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
            <div className="space-y-6">
              {showResetBanner && (
                <Alert className="bg-amber-950/40 border-amber-600/40">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="size-5 text-amber-400 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <AlertTitle className="text-amber-200 mb-1">Token armazenado não pode ser descriptografado</AlertTitle>
                      <AlertDescription className="text-amber-100/80 text-sm">{statusMessage}</AlertDescription>
                      <Button onClick={handleReset} disabled={resetting} size="sm" className="mt-3 bg-amber-600 hover:bg-amber-700 text-white">
                        {resetting ? <><Loader2 className="size-4 animate-spin" />Redefinindo...</> : <><RotateCcw className="size-4" />Redefinir Configuração</>}
                      </Button>
                    </div>
                  </div>
                </Alert>
              )}

              <Alert className="bg-card border-border">
                <div className="flex items-center gap-2">
                  {connectionStatus === 'connected'
                    ? <CheckCircle2 className="size-4 text-primary" />
                    : <XCircle className="size-4 text-red-500" />}
                  <AlertTitle className="text-foreground mb-0">
                    {connectionStatus === 'connected' ? 'Credenciais válidas' : 'Não conectado'}
                  </AlertTitle>
                </div>
                <AlertDescription className="text-muted-foreground">
                  {connectionStatus === 'connected'
                    ? 'Seu token de acesso autentica com o Meta.'
                    : statusMessage || 'Configure suas credenciais da API do Meta abaixo.'}
                </AlertDescription>
              </Alert>

              {config && activeProvider === 'meta' && (
                <Alert className={isRegistered ? 'bg-emerald-950/30 border-emerald-700/50' : 'bg-amber-950/30 border-amber-700/50'}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      {isRegistered
                        ? <CheckCircle2 className="size-4 text-emerald-400" />
                        : <AlertTriangle className="size-4 text-amber-400" />}
                      <AlertTitle className={'mb-0 ' + (isRegistered ? 'text-emerald-200' : 'text-amber-200')}>
                        {isRegistered ? 'Registrado — o Meta entregará eventos' : 'Não registrado — o Meta não entregará eventos'}
                      </AlertTitle>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleVerifyRegistration} disabled={verifyingRegistration} className="border-border bg-transparent text-foreground hover:bg-muted h-7">
                      {verifyingRegistration ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
                      Verificar com Meta
                    </Button>
                  </div>
                  <AlertDescription className="text-muted-foreground mt-2 text-xs leading-relaxed">
                    {isRegistered ? (
                      <>Inscrito desde {config.registered_at ? new Date(config.registered_at).toLocaleString() : 'desconhecido'}.</>
                    ) : lastRegistrationError ? (
                      <>A última tentativa falhou: <span className="text-red-300">&quot;{lastRegistrationError}&quot;</span>. Insira o PIN abaixo e salve.</>
                    ) : (
                      <>Insira o PIN de 2 etapas abaixo e clique em Salvar para inscrever o número.</>
                    )}
                  </AlertDescription>
                  {registrationProbe && (
                    <div className="mt-3 rounded border border-border bg-card/60 px-3 py-2 space-y-1.5 text-[11px]">
                      <p className="font-medium text-foreground">
                        Diagnóstico: <span className={registrationProbe.live ? 'text-emerald-400' : 'text-amber-400'}>{registrationProbe.live ? 'ativo' : 'inativo'}</span>
                      </p>
                      <ul className="space-y-0.5 text-muted-foreground">
                        {Object.entries(registrationProbe.checks).map(([k, v]) => (
                          <li key={k} className="flex items-center gap-1.5">
                            {v === true
                              ? <CheckCircle2 className="size-3 text-emerald-400 shrink-0" />
                              : v === false
                                ? <XCircle className="size-3 text-red-400 shrink-0" />
                                : <span className="size-3 rounded-full border border-border shrink-0" />}
                            <code className="text-muted-foreground">{k}</code>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Alert>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-foreground">Credenciais da API</CardTitle>
                  <CardDescription className="text-muted-foreground">Credenciais da API WhatsApp Business do Meta.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">ID do número de telefone</Label>
                    <Input placeholder="ex.: 100234567890123" value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} className="bg-muted border-border text-foreground placeholder:text-muted-foreground" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">ID da conta WhatsApp Business (WABA)</Label>
                    <Input placeholder="ex.: 100234567890456" value={wabaId} onChange={(e) => setWabaId(e.target.value)} className="bg-muted border-border text-foreground placeholder:text-muted-foreground" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Token de acesso permanente</Label>
                    <div className="relative">
                      <Input
                        type={showToken ? 'text' : 'password'}
                        placeholder="Insira seu token de acesso"
                        value={accessToken}
                        onChange={(e) => { setAccessToken(e.target.value); setTokenEdited(true); }}
                        onFocus={() => { if (accessToken === MASKED_TOKEN) { setAccessToken(''); setTokenEdited(true); } }}
                        className="bg-muted border-border text-foreground placeholder:text-muted-foreground pr-10"
                      />
                      <button type="button" onClick={() => setShowToken(!showToken)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                        {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                    {config && !tokenEdited && <p className="text-xs text-muted-foreground">Token oculto por segurança. Insira-o novamente para atualizar.</p>}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Token de verificação do Webhook</Label>
                    <Input placeholder="Crie um token de verificação personalizado" value={verifyToken} onChange={(e) => setVerifyToken(e.target.value)} className="bg-muted border-border text-foreground placeholder:text-muted-foreground" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">PIN de verificação em duas etapas <span className="ml-1 text-muted-foreground">(opcional)</span></Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="PIN de 6 dígitos do Meta WhatsApp Manager"
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="bg-muted border-border text-foreground placeholder:text-muted-foreground tracking-widest"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-foreground">Configuração do Webhook</CardTitle>
                  <CardDescription className="text-muted-foreground">Use esta URL como callback no Meta App Dashboard.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">URL de callback do Webhook</Label>
                    <div className="flex gap-2">
                      <Input readOnly value={metaWebhookUrl} className="bg-muted border-border text-muted-foreground font-mono text-sm" />
                      <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(metaWebhookUrl); toast.success('URL copiada'); }} className="shrink-0 border-border text-muted-foreground hover:text-foreground hover:bg-muted">
                        <Copy className="size-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex flex-wrap gap-3">
                <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                  {saving ? <><Loader2 className="size-4 animate-spin" />Salvando...</> : 'Salvar Configuração'}
                </Button>
                <Button variant="outline" onClick={handleTestConnection} disabled={testing || !config} className="border-border text-muted-foreground hover:text-foreground hover:bg-muted">
                  {testing ? <><Loader2 className="size-4 animate-spin" />Testando...</> : <><Zap className="size-4" />Testar Conexão</>}
                </Button>
                {config && (
                  <Button variant="outline" onClick={handleReset} disabled={resetting} className="border-red-900 text-red-400 hover:text-red-300 hover:bg-red-950/40">
                    {resetting ? <><Loader2 className="size-4 animate-spin" />Redefinindo...</> : <><RotateCcw className="size-4" />Redefinir Configuração</>}
                  </Button>
                )}
              </div>
            </div>

            {/* Meta sidebar */}
            <div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-foreground text-base">Instruções de configuração</CardTitle>
                  <CardDescription className="text-muted-foreground">Passos para conectar a API oficial do Meta.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Accordion>
                    <AccordionItem className="border-border">
                      <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                        <span className="flex items-center gap-2">
                          <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span>
                          Criar um app do Meta
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground">
                        <ol className="list-decimal list-inside space-y-1 text-sm">
                          <li>Acesse developers.facebook.com</li>
                          <li>Clique em &quot;Meus Apps&quot; → &quot;Criar App&quot;</li>
                          <li>Selecione &quot;Empresa&quot; como tipo de app</li>
                        </ol>
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem className="border-border">
                      <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                        <span className="flex items-center gap-2">
                          <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</span>
                          Obter credenciais da API
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground">
                        <ol className="list-decimal list-inside space-y-1 text-sm">
                          <li>Acesse WhatsApp → Configuração da API</li>
                          <li>Copie o <strong className="text-foreground">ID do número de telefone</strong></li>
                          <li>Copie o <strong className="text-foreground">ID da conta WhatsApp Business</strong></li>
                          <li>Gere um <strong className="text-foreground">Token de acesso permanente</strong></li>
                        </ol>
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem className="border-border">
                      <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                        <span className="flex items-center gap-2">
                          <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">3</span>
                          Configurar Webhooks
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground">
                        <ol className="list-decimal list-inside space-y-1 text-sm">
                          <li>Acesse WhatsApp → Configuração</li>
                          <li>Cole a URL de callback do Webhook acima</li>
                          <li>Insira o mesmo Token de verificação</li>
                          <li>Assine o campo &quot;messages&quot;</li>
                        </ol>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                  <div className="mt-4 pt-4 border-t border-border">
                    <a href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors">
                      <ExternalLink className="size-3.5" />
                      Documentação oficial do Meta
                    </a>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ─────────────── W-API TAB ─────────────── */}
        <TabsContent value="wapi" className="mt-0">
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="space-y-6">

              {/* Status card */}
              <Alert className="bg-card border-border">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    {wapiConnected
                      ? <CheckCircle2 className="size-4 text-primary" />
                      : <XCircle className="size-4 text-red-500" />}
                    <AlertTitle className="text-foreground mb-0">
                      {wapiConnected
                        ? `Conectado${wapiPhone ? ` — +${wapiPhone}` : ''}`
                        : 'Não conectado'}
                    </AlertTitle>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleWapiCheckStatus}
                    disabled={wapiStatusLoading || activeProvider !== 'wapi'}
                    className="border-border text-muted-foreground hover:text-foreground hover:bg-muted h-7"
                  >
                    {wapiStatusLoading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                    Verificar
                  </Button>
                </div>
                <AlertDescription className="text-muted-foreground">
                  {activeProvider !== 'wapi'
                    ? 'Ative a API Não Oficial abaixo para usar esta integração.'
                    : wapiConnected
                      ? 'WhatsApp conectado via W-API. Mensagens enviadas e recebidas pelo CRM.'
                      : 'Escaneie o QR code para conectar o WhatsApp.'}
                </AlertDescription>
              </Alert>

              {/* Webhook URL */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-foreground">URL do Webhook</CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Configure esta URL nos 4 campos de webhook no painel da W-API.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={WAPI_WEBHOOK_URL}
                      className="bg-muted border-border text-muted-foreground font-mono text-xs"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => { navigator.clipboard.writeText(WAPI_WEBHOOK_URL); toast.success('URL copiada'); }}
                      className="shrink-0 border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                    >
                      <Copy className="size-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    No painel da W-API, clique em &quot;Webhooks&quot; e cole este URL nos campos:<br />
                    <strong className="text-foreground">Ao receber</strong>, <strong className="text-foreground">Ao enviar</strong>, <strong className="text-foreground">Ao conectar</strong> e <strong className="text-foreground">Status</strong>. Em seguida, clique em &quot;Salvar alterações&quot;.
                  </p>
                </CardContent>
              </Card>

              {/* QR code section — only visible when active and not connected */}
              {activeProvider === 'wapi' && !wapiConnected && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-foreground flex items-center gap-2">
                      <QrCode className="size-4" />
                      Conectar WhatsApp
                    </CardTitle>
                    <CardDescription className="text-muted-foreground">
                      Abra o WhatsApp no celular → Aparelhos conectados → Conectar um aparelho.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {wapiQrCode ? (
                      <div className="flex flex-col items-center gap-4">
                        <div className="rounded-lg border border-border bg-white p-3">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={wapiQrCode} alt="WhatsApp QR Code" className="size-52 object-contain" />
                        </div>
                        <p className="text-xs text-muted-foreground text-center">
                          QR code expira em ~60s. Após escanear, clique em <strong className="text-foreground">Verificar</strong> acima.
                        </p>
                        <Button variant="outline" size="sm" onClick={handleWapiLoadQr} disabled={wapiQrLoading} className="border-border text-muted-foreground hover:text-foreground hover:bg-muted">
                          {wapiQrLoading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                          Novo QR code
                        </Button>
                      </div>
                    ) : (
                      <Button onClick={handleWapiLoadQr} disabled={wapiQrLoading} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                        {wapiQrLoading ? <><Loader2 className="size-4 animate-spin" />Carregando...</> : <><QrCode className="size-4" />Carregar QR code</>}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Activation / Deactivation buttons */}
              <div className="flex flex-wrap gap-3">
                {activeProvider !== 'wapi' ? (
                  <Button onClick={handleWapiActivate} disabled={wapiActivating} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                    {wapiActivating ? <><Loader2 className="size-4 animate-spin" />Ativando...</> : <><Smartphone className="size-4" />Ativar API Não Oficial</>}
                  </Button>
                ) : (
                  <>
                    {wapiConnected && (
                      <Button variant="outline" onClick={handleWapiDisconnect} className="border-red-900 text-red-400 hover:text-red-300 hover:bg-red-950/40">
                        <XCircle className="size-4" />
                        Desconectar WhatsApp
                      </Button>
                    )}
                    {config && (
                      <Button variant="outline" onClick={handleReset} disabled={resetting} className="border-border text-muted-foreground hover:text-foreground hover:bg-muted">
                        {resetting ? <><Loader2 className="size-4 animate-spin" />Removendo...</> : <><RotateCcw className="size-4" />Remover Configuração</>}
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* W-API sidebar */}
            <div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-foreground text-base">Como configurar</CardTitle>
                  <CardDescription className="text-muted-foreground">Conecte o WhatsApp via W-API em 4 passos.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Accordion>
                    <AccordionItem className="border-border">
                      <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                        <span className="flex items-center gap-2">
                          <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span>
                          Ativar a integração
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground text-sm">
                        Clique em <strong className="text-foreground">Ativar API Não Oficial</strong> nesta página. Isso altera o provedor ativo para W-API.
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem className="border-border">
                      <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                        <span className="flex items-center gap-2">
                          <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</span>
                          Configurar webhook na W-API
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground text-sm space-y-1">
                        <p>No painel da W-API (painel.w-api.app):</p>
                        <ol className="list-decimal list-inside space-y-1">
                          <li>Acesse sua instância</li>
                          <li>Clique em &quot;Webhooks&quot;</li>
                          <li>Cole a URL do Webhook nos 4 campos</li>
                          <li>Clique em &quot;Salvar alterações&quot;</li>
                        </ol>
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem className="border-border">
                      <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                        <span className="flex items-center gap-2">
                          <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">3</span>
                          Conectar o WhatsApp
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground text-sm">
                        Se a instância não estiver conectada, clique em <strong className="text-foreground">Carregar QR code</strong> e escaneie com o celular. Se já estiver conectada, clique em <strong className="text-foreground">Verificar</strong>.
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem className="border-border">
                      <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                        <span className="flex items-center gap-2">
                          <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">4</span>
                          Enviar e receber mensagens
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground text-sm">
                        Mensagens recebidas aparecerão automaticamente na Caixa de Entrada. Para enviar, abra uma conversa normalmente.
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                  <div className="mt-4 pt-4 border-t border-border space-y-2">
                    <p className="text-xs text-muted-foreground">
                      As credenciais da W-API são armazenadas de forma segura no servidor e nunca expostas ao navegador.
                    </p>
                    <a href="https://painel.w-api.app" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors">
                      <ExternalLink className="size-3.5" />
                      Painel da W-API
                    </a>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ─────────────── EVOLUTION API TAB ─────────────── */}
        <TabsContent value="evolution" className="mt-0">
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="space-y-6">

              {/* Status card */}
              <Alert className="bg-card border-border">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    {evolutionConnected
                      ? <CheckCircle2 className="size-4 text-primary" />
                      : <XCircle className="size-4 text-red-500" />}
                    <AlertTitle className="text-foreground mb-0">
                      {evolutionConnected
                        ? `Conectado${evolutionPhone ? ` — +${evolutionPhone}` : ''}`
                        : 'Não conectado'}
                    </AlertTitle>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleEvolutionCheckStatus}
                    disabled={evolutionStatusLoading || activeProvider !== 'evolution'}
                    className="border-border text-muted-foreground hover:text-foreground hover:bg-muted h-7"
                  >
                    {evolutionStatusLoading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                    Verificar
                  </Button>
                </div>
                <AlertDescription className="text-muted-foreground">
                  {activeProvider !== 'evolution'
                    ? 'Ative o Evolution API abaixo para usar esta integração.'
                    : evolutionConnected
                      ? 'WhatsApp conectado via Evolution API. Mensagens enviadas e recebidas pelo CRM.'
                      : 'Escaneie o QR code para conectar o WhatsApp.'}
                </AlertDescription>
              </Alert>

              {/* QR code section — only visible when active and not connected */}
              {activeProvider === 'evolution' && !evolutionConnected && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-foreground flex items-center gap-2">
                      <QrCode className="size-4" />
                      Conectar WhatsApp
                    </CardTitle>
                    <CardDescription className="text-muted-foreground">
                      Abra o WhatsApp no celular → Aparelhos conectados → Conectar um aparelho.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {evolutionQrCode ? (
                      <div className="flex flex-col items-center gap-4">
                        <div className="rounded-lg border border-border bg-white p-3">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={evolutionQrCode} alt="WhatsApp QR Code" className="size-52 object-contain" />
                        </div>
                        {evolutionPairingCode && (
                          <p className="text-sm text-foreground">
                            Ou use o código: <code className="font-mono font-semibold tracking-widest">{evolutionPairingCode}</code>
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground text-center">
                          QR code expira em ~60s. Após escanear, clique em <strong className="text-foreground">Verificar</strong> acima.
                        </p>
                        <Button variant="outline" size="sm" onClick={handleEvolutionLoadQr} disabled={evolutionQrLoading} className="border-border text-muted-foreground hover:text-foreground hover:bg-muted">
                          {evolutionQrLoading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                          Novo QR code
                        </Button>
                      </div>
                    ) : (
                      <Button onClick={handleEvolutionLoadQr} disabled={evolutionQrLoading} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                        {evolutionQrLoading ? <><Loader2 className="size-4 animate-spin" />Carregando...</> : <><QrCode className="size-4" />Carregar QR code</>}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Activation / Deactivation buttons */}
              <div className="flex flex-wrap gap-3">
                {activeProvider !== 'evolution' ? (
                  <Button onClick={handleEvolutionActivate} disabled={evolutionActivating} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                    {evolutionActivating ? <><Loader2 className="size-4 animate-spin" />Ativando...</> : <><Smartphone className="size-4" />Ativar Evolution API</>}
                  </Button>
                ) : (
                  <>
                    {evolutionConnected && (
                      <Button variant="outline" onClick={handleEvolutionDisconnect} className="border-red-900 text-red-400 hover:text-red-300 hover:bg-red-950/40">
                        <XCircle className="size-4" />
                        Desconectar WhatsApp
                      </Button>
                    )}
                    {config && (
                      <Button variant="outline" onClick={handleReset} disabled={resetting} className="border-border text-muted-foreground hover:text-foreground hover:bg-muted">
                        {resetting ? <><Loader2 className="size-4 animate-spin" />Removendo...</> : <><RotateCcw className="size-4" />Remover Configuração</>}
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Evolution sidebar */}
            <div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-foreground text-base">Como funciona</CardTitle>
                  <CardDescription className="text-muted-foreground">Sua própria instância de WhatsApp, self-hosted.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Accordion>
                    <AccordionItem className="border-border">
                      <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                        <span className="flex items-center gap-2">
                          <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span>
                          Ativar a integração
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground text-sm">
                        Clique em <strong className="text-foreground">Ativar Evolution API</strong>. Isso cria automaticamente uma instância própria para esta conta no servidor Evolution API e já configura o webhook — não é preciso colar nenhuma URL manualmente.
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem className="border-border">
                      <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                        <span className="flex items-center gap-2">
                          <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</span>
                          Conectar o WhatsApp
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground text-sm">
                        Clique em <strong className="text-foreground">Carregar QR code</strong> e escaneie com o celular. Depois de escanear, clique em <strong className="text-foreground">Verificar</strong>.
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem className="border-border">
                      <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                        <span className="flex items-center gap-2">
                          <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">3</span>
                          Enviar e receber mensagens
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground text-sm">
                        Mensagens recebidas (incluindo de grupos) aparecerão automaticamente na Caixa de Entrada. Para enviar, abra uma conversa normalmente.
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                  <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-xs text-muted-foreground">
                      As credenciais da instância são armazenadas de forma segura no servidor e nunca expostas ao navegador.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}
