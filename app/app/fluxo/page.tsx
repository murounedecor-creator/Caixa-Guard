'use client';

import { useMemo, useState } from 'react';
import { useOrgData } from '@/hooks/use-org-data';
import { useTransactionData } from '@/hooks/use-transaction-data';
import { calculateProjection } from '@/lib/engine';
import { formatCurrency, formatDateShort, formatDate } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts';

const HORIZONS = [
  { days: 7, label: '7 dias' },
  { days: 15, label: '15 dias' },
  { days: 30, label: '30 dias' },
] as const;

export default function FluxoPage() {
  const { organization, accounts, riskConfig, loading: orgLoading } = useOrgData();
  const { transactions, recurringBills, loading: txLoading } = useTransactionData(organization?.id ?? null);
  const [view, setView] = useState<'simple' | 'detailed'>('simple');
  const [horizon, setHorizon] = useState<number>(30);

  const projection = useMemo(() => {
    if (orgLoading || txLoading) return null;
    return calculateProjection(accounts, transactions, recurringBills, riskConfig, horizon);
  }, [accounts, transactions, recurringBills, riskConfig, orgLoading, txLoading, horizon]);

  if (orgLoading || txLoading || !projection) {
    return <div className="flex items-center justify-center py-20"><p className="text-muted-foreground">Carregando projeção...</p></div>;
  }

  const minimumCash = riskConfig?.minimum_cash_threshold ?? 1000;
  const chartData = projection.days.map(d => ({
    date: formatDateShort(d.date),
    conservative: d.conservative,
    base: d.base,
    optimistic: d.optimistic,
  }));

  const riskColor = (balance: number) => {
    if (balance < 0) return 'text-red-600';
    if (balance < minimumCash) return 'text-amber-600';
    return 'text-green-600';
  };

  const statusBadge = (balance: number) => {
    if (balance < 0) return <Badge variant="destructive">Negativo</Badge>;
    if (balance < minimumCash) return <Badge className="bg-amber-500 text-white">Abaixo do mínimo</Badge>;
    return <Badge className="bg-green-500 text-white">Saudável</Badge>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Fluxo de Caixa</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Projeção dos próximos {horizon} dias em 3 cenários
        </p>
      </div>

      {/* Horizon toggle */}
      <div className="flex gap-2">
        {HORIZONS.map((h) => (
          <Button
            key={h.days}
            variant={horizon === h.days ? 'default' : 'outline'}
            size="sm"
            onClick={() => setHorizon(h.days)}
          >
            {h.label}
          </Button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">Conservador</p>
              {statusBadge(projection.summary.conservative.endBalance)}
            </div>
            <p className={`text-2xl font-bold ${riskColor(projection.summary.conservative.endBalance)}`}>
              {formatCurrency(projection.summary.conservative.endBalance)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Menor saldo: {formatCurrency(projection.summary.conservative.minBalance)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-2 border-primary/30">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">Base</p>
              {statusBadge(projection.summary.base.endBalance)}
            </div>
            <p className={`text-2xl font-bold ${riskColor(projection.summary.base.endBalance)}`}>
              {formatCurrency(projection.summary.base.endBalance)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Menor saldo: {formatCurrency(projection.summary.base.minBalance)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">Otimista</p>
              {statusBadge(projection.summary.optimistic.endBalance)}
            </div>
            <p className={`text-2xl font-bold ${riskColor(projection.summary.optimistic.endBalance)}`}>
              {formatCurrency(projection.summary.optimistic.endBalance)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Menor saldo: {formatCurrency(projection.summary.optimistic.minBalance)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={view} onValueChange={(v) => setView(v as 'simple' | 'detailed')}>
        <TabsList>
          <TabsTrigger value="simple">Visão simples</TabsTrigger>
          <TabsTrigger value="detailed">Visão detalhada</TabsTrigger>
        </TabsList>

        {/* Simple view */}
        <TabsContent value="simple" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Saldo projetado — {horizon} dias</CardTitle>
              <CardDescription>
                Linha verde: saudável. Amarelo: abaixo do caixa mínimo. Vermelho: negativo.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" className="text-xs" tick={{ fontSize: 11 }} />
                    <YAxis className="text-xs" tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                      contentStyle={{ borderRadius: '8px', fontSize: '12px' }}
                    />
                    <ReferenceLine y={minimumCash} stroke="#f59e0b" strokeDasharray="5 5" label={{ value: 'Caixa mínimo', fontSize: 10, fill: '#f59e0b' }} />
                    <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="2 2" />
                    <Line type="monotone" dataKey="base" stroke="hsl(199, 89%, 48%)" strokeWidth={2.5} name="Base" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Risk indicator */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                {projection.summary.base.minBalance < 0 ? (
                  <>
                    <div className="h-3 w-3 rounded-full bg-red-500" />
                    <p className="text-sm"><strong>Risco alto:</strong> O cenário base projeta saldo negativo nos próximos {horizon} dias.</p>
                  </>
                ) : projection.summary.base.minBalance < minimumCash ? (
                  <>
                    <div className="h-3 w-3 rounded-full bg-amber-500" />
                    <p className="text-sm"><strong>Atenção:</strong> O caixa pode cair abaixo do mínimo em {projection.summary.base.minDate ? formatDate(projection.summary.base.minDate) : 'data futura'}.</p>
                  </>
                ) : (
                  <>
                    <div className="h-3 w-3 rounded-full bg-green-500" />
                    <p className="text-sm"><strong>Saudável:</strong> O caixa deve permanecer acima do mínimo nos próximos {horizon} dias.</p>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Detailed view */}
        <TabsContent value="detailed" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Projeção detalhada — 3 cenários</CardTitle>
              <CardDescription>
                Conservador (apenas confirmado), Base (70% das entradas médias), Otimista (100% das entradas)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" className="text-xs" tick={{ fontSize: 11 }} />
                    <YAxis className="text-xs" tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                      contentStyle={{ borderRadius: '8px', fontSize: '12px' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <ReferenceLine y={minimumCash} stroke="#f59e0b" strokeDasharray="5 5" label={{ value: 'Caixa mínimo', fontSize: 10, fill: '#f59e0b' }} />
                    <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="2 2" />
                    <Line type="monotone" dataKey="conservative" stroke="#ef4444" strokeWidth={1.5} name="Conservador" dot={false} strokeDasharray="5 5" />
                    <Line type="monotone" dataKey="base" stroke="hsl(199, 89%, 48%)" strokeWidth={2.5} name="Base" dot={false} />
                    <Line type="monotone" dataKey="optimistic" stroke="#22c55e" strokeWidth={1.5} name="Otimista" dot={false} strokeDasharray="2 2" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Daily breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Detalhamento diário</CardTitle>
              <CardDescription>Entradas e saídas previstas por dia</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 font-medium text-muted-foreground">Data</th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">Entradas</th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">Saídas</th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">Conservador</th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">Base</th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">Otimista</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projection.days.filter((_, i) => i % 2 === 0).map((d) => (
                      <tr key={d.date} className="border-b">
                        <td className="py-2">{formatDate(d.date)}</td>
                        <td className="py-2 text-right text-green-600">{d.inflow > 0 ? `+${formatCurrency(d.inflow)}` : '—'}</td>
                        <td className="py-2 text-right text-red-600">{d.outflow > 0 ? `−${formatCurrency(d.outflow)}` : '—'}</td>
                        <td className={`py-2 text-right font-medium ${riskColor(d.conservative)}`}>{formatCurrency(d.conservative)}</td>
                        <td className={`py-2 text-right font-medium ${riskColor(d.base)}`}>{formatCurrency(d.base)}</td>
                        <td className={`py-2 text-right font-medium ${riskColor(d.optimistic)}`}>{formatCurrency(d.optimistic)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Assumptions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Premissas do cálculo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p><strong>Conservador:</strong> Apenas entradas confirmadas + saídas recorrentes. Estima 80% da média de saídas diárias.</p>
              <p><strong>Base:</strong> Entradas confirmadas + 70% da média de entradas diárias. Estima 50% da média de saídas.</p>
              <p><strong>Otimista:</strong> Entradas confirmadas + 100% da média de entradas. Estima 30% da média de saídas.</p>
              <p className="pt-2 text-xs">A média é calculada sobre os últimos 30 dias de transações. Estes são cenários, não certezas.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
