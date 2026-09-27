import type {
  Transaction,
  RecurringBill,
  Reserve,
  RiskConfig,
  FinancialAccount,
} from '@/lib/types';
import { addDays, toDateStr, daysBetween } from '@/lib/format';

// ============================================================
// Saldo Disponível Real
// ============================================================

export interface AvailableCashResult {
  reconciledBalance: number;
  shortTermInflows: number;
  shortTermOutflows: number;
  totalReserves: number;
  minimumCash: number;
  availableCash: number;
  formula: string;
  lastUpdated: string;
  confidence: 'high' | 'medium' | 'low';
}

export function calculateAvailableCash(
  accounts: FinancialAccount[],
  transactions: Transaction[],
  recurringBills: RecurringBill[],
  reserves: Reserve[],
  riskConfig: RiskConfig | null,
  today: Date = new Date()
): AvailableCashResult {
  const reconciledBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);

  const horizonEnd = addDays(today, 7);

  const shortTermInflows = transactions
    .filter(
      (t) =>
        t.direction === 'inflow' &&
        t.is_confirmed &&
        !t.is_archived &&
        new Date(t.occurred_at) >= today &&
        new Date(t.occurred_at) <= horizonEnd
    )
    .reduce((sum, t) => sum + t.amount, 0);

  const shortTermOutflows = recurringBills
    .filter((b) => b.type === 'payable' && b.is_active)
    .reduce((sum, b) => {
      const dueThisCycle = nextOccurrence(b.due_day, today, 7);
      return sum + (dueThisCycle ? b.amount : 0);
    }, 0);

  const totalReserves = reserves.reduce((sum, r) => sum + r.current_amount, 0);

  const minimumCash = riskConfig?.minimum_cash_threshold ?? 1000;

  const availableCash =
    reconciledBalance +
    shortTermInflows -
    shortTermOutflows -
    totalReserves -
    minimumCash;

  const formula =
    `${formatNum(reconciledBalance)} (saldo conciliado) + ` +
    `${formatNum(shortTermInflows)} (entradas confirmadas 7d) - ` +
    `${formatNum(shortTermOutflows)} (saídas obrigatórias 7d) - ` +
    `${formatNum(totalReserves)} (reservas) - ` +
    `${formatNum(minimumCash)} (caixa mínimo)`;

  const confidence =
    shortTermInflows > 0 || shortTermOutflows > 0 ? 'medium' : 'high';

  return {
    reconciledBalance,
    shortTermInflows,
    shortTermOutflows,
    totalReserves,
    minimumCash,
    availableCash,
    formula,
    lastUpdated: toDateStr(today),
    confidence,
  };
}

function nextOccurrence(dueDay: number, today: Date, horizonDays: number): boolean {
  const currentDay = today.getDate();
  if (dueDay >= currentDay && dueDay <= currentDay + horizonDays) return true;
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  if (dueDay > lastDayOfMonth && lastDayOfMonth >= currentDay && lastDayOfMonth <= currentDay + horizonDays) return true;
  return false;
}

