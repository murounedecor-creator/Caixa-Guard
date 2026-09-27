'use client';

import { useState, useEffect } from 'react';
import { useOrgData } from '@/hooks/use-org-data';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Shield, Wallet, PiggyBank, Users, Plus, Trash2, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import type { ReserveType } from '@/lib/types';

const reserveTypeLabels: Record<ReserveType, string> = {
  tax: 'Impostos',
  payroll: 'Folha',
  emergency: 'Emergência',
  investment: 'Investimento',
};

export default function ConfigPage() {
  const { organization, riskConfig, reserves, accounts, loading, refresh } = useOrgData();
  const { user } = useAuth();
  const [minCash, setMinCash] = useState('');
  const [reserveDays, setReserveDays] = useState('15');
  const [saving, setSaving] = useState(false);
  const [newReserveType, setNewReserveType] = useState<ReserveType>('tax');
  const [newReserveTarget, setNewReserveTarget] = useState('');
  const [newReserveCurrent, setNewReserveCurrent] = useState('');
  const [members, setMembers] = useState<{id: string; role: string; user_id: string}[]>([]);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountBalance, setNewAccountBalance] = useState('');

  useEffect(() => {
    if (riskConfig) {
      setMinCash(riskConfig.minimum_cash_threshold.toString());
      setReserveDays(riskConfig.reserve_days.toString());
    }
  }, [riskConfig]);

  useEffect(() => {
    if (organization) {
      supabase
        .from('memberships')
        .select('id, role, user_id')
        .eq('organization_id', organization.id)
        .then(({ data }) => setMembers(data ?? []));
    }
  }, [organization]);

  const saveRiskConfig = async () => {
    if (!organization) return;
    setSaving(true);
    const { error } = await supabase
      .from('risk_config')
      .update({
        minimum_cash_threshold: parseFloat(minCash) || 1000,
        reserve_days: parseInt(reserveDays) || 15,
      })
      .eq('organization_id', organization.id);

    if (error) {
      toast.error('Erro ao salvar configuração');
    } else {
      toast.success('Configuração salva');
      await logAudit('update', 'risk_config', { minimum_cash_threshold: parseFloat(minCash), reserve_days: parseInt(reserveDays) });
      refresh();
    }
    setSaving(false);
  };

  const addReserve = async () => {
    if (!organization || !newReserveTarget) return;
    const { error } = await supabase.from('reserves').insert({
      organization_id: organization.id,
      type: newReserveType,
      target_amount: parseFloat(newReserveTarget) || 0,
      current_amount: parseFloat(newReserveCurrent) || 0,
    });
    if (error) {
      toast.error('Erro ao adicionar reserva');
    } else {
      toast.success('Reserva adicionada');
      setNewReserveTarget('');
      setNewReserveCurrent('');
      await logAudit('insert', 'reserves', { type: newReserveType, target_amount: parseFloat(newReserveTarget) });
      refresh();
    }
  };

  const deleteReserve = async (id: string) => {
    const { error } = await supabase.from('reserves').delete().eq('id', id);
    if (error) {
      toast.error('Erro ao remover reserva');
    } else {
      toast.success('Reserva removida');
      await logAudit('delete', 'reserves', { id });
      refresh();
    }
  };

  const addAccount = async () => {
    if (!organization || !newAccountName) return;
    const { error } = await supabase.from('financial_accounts').insert({
      organization_id: organization.id,
      name: newAccountName,
      type: 'checking',
      balance: parseFloat(newAccountBalance) || 0,
    });
    if (error) {
      toast.error('Erro ao adicionar conta');
    } else {
      toast.success('Conta adicionada');
      setNewAccountName('');
      setNewAccountBalance('');
      await logAudit('insert', 'financial_accounts', { name: newAccountName });
      refresh();
    }
  };

  const logAudit = async (action: string, entity: string, after: Record<string, unknown>) => {
    if (!user || !organization) return;
    await supabase.from('audit_log').insert({
      organization_id: organization.id,
      user_id: user.id,
      action,
      entity,
      after,
    });
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-1">Ajuste os parâmetros do seu caixa</p>
      </div>

      {/* Risk config */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Caixa mínimo e reservas</CardTitle>
          </div>
          <CardDescription>
            O caixa mínimo é o valor que você não quer que o saldo caia abaixo. Padrão: maior valor entre 15% do faturamento ou R$ 1.000.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="minCash">Caixa mínimo (R$)</Label>
              <Input id="minCash" type="number" value={minCash} onChange={(e) => setMinCash(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reserveDays">Dias de reserva</Label>
              <Input id="reserveDays" type="number" value={reserveDays} onChange={(e) => setReserveDays(e.target.value)} />
            </div>
          </div>
          <Button onClick={saveRiskConfig} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar
          </Button>
        </CardContent>
      </Card>

      {/* Reserves */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <PiggyBank className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Reservas</CardTitle>
          </div>
          <CardDescription>Valores reservados que são subtraídos do saldo disponível</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {reserves.length > 0 && (
            <div className="space-y-2">
              {reserves.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <p className="text-sm font-medium">{reserveTypeLabels[r.type]}</p>
                    <p className="text-xs text-muted-foreground">
                      Atual: {formatCurrency(r.current_amount)} / Meta: {formatCurrency(r.target_amount)}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => deleteReserve(r.id)}>
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <Separator />
          <div className="grid grid-cols-3 gap-2">
            <Select value={newReserveType} onValueChange={(v) => setNewReserveType(v as ReserveType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(reserveTypeLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="number" placeholder="Meta (R$)" value={newReserveTarget} onChange={(e) => setNewReserveTarget(e.target.value)} />
            <Input type="number" placeholder="Atual (R$)" value={newReserveCurrent} onChange={(e) => setNewReserveCurrent(e.target.value)} />
          </div>
          <Button onClick={addReserve} variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-1" /> Adicionar reserva
          </Button>
        </CardContent>
      </Card>

      {/* Accounts */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Contas financeiras</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {accounts.length > 0 && (
            <div className="space-y-2">
              {accounts.map((a) => (
                <div key={a.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <p className="text-sm font-medium">{a.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{a.type}</p>
                  </div>
                  <p className="text-sm font-semibold">{formatCurrency(a.balance)}</p>
                </div>
              ))}
            </div>
          )}
          <Separator />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Nome da conta" value={newAccountName} onChange={(e) => setNewAccountName(e.target.value)} />
            <Input type="number" placeholder="Saldo (R$)" value={newAccountBalance} onChange={(e) => setNewAccountBalance(e.target.value)} />
          </div>
          <Button onClick={addAccount} variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-1" /> Adicionar conta
          </Button>
        </CardContent>
      </Card>

      {/* Members */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Papéis e permissões</CardTitle>
          </div>
          <CardDescription>Membros da organização e seus papéis</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-xs font-semibold">
                    {m.user_id === user?.id ? 'Você' : '??'}
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {m.user_id === user?.id ? 'Você' : `Usuário ${m.user_id.slice(0, 8)}`}
                    </p>
                  </div>
                </div>
                <Badge variant={m.role === 'owner' ? 'default' : 'secondary'}>
                  {m.role === 'owner' ? 'Dono' : m.role === 'partner' ? 'Sócio' : m.role === 'manager' ? 'Gestor' : 'Contador'}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
