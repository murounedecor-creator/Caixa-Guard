'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Shield, Building2, ArrowRight, Loader2, CheckCircle2, Target, Upload, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

const STEPS = ['empresa', 'objetivo', 'conta', 'confirmar'] as const;
type Step = typeof STEPS[number];

const SECTORS = [
  'Assistência Técnica',
  'Comércio Varejista',
  'Alimentação',
  'Serviços',
  'Indústria',
  'Saúde',
  'Educação',
  'Construção',
  'Tecnologia',
  'Outros',
];

const TAX_REGIMES = [
  { value: 'simples_nacional', label: 'Simples Nacional' },
  { value: 'lucro_presumido', label: 'Lucro Presumido' },
  { value: 'lucro_real', label: 'Lucro Real' },
  { value: 'mei', label: 'MEI' },
];

export default function OnboardingPage() {
  const { user, setOrgId } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<Step>('empresa');
  const [loading, setLoading] = useState(false);

  const [orgName, setOrgName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [sector, setSector] = useState('Assistência Técnica');
  const [taxRegime, setTaxRegime] = useState('simples_nacional');
  const [monthlyRevenue, setMonthlyRevenue] = useState('40000');
  const [accountName, setAccountName] = useState('Conta Corrente');
  const [accountBalance, setAccountBalance] = useState('15000');
  const [objective, setObjective] = useState('');

  const stepIndex = STEPS.indexOf(step);

  const createOrg = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .insert({
          name: orgName,
          cnpj: cnpj || null,
          sector,
          tax_regime: taxRegime,
          monthly_revenue: parseFloat(monthlyRevenue) || 0,
        })
        .select()
        .single();

      if (orgError) throw orgError;

      const { error: memberError } = await supabase.from('memberships').insert({
        user_id: user.id,
        organization_id: orgData.id,
        role: 'owner',
      });
      if (memberError) throw memberError;

      const { error: accountError } = await supabase.from('financial_accounts').insert({
        organization_id: orgData.id,
        name: accountName,
        type: 'checking',
        balance: parseFloat(accountBalance) || 0,
      });
      if (accountError) throw accountError;

      // Default risk config: max(15% of monthly revenue, R$ 1000)
      const minCash = Math.max((parseFloat(monthlyRevenue) || 0) * 0.15, 1000);
      const { error: riskError } = await supabase.from('risk_config').insert({
        organization_id: orgData.id,
        minimum_cash_threshold: minCash,
        reserve_days: 15,
      });
      if (riskError) throw riskError;

      // Default reserves
      const reserves = [
        { type: 'tax', target_amount: (parseFloat(monthlyRevenue) || 0) * 0.1, current_amount: 0 },
        { type: 'emergency', target_amount: (parseFloat(monthlyRevenue) || 0) * 0.2, current_amount: 2000 },
      ];
      for (const r of reserves) {
        await supabase.from('reserves').insert({ organization_id: orgData.id, ...r });
      }

      // Default categories
      const defaultCategories = [
        'Receitas de Serviços', 'Receitas de Vendas', 'Materiais',
        'Salários e Encargos', 'Aluguel', 'Energia Elétrica',
        'Internet e Telefone', 'Marketing', 'Impostos', 'Software',
        'Manutenção', 'Despesas Bancárias', 'Pró-labore', 'Outros',
      ];
      for (const cat of defaultCategories) {
        await supabase.from('categories').insert({ organization_id: orgData.id, name: cat });
      }

      setOrgId(orgData.id);
      toast.success('Empresa criada com sucesso!');
      setStep('confirmar');
    } catch (err) {
      toast.error('Erro ao criar empresa: ' + (err as Error).message);
    }
    setLoading(false);
  };

  const finish = () => {
    router.push('/app');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-background to-blue-50">
      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Shield className="h-6 w-6" />
          </div>
          <div>
            <p className="font-bold text-lg leading-tight">CaixaGuard</p>
            <p className="text-xs text-muted-foreground">Configuração inicial</p>
          </div>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className="flex-1">
              <div
                className={`h-2 rounded-full transition-colors ${
                  i <= stepIndex ? 'bg-primary' : 'bg-muted'
                }`}
              />
            </div>
          ))}
        </div>

        {step === 'empresa' && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="h-5 w-5 text-primary" />
                <CardTitle>Sobre sua empresa</CardTitle>
              </div>
              <CardDescription>Conte-nos sobre o seu negócio para personalizarmos o CaixaGuard</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="orgName">Nome da empresa *</Label>
                <Input id="orgName" value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Ex: TechAssist Soluções" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cnpj">CNPJ (opcional)</Label>
                <Input id="cnpj" value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Setor</Label>
                  <Select value={sector} onValueChange={setSector}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SECTORS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Regime tributário</Label>
                  <Select value={taxRegime} onValueChange={setTaxRegime}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TAX_REGIMES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="revenue">Faturamento mensal médio (R$)</Label>
                <Input id="revenue" type="number" value={monthlyRevenue} onChange={(e) => setMonthlyRevenue(e.target.value)} />
              </div>
            </CardContent>
            <div className="flex justify-end px-6 pb-6">
              <Button onClick={() => setStep('objetivo')} disabled={!orgName}>
                Próximo <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </Card>
        )}

        {step === 'objetivo' && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 mb-1">
                <Target className="h-5 w-5 text-primary" />
                <CardTitle>Qual seu principal objetivo?</CardTitle>
              </div>
              <CardDescription>Isso nos ajuda a focar nos insights certos para você</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                'Saber quanto posso gastar sem comprometer o caixa',
                'Prever quando meu caixa vai apertar',
                'Decidir com segurança antes de pagar algo grande',
                'Organizar minhas contas e extratos em um só lugar',
              ].map((opt) => (
                <button
                  key={opt}
                  onClick={() => { setObjective(opt); setStep('conta'); }}
                  className={`w-full text-left p-4 rounded-lg border transition-colors ${
                    objective === opt ? 'border-primary bg-primary/5' : 'border-border hover:bg-secondary'
                  }`}
                >
                  <p className="text-sm font-medium">{opt}</p>
                </button>
              ))}
            </CardContent>
          </Card>
        )}

        {step === 'conta' && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 mb-1">
                <Upload className="h-5 w-5 text-primary" />
                <CardTitle>Sua conta financeira</CardTitle>
              </div>
              <CardDescription>Cadastre sua conta principal. Você pode importar extratos depois.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="accountName">Nome da conta</Label>
                <Input id="accountName" value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="Ex: Conta Corrente Banco X" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="accountBalance">Saldo atual (R$)</Label>
                <Input id="accountBalance" type="number" value={accountBalance} onChange={(e) => setAccountBalance(e.target.value)} />
              </div>
            </CardContent>
            <div className="flex justify-between px-6 pb-6">
              <Button variant="outline" onClick={() => setStep('objetivo')}>Voltar</Button>
              <Button onClick={createOrg} disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Criar empresa <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </Card>
        )}

        {step === 'confirmar' && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="h-5 w-5 text-primary" />
                <CardTitle>Tudo pronto!</CardTitle>
              </div>
              <CardDescription>Sua empresa está configurada. Veja seu primeiro insight.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Aha insight */}
              <div className="p-4 rounded-lg bg-primary/10 border border-primary/30">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <p className="text-sm font-semibold text-primary">Seu primeiro insight</p>
                </div>
                <p className="text-sm leading-relaxed">
                  Seu saldo bancário é <strong>R$ {parseFloat(accountBalance || '0').toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>.
                  Considerando suas contas fixas e uma reserva mínima de{' '}
                  <strong>R$ {Math.max((parseFloat(monthlyRevenue) || 0) * 0.15, 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>,
                  você tem <strong className="text-primary">R$ {Math.max(0, parseFloat(accountBalance || '0') - Math.max((parseFloat(monthlyRevenue) || 0) * 0.15, 1000) - 2000).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong> realmente disponíveis.
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Importe seu extrato bancário para uma visão ainda mais precisa.
                </p>
              </div>

              <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/5 border border-primary/20">
                <CheckCircle2 className="h-6 w-6 text-primary shrink-0" />
                <div>
                  <p className="text-sm font-medium">Caixa mínimo configurado automaticamente</p>
                  <p className="text-xs text-muted-foreground">
                    R$ {Math.max((parseFloat(monthlyRevenue) || 0) * 0.15, 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (15% do faturamento ou R$ 1.000)
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/5 border border-primary/20">
                <CheckCircle2 className="h-6 w-6 text-primary shrink-0" />
                <div>
                  <p className="text-sm font-medium">Categorias padrão criadas</p>
                  <p className="text-xs text-muted-foreground">14 categorias comuns prontas para uso</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/5 border border-primary/20">
                <CheckCircle2 className="h-6 w-6 text-primary shrink-0" />
                <div>
                  <p className="text-sm font-medium">Reserva de emergência inicial</p>
                  <p className="text-xs text-muted-foreground">R$ 2.000 alocados como reserva de emergência</p>
                </div>
              </div>
            </CardContent>
            <div className="flex justify-end px-6 pb-6">
              <Button onClick={finish} size="lg">
                Ir para o painel <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
