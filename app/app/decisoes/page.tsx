'use client';

import { useMemo, useState } from 'react';
import { useOrgData } from '@/hooks/use-org-data';
import { useTransactionData } from '@/hooks/use-transaction-data';
import { calculateAvailableCash, calculateProjection, generateAlerts } from '@/lib/engine';
import { formatCurrency, formatDate } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';
import type { AlertSeverity } from '@/lib/types';
import type { GeneratedAlert } from '@/lib/engine';
import {
  Info, AlertTriangle, AlertOctagon, CheckCircle2,
  Lightbulb, Ban, FileWarning, ListChecks, Brain,
} from 'lucide-react';

const severityConfig: Record<AlertSeverity, { icon: typeof Info; label: string; bg: string; border: string; text: string }> = {
  info: { icon: Info, label: 'Informativo', bg: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-200 dark:border-blue-800', text: 'text-blue-700 dark:text-blue-300' },
  attention: { icon: AlertTriangle, label: 'Atenção', bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-800', text: 'text-amber-700 dark:text-amber-300' },
  important: { icon: AlertTriangle, label: 'Importante', bg: 'bg-orange-50 dark:bg-orange-950/30', border: 'border-orange-200 dark:border-orange-800', text: 'text-orange-700 dark:text-orange-300' },
  critical: { icon: AlertOctagon, label: 'Crítico', bg: 'bg-red-50 dark:bg-red-950/30', border: 'border-red-200 dark:border-red-800', text: 'text-red-700 dark:text-red-300' },
};

interface UnifiedAlert {
  id: string;
  severity: AlertSeverity;
  cause: string;
  projected_balance: number | null;
  projected_date: string | null;
  recommendation: string | null;
  status: string;
  fromDb: boolean;
  possibleActions?: string[];
  systemRecommendation?: string;
  reasoning?: string;
  confidence?: 'high' | 'medium' | 'low';
}

export default function DecisoesPage() {
  const { organization, accounts, riskConfig, reserves, loading: orgLoading } = useOrgData();
  const { transactions, recurringBills, alerts, loading: txLoading, refresh } = useTransactionData(organization?.id ?? null);
  const { user } = useAuth();
  const [filter, setFilter] = useState<'all' | AlertSeverity>('all');

  const availableCash = useMemo(() => {
    if (orgLoading || txLoading) return null;
    return calculateAvailableCash(accounts, transactions, recurringBills, reserves, riskConfig);
  }, [accounts, transactions, recurringBills, reserves, riskConfig, orgLoading, txLoading]);

  const projection = useMemo(() => {
    if (orgLoading || txLoading) return null;
    return calculateProjection(accounts, transactions, recurringBills, riskConfig, 30);
  }, [accounts, transactions, recurringBills, riskConfig, orgLoading, txLoading]);

  const generatedAlerts = useMemo(() => {
    if (!availableCash || !projection) return [] as GeneratedAlert[];
    return generateAlerts(projection, availableCash, riskConfig);
  }, [availableCash, projection, riskConfig]);

  const allAlerts: UnifiedAlert[] = [
    ...alerts.filter(a => a.status === 'active').map(a => ({
      id: a.id,
      severity: a.severity,
      cause: a.cause,
      projected_balance: a.projected_balance,
      projected_date: a.projected_date,
      recommendation: a.recommendation,
      status: a.status,
      fromDb: true,
    })),
    ...generatedAlerts.map((g, i) => ({
      id: `gen-${i}`,
      severity: g.severity,
      cause: g.cause,
      projected_balance: g.projected_balance,
      projected_date: g.projected_date,
      recommendation: g.recommendation,
      status: 'active',
      fromDb: false,
      possibleActions: g.possibleActions,
      systemRecommendation: g.systemRecommendation,
      reasoning: g.reasoning,
      confidence: g.confidence,
    })),
  ];

  const filtered = filter === 'all' ? allAlerts : allAlerts.filter(a => a.severity === filter);
  const sorted = filtered.sort((a, b) => {
    const order = { critical: 0, important: 1, attention: 2, info: 3 };
    return (order[a.severity] ?? 4) - (order[b.severity] ?? 4);
  });

  const resolveAlert = async (alertId: string) => {
    const { error } = await supabase
      .from('alerts')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', alertId);
    if (error) {
      toast.error('Erro ao resolver alerta');
    } else {
      toast.success('Alerta resolvido');
      refresh();
    }
  };

  if (orgLoading || txLoading) {
    return <div className="flex items-center justify-center py-20"><p className="text-muted-foreground">Carregando alertas...</p></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Central de Decisões</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Alertas de caixa com causa, impacto e ações recomendadas
        </p>
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        <Button
          variant={filter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('all')}
        >
          Todos ({allAlerts.length})
        </Button>
        {(['critical', 'important', 'attention', 'info'] as AlertSeverity[]).map(s => {
          const count = allAlerts.filter(a => a.severity === s).length;
          if (count === 0) return null;
          return (
            <Button
              key={s}
              variant={filter === s ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(s)}
            >
              {severityConfig[s].label} ({count})
            </Button>
          );
        })}
      </div>

      {/* Alert cards */}
      {sorted.length === 0 ? (
        <Card>
          <CardContent className="pt-6 flex flex-col items-center gap-3 text-center">
            <CheckCircle2 className="h-10 w-10 text-green-500" />
            <p className="font-medium">Tudo sob controle</p>
            <p className="text-sm text-muted-foreground">Nenhum alerta ativo no momento.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sorted.map((alert) => {
            const config = severityConfig[alert.severity];
            const Icon = config.icon;
            return (
              <Card key={alert.id} className={`border-2 ${config.border} ${config.bg}`}>
                <CardContent className="pt-6">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-5 w-5 ${config.text}`} />
                      <Badge variant="outline" className={config.text}>
                        {config.label}
                      </Badge>
                      {alert.projected_date && (
                        <span className="text-xs text-muted-foreground">
                          {formatDate(alert.projected_date)}
                        </span>
                      )}
                    </div>
                    {alert.fromDb && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => resolveAlert(alert.id)}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        Resolver
                      </Button>
                    )}
                  </div>

                  {/* Standardized decision card */}
                  <div className="space-y-3">
                    {/* Situação */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Situação</p>
                      <p className="text-sm">{alert.cause}</p>
                    </div>

                    {/* Impacto */}
                    {alert.projected_balance !== null && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Impacto no saldo</p>
                        <p className={`text-sm font-semibold ${alert.projected_balance < 0 ? 'text-red-600' : 'text-foreground'}`}>
                          {formatCurrency(alert.projected_balance)}
                        </p>
                      </div>
                    )}

                    {/* Ações possíveis */}
                    {alert.possibleActions && alert.possibleActions.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
                          <ListChecks className="h-3 w-3" /> Ações possíveis
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {alert.possibleActions.map((action, i) => (
                            <span key={i} className="text-xs px-2 py-1 rounded-md bg-secondary border">
                              {action}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Recomendação do sistema */}
                    {alert.systemRecommendation && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
                          <Brain className="h-3 w-3" /> Recomendação do sistema
                        </p>
                        <p className="text-sm font-medium">{alert.systemRecommendation}</p>
                      </div>
                    )}

                    {/* Por quê */}
                    {alert.reasoning && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Por quê</p>
                        <p className="text-sm text-muted-foreground">{alert.reasoning}</p>
                      </div>
                    )}

                    {/* Recomendação genérica (DB alerts) */}
                    {alert.recommendation && !alert.systemRecommendation && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
                          <Lightbulb className="h-3 w-3" /> Recomendação
                        </p>
                        <p className="text-sm">{alert.recommendation}</p>
                      </div>
                    )}

                    {/* Confiança */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Confiança</p>
                      <p className="text-sm text-muted-foreground">
                        {alert.confidence === 'high' ? 'Alta — baseado em dados confirmados e saídas recorrentes' :
                          alert.confidence === 'medium' ? 'Média — baseado em projeções de cenário base' :
                          'Alta — baseado em dados confirmados e saídas recorrentes'}
                      </p>
                    </div>

                    {/* Limitações */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
                        <FileWarning className="h-3 w-3" /> Limitações
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Esta análise não considera entradas não confirmadas. A precisão depende da atualização dos dados.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
