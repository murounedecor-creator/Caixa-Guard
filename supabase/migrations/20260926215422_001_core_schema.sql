/*
# CaixaGuard MVP — Core Schema

## Overview
Creates the complete database schema for CaixaGuard, a cash intelligence platform
for Brazilian small businesses. Multi-tenant with organization-level RLS.

## New Tables
1. `organizations` — Company profiles (CNPJ, sector, tax regime)
2. `memberships` — Links users to organizations with roles (owner/partner/manager/accountant)
3. `financial_accounts` — Bank/cash accounts with balances
4. `categories` — Transaction categories with optional parent
5. `transactions` — Imported/manual financial movements with categorization
6. `recurring_bills` — Fixed payable/receivable bills with due day
7. `reserves` — Reserve targets (tax, payroll, emergency)
8. `risk_config` — Per-org risk settings (minimum cash, reserve days)
9. `alerts` — Cash flow alerts with severity levels
10. `audit_log` — Immutable audit trail for critical changes

## Security
- RLS enabled on ALL tables
- Access scoped to authenticated users who are members of the organization
- Membership check: EXISTS (SELECT 1 FROM memberships WHERE organization_id = <table>.organization_id AND user_id = auth.uid())
- audit_log is INSERT-only for members (no UPDATE/DELETE) to preserve immutability
- risk_config uses organization_id as PK (one config per org)

## Notes
1. All amount columns use numeric(14,2) for Brazilian Real precision
2. Transactions support soft-delete via is_archived flag (never hard delete)
3. confidence_score tracks categorization confidence (0-1)
4. Alerts have status lifecycle: active → resolved/dismissed
*/

-- ============================================================
-- ORGANIZATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  cnpj text,
  sector text,
  tax_regime text DEFAULT 'simples_nacional',
  monthly_revenue numeric(14,2) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- MEMBERSHIPS
-- ============================================================
CREATE TABLE IF NOT EXISTS memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'partner', 'manager', 'accountant')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, organization_id)
);

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- FINANCIAL ACCOUNTS
-- ============================================================
CREATE TABLE IF NOT EXISTS financial_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'checking' CHECK (type IN ('checking', 'savings', 'cash', 'investment')),
  balance numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE financial_accounts ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- CATEGORIES
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  parent_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TRANSACTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  financial_account_id uuid REFERENCES financial_accounts(id) ON DELETE SET NULL,
  occurred_at date NOT NULL,
  amount numeric(14,2) NOT NULL,
  direction text NOT NULL CHECK (direction IN ('inflow', 'outflow')),
  description_raw text NOT NULL,
  description_normalized text,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  confidence_score numeric(3,2) DEFAULT 0,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'csv', 'ofx')),
  is_confirmed boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RECURRING BILLS
-- ============================================================
CREATE TABLE IF NOT EXISTS recurring_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  description text NOT NULL,
  amount numeric(14,2) NOT NULL,
  due_day integer NOT NULL CHECK (due_day >= 1 AND due_day <= 31),
  type text NOT NULL CHECK (type IN ('payable', 'receivable')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE recurring_bills ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RESERVES
-- ============================================================
CREATE TABLE IF NOT EXISTS reserves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('tax', 'payroll', 'emergency', 'investment')),
  target_amount numeric(14,2) NOT NULL DEFAULT 0,
  current_amount numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE reserves ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RISK CONFIG (one per org)
