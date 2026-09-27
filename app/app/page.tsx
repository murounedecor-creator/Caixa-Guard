'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useOrgData } from '@/hooks/use-org-data';
import { useTransactionData } from '@/hooks/use-transaction-data';
import { useAuth } from '@/lib/auth-context';
import {
  calculateAvailableCash, calculateProjection, generateAlerts,
  findNextRiskDay, getTodayItems, getMonthlySummary,
} from '@/lib/engine';
import { formatCurrency, formatDate, getGreeting, getFirstName } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertSeverity } from '@/lib/types';
import {
  Wallet, TrendingUp, Calculator, Bell, Upload, ArrowRight,
  Info, AlertTriangle, AlertOctagon, CheckCircle2, ChevronDown, ChevronUp,
  Shield, Calendar, TrendingDown, ArrowDownLeft, ArrowUpRight,
} from 'lucide-react';

const severityConfig: Record<AlertSeverity, { icon: typeof Info; label: string; color: string }> = {
  info: { icon: Info, label: 'Informativo', color: 'text-blue-600' },
  attention: { icon: AlertTriangle, label: 'Atenção', color: 'text-amber-600' },
  important: { icon: AlertTriangle, label: 'Importante', color: 'text-orange-600' },
  critical: { icon: AlertOctagon, label: 'Crítico', color: 'text-red-600' },
};

