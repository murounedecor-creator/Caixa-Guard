'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import type { Organization, Membership, FinancialAccount, Category, RiskConfig, Reserve } from '@/lib/types';

interface OrgData {
  organization: Organization | null;
  membership: Membership | null;
  accounts: FinancialAccount[];
  categories: Category[];
  riskConfig: RiskConfig | null;
  reserves: Reserve[];
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useOrgData(): OrgData {
  const { user, orgId, setOrgId } = useAuth();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [riskConfig, setRiskConfig] = useState<RiskConfig | null>(null);
  const [reserves, setReserves] = useState<Reserve[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!user) {
      setOrganization(null);
      setLoading(false);
      return;
    }

    // If no orgId stored, find the user's first membership
    let activeOrgId = orgId;

    if (!activeOrgId) {
      const { data: memberData } = await supabase
        .from('memberships')
        .select('*, organizations(*)')
        .eq('user_id', user.id)
        .order('created_at')
        .limit(1)
        .maybeSingle();

      if (memberData?.organization_id) {
        activeOrgId = memberData.organization_id;
        setOrgId(activeOrgId);
      }
    }

    if (!activeOrgId) {
      setOrganization(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    const [orgRes, memberRes, accountsRes, categoriesRes, riskRes, reservesRes] = await Promise.all([
      supabase.from('organizations').select('*').eq('id', activeOrgId).maybeSingle(),
      supabase.from('memberships').select('*').eq('user_id', user.id).eq('organization_id', activeOrgId).maybeSingle(),
      supabase.from('financial_accounts').select('*').eq('organization_id', activeOrgId).order('created_at'),
      supabase.from('categories').select('*').eq('organization_id', activeOrgId).order('name'),
      supabase.from('risk_config').select('*').eq('organization_id', activeOrgId).maybeSingle(),
      supabase.from('reserves').select('*').eq('organization_id', activeOrgId).order('type'),
    ]);

    setOrganization(orgRes.data as Organization | null);
    setMembership(memberRes.data as Membership | null);
    setAccounts((accountsRes.data ?? []) as FinancialAccount[]);
    setCategories((categoriesRes.data ?? []) as Category[]);
    setRiskConfig(riskRes.data as RiskConfig | null);
    setReserves((reservesRes.data ?? []) as Reserve[]);
    setLoading(false);
  }, [user, orgId, setOrgId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    organization,
    membership,
    accounts,
    categories,
    riskConfig,
    reserves,
    loading,
    refresh: loadData,
  };
}