function formatNum(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ============================================================
// PROJECTION — 3 scenarios for configurable horizon
// ============================================================

export interface ProjectionDay {
  date: string;
  conservative: number;
  base: number;
  optimistic: number;
  inflow: number;
  outflow: number;
}

export interface ProjectionResult {
  days: ProjectionDay[];
  startingBalance: number;
  summary: {
    conservative: { endBalance: number; minBalance: number; minDate: string | null };
    base: { endBalance: number; minBalance: number; minDate: string | null };
    optimistic: { endBalance: number; minBalance: number; minDate: string | null };
  };
}

export function calculateProjection(
  accounts: FinancialAccount[],
  transactions: Transaction[],
  recurringBills: RecurringBill[],
  riskConfig: RiskConfig | null,
  horizonDays: number = 30,
  today: Date = new Date()
): ProjectionResult {
  const startingBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);

  const thirtyDaysAgo = addDays(today, -30);
  const recentTx = transactions.filter(
    (t) => !t.is_archived && new Date(t.occurred_at) >= thirtyDaysAgo && new Date(t.occurred_at) < today
  );
  const totalInflow = recentTx.filter((t) => t.direction === 'inflow').reduce((s, t) => s + t.amount, 0);
  const totalOutflow = recentTx.filter((t) => t.direction === 'outflow').reduce((s, t) => s + t.amount, 0);
  const avgDailyInflow = totalInflow / 30;
  const avgDailyOutflow = totalOutflow / 30;

  const recurringByDay: Record<number, { inflow: number; outflow: number }> = {};
  for (const bill of recurringBills) {
    if (!bill.is_active) continue;
    if (!recurringByDay[bill.due_day]) recurringByDay[bill.due_day] = { inflow: 0, outflow: 0 };
    if (bill.type === 'receivable') recurringByDay[bill.due_day].inflow += bill.amount;
    else recurringByDay[bill.due_day].outflow += bill.amount;
  }

  const confirmedByDate: Record<string, { inflow: number; outflow: number }> = {};
  for (const t of transactions) {
    if (t.is_archived || !t.is_confirmed) continue;
    const d = new Date(t.occurred_at);
    if (d >= today && d <= addDays(today, horizonDays)) {
      const key = toDateStr(d);
      if (!confirmedByDate[key]) confirmedByDate[key] = { inflow: 0, outflow: 0 };
      if (t.direction === 'inflow') confirmedByDate[key].inflow += t.amount;
      else confirmedByDate[key].outflow += t.amount;
    }
  }

  const days: ProjectionDay[] = [];
  let consBalance = startingBalance;
  let baseBalance = startingBalance;
  let optBalance = startingBalance;

  let consMin = startingBalance;
  let baseMin = startingBalance;
  let optMin = startingBalance;
  let consMinDate: string | null = null;
  let baseMinDate: string | null = null;
  let optMinDate: string | null = null;

  for (let i = 0; i < horizonDays; i++) {
    const date = addDays(today, i);
    const dateStr = toDateStr(date);
    const dayOfMonth = date.getDate();

    const confirmed = confirmedByDate[dateStr] ?? { inflow: 0, outflow: 0 };
    const recurring = recurringByDay[dayOfMonth] ?? { inflow: 0, outflow: 0 };

    const consInflow = confirmed.inflow + recurring.inflow;
    const consOutflow = confirmed.outflow + recurring.outflow + avgDailyOutflow * 0.8;
    consBalance += consInflow - consOutflow;

    const baseInflow = confirmed.inflow + recurring.inflow + avgDailyInflow * 0.7;
    const baseOutflow = confirmed.outflow + recurring.outflow + avgDailyOutflow * 0.5;
    baseBalance += baseInflow - baseOutflow;

    const optInflow = confirmed.inflow + recurring.inflow + avgDailyInflow;
    const optOutflow = confirmed.outflow + recurring.outflow + avgDailyOutflow * 0.3;
    optBalance += optInflow - optOutflow;

    if (consBalance < consMin) { consMin = consBalance; consMinDate = dateStr; }
    if (baseBalance < baseMin) { baseMin = baseBalance; baseMinDate = dateStr; }
    if (optBalance < optMin) { optMin = optBalance; optMinDate = dateStr; }

    days.push({
      date: dateStr,
      conservative: Math.round(consBalance * 100) / 100,
      base: Math.round(baseBalance * 100) / 100,
      optimistic: Math.round(optBalance * 100) / 100,
      inflow: Math.round((confirmed.inflow + recurring.inflow) * 100) / 100,
      outflow: Math.round((confirmed.outflow + recurring.outflow) * 100) / 100,
    });
  }

  return {
    days,
    startingBalance,
    summary: {
      conservative: { endBalance: consBalance, minBalance: consMin, minDate: consMinDate },
      base: { endBalance: baseBalance, minBalance: baseMin, minDate: baseMinDate },
      optimistic: { endBalance: optBalance, minBalance: optMin, minDate: optMinDate },
    },
  };
}

// ============================================================
// "Posso pagar?" simulator
// ============================================================

export type PaymentDecision = 'safe' | 'attention' | 'not_recommended';

export interface HorizonImpact {
  horizon: number;
  projectedBalance: number;
  belowMinimum: boolean;
}

export interface SimulationResult {
  decision: PaymentDecision;
  decisionLabel: string;
  impactOnReserve: number;
  projectedBalanceAfter: number;
  daysUntilNegative: number | null;
  horizonImpacts: HorizonImpact[];
  assumptions: string[];
  alternatives: string[];
  confidence: 'high' | 'medium' | 'low';
}