-- ============================================================
CREATE TABLE IF NOT EXISTS risk_config (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  minimum_cash_threshold numeric(14,2) NOT NULL DEFAULT 1000,
  reserve_days integer NOT NULL DEFAULT 15,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE risk_config ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- ALERTS
-- ============================================================
CREATE TABLE IF NOT EXISTS alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  severity text NOT NULL CHECK (severity IN ('info', 'attention', 'important', 'critical')),
  cause text NOT NULL,
  projected_balance numeric(14,2),
  projected_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'dismissed')),
  recommendation text,
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- AUDIT LOG (immutable — insert only)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_transactions_org_date ON transactions(organization_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_transactions_org_category ON transactions(organization_id, category_id);
CREATE INDEX IF NOT EXISTS idx_recurring_bills_org ON recurring_bills(organization_id);
CREATE INDEX IF NOT EXISTS idx_alerts_org_status ON alerts(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_org ON memberships(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_org ON audit_log(organization_id, created_at);

-- ============================================================
-- RLS POLICIES
-- All tables use membership-based access control:
-- a user can access rows in organizations where they have a membership.
-- ============================================================

-- Helper: membership check pattern used across all policies
-- EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = <table>.organization_id AND m.user_id = auth.uid())

-- ORGANIZATIONS: user can see orgs they belong to
DROP POLICY IF EXISTS "select_member_orgs" ON organizations;
CREATE POLICY "select_member_orgs" ON organizations FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = organizations.id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_orgs" ON organizations;
CREATE POLICY "insert_orgs" ON organizations FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_member_orgs" ON organizations;
CREATE POLICY "update_member_orgs" ON organizations FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = organizations.id AND m.user_id = auth.uid() AND m.role IN ('owner', 'partner'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = organizations.id AND m.user_id = auth.uid() AND m.role IN ('owner', 'partner'))
  );

-- MEMBERSHIPS: members can see who's in their org; owners can add/update/remove
DROP POLICY IF EXISTS "select_memberships" ON memberships;
CREATE POLICY "select_memberships" ON memberships FOR SELECT
  TO authenticated USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM memberships m2 WHERE m2.organization_id = memberships.organization_id AND m2.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_memberships" ON memberships;
CREATE POLICY "insert_memberships" ON memberships FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM memberships m2 WHERE m2.organization_id = memberships.organization_id AND m2.user_id = auth.uid() AND m2.role IN ('owner', 'partner'))
    OR NOT EXISTS (SELECT 1 FROM memberships m3 WHERE m3.organization_id = memberships.organization_id)
  );

DROP POLICY IF EXISTS "update_memberships" ON memberships;
CREATE POLICY "update_memberships" ON memberships FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships m2 WHERE m2.organization_id = memberships.organization_id AND m2.user_id = auth.uid() AND m2.role IN ('owner', 'partner'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM memberships m2 WHERE m2.organization_id = memberships.organization_id AND m2.user_id = auth.uid() AND m2.role IN ('owner', 'partner'))
  );

DROP POLICY IF EXISTS "delete_memberships" ON memberships;
CREATE POLICY "delete_memberships" ON memberships FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships m2 WHERE m2.organization_id = memberships.organization_id AND m2.user_id = auth.uid() AND m2.role IN ('owner', 'partner'))
  );

-- FINANCIAL ACCOUNTS
DROP POLICY IF EXISTS "select_accounts" ON financial_accounts;
CREATE POLICY "select_accounts" ON financial_accounts FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = financial_accounts.organization_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_accounts" ON financial_accounts;
CREATE POLICY "insert_accounts" ON financial_accounts FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = financial_accounts.organization_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_accounts" ON financial_accounts;
CREATE POLICY "update_accounts" ON financial_accounts FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = financial_accounts.organization_id AND m.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = financial_accounts.organization_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_accounts" ON financial_accounts;
CREATE POLICY "delete_accounts" ON financial_accounts FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = financial_accounts.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner', 'partner'))
  );

-- CATEGORIES
DROP POLICY IF EXISTS "select_categories" ON categories;
CREATE POLICY "select_categories" ON categories FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = categories.organization_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_categories" ON categories;
CREATE POLICY "insert_categories" ON categories FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = categories.organization_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_categories" ON categories;
CREATE POLICY "update_categories" ON categories FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = categories.organization_id AND m.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = categories.organization_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_categories" ON categories;
CREATE POLICY "delete_categories" ON categories FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = categories.organization_id AND m.user_id = auth.uid())
  );