export default function HomePage() {
  const { organization, accounts, riskConfig, reserves, loading: orgLoading } = useOrgData();
  const { transactions, recurringBills, alerts, loading: txLoading } = useTransactionData(organization?.id ?? null);
  const { user } = useAuth();
  const [showCalc, setShowCalc] = useState(false);

  const availableCash = useMemo(() => {
    if (orgLoading || txLoading) return null;
    return calculateAvailableCash(accounts, transactions, recurringBills, reserves, riskConfig);
  }, [accounts, transactions, recurringBills, reserves, riskConfig, orgLoading, txLoading]);

  const projection = useMemo(() => {
    if (orgLoading || txLoading) return null;
    return calculateProjection(accounts, transactions, recurringBills, riskConfig, 30);
  }, [accounts, transactions, recurringBills, riskConfig, orgLoading, txLoading]);

  const generatedAlerts = useMemo(() => {
    if (!availableCash || !projection) return [];
    return generateAlerts(projection, availableCash, riskConfig);
  }, [availableCash, projection, riskConfig]);

  const nextRisk = useMemo(() => {
    if (!projection) return null;
    return findNextRiskDay(projection, riskConfig);
  }, [projection, riskConfig]);

  const todayItems = useMemo(() => {
    if (orgLoading || txLoading) return [];
    return getTodayItems(transactions, recurringBills, reserves);
  }, [transactions, recurringBills, reserves, orgLoading, txLoading]);

  const monthlySummary = useMemo(() => {
    if (orgLoading || txLoading) return null;
    return getMonthlySummary(transactions);
  }, [transactions, orgLoading, txLoading]);

  const activeAlerts = alerts.filter(a => a.status === 'active');
  const allAlerts = [...activeAlerts, ...generatedAlerts];
  const topAlert = allAlerts.sort((a, b) => {
    const order = { critical: 0, important: 1, attention: 2, info: 3 };
    return (order[a.severity as keyof typeof order] ?? 4) - (order[b.severity as keyof typeof order] ?? 4);
  })[0];

  const upcomingBills = recurringBills
    .filter(b => b.is_active)
    .sort((a, b) => a.due_day - b.due_day)
    .slice(0, 4);

  if (orgLoading || txLoading) {
    return <div className="flex items-center justify-center py-20"><p className="text-muted-foreground">Carregando dados...</p></div>;
  }

  const greeting = getGreeting();
  const firstName = getFirstName(user?.user_metadata?.full_name as string);

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold">{greeting}{firstName ? `, ${firstName}` : ''}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {formatDate(new Date())} — Visão geral do caixa
        </p>
      </div>

      {/* Available Cash Hero */}
      <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Wallet className="h-5 w-5 text-primary" />
                <p className="text-sm font-medium text-muted-foreground">Caixa disponível hoje</p>
              </div>
              <p className="text-4xl font-bold tracking-tight">
                {availableCash ? formatCurrency(availableCash.availableCash) : '—'}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant={availableCash && availableCash.confidence === 'high' ? 'default' : 'secondary'}>
                  Confiança: {availableCash?.confidence === 'high' ? 'Alta' : 'Média'}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Atualizado em {availableCash?.lastUpdated ? formatDate(availableCash.lastUpdated) : '—'}
                </span>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowCalc(!showCalc)}>
              {showCalc ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
              Ver cálculo
            </Button>
          </div>

          {showCalc && availableCash && (
            <div className="mt-4 p-4 rounded-lg bg-card border space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Como calculamos</p>
              <div className="space-y-1.5 text-sm font-mono">
                <div className="flex justify-between">
                  <span>Saldo conciliado</span>
                  <span className="font-semibold">{formatCurrency(availableCash.reconciledBalance)}</span>
                </div>
                <div className="flex justify-between text-green-600">
                  <span>+ Entradas confirmadas (7 dias)</span>
                  <span className="font-semibold">{formatCurrency(availableCash.shortTermInflows)}</span>
                </div>
                <div className="flex justify-between text-red-600">
                  <span>− Saídas obrigatórias (7 dias)</span>
                  <span className="font-semibold">{formatCurrency(availableCash.shortTermOutflows)}</span>
                </div>
                <div className="flex justify-between text-red-600">
                  <span>− Reservas obrigatórias</span>
                  <span className="font-semibold">{formatCurrency(availableCash.totalReserves)}</span>
                </div>
                <div className="flex justify-between text-red-600">
                  <span>− Caixa mínimo</span>
                  <span className="font-semibold">{formatCurrency(availableCash.minimumCash)}</span>
                </div>
                <div className="border-t pt-1.5 flex justify-between font-bold">
                  <span>= Saldo disponível real</span>
                  <span className={availableCash.availableCash >= 0 ? 'text-green-600' : 'text-red-600'}>
                    {formatCurrency(availableCash.availableCash)}
                  </span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Este valor não é garantido. Depende das entradas confirmadas e premissas de saídas.
                Sempre verifique a data de atualização.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Próximo Risco */}
      {nextRisk ? (
        <Card className={`border-2 cursor-pointer hover:shadow-md transition-shadow ${
          nextRisk.severity === 'critical' ? 'border-red-300 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20' : 'border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20'
        }`}>
          <Link href="/app/fluxo">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <AlertTriangle className={`h-5 w-5 shrink-0 mt-0.5 ${nextRisk.severity === 'critical' ? 'text-red-600' : 'text-amber-600'}`} />
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground">Próximo risco</p>
                    <p className="text-lg font-bold mt-0.5">
                      Em {nextRisk.daysAway} {nextRisk.daysAway === 1 ? 'dia' : 'dias'}: saldo pode cair para {formatCurrency(nextRisk.projectedBalance)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{formatDate(nextRisk.date)}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/app/fluxo">Entender</Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/app/simulador">Ver alternativas</Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Link>
        </Card>
      ) : (
        <Card className="border-2 border-green-300 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm font-semibold text-green-700 dark:text-green-400">Caixa saudável</p>
                <p className="text-sm text-muted-foreground">Nenhum risco projetado nos próximos 30 dias no cenário base.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top Alert (if different from nextRisk) */}
      {topAlert && (!nextRisk || topAlert.severity !== nextRisk.severity) && (
        <Link href="/app/decisoes">
          <Card className={`severity-${topAlert.severity} border-2 cursor-pointer hover:shadow-md transition-shadow`}>
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                {(() => {
                  const Icon = severityConfig[topAlert.severity as AlertSeverity].icon;
                  return <Icon className="h-5 w-5 shrink-0 mt-0.5" />;
                })()}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-sm">
                      {severityConfig[topAlert.severity as AlertSeverity].label}
                    </p>
                    <ArrowRight className="h-3 w-3" />
                  </div>
                  <p className="text-sm">{topAlert.cause}</p>
                  {topAlert.recommendation && (
                    <p className="text-xs mt-1 opacity-80">{topAlert.recommendation}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      )}

      {/* Hoje */}
      {todayItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hoje</CardTitle>
            <CardDescription>Movimentações previstas para hoje</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {todayItems.map((item, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {item.type === 'inflow' && <ArrowDownLeft className="h-4 w-4 text-green-600" />}
                    {item.type === 'outflow' && <ArrowUpRight className="h-4 w-4 text-red-600" />}
                    {item.type === 'reserve' && <Shield className="h-4 w-4 text-amber-600" />}
                    <span className="text-sm">{item.description}</span>
                  </div>
                  <span className={`text-sm font-semibold ${
                    item.type === 'inflow' ? 'text-green-600' :
                    item.type === 'outflow' ? 'text-red-600' : 'text-amber-600'
                  }`}>
                    {item.type === 'inflow' ? '+' : item.type === 'outflow' ? '−' : ''}
                    {formatCurrency(item.amount)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Link href="/app/simulador">
          <Card className="hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer">
            <CardContent className="pt-5 pb-5 flex flex-col items-center gap-2 text-center">
              <Calculator className="h-6 w-6 text-primary" />
              <p className="text-sm font-medium">Posso pagar?</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/app/importar">
          <Card className="hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer">
            <CardContent className="pt-5 pb-5 flex flex-col items-center gap-2 text-center">
              <Upload className="h-6 w-6 text-primary" />
              <p className="text-sm font-medium">Importar extrato</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/app/fluxo">
          <Card className="hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer">
            <CardContent className="pt-5 pb-5 flex flex-col items-center gap-2 text-center">
              <TrendingUp className="h-6 w-6 text-primary" />
              <p className="text-sm font-medium">Ver fluxo</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/app/decisoes">
          <Card className="hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer">
            <CardContent className="pt-5 pb-5 flex flex-col items-center gap-2 text-center">
              <Bell className="h-6 w-6 text-primary" />
              <p className="text-sm font-medium">
                {allAlerts.length > 0 ? `${allAlerts.length} alerta${allAlerts.length > 1 ? 's' : ''}` : 'Sem alertas'}
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Resumo do mês */}
      {monthlySummary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resumo do mês</CardTitle>
            <CardDescription>Movimentações deste mês até hoje</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  <p className="text-xs text-muted-foreground">Entradas</p>
                </div>
                <p className="text-lg font-bold text-green-600">{formatCurrency(monthlySummary.totalInflow)}</p>
              </div>
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <TrendingDown className="h-4 w-4 text-red-600" />
                  <p className="text-xs text-muted-foreground">Saídas</p>
                </div>
                <p className="text-lg font-bold text-red-600">{formatCurrency(monthlySummary.totalOutflow)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Resultado</p>
                <p className={`text-lg font-bold ${monthlySummary.result >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(monthlySummary.result)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Projection summary + Upcoming bills */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Projeção 30 dias</CardTitle>
            <CardDescription>Cenário base — saldo projetado</CardDescription>
          </CardHeader>
          <CardContent>
            {projection && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Conservador</p>
                    <p className={`text-sm font-bold ${projection.summary.conservative.endBalance < 0 ? 'text-red-600' : 'text-foreground'}`}>
                      {formatCurrency(projection.summary.conservative.endBalance)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Base</p>
                    <p className={`text-sm font-bold ${projection.summary.base.endBalance < 0 ? 'text-red-600' : 'text-primary'}`}>
                      {formatCurrency(projection.summary.base.endBalance)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Otimista</p>
                    <p className="text-sm font-bold text-green-600">
                      {formatCurrency(projection.summary.optimistic.endBalance)}
                    </p>
                  </div>
                </div>
                {projection.summary.base.minBalance < (riskConfig?.minimum_cash_threshold ?? 1000) && (
                  <div className="flex items-center gap-2 p-2 rounded-md bg-amber-50 dark:bg-amber-950/30">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Menor saldo projetado: {formatCurrency(projection.summary.base.minBalance)} em {projection.summary.base.minDate ? formatDate(projection.summary.base.minDate) : '—'}
                    </p>
                  </div>
                )}
                <Link href="/app/fluxo">
                  <Button variant="ghost" size="sm" className="w-full">
                    Ver detalhes <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Próximas contas fixas</CardTitle>
            <CardDescription>Contas recorrentes a vencer</CardDescription>
          </CardHeader>
          <CardContent>
            {upcomingBills.length > 0 ? (
              <div className="space-y-2">
                {upcomingBills.map((bill) => (
                  <div key={bill.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{bill.description}</p>
                        <p className="text-xs text-muted-foreground">Dia {bill.due_day}</p>
                      </div>
                    </div>
                    <p className={`text-sm font-semibold ${bill.type === 'receivable' ? 'text-green-600' : 'text-foreground'}`}>
                      {bill.type === 'receivable' ? '+' : '−'}{formatCurrency(bill.amount)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma conta fixa cadastrada.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Reserves summary */}
      {reserves.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Reservas</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {reserves.map((r) => (
                <div key={r.id} className="p-3 rounded-lg border">
                  <p className="text-xs text-muted-foreground capitalize mb-1">{r.type}</p>
                  <p className="text-sm font-bold">{formatCurrency(r.current_amount)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Meta: {formatCurrency(r.target_amount)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
