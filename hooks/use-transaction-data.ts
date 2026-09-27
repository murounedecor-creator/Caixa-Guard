'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { useOrgData } from '@/hooks/use-org-data';
import type { Transaction, RecurringBill, Alert } from '@/lib/types';

interface TransactionData {
  transactions: Transaction[];
  recurringBills: RecurringBill[];
  alerts: Alert[];
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useTransactionData(orgId: string | null): TransactionData {
  const { user } = useAuth();
  const { refresh: refreshOrg } = useOrgData();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [recurringBills, setRecurringBills] = useState<RecurringBill[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!user || !orgId) {
      setTransactions([]);
      setRecurringBills([]);
      setAlerts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const [txRes, billsRes, alertsRes] = await Promise.all([
      supabase.from('transactions').select('*').eq('organization_id', orgId).order('occurred_at', { ascending: false }),
      supabase.from('recurring_bills').select('*').eq('organization_id', orgId).order('due_day'),
      supabase.from('alerts').select('*').eq('organization_id', orgId).order('created_at', { ascending: false }),
    ]);

    setTransactions((txRes.data ?? []) as Transaction[]);
    setRecurringBills((billsRes.data ?? []) as RecurringBill[]);
    setAlerts((alertsRes.data ?? []) as Alert[]);
    setLoading(false);
  }, [user, orgId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    transactions,
    recurringBills,
    alerts,
    loading,
    refresh: async () => {
      await Promise.all([loadData(), refreshOrg()]);
    },
  };
}
