'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';
import { MessageTemplate } from '@/types';
import type { QuickTemplate } from '@/types';
import { Step1ChooseTemplate } from '@/components/broadcasts/step1-choose-template';
import { Step1ChooseQuickTemplate } from '@/components/broadcasts/step1-choose-quick-template';
import { Step2SelectAudience } from '@/components/broadcasts/step2-select-audience';
import { Step3Personalize } from '@/components/broadcasts/step3-personalize';
import { Step4ScheduleSend } from '@/components/broadcasts/step4-schedule-send';
import { useBroadcastSending } from '@/hooks/use-broadcast-sending';
import { Check, MessageSquare, FileText } from 'lucide-react';

// ── Step definitions per type ─────────────────────────────────────────────────

const META_STEPS = [
  { label: 'Template', key: 'template' },
  { label: 'Audience', key: 'audience' },
  { label: 'Personalize', key: 'personalize' },
  { label: 'Send', key: 'send' },
] as const;

const QUICK_STEPS = [
  { label: 'Template', key: 'template' },
  { label: 'Público', key: 'audience' },
  { label: 'Enviar', key: 'send' },
] as const;

// ── Audience type ─────────────────────────────────────────────────────────────

interface AudienceState {
  type: 'all' | 'tags' | 'custom_field' | 'csv';
  tagIds?: string[];
  customField?: { fieldId: string; operator: 'is' | 'is_not' | 'contains'; value: string };
  csvContacts?: { phone: string; name?: string }[];
  excludeTagIds?: string[];
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NewBroadcastPage() {
  const router = useRouter();
  const { accountId } = useAuth();
  const { createAndSendBroadcast, isProcessing, progress } = useBroadcastSending();

  // 'meta' | 'quick' | null (null = type not chosen yet)
  const [broadcastType, setBroadcastType] = useState<'meta' | 'quick' | null>(null);
  const [currentStep, setCurrentStep] = useState(0);

  // Meta flow state
  const [template, setTemplate] = useState<MessageTemplate | null>(null);
  const [variables, setVariables] = useState<
    Record<string, { type: 'static' | 'field' | 'custom_field'; value: string }>
  >({});

  // Quick flow state
  const [quickTemplate, setQuickTemplate] = useState<QuickTemplate | null>(null);
  const [quickSending, setQuickSending] = useState(false);
  const [delaySec, setDelaySec] = useState(10);

  // Shared state
  const [audience, setAudience] = useState<AudienceState>({ type: 'all' });
  const [name, setName] = useState('');

  const steps = broadcastType === 'quick' ? QUICK_STEPS : META_STEPS;

  // ── Meta send ──────────────────────────────────────────────────────────────
  async function handleMetaSend() {
    if (!template) return;
    try {
      const broadcastId = await createAndSendBroadcast({
        name,
        template,
        audience: {
          type: audience.type,
          tagIds: audience.tagIds,
          customField: audience.customField,
          csvContacts: audience.csvContacts,
          excludeTagIds: audience.excludeTagIds,
        },
        variables,
      });
      router.push(`/broadcasts/${broadcastId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Broadcast failed';
      console.error('Broadcast failed:', err);
      toast.error(message);
    }
  }

  async function handleMetaSaveDraft() {
    if (!template || !name.trim()) {
      toast.error('Give the broadcast a name before saving a draft.');
      return;
    }
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) { toast.error('Not signed in.'); return; }
    if (!accountId) { toast.error('Your profile is not linked to an account.'); return; }

    const { error } = await supabase.from('broadcasts').insert({
      user_id: user.id,
      account_id: accountId,
      name: name.trim(),
      template_name: template.name,
      template_language: template.language ?? 'en_US',
      template_variables: variables,
      audience_filter: { type: audience.type, tagIds: audience.tagIds },
      status: 'draft',
      total_recipients: 0,
      sent_count: 0,
      delivered_count: 0,
      read_count: 0,
      replied_count: 0,
      failed_count: 0,
    });

    if (error) { toast.error(`Failed to save draft: ${error.message}`); return; }
    toast.success('Draft saved');
    router.push('/broadcasts');
  }

  // ── Quick send ─────────────────────────────────────────────────────────────
  async function handleQuickSend() {
    if (!quickTemplate || !name.trim()) {
      toast.error('Informe o nome do disparo.');
      return;
    }
    setQuickSending(true);
    try {
      const res = await fetch('/api/whatsapp/broadcast-quick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          quick_template_id: quickTemplate.id,
          delay_seconds: delaySec,
          audience: {
            type: audience.type,
            tagIds: audience.tagIds,
            customField: audience.customField,
            csvContacts: audience.csvContacts,
            excludeTagIds: audience.excludeTagIds,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? 'Falha no disparo'); return; }
      toast.success(`Disparo enviado — ${data.sentCount} enviados, ${data.failedCount} falhas.`);
      router.push(`/broadcasts/${data.broadcastId}`);
    } catch {
      toast.error('Erro de rede. Tente novamente.');
    } finally {
      setQuickSending(false);
    }
  }

  // ── Type selection screen ──────────────────────────────────────────────────
  if (!broadcastType) {
    return (
      <div className="mx-auto max-w-3xl space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Novo Disparo</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Escolha como deseja enviar o disparo.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setBroadcastType('meta')}
            className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-6 text-left hover:border-primary/60 hover:bg-primary/5 transition-all"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
              <FileText className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Meta API (oficial)</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Usa templates aprovados pela Meta. Exige aprovação prévia e número verificado.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setBroadcastType('quick')}
            className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-6 text-left hover:border-primary/60 hover:bg-primary/5 transition-all"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
              <MessageSquare className="h-5 w-5 text-green-400" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Templates Rápidos</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Envia texto livre via API não oficial (Evolution). Sem aprovação, responde imediatamente.
              </p>
            </div>
          </button>
        </div>
      </div>
    );
  }

  // ── Step indicator ─────────────────────────────────────────────────────────
  const StepIndicator = () => (
    <div className="flex items-center justify-between">
      {steps.map((step, index) => {
        const isActive = index === currentStep;
        const isCompleted = index < currentStep;
        return (
          <div key={step.key} className="flex flex-1 items-center">
            <div className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-all ${
                  isCompleted
                    ? 'bg-primary text-primary-foreground'
                    : isActive
                      ? 'border-2 border-primary bg-primary/10 text-primary'
                      : 'border border-border bg-muted text-muted-foreground'
                }`}
              >
                {isCompleted ? <Check className="h-4 w-4" /> : index + 1}
              </div>
              <span
                className={`hidden text-sm font-medium sm:block ${
                  isActive ? 'text-foreground' : isCompleted ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div className={`mx-3 h-px flex-1 ${index < currentStep ? 'bg-primary' : 'bg-muted'}`} />
            )}
          </div>
        );
      })}
    </div>
  );

  // ── Quick flow ─────────────────────────────────────────────────────────────
  if (broadcastType === 'quick') {
    return (
      <div className="mx-auto max-w-3xl space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Novo Disparo</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Templates Rápidos — API não oficial.
          </p>
        </div>

        <StepIndicator />

        <div className="relative min-h-[400px]">
          <div
            className="transition-all duration-300 ease-in-out"
            style={{ opacity: quickSending ? 0.6 : 1, pointerEvents: quickSending ? 'none' : 'auto' }}
          >
            {currentStep === 0 && (
              <Step1ChooseQuickTemplate
                selectedTemplate={quickTemplate}
                onSelect={setQuickTemplate}
                onNext={() => setCurrentStep(1)}
                onBack={() => { setBroadcastType(null); setCurrentStep(0); }}
              />
            )}
            {currentStep === 1 && (
              <Step2SelectAudience
                audience={audience}
                onUpdate={setAudience}
                onNext={() => setCurrentStep(2)}
                onBack={() => setCurrentStep(0)}
              />
            )}
            {currentStep === 2 && quickTemplate && (
              <QuickSendStep
                name={name}
                onNameChange={setName}
                quickTemplate={quickTemplate}
                audience={audience}
                delaySec={delaySec}
                onDelayChange={setDelaySec}
                onSend={handleQuickSend}
                onBack={() => setCurrentStep(1)}
                isSending={quickSending}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Meta flow ──────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Novo Disparo</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Meta API — templates aprovados.
        </p>
      </div>

      <StepIndicator />

      <div className="relative min-h-[400px]">
        <div
          className="transition-all duration-300 ease-in-out"
          style={{ opacity: isProcessing ? 0.6 : 1, pointerEvents: isProcessing ? 'none' : 'auto' }}
        >
          {currentStep === 0 && (
            <Step1ChooseTemplate
              selectedTemplate={template}
              onSelect={setTemplate}
              onNext={() => setCurrentStep(1)}
              onBack={() => { setBroadcastType(null); setCurrentStep(0); }}
            />
          )}
          {currentStep === 1 && (
            <Step2SelectAudience
              audience={audience}
              onUpdate={setAudience}
              onNext={() => setCurrentStep(2)}
              onBack={() => setCurrentStep(0)}
            />
          )}
          {currentStep === 2 && template && (
            <Step3Personalize
              template={template}
              variables={variables}
              onUpdate={setVariables}
              onNext={() => setCurrentStep(3)}
              onBack={() => setCurrentStep(1)}
            />
          )}
          {currentStep === 3 && template && (
            <Step4ScheduleSend
              name={name}
              onNameChange={setName}
              template={template}
              audience={audience}
              onSend={handleMetaSend}
              onSaveDraft={handleMetaSaveDraft}
              onBack={() => setCurrentStep(2)}
              isProcessing={isProcessing}
              progress={progress}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Quick Send final step ──────────────────────────────────────────────────────

const DELAY_OPTIONS = [
  { label: '5 segundos',  value: 5 },
  { label: '10 segundos', value: 10 },
  { label: '30 segundos', value: 30 },
  { label: '1 minuto',    value: 60 },
  { label: '2 minutos',   value: 120 },
  { label: '5 minutos',   value: 300 },
  { label: '10 minutos',  value: 600 },
];

interface QuickSendStepProps {
  name: string;
  onNameChange: (v: string) => void;
  quickTemplate: QuickTemplate;
  audience: AudienceState;
  delaySec: number;
  onDelayChange: (v: number) => void;
  onSend: () => void;
  onBack: () => void;
  isSending: boolean;
}

function audienceSummary(audience: AudienceState): string {
  if (audience.type === 'all') return 'Todos os contatos';
  if (audience.type === 'tags') return `Por tags (${audience.tagIds?.length ?? 0} selecionadas)`;
  if (audience.type === 'csv') return `CSV (${audience.csvContacts?.length ?? 0} contatos)`;
  if (audience.type === 'custom_field') return 'Campo personalizado';
  return '';
}

function QuickSendStep({ name, onNameChange, quickTemplate, audience, delaySec, onDelayChange, onSend, onBack, isSending }: QuickSendStepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Revisar e enviar</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Confirme os detalhes e dê um nome ao disparo antes de enviar.
        </p>
      </div>

      {/* Name input */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground" htmlFor="broadcast-name">
          Nome do disparo <span className="text-primary">*</span>
        </label>
        <input
          id="broadcast-name"
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="ex: Promoção Julho, Follow-up Leads…"
          className="h-9 w-full rounded-lg border border-border bg-muted/60 px-3 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* Delay selector */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">
          Intervalo entre mensagens
        </label>
        <p className="text-xs text-muted-foreground">
          Tempo de espera entre o envio de cada mensagem. Intervalos maiores reduzem o risco de bloqueio.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          {DELAY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onDelayChange(opt.value)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                delaySec === opt.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Template</span>
          <span className="font-medium text-foreground text-right">
            {quickTemplate.name}
            {quickTemplate.messages && quickTemplate.messages.length > 1 && (
              <span className="ml-2 rounded-full border border-primary/30 bg-primary/5 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                {quickTemplate.messages.length} msgs
              </span>
            )}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Público</span>
          <span className="font-medium text-foreground text-right">{audienceSummary(audience)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Intervalo</span>
          <span className="font-medium text-foreground text-right">
            {DELAY_OPTIONS.find(o => o.value === delaySec)?.label ?? `${delaySec}s`}
          </span>
        </div>
        <div className="border-t border-border pt-3">
          <p className="text-xs text-muted-foreground mb-1">Mensagem (prévia)</p>
          <p className="text-xs text-foreground whitespace-pre-wrap line-clamp-4">{quickTemplate.body}</p>
        </div>
      </div>

      <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-xs text-amber-600 dark:text-amber-400">
        O disparo será enviado imediatamente para todos os contatos do público selecionado. Esta ação não pode ser desfeita.
      </div>

      <div className="flex justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          disabled={isSending}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          Voltar
        </button>
        <button
          type="button"
          onClick={onSend}
          disabled={isSending || !name.trim()}
          className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {isSending ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Enviando…
            </>
          ) : (
            'Enviar disparo'
          )}
        </button>
      </div>
    </div>
  );
}
