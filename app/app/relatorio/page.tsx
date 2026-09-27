'use client';

import { useMemo } from 'react';
import { useOrgData } from '@/hooks/use-org-data';
import { useTransactionData } from '@/hooks/use-transaction-data';
import { calculateAvailableCash, calculateProjection } from '@/lib/engine';
import { formatCurrency, formatDate } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Download, TrendingUp, TrendingDown, Wallet, AlertTriangle, Printer } from 'lucide-react';

export default function RelatorioPage() {
  const { organization, accounts, riskConfig, reserves, loading: orgLoading } = useOrgData();
  const { transactions, recurringBills, loading: txLoading } = useTransactionData(organization?.id ?? null);

  const availableCash = useMemo(() => {
    if (orgLoading || txLoading) return null;
    return calculateAvailableCash(accounts, transactions, recurringBills, reserves, riskConfig);
  }, [accounts, transactions, recurringBills, reserves, riskConfig, orgLoading, txLoading]);

  const projection = useMemo(() => {
    if (orgLoading || txLoading) return null;
    return calculateProjection(accounts, transactions, recurringBills, riskConfig, 30);
  }, [accounts, transactions, recurringBills, riskConfig, orgLoading, txLoading]);

  const last7Days = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    return transactions.filter((t) => !t.is_archived && new Date(t.occurred_at) >= cutoff);
  }, [transactions]);

  const totalInflow = last7Days.filter((t) => t.direction === 'inflow').reduce((s, t) => s + t.amount, 0);
  const totalOutflow = last7Days.filter((t) => t.direction === 'outflow').reduce((s, t) => s + t.amount, 0);
  const result = totalInflow - totalOutflow;

  const exportCSV = () => {
    const headers = ['Data', 'Descricao', 'Tipo', 'Valor', 'Categoria', 'Confirmado'];
    const rows = transactions.map((t) => [
      t.occurred_at,
      t.description_raw.replace(/,/g, ';'),
      t.direction,
      t.amount.toString().replace('.', ','),
      '',
      t.is_confirmed ? 'Sim' : 'Nao',
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `caixaguard_relatorio_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (orgLoading || txLoading) {
    return <div className="flex items-center justify-center py-20"><p className="text-muted-foreground">Carregando relatório...</p></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Relatório Semanal</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Resumo de {organization?.name} — {formatDate(new Date())}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-1" />
            Exportar CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-1" />
            Exportar PDF
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="h-5 w-5 text-primary" />
              <p className="text-sm text-muted-foreground">Caixa disponível</p>
            </div>
            <p className="text-2xl font-bold">{availableCash ? formatCurrency(availableCash.availableCash) : '—'}</p>
            <p className="text-xs text-muted-foreground mt-1">Atualizado em {availableCash?.lastUpdated ? formatDate(availableCash.lastUpdated) : '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              <p className="text-sm text-muted-foreground">Entradas (7 dias)</p>
            </div>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(totalInflow)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="h-5 w-5 text-red-600" />
              <p className="text-sm text-muted-foreground">Saídas (7 dias)</p>
            </div>
            <p className="text-2xl font-bold text-red-600">{formatCurrency(totalOutflow)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Result */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Resultado operacional (7 dias)</p>
              <p className={`text-2xl font-bold ${result >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(result)}
              </p>
            </div>
            <Badge variant={result >= 0 ? 'default' : 'destructive'}>
              {result >= 0 ? 'Positivo' : 'Negativo'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Projection summary */}
      {projection && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Projeção 30 dias</CardTitle>
            <CardDescription>Cenário base</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Conservador</p>
                <p className={`text-sm font-bold ${projection.summary.conservative.endBalance < 0 ? 'text-red-600' : ''}`}>
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
                  Menor saldo projetado: {formatCurrency(projection.summary.base.minBalance)} em{' '}
                  {projection.summary.base.minDate ? formatDate(projection.summary.base.minDate) : '—'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recent transactions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transações recentes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {transactions.slice(0, 15).map((t) => (
              <div key={t.id} className="flex items-center justify-between border-b pb-2">
                <div>
                  <p className="text-sm font-medium">{t.description_raw}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(t.occurred_at)}</p>
                </div>
                <p className={`text-sm font-semibold ${t.direction === 'inflow' ? 'text-green-600' : 'text-red-600'}`}>
                  {t.direction === 'inflow' ? '+' : '−'}{formatCurrency(t.amount)}
                </p>
              </div>
            ))}
            {transactions.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma transação registrada.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Footer note */}
      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <FileText className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Aviso</p>
              <p className="mt-1">Este relatório é baseado nos dados disponíveis até a última atualização. Os valores projetados são estimativas e não constituem garantia. Sempre confirme os lançamentos principais antes de tomar decisões financeiras.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