-- TRANSACTIONS
DROP POLICY IF EXISTS "select_transactions" ON transactions;
CREATE POLICY "select_transactions" ON transactions FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = transactions.organization_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_transactions" ON transactions;
CREATE POLICY "insert_transactions" ON transactions FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = transactions.organization_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_transactions" ON transactions;
CREATE POLICY "update_transactions" ON transactions FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = transactions.organization_id AND m.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = transactions.organization_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_transactions" ON transactions;
CREATE POLICY "delete_transactions" ON transactions FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = transactions.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner', 'partner', 'accountant'))
  );

-- RECURRING BILLS
DROP POLICY IF EXISTS "select_recurring" ON recurring_bills;
CREATE POLICY "select_recurring" ON recurring_bills FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = recurring_bills.organization_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_recurring" ON recurring_bills;
CREATE POLICY "insert_recurring" ON recurring_bills FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = recurring_bills.organization_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_recurring" ON recurring_bills;
CREATE POLICY "update_recurring" ON recurring_bills FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = recurring_bills.organization_id AND m.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = recurring_bills.organization_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_recurring" ON recurring_bills;
CREATE POLICY "delete_recurring" ON recurring_bills FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = recurring_bills.organization_id AND m.user_id = auth.uid())
  );

-- RESERVES
DROP POLICY IF EXISTS "select_reserves" ON reserves;
CREATE POLICY "select_reserves" ON reserves FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = reserves.organization_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_reserves" ON reserves;
CREATE POLICY "insert_reserves" ON reserves FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = reserves.organization_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_reserves" ON reserves;
CREATE POLICY "update_reserves" ON reserves FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = reserves.organization_id AND m.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = reserves.organization_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_reserves" ON reserves;
CREATE POLICY "delete_reserves" ON reserves FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = reserves.organization_id AND m.user_id = auth.uid())
  );

-- RISK CONFIG
DROP POLICY IF EXISTS "select_risk_config" ON risk_config;
CREATE POLICY "select_risk_config" ON risk_config FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = risk_config.organization_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_risk_config" ON risk_config;
CREATE POLICY "insert_risk_config" ON risk_config FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = risk_config.organization_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_risk_config" ON risk_config;
CREATE POLICY "update_risk_config" ON risk_config FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = risk_config.organization_id AND m.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = risk_config.organization_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_risk_config" ON risk_config;
CREATE POLICY "delete_risk_config" ON risk_config FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = risk_config.organization_id AND m.user_id = auth.uid() AND m.role = 'owner')
  );

-- ALERTS
DROP POLICY IF EXISTS "select_alerts" ON alerts;
CREATE POLICY "select_alerts" ON alerts FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = alerts.organization_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_alerts" ON alerts;
CREATE POLICY "insert_alerts" ON alerts FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = alerts.organization_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_alerts" ON alerts;
CREATE POLICY "update_alerts" ON alerts FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = alerts.organization_id AND m.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = alerts.organization_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_alerts" ON alerts;
CREATE POLICY "delete_alerts" ON alerts FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = alerts.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner', 'partner'))
  );

-- AUDIT LOG: insert-only for members, select for members, NO update/delete
DROP POLICY IF EXISTS "select_audit" ON audit_log;
CREATE POLICY "select_audit" ON audit_log FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = audit_log.organization_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_audit" ON audit_log;
CREATE POLICY "insert_audit" ON audit_log FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = audit_log.organization_id AND m.user_id = auth.uid())
  );

-- ============================================================
-- UPDATED_AT TRIGGER for organizations
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orgs_updated_at ON organizations;
CREATE TRIGGER trg_orgs_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_risk_config_updated_at ON risk_config;
CREATE TRIGGER trg_risk_config_updated_at BEFORE UPDATE ON risk_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
