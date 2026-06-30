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
  QrCode,
  RefreshCw,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SettingsPanelHead } from './settings-panel-head';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import type { WhatsAppConfig as WhatsAppConfigType, WhatsAppProvider } from '@/types';

const MASKED_TOKEN = '••••••••••••••••';

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

  // Provider selection
  const [provider, setProvider] = useState<WhatsAppProvider>('meta');

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

  // ── Evolution fields ─────────────────────────────────────────────────
  const [evoQrCode, setEvoQrCode] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);
  const [instanceState, setInstanceState] = useState<string | null>(null);

  const metaWebhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/whatsapp/webhook`
      : '';

  const fetchConfig = useCallback(async (acctId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('whatsapp_config')
        .select('*')
        .eq('account_id', acctId)
        .maybeSingle();

      if (error) {
        console.error('Failed to load config row:', error);
      }

      if (data) {
        setConfig(data);
        const savedProvider: WhatsAppProvider = (data.provider as WhatsAppProvider) ?? 'meta';
        setProvider(savedProvider);

        if (savedProvider === 'evolution') {
          // credentials managed server-side via env vars
        } else {
          setPhoneNumberId(data.phone_number_id || '');
          setWabaId(data.waba_id || '');
          setAccessToken(MASKED_TOKEN);
          setVerifyToken('');
          setPin('');
          setTokenEdited(false);
        }
      } else {
        setConfig(null);
        setPhoneNumberId('');
        setWabaId('');
        setAccessToken('');
        setVerifyToken('');
        setPin('');
        setTokenEdited(false);
        setEvoQrCode(null);
      }
      setRegistrationProbe(null);

      // Health check
      if (data) {
        try {
          const res = await fetch('/api/whatsapp/config', { method: 'GET' });
          const payload = await res.json();

          if (payload.connected) {
            setConnectionStatus('connected');
            setResetReason(null);
            setStatusMessage('');
            if (payload.instance_state) setInstanceState(payload.instance_state);
          } else {
            setConnectionStatus('disconnected');
            setResetReason(payload.needs_reset ? 'token_corrupted' : payload.reason === 'meta_api_error' ? 'meta_api_error' : null);
            setStatusMessage(payload.message || '');
            if (payload.instance_state) setInstanceState(payload.instance_state);
          }
        } catch (err) {
          console.error('Health check failed:', err);
          setConnectionStatus('disconnected');
        }
      } else {
        setConnectionStatus('disconnected');
        setResetReason(null);
        setStatusMessage('');
        setInstanceState(null);
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
    if (!user || !accountId) {
      setLoading(false);
      return;
    }
    fetchConfig(accountId);
  }, [authLoading, profileLoading, user, accountId, fetchConfig]);

  // ── Evolution QR code polling ────────────────────────────────────────
  async function fetchEvolutionQr() {
    setLoadingQr(true);
    try {
      const res = await fetch('/api/whatsapp/qr', { method: 'GET' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Não foi possível obter o QR code.');
        return;
      }
      if (data.qr) {
        setEvoQrCode(data.qr);
      } else {
        toast.info('Instância já conectada ou QR code indisponível.');
      }
    } catch (err) {
      console.error('QR fetch error:', err);
      toast.error('Erro ao buscar QR code.');
    } finally {
      setLoadingQr(false);
    }
  }

  // ── Save handlers ────────────────────────────────────────────────────
  async function handleSave() {
    if (provider === 'evolution') {
      await handleSaveEvolution();
    } else {
      await handleSaveMeta();
    }
  }

  async function handleSaveMeta() {
    if (!phoneNumberId.trim()) {
      toast.error('O ID do número de telefone é obrigatório');
      return;
    }
    if (!config && (!accessToken.trim() || !tokenEdited)) {
      toast.error('O Token de Acesso é obrigatório para a configuração inicial');
      return;
    }
    if (config && !tokenEdited) {
      toast.error('Por favor, insira novamente o Token de Acesso para salvar as alterações');
      return;
    }

    try {
      setSaving(true);
      const payload: Record<string, unknown> = {
        provider: 'meta',
        phone_number_id: phoneNumberId.trim(),
        waba_id: wabaId.trim() || null,
        verify_token: verifyToken.trim() || null,
        pin: pin.trim() || null,
        access_token: accessToken.trim(),
      };

      const res = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Falha ao salvar a configuração');
        return;
      }

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
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Falha ao salvar a configuração');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEvolution() {
    try {
      setSaving(true);
      const payload: Record<string, unknown> = {
        provider: 'evolution',
      };

      const res = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Falha ao salvar a configuração');
        return;
      }

      if (data.needs_qr) {
        toast.success('Configuração salva. Escaneie o QR code abaixo para conectar.');
        setInstanceState('connecting');
        await fetchEvolutionQr();
      } else {
        toast.success('Evolution API conectada com sucesso.');
        setInstanceState('open');
        setEvoQrCode(null);
      }

      if (accountId) await fetchConfig(accountId);
    } catch (err) {
      console.error('Save error:', err);
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
        if (payload.instance_state) setInstanceState(payload.instance_state);
        toast.success(
          payload.phone_info?.verified_name
            ? `Conectado a ${payload.phone_info.verified_name}`
            : 'Conexão com a API bem-sucedida'
        );
      } else {
        setConnectionStatus('disconnected');
        setResetReason(payload.needs_reset ? 'token_corrupted' : null);
        setStatusMessage(payload.message || '');
        if (payload.instance_state) setInstanceState(payload.instance_state);
        const msg = payload.instance_state === 'connecting'
          ? 'Aguardando QR code — escaneie com o WhatsApp para conectar.'
          : payload.message || 'Falha na conexão com a API';
        toast.error(msg);
      }
    } catch (err) {
      console.error('Test connection error:', err);
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
    } catch (err) {
      console.error('verify-registration failed:', err);
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

      if (!res.ok) {
        toast.error(data.error || 'Falha ao redefinir a configuração');
        return;
      }

      toast.success('Configuração apagada.');
      setConfig(null);
      setPhoneNumberId(''); setWabaId(''); setAccessToken(''); setVerifyToken('');
      setTokenEdited(false); setEvoQrCode(null);
      setConnectionStatus('disconnected'); setResetReason(null); setStatusMessage('');
      setInstanceState(null);
    } catch (err) {
      console.error('Reset error:', err);
      toast.error('Falha ao redefinir a configuração');
    } finally {
      setResetting(false);
    }
  }

  if (loading) {
    return (
      <section className="animate-in fade-in-50 duration-200">
        <SettingsPanelHead
          title="Conexão WhatsApp"
          description="Configure sua conexão WhatsApp — API oficial do Meta ou Evolution API (não oficial via QR code)."
        />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      </section>
    );
  }

  const showResetBanner = resetReason === 'token_corrupted';
  const evoConnected = provider === 'evolution' && instanceState === 'open';
  const evoNeedsQr = provider === 'evolution' && instanceState === 'connecting';

  return (
    <section className="animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title="Conexão WhatsApp"
        description="Configure sua conexão WhatsApp — API oficial do Meta ou Evolution API (não oficial via QR code)."
      />

      {/* Provider selector */}
      <div className="mb-6 flex gap-2">
        <button
          type="button"
          onClick={() => setProvider('meta')}
          className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
            provider === 'meta'
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          API Oficial (Meta)
        </button>
        <button
          type="button"
          onClick={() => setProvider('evolution')}
          className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
            provider === 'evolution'
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          Evolution API
          <span className="ml-1.5 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
            não oficial
          </span>
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {/* Reset banner */}
          {showResetBanner && (
            <Alert className="bg-amber-950/40 border-amber-600/40">
              <div className="flex items-start gap-3">
                <AlertTriangle className="size-5 text-amber-400 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <AlertTitle className="text-amber-200 mb-1">Token armazenado não pode ser descriptografado</AlertTitle>
                  <AlertDescription className="text-amber-100/80 text-sm">{statusMessage}</AlertDescription>
                  <Button
                    onClick={handleReset}
                    disabled={resetting}
                    size="sm"
                    className="mt-3 bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    {resetting ? <><Loader2 className="size-4 animate-spin" />Redefinindo...</> : <><RotateCcw className="size-4" />Redefinir Configuração</>}
                  </Button>
                </div>
              </div>
            </Alert>
          )}

          {/* Connection status */}
          <Alert className="bg-card border-border">
            <div className="flex items-center gap-2">
              {connectionStatus === 'connected' ? (
                <CheckCircle2 className="size-4 text-primary" />
              ) : (
                <XCircle className="size-4 text-red-500" />
              )}
              <AlertTitle className="text-foreground mb-0">
                {connectionStatus === 'connected'
                  ? provider === 'evolution'
                    ? 'Evolution API conectada'
                    : 'Credenciais válidas'
                  : provider === 'evolution'
                  ? 'Evolution API desconectada'
                  : 'Não conectado'}
              </AlertTitle>
            </div>
            <AlertDescription className="text-muted-foreground">
              {connectionStatus === 'connected'
                ? provider === 'evolution'
                  ? 'Instância conectada e pronta para envio e recebimento de mensagens.'
                  : 'Seu token de acesso autentica com o Meta.'
                : statusMessage ||
                  (provider === 'evolution'
                    ? 'Clique em "Conectar WhatsApp" para gerar o QR code.'
                    : 'Configure suas credenciais da API do Meta abaixo.')}
            </AlertDescription>
          </Alert>

          {/* ── Meta form ─────────────────────────────────────────────── */}
          {provider === 'meta' && (
            <>
              {/* Registration Status */}
              {config && config.provider === 'meta' && (
                <Alert className={isRegistered ? 'bg-emerald-950/30 border-emerald-700/50' : 'bg-amber-950/30 border-amber-700/50'}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      {isRegistered ? (
                        <CheckCircle2 className="size-4 text-emerald-400" />
                      ) : (
                        <AlertTriangle className="size-4 text-amber-400" />
                      )}
                      <AlertTitle className={'mb-0 ' + (isRegistered ? 'text-emerald-200' : 'text-amber-200')}>
                        {isRegistered ? 'Registrado — o Meta entregará eventos' : 'Não registrado — o Meta não entregará eventos'}
                      </AlertTitle>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleVerifyRegistration}
                      disabled={verifyingRegistration}
                      className="border-border bg-transparent text-foreground hover:bg-muted h-7"
                    >
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
                            {v === true ? <CheckCircle2 className="size-3 text-emerald-400 shrink-0" /> : v === false ? <XCircle className="size-3 text-red-400 shrink-0" /> : <span className="size-3 rounded-full border border-border shrink-0" />}
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
            </>
          )}

          {/* ── Evolution form ────────────────────────────────────────── */}
          {provider === 'evolution' && (
            <>
              {/* QR code panel */}
              {(evoNeedsQr || evoQrCode) && (
                <Alert className="bg-blue-950/30 border-blue-700/50">
                  <div className="flex items-start gap-3">
                    <QrCode className="size-5 text-blue-400 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <AlertTitle className="text-blue-200 mb-2">Escaneie o QR code para conectar</AlertTitle>
                      <AlertDescription className="text-blue-100/80 text-sm mb-3">
                        Abra o WhatsApp → Aparelhos conectados → Conectar um aparelho → escaneie o código abaixo.
                      </AlertDescription>
                      {evoQrCode ? (
                        <div className="mb-3 inline-block rounded-lg border border-blue-700/40 bg-white p-2">
                          <img src={evoQrCode} alt="QR code" className="h-48 w-48" />
                        </div>
                      ) : (
                        <div className="mb-3 flex h-48 w-48 items-center justify-center rounded-lg border border-blue-700/40 bg-blue-950/40">
                          <Loader2 className="size-6 animate-spin text-blue-400" />
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={fetchEvolutionQr} disabled={loadingQr} className="border-blue-700/50 text-blue-300 hover:bg-blue-950/40">
                          {loadingQr ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                          Atualizar QR
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleTestConnection} disabled={testing} className="border-blue-700/50 text-blue-300 hover:bg-blue-950/40">
                          {testing ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
                          Já escaniei
                        </Button>
                      </div>
                    </div>
                  </div>
                </Alert>
              )}
            </>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3">
            {provider === 'evolution' ? (
              <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                {saving
                  ? <><Loader2 className="size-4 animate-spin" />Conectando...</>
                  : <><QrCode className="size-4" />{evoConnected ? 'Reconectar WhatsApp' : 'Conectar WhatsApp'}</>}
              </Button>
            ) : (
              <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                {saving ? <><Loader2 className="size-4 animate-spin" />Salvando...</> : 'Salvar Configuração'}
              </Button>
            )}
            {provider === 'meta' && (
              <Button
                variant="outline"
                onClick={handleTestConnection}
                disabled={testing || !config}
                className="border-border text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                {testing ? <><Loader2 className="size-4 animate-spin" />Testando...</> : <><Zap className="size-4" />Testar Conexão</>}
              </Button>
            )}
            {config && (
              <Button variant="outline" onClick={handleReset} disabled={resetting} className="border-red-900 text-red-400 hover:text-red-300 hover:bg-red-950/40">
                {resetting ? <><Loader2 className="size-4 animate-spin" />Redefinindo...</> : <><RotateCcw className="size-4" />Redefinir Configuração</>}
              </Button>
            )}
          </div>
        </div>

        {/* Setup instructions sidebar */}
        <div>
          {provider === 'meta' ? (
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
                  <a
                    href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
                  >
                    <ExternalLink className="size-3.5" />
                    Documentação oficial do Meta
                  </a>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-foreground text-base">Como conectar</CardTitle>
                <CardDescription className="text-muted-foreground text-xs">Sem senha, sem aprovação — só escanear o QR.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <ol className="space-y-4">
                  {[
                    { n: 1, text: 'Clique no botão', highlight: 'Conectar WhatsApp', after: '.' },
                    { n: 2, text: 'O QR code aparece aqui. Abra o', highlight: 'WhatsApp', after: 'no celular.' },
                    { n: 3, text: 'Toque em', highlight: 'Aparelhos conectados → Conectar um aparelho', after: 'e aponte a câmera para o QR.' },
                    { n: 4, text: 'Clique em', highlight: 'Já escaniei', after: 'para confirmar a conexão.' },
                  ].map(({ n, text, highlight, after }) => (
                    <li key={n} className="flex items-start gap-3">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground mt-0.5">
                        {n}
                      </span>
                      <p className="text-sm text-muted-foreground leading-snug">
                        {text} <span className="font-semibold text-foreground">{highlight}</span> {after}
                      </p>
                    </li>
                  ))}
                </ol>

                <p className="text-xs text-muted-foreground border-t border-border pt-3">
                  O QR expira em ~30 s — clique em <span className="text-foreground font-medium">Atualizar QR</span> se precisar de um novo.
                </p>

                <div className="rounded-lg border border-amber-600/30 bg-amber-950/20 px-3 py-2.5">
                  <p className="text-xs font-semibold text-amber-400 mb-1">Aviso</p>
                  <p className="text-xs text-amber-200/70 leading-relaxed">
                    Usa o protocolo não oficial do WhatsApp Web. O Meta pode suspender o número. Use preferencialmente em números secundários.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </section>
  );
}
