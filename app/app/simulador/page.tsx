'use client';

import { useMemo, useState } from 'react';
import { useOrgData } from '@/hooks/use-org-data';
import { useTransactionData } from '@/hooks/use-transaction-data';
import { calculateAvailableCash, calculateProjection, simulatePayment } from '@/lib/engine';
import { formatCurrency, formatDate } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import {
  Calculator, ShieldCheck, AlertTriangle, Ban,
  TrendingDown, Info, ArrowRight, Lightbulb, Calendar,
} from 'lucide-react';

export default function SimuladorPage() {
  const { organization, accounts, riskConfig, reserves, loading: orgLoading } = useOrgData();
  const { transactions, recurringBills, loading: txLoading } = useTransactionData(organization?.id ?? null);

  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [type, setType] = useState<'single' | 'installment'>('single');
  const [installments, setInstallments] = useState('1');
  const [result, setResult] = useState<ReturnType<typeof simulatePayment> | null>(null);

  const availableCash = useMemo(() => {
    if (orgLoading || txLoading) return null;
    return calculateAvailableCash(accounts, transactions, recurringBills, reserves, riskConfig);
  }, [accounts, transactions, recurringBills, reserves, riskConfig, orgLoading, txLoading]);

  const projection = useMemo(() => {
    if (orgLoading || txLoading) return null;
    return calculateProjection(accounts, transactions, recurringBills, riskConfig, 90);
  }, [accounts, transactions, recurringBills, riskConfig, orgLoading, txLoading]);

  const handleSimulate = () => {
    if (!availableCash || !projection) return;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    const sim = simulatePayment(
      amt,
      new Date(date + 'T00:00:00'),
      type,
      parseInt(installments) || 1,
      availableCash,
      projection,
      riskConfig
    );
    setResult(sim);
  };

  if (orgLoading || txLoading || !availableCash || !projection) {
    return <div className="flex items-center justify-center py-20"><p className="text-muted-foreground">Carregando...</p></div>;
  }

  const decisionConfig = result ? {
    safe: { icon: ShieldCheck, bg: 'bg-green-50 dark:bg-green-950/30', border: 'border-green-200 dark:border-green-800', text: 'text-green-700 dark:text-green-300', label: result.decisionLabel },
    attention: { icon: AlertTriangle, bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-800', text: 'text-amber-700 dark:text-amber-300', label: result.decisionLabel },
    not_recommended: { icon: Ban, bg: 'bg-red-50 dark:bg-red-950/30', border: 'border-red-200 dark:border-red-800', text: 'text-red-700 dark:text-red-300', label: result.decisionLabel },
  }[result.decision] : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Posso pagar?</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Simule um pagamento e veja o impacto no seu caixa
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Form */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Dados do pagamento</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Valor (R$) *</Label>
              <Input
                id="amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Ex: 5000,00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">Data do pagamento *</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de pagamento</Label>
              <RadioGroup value={type} onValueChange={(v) => setType(v as 'single' | 'installment')}>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="single" id="single" />
                  <Label htmlFor="single">À vista</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="installment" id="installment" />
                  <Label htmlFor="installment">Parcelado</Label>
                </div>
              </RadioGroup>
            </div>
            {type === 'installment' && (
              <div className="space-y-2">
                <Label htmlFor="installments">Número de parcelas</Label>
                <Input
                  id="installments"
                  type="number"
                  value={installments}
                  onChange={(e) => setInstallments(e.target.value)}
                  min="2"
                  max="12"
                />
              </div>
            )}
            <Button onClick={handleSimulate} className="w-full" disabled={!amount || parseFloat(amount) <= 0}>
              Simular <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </CardContent>
        </Card>

        {/* Result */}
        <div className="space-y-4">
          {result && decisionConfig ? (
            <>
              {/* Decision */}
              <Card className={`border-2 ${decisionConfig.border} ${decisionConfig.bg}`}>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 mb-4">
                    {(() => {
                      const Icon = decisionConfig.icon;
                      return <Icon className={`h-8 w-8 ${decisionConfig.text}`} />;
                    })()}
                    <div>
                      <p className="text-xs text-muted-foreground">Decisão</p>
                      <p className={`text-xl font-bold ${decisionConfig.text}`}>{decisionConfig.label}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 rounded-lg bg-card border">
                      <span className="text-sm text-muted-foreground">Saldo projetado após pagamento</span>
                      <span className={`text-lg font-bold ${result.projectedBalanceAfter < 0 ? 'text-red-600' : 'text-foreground'}`}>
                        {formatCurrency(result.projectedBalanceAfter)}
                      </span>
                    </div>
                    {result.impactOnReserve > 0 && (
                      <div className="flex justify-between items-center p-3 rounded-lg bg-card border">
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <TrendingDown className="h-4 w-4" /> Impacto na reserva
                        </span>
                        <span className="text-sm font-semibold text-amber-600">
                          −{formatCurrency(result.impactOnReserve)}
                        </span>
                      </div>
                    )}
                    {result.daysUntilNegative !== null && (
                      <div className="flex justify-between items-center p-3 rounded-lg bg-card border">
                        <span className="text-sm text-muted-foreground">Dias até saldo negativo</span>
                        <span className="text-sm font-semibold text-red-600">{result.daysUntilNegative} dias</span>
                      </div>
                    )}
                    <Badge variant="outline">
                      Confiança: {result.confidence === 'high' ? 'Alta' : 'Média'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Multi-horizon impact */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" /> Impacto por horizonte
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-5 gap-2 text-center">
                    {result.horizonImpacts.map((h) => (
                      <div key={h.horizon} className={`p-2 rounded-lg border ${h.belowMinimum ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/20' : 'border-border'}`}>
                        <p className="text-xs text-muted-foreground mb-1">{h.horizon}d</p>
                        <p className={`text-xs font-bold ${h.belowMinimum ? 'text-amber-700 dark:text-amber-400' : 'text-foreground'}`}>
                          {formatCurrency(h.projectedBalance)}
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Saldo projetado após o pagamento em 7, 15, 30, 60 e 90 dias.</p>
                </CardContent>
              </Card>

              {/* Assumptions */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Info className="h-4 w-4 text-muted-foreground" /> Premissas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1.5">
                    {result.assumptions.map((a, i) => (
                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="text-muted-foreground">•</span> {a}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {/* Alternatives */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-primary" /> Alternativas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {result.alternatives.map((alt, i) => (
                      <li key={i} className="text-sm flex items-start gap-2 p-2 rounded-md bg-secondary/50">
                        <span className="text-primary font-semibold">{i + 1}.</span> {alt}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="border-dashed">
              <CardContent className="pt-6 flex flex-col items-center gap-3 text-center py-12">
                <Calculator className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Preencha os dados e clique em simular para ver a decisão.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Current available cash reference */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Caixa disponível atual</p>
              <p className="text-2xl font-bold">{formatCurrency(availableCash.availableCash)}</p>
            </div>
            <p className="text-xs text-muted-foreground text-right">
              Atualizado em {formatDate(availableCash.lastUpdated)}<br />
              Confiança: {availableCash.confidence === 'high' ? 'Alta' : 'Média'}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
