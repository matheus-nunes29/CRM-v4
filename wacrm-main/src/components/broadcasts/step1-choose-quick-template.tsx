'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Loader2, MessageSquare, ArrowRight, Image, Video, Mic } from 'lucide-react';
import type { QuickTemplate } from '@/types';

const MEDIA_BADGE: Record<string, { label: string; icon: React.ReactNode }> = {
  image: { label: 'Imagem', icon: <Image className="h-3 w-3" /> },
  video: { label: 'Vídeo',  icon: <Video className="h-3 w-3" /> },
  audio: { label: 'Áudio',  icon: <Mic   className="h-3 w-3" /> },
};

function msgCount(t: QuickTemplate) {
  if (t.messages && t.messages.length > 1) return t.messages.length;
  return 1;
}

interface Step1QuickProps {
  selectedTemplate: QuickTemplate | null;
  onSelect: (t: QuickTemplate) => void;
  onNext: () => void;
  onBack: () => void;
}

export function Step1ChooseQuickTemplate({ selectedTemplate, onSelect, onNext, onBack }: Step1QuickProps) {
  const [templates, setTemplates] = useState<QuickTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('quick_templates')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error: err }) => {
        if (err) setError(err.message);
        else setTemplates((data as QuickTemplate[]) ?? []);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        Falha ao carregar templates: {error}
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border">
        <MessageSquare className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm font-medium text-foreground">Nenhum template rápido criado</p>
        <p className="text-xs text-muted-foreground text-center max-w-xs">
          Crie templates rápidos em{' '}
          <a href="/settings?tab=quick-templates" className="text-primary underline underline-offset-2">
            Configurações → Templates Rápidos
          </a>{' '}
          antes de enviar um disparo.
        </p>
        <Button variant="outline" size="sm" onClick={onBack} className="mt-1">
          Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Escolha um template rápido</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Selecione o modelo de mensagem a ser enviado. Variáveis como {'{{nome}}'} são substituídas automaticamente por contato.
        </p>
      </div>

      <div className="space-y-3">
        {templates.map((t) => {
          const isSelected = selectedTemplate?.id === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelect(t)}
              className={`w-full rounded-xl border p-4 text-left transition-all ${
                isSelected
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                  : 'border-border bg-card hover:border-primary/40 hover:bg-muted/40'
              }`}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-foreground">{t.name}</p>
                {msgCount(t) > 1 && (
                  <span className="rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[10px] font-medium text-primary">
                    {msgCount(t)} mensagens
                  </span>
                )}
                {t.media_type && MEDIA_BADGE[t.media_type] && (
                  <span className="flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {MEDIA_BADGE[t.media_type].icon}
                    {MEDIA_BADGE[t.media_type].label}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">{t.body}</p>
            </button>
          );
        })}
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack}>
          Voltar
        </Button>
        <Button onClick={onNext} disabled={!selectedTemplate}>
          Próximo
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
