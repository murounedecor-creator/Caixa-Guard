export type Role = 'owner' | 'partner' | 'manager' | 'accountant';

export type AccountType = 'checking' | 'savings' | 'cash' | 'investment';

export type Direction = 'inflow' | 'outflow';

export type TransactionSource = 'manual' | 'csv' | 'ofx';

export type ReserveType = 'tax' | 'payroll' | 'emergency' | 'investment';

export type AlertSeverity = 'info' | 'attention' | 'important' | 'critical';

export type AlertStatus = 'active' | 'resolved' | 'dismissed';

export type Scenario = 'conservative' | 'base' | 'optimistic';

export interface Organization {
  id: string;
  name: string;
  cnpj: string | null;
  sector: string | null;
  tax_regime: string;
  monthly_revenue: number;
  created_at: string;
  updated_at: string;
}

export interface Membership {
  id: string;
  user_id: string;
  organization_id: string;
  role: Role;
  created_at: string;
}

export interface FinancialAccount {
  id: string;
  organization_id: string;
  name: string;
  type: AccountType;
  balance: number;
  created_at: string;
}

export interface Category {
  id: string;
  organization_id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
}

export interface Transaction {
  id: string;
  organization_id: string;
  financial_account_id: string | null;
  occurred_at: string;
  amount: number;
  direction: Direction;
  description_raw: string;
  description_normalized: string | null;
  category_id: string | null;
  confidence_score: number;
  source: TransactionSource;
  is_confirmed: boolean;
  is_archived: boolean;
  created_at: string;
}

export interface RecurringBill {
  id: string;
  organization_id: string;
  description: string;
  amount: number;
  due_day: number;
  type: 'payable' | 'receivable';
  is_active: boolean;
  created_at: string;
}

export interface Reserve {
  id: string;
  organization_id: string;
  type: ReserveType;
  target_amount: number;
  current_amount: number;
  created_at: string;
}

export interface RiskConfig {
  organization_id: string;
  minimum_cash_threshold: number;
  reserve_days: number;
  created_at: string;
  updated_at: string;
}

export interface Alert {
  id: string;
  organization_id: string;
  severity: AlertSeverity;
  cause: string;
  projected_balance: number | null;
  projected_date: string | null;
  status: AlertStatus;
  recommendation: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface AuditLog {
  id: string;
  organization_id: string;
  user_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
}

export interface OrgContext {
  organization: Organization;
  membership: Membership;
  accounts: FinancialAccount[];
  categories: Category[];
  riskConfig: RiskConfig | null;
  reserves: Reserve[];
}
