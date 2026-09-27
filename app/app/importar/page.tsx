'use client';

import { useState, useCallback } from 'react';
import { useOrgData } from '@/hooks/use-org-data';
import { useTransactionData } from '@/hooks/use-transaction-data';
import { supabase } from '@/lib/supabase/client';
import { parseCSV, parseOFX, ParsedTransaction } from '@/lib/parser';
import { formatCurrency, formatDate } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Upload, FileText, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { Category } from '@/lib/types';

export default function ImportPage() {
  const { organization, accounts, categories } = useOrgData();
  const { refresh } = useTransactionData(organization?.id ?? null);
  const [parsed, setParsed] = useState<ParsedTransaction[]>([]);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setFileName(file.name);
    const text = await file.text();

    let transactions: ParsedTransaction[] = [];
    if (file.name.toLowerCase().endsWith('.ofx')) {
      transactions = parseOFX(text);
    } else {
      transactions = parseCSV(text);
    }

    if (transactions.length === 0) {
      setError('Não foi possível ler o arquivo. Verifique o formato (CSV ou OFX).');
      return;
    }

    setParsed(transactions);
  }, []);

  function autoCategorize(desc: string, categories: Category[]): string | null {
    const upper = desc.toUpperCase();
    for (const cat of categories) {
      const catName = cat.name.toUpperCase();
      if (upper.includes(catName) || catName.includes(upper)) return cat.id;
    }
    const keywordMap: Record<string, string> = {
      'SALARIO': 'Salários e Encargos', 'FOLHA': 'Salários e Encargos',
      'IMPOSTO': 'Impostos', 'TAXA': 'Impostos',
      'ALUGUEL': 'Aluguel', 'FORNECEDOR': 'Materiais', 'COMPRA': 'Materiais',
      'MARKETING': 'Marketing', 'ANUNCIO': 'Marketing',
      'SOFTWARE': 'Software', 'SISTEMA': 'Software',
      'BANCO': 'Despesas Bancárias', 'TARIFA': 'Despesas Bancárias',
      'MANUTENCAO': 'Manutenção', 'EQUIPAMENTO': 'Materiais',
      'ENERGIA': 'Energia Elétrica', 'INTERNET': 'Internet e Telefone',
      'PROLABORE': 'Pró-labore',
    };
    for (const [keyword, catName] of Object.entries(keywordMap)) {
      if (upper.includes(keyword)) {
        const cat = categories.find((c) => c.name === catName);
        if (cat) return cat.id;
      }
    }
    return null;
  }

  async function handleImport() {
    if (!organization || parsed.length === 0) return;
    setImporting(true);

    const accountId = accounts[0]?.id;
    const rows = parsed.map((t) => {
      const catId = autoCategorize(t.description_normalized || t.description_raw, categories);
      return {
        organization_id: organization.id,
        financial_account_id: accountId,
        occurred_at: t.occurred_at,
        amount: t.amount,
        direction: t.direction,
        description_raw: t.description_raw,
        description_normalized: t.description_normalized,
        category_id: catId,
        confidence_score: catId ? 0.7 : 0,
        source: 'csv' as const,
        is_confirmed: false,
        is_archived: false,
      };
    });

    const { error } = await supabase.from('transactions').insert(rows);
    if (error) {
      setError('Erro ao importar: ' + error.message);
      toast.error('Erro ao importar transações');
    } else {
      setImported(rows.length);
      toast.success(`${rows.length} transações importadas`);
      await refresh();
    }
    setImporting(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Importar Extrato</h1>
        <p className="text-sm text-muted-foreground mt-1">Importe seu extrato bancário em formato CSV ou OFX</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {imported > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-green-500/50 bg-green-500/5 p-3 text-sm text-green-700 dark:text-green-400">
          <CheckCircle2 className="h-4 w-4" />
          {imported} transações importadas com sucesso!
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Arquivo</CardTitle>
        </CardHeader>
        <CardContent>
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-8 transition-colors hover:border-primary hover:bg-primary/5">
            <Upload className="mb-3 h-10 w-10 text-muted-foreground" />
            <span className="text-sm font-medium">Clique para selecionar um arquivo</span>
            <span className="text-xs text-muted-foreground mt-1">Formatos: CSV, OFX</span>
            <input
              type="file"
              accept=".csv,.ofx,.txt"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </label>
          {fileName && (
            <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="h-4 w-4" />
              {fileName} — {parsed.length} transações encontradas
            </div>
          )}
        </CardContent>
      </Card>

      {parsed.length > 0 && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Prévia das transações</CardTitle>
              <CardDescription>Revise antes de confirmar a importação</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-96 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.slice(0, 50).map((t, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm">{formatDate(t.occurred_at)}</TableCell>
                        <TableCell className="text-sm">{t.description_normalized || t.description_raw}</TableCell>
                        <TableCell>
                          <Badge variant={t.direction === 'inflow' ? 'default' : 'secondary'}>
                            {t.direction === 'inflow' ? 'Entrada' : 'Saída'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatCurrency(t.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {parsed.length > 50 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Mostrando 50 de {parsed.length} transações
                </p>
              )}
            </CardContent>
          </Card>

          <Button onClick={handleImport} disabled={importing} className="w-full" size="lg">
            {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar importação de {parsed.length} transações
          </Button>
        </>
      )}
    </div>
  );
}
