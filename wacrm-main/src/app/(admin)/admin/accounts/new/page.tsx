"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Copy, Check } from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BUSINESS_TYPES, AVAILABLE_FEATURES } from "@/lib/auth/platform-accounts";

interface ProvisionResult {
  account: { id: string; name: string };
  email: string;
  password: string;
}

export default function NewAdminAccountPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [businessType, setBusinessType] = useState<string>(BUSINESS_TYPES[2].value);
  const [maxSeats, setMaxSeats] = useState("");
  const [enabledFeatures, setEnabledFeatures] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ProvisionResult | null>(null);
  const [copied, setCopied] = useState(false);

  function toggleFeature(key: string, checked: boolean) {
    setEnabledFeatures((prev) =>
      checked ? [...prev, key] : prev.filter((k) => k !== key),
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !accountName.trim()) {
      toast.error("E-mail e nome da conta são obrigatórios");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          fullName: fullName.trim() || undefined,
          accountName: accountName.trim(),
          businessType,
          maxSeats: maxSeats.trim() === "" ? null : Number(maxSeats),
          enabledFeatures,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload.error || "Falha ao criar conta");
        return;
      }
      setResult(payload as ProvisionResult);
    } catch {
      toast.error("Falha de rede ao criar conta");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyPassword() {
    if (!result) return;
    await navigator.clipboard.writeText(result.password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (result) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle>Conta criada</CardTitle>
          <CardDescription>
            A senha é a padrão de todos os clientes novos — não é secreta por
            conta. Avise o cliente pra trocar assim que entrar pela primeira vez.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Conta</Label>
            <p className="text-sm">{result.account.name}</p>
          </div>
          <div>
            <Label>E-mail de login</Label>
            <p className="text-sm">{result.email}</p>
          </div>
          <div>
            <Label>Senha padrão</Label>
            <div className="mt-1 flex items-center gap-2">
              <code className="flex-1 rounded border bg-muted px-3 py-2 font-mono text-sm">
                {result.password}
              </code>
              <Button type="button" variant="outline" size="icon" onClick={copyPassword}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Link href="/admin" className={buttonVariants({})}>
              Voltar para a lista
            </Link>
            <Button
              variant="outline"
              onClick={() => router.push(`/admin/accounts/${result.account.id}`)}
            >
              Ver conta
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle>Criar conta de cliente</CardTitle>
        <CardDescription>
          Cria o primeiro acesso (owner) e a conta já com os módulos e o
          limite de usuários escolhidos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="accountName">Nome da conta</Label>
            <Input
              id="accountName"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="Clínica Exemplo"
              required
            />
          </div>

          <div>
            <Label htmlFor="email">E-mail do owner</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="dona@clinica.com"
              required
            />
          </div>

          <div>
            <Label htmlFor="fullName">Nome do owner (opcional)</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nome completo"
            />
          </div>

          <div>
            <Label htmlFor="businessType">Tipo de negócio</Label>
            <Select value={businessType} onValueChange={(v) => v && setBusinessType(v)}>
              <SelectTrigger id="businessType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUSINESS_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="maxSeats">Limite de usuários (vazio = ilimitado)</Label>
            <Input
              id="maxSeats"
              type="number"
              min={1}
              value={maxSeats}
              onChange={(e) => setMaxSeats(e.target.value)}
              placeholder="Ex: 3"
            />
          </div>

          <div>
            <Label>Módulos habilitados</Label>
            <div className="mt-2 space-y-2">
              {AVAILABLE_FEATURES.map((feature) => (
                <div key={feature.key} className="flex items-center gap-2">
                  <Checkbox
                    id={`feature-${feature.key}`}
                    checked={enabledFeatures.includes(feature.key)}
                    onCheckedChange={(checked) =>
                      toggleFeature(feature.key, checked === true)
                    }
                  />
                  <Label htmlFor={`feature-${feature.key}`} className="font-normal">
                    {feature.label}
                    {!feature.implemented && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        (ainda não implementado)
                      </span>
                    )}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Criando…
                </>
              ) : (
                "Criar conta"
              )}
            </Button>
            <Link href="/admin" className={buttonVariants({ variant: "outline" })}>
              Cancelar
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