export function simulatePayment(
  amount: number,
  paymentDate: Date,
  type: 'single' | 'installment',
  installments: number,
  availableCash: AvailableCashResult,
  projection: ProjectionResult,
  riskConfig: RiskConfig | null
): SimulationResult {
  const minimumCash = riskConfig?.minimum_cash_threshold ?? 1000;
  const today = new Date();
  const daysUntilPayment = Math.max(0, daysBetween(today, paymentDate));

  const perInstallment = type === 'installment' ? amount / installments : amount;

  const projIdx = Math.min(daysUntilPayment, projection.days.length - 1);
  const balanceOnPaymentDate = projection.days[projIdx]?.base ?? availableCash.availableCash;

  const balanceAfter = balanceOnPaymentDate - perInstallment;
  const impactOnReserve = Math.max(0, minimumCash - balanceAfter);

  let daysUntilNegative: number | null = null;
  for (let i = projIdx + 1; i < projection.days.length; i++) {
    if (projection.days[i].base < 0) {
      daysUntilNegative = i - projIdx;
      break;
    }
  }
  if (balanceAfter < 0) daysUntilNegative = 0;

  // Multi-horizon impact: 7, 15, 30, 60, 90 days after payment
  const horizonImpacts: HorizonImpact[] = [7, 15, 30, 60, 90].map((h) => {
    const idx = Math.min(projIdx + h, projection.days.length - 1);
    const projected = projection.days[idx]?.base ?? balanceAfter;
    return {
      horizon: h,
      projectedBalance: Math.round(projected * 100) / 100,
      belowMinimum: projected < minimumCash,
    };
  });

  const assumptions: string[] = [
    `Saldo projetado no pagamento: R$ ${balanceOnPaymentDate.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    `Caixa mínimo configurado: R$ ${minimumCash.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    `Cenário base usado (não otimista)`,
  ];
  if (type === 'installment') {
    assumptions.push(`${installments}x de R$ ${perInstallment.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
  }

  const alternatives: string[] = [];

  let decision: PaymentDecision;
  let decisionLabel: string;
  let confidence: 'high' | 'medium' | 'low';

  if (balanceAfter >= minimumCash * 1.2) {
    decision = 'safe';
    decisionLabel = 'Seguro';
    confidence = 'high';
    alternatives.push('Pagamento pode ser feito sem risco ao caixa.');
  } else if (balanceAfter >= minimumCash) {
    decision = 'attention';
    decisionLabel = 'Atenção';
    confidence = 'medium';
    alternatives.push('Negociar prazo com o fornecedor para adiar o pagamento em 7-15 dias.');
    alternatives.push('Parcelar o pagamento para reduzir o impacto imediato.');
    alternatives.push('Aguardar confirmação de entradas previstas antes de pagar.');
  } else {
    decision = 'not_recommended';
    decisionLabel = 'Não recomendado';
    confidence = 'high';
    alternatives.push('Negociar prazo com o fornecedor — o caixa ficaria abaixo do mínimo.');
    alternatives.push('Parcelar em mais vezes para reduzir o impacto por parcela.');
    alternatives.push('Reduzir retirada de sócios neste mês para preservar o caixa.');
    alternatives.push('Verificar se há contas a receber que podem ser antecipadas.');
  }

  return {
    decision,
    decisionLabel,
    impactOnReserve: Math.round(impactOnReserve * 100) / 100,
    projectedBalanceAfter: Math.round(balanceAfter * 100) / 100,
    daysUntilNegative,
    horizonImpacts,
    assumptions,
    alternatives,
    confidence,
  };
}

// ============================================================
// Alert generation
// ============================================================

export interface GeneratedAlert {
  severity: 'info' | 'attention' | 'important' | 'critical';
  cause: string;
  projected_balance: number | null;
  projected_date: string | null;
  recommendation: string;
  possibleActions: string[];
  systemRecommendation: string;
  reasoning: string;
  confidence: 'high' | 'medium' | 'low';
}

export function generateAlerts(
  projection: ProjectionResult,
  availableCash: AvailableCashResult,
  riskConfig: RiskConfig | null
): GeneratedAlert[] {
  const alerts: GeneratedAlert[] = [];
  const minimumCash = riskConfig?.minimum_cash_threshold ?? 1000;

  if (projection.summary.conservative.minBalance < 0) {
    alerts.push({
      severity: 'critical',
      cause: `Cenário conservador projeta saldo negativo de R$ ${projection.summary.conservative.minBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em ${projection.summary.conservative.minDate ?? 'data futura'}.`,
      projected_balance: projection.summary.conservative.minBalance,
      projected_date: projection.summary.conservative.minDate,
      recommendation: 'Priorizar a entrada de recebíveis e postergar despesas não essenciais. Avaliar antecipação de contas a receber.',
      possibleActions: ['Postergar despesas não essenciais', 'Antecipar cobrança de clientes', 'Renegociar vencimento com fornecedores', 'Reduzir retirada de sócios'],
      systemRecommendation: 'Priorize a cobrança de clientes em atraso e postergue despesas opcionais',
      reasoning: `O saldo projetado no cenário conservador atinge o mínimo em ${projection.summary.conservative.minDate ?? 'data futura'}, indicando que mesmo sem novas receitas, as obrigações fixas ultrapassam o caixa disponível.`,
      confidence: 'high',
    });
  }

  if (projection.summary.base.minBalance < minimumCash && projection.summary.base.minBalance >= 0) {
    alerts.push({
      severity: 'important',
      cause: `Cenário base projeta saldo abaixo do caixa mínimo (R$ ${minimumCash.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) em ${projection.summary.base.minDate ?? 'data futura'}.`,
      projected_balance: projection.summary.base.minBalance,
      projected_date: projection.summary.base.minDate,
      recommendation: 'Revisar despesas opcionais nos próximos dias e confirmar entradas previstas.',
      possibleActions: ['Confirmar receitas previstas', 'Postergar despesas opcionais', 'Parcelar compromissos grandes', 'Avaliar linha de crédito de emergência'],
      systemRecommendation: 'Confirme as receitas previstas e revise despesas opcionais antes da data crítica',
      reasoning: `No cenário base, que considera 70% das receitas médias, o saldo cai para R$ ${projection.summary.base.minBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em ${projection.summary.base.minDate ?? 'data futura'}, ficando abaixo do caixa mínimo de R$ ${minimumCash.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`,
      confidence: 'medium',
    });
  }

  if (availableCash.availableCash < minimumCash * 1.5 && availableCash.availableCash >= minimumCash) {
    alerts.push({
      severity: 'attention',
      cause: `Saldo disponível real (R$ ${availableCash.availableCash.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) está próximo do caixa mínimo.`,
      projected_balance: availableCash.availableCash,
      projected_date: availableCash.lastUpdated,
      recommendation: 'Monitorar o fluxo de caixa de proximidade e evitar grandes saídas nos próximos dias.',
      possibleActions: ['Evitar grandes saídas', 'Acelerar recebimentos', 'Revisar contas a vencer esta semana'],
      systemRecommendation: 'Evite grandes saídas nos próximos dias e acelere o recebimento de clientes',
      reasoning: `O saldo disponível real está em R$ ${availableCash.availableCash.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}, a apenas ${(minimumCash * 1.5 - availableCash.availableCash).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} do limite de atenção (1,5x o caixa mínimo).`,
      confidence: 'medium',
    });
  }

  if (availableCash.availableCash < minimumCash) {
    alerts.push({
      severity: 'critical',
      cause: `Saldo disponível real (R$ ${availableCash.availableCash.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) já está abaixo do caixa mínimo (R$ ${minimumCash.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}).`,
      projected_balance: availableCash.availableCash,
      projected_date: availableCash.lastUpdated,
      recommendation: 'Ação imediata: postergar pagamentos não essenciais, buscar antecipação de recebíveis e revisar reservas.',
      possibleActions: ['Postergar pagamentos não essenciais', 'Buscar antecipação de recebíveis', 'Revisar reservas', 'Considerar aporte de sócios'],
      systemRecommendation: 'Aja agora: postergue pagamentos não essenciais e busque antecipar recebíveis',
      reasoning: `O saldo disponível real já está R$ ${(minimumCash - availableCash.availableCash).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} abaixo do caixa mínimo configurado. Cada dia sem ação aumenta o risco de não cumprir obrigações.`,
      confidence: 'high',
    });
  }

  if (availableCash.availableCash > minimumCash * 3 && alerts.length === 0) {
    alerts.push({
      severity: 'info',
      cause: 'Caixa saudável. O saldo disponível real está bem acima do mínimo configurado.',
      projected_balance: availableCash.availableCash,
      projected_date: availableCash.lastUpdated,
      recommendation: 'Considere aumentar a reserva de emergência ou investir o excesso de caixa.',
      possibleActions: ['Aumentar reserva de emergência', 'Investir excesso de caixa', 'Revisar metas financeiras'],
      systemRecommendation: 'Aproveite para fortalecer sua reserva de emergência',
      reasoning: `O saldo disponível real está ${(availableCash.availableCash - minimumCash * 3).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} acima de 3x o caixa mínimo, indicando folga financeira confortável.`,
      confidence: 'high',
    });
  }

  return alerts;
}

// ============================================================
// Home helpers: next risk, today's items, monthly summary
// ============================================================

export interface NextRisk {
  daysAway: number;
  projectedBalance: number;
  date: string;
  severity: 'critical' | 'important' | 'attention';
}

export function findNextRiskDay(
  projection: ProjectionResult,
  riskConfig: RiskConfig | null
): NextRisk | null {
  const minimumCash = riskConfig?.minimum_cash_threshold ?? 1000;

  for (let i = 0; i < projection.days.length; i++) {
    const day = projection.days[i];
    if (day.base < 0) {
      return {
        daysAway: i,
        projectedBalance: Math.round(day.base * 100) / 100,
        date: day.date,
        severity: 'critical',
      };
    }
    if (day.base < minimumCash) {
      return {
        daysAway: i,
        projectedBalance: Math.round(day.base * 100) / 100,
        date: day.date,
        severity: 'important',
      };
    }
  }

  return null;
}

export interface TodayItem {
  description: string;
  amount: number;
  type: 'inflow' | 'outflow' | 'reserve';
}

export function getTodayItems(
  transactions: Transaction[],
  recurringBills: RecurringBill[],
  reserves: Reserve[],
  today: Date = new Date()
): TodayItem[] {
  const items: TodayItem[] = [];
  const todayStr = toDateStr(today);
  const todayDay = today.getDate();

  for (const t of transactions) {
    if (t.is_archived || !t.is_confirmed) continue;
    if (toDateStr(new Date(t.occurred_at)) === todayStr) {
      items.push({
        description: t.description_raw,
        amount: t.amount,
        type: t.direction === 'inflow' ? 'inflow' : 'outflow',
      });
    }
  }

  for (const bill of recurringBills) {
    if (!bill.is_active) continue;
    if (bill.due_day === todayDay) {
      items.push({
        description: bill.description,
        amount: bill.amount,
        type: bill.type === 'receivable' ? 'inflow' : 'outflow',
      });
    }
  }

  for (const r of reserves) {
    if (r.type === 'tax') {
      items.push({
        description: `Separar para impostos (${r.type})`,
        amount: r.current_amount,
        type: 'reserve',
      });
    }
  }

  return items;
}

export interface MonthlySummary {
  totalInflow: number;
  totalOutflow: number;
  result: number;
}

export function getMonthlySummary(
  transactions: Transaction[],
  today: Date = new Date()
): MonthlySummary {
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthTx = transactions.filter(
    (t) => !t.is_archived && new Date(t.occurred_at) >= monthStart && new Date(t.occurred_at) <= today
  );
  const totalInflow = monthTx.filter((t) => t.direction === 'inflow').reduce((s, t) => s + t.amount, 0);
  const totalOutflow = monthTx.filter((t) => t.direction === 'outflow').reduce((s, t) => s + t.amount, 0);
  return {
    totalInflow: Math.round(totalInflow * 100) / 100,
    totalOutflow: Math.round(totalOutflow * 100) / 100,
    result: Math.round((totalInflow - totalOutflow) * 100) / 100,
  };
}

// ============================================================
// Calendar items
// ============================================================

export interface CalendarItem {
  date: string;
  day: number;
  description: string;
  amount: number;
  type: 'payable' | 'receivable';
  isRecurring: boolean;
}

export function getCalendarItems(
  recurringBills: RecurringBill[],
  transactions: Transaction[],
  today: Date = new Date()
): CalendarItem[] {
  const items: CalendarItem[] = [];
  const year = today.getFullYear();
  const month = today.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();

  for (const bill of recurringBills) {
    if (!bill.is_active) continue;
    const day = Math.min(bill.due_day, lastDay);
    const date = toDateStr(new Date(year, month, day));
    items.push({
      date,
      day,
      description: bill.description,
      amount: bill.amount,
      type: bill.type,
      isRecurring: true,
    });
  }

  for (const t of transactions) {
    if (t.is_archived) continue;
    const d = new Date(t.occurred_at);
    if (d.getMonth() === month && d.getFullYear() === year && d >= today) {
      items.push({
        date: toDateStr(d),
        day: d.getDate(),
        description: t.description_raw,
        amount: t.amount,
        type: t.direction === 'inflow' ? 'receivable' : 'payable',
        isRecurring: false,
      });
    }
  }

  return items.sort((a, b) => a.day - b.day);
}
