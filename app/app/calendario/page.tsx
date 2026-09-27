'use client';

import { useMemo } from 'react';
import { useOrgData } from '@/hooks/use-org-data';
import { useTransactionData } from '@/hooks/use-transaction-data';
import { getCalendarItems } from '@/lib/engine';
import { formatCurrency, formatDate } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, ArrowDownLeft, ArrowUpRight, Repeat } from 'lucide-react';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export default function CalendarioPage() {
  const { organization, loading: orgLoading } = useOrgData();
  const { transactions, recurringBills, loading: txLoading } = useTransactionData(organization?.id ?? null);

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const monthName = MONTH_NAMES[month];

  const calendarItems = useMemo(() => {
    if (orgLoading || txLoading) return [];
    return getCalendarItems(recurringBills, transactions, today);
  }, [recurringBills, transactions, orgLoading, txLoading]);

  // Build calendar grid
  const firstDay = new Date(year, month, 1).getDay();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const grid: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) grid.push(null);
  for (let d = 1; d <= lastDay; d++) grid.push(d);
  while (grid.length % 7 !== 0) grid.push(null);

  const itemsByDay: Record<number, typeof calendarItems> = {};
  for (const item of calendarItems) {
    if (!itemsByDay[item.day]) itemsByDay[item.day] = [];
    itemsByDay[item.day].push(item);
  }

  const todayDay = today.getDate();

  if (orgLoading || txLoading) {
    return <div className="flex items-center justify-center py-20"><p className="text-muted-foreground">Carregando calendário...</p></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Calendário Financeiro</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {monthName} {year} — contas a pagar e receber
        </p>
      </div>

      {/* Calendar grid */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-7 gap-1 mb-2">
            {WEEKDAYS.map((d) => (
              <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {grid.map((day, i) => {
              if (day === null) return <div key={i} className="min-h-20 rounded-lg bg-muted/30" />;
              const items = itemsByDay[day] ?? [];
              const isToday = day === todayDay;
              return (
                <div
                  key={i}
                  className={`min-h-20 rounded-lg border p-1.5 ${
                    isToday ? 'border-primary border-2 bg-primary/5' : 'border-border'
                  }`}
                >
                  <p className={`text-xs font-medium mb-1 ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                    {day}
                  </p>
                  <div className="space-y-0.5">
                    {items.slice(0, 3).map((item, j) => (
                      <div
                        key={j}
                        className={`text-xs px-1 py-0.5 rounded truncate ${
                          item.type === 'receivable'
                            ? 'bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400'
                            : 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400'
                        }`}
                        title={`${item.description} — ${formatCurrency(item.amount)}`}
                      >
                        {item.type === 'receivable' ? '+' : '−'}{formatCurrency(item.amount)}
                      </div>
                    ))}
                    {items.length > 3 && (
                      <p className="text-xs text-muted-foreground">+{items.length - 3} mais</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* List view */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detalhamento do mês</CardTitle>
          <CardDescription>Todas as contas e recebimentos previstos</CardDescription>
        </CardHeader>
        <CardContent>
          {calendarItems.length > 0 ? (
            <div className="space-y-2">
              {calendarItems.map((item, i) => (
                <div key={i} className="flex items-center justify-between border-b pb-2">
                  <div className="flex items-center gap-2">
                    {item.type === 'receivable' ? (
                      <ArrowDownLeft className="h-4 w-4 text-green-600" />
                    ) : (
                      <ArrowUpRight className="h-4 w-4 text-red-600" />
                    )}
                    <div>
                      <p className="text-sm font-medium">{item.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(item.date)}
                        {item.isRecurring && (
                          <span className="ml-2 inline-flex items-center gap-0.5">
                            <Repeat className="h-3 w-3" /> Recorrente
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.isRecurring && <Badge variant="outline" className="text-xs">Recorrente</Badge>}
                    <p className={`text-sm font-semibold ${item.type === 'receivable' ? 'text-green-600' : 'text-red-600'}`}>
                      {item.type === 'receivable' ? '+' : '−'}{formatCurrency(item.amount)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma conta ou recebimento previsto para este mês.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
