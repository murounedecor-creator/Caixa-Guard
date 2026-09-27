import type { Direction } from '@/lib/types';

export interface ParsedTransaction {
  occurred_at: string;
  amount: number;
  direction: Direction;
  description_raw: string;
  description_normalized: string;
}

export function parseCSV(content: string): ParsedTransaction[] {
  const lines = content.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const delimiter = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(delimiter).map((h) => h.trim().toLowerCase());

  const dateIdx = findIndex(headers, ['data', 'date', 'data transacao']);
  const amountIdx = findIndex(headers, ['valor', 'amount', 'montante']);
  const descIdx = findIndex(headers, ['descricao', 'description', 'historico', 'memo']);

  if (dateIdx === -1 || amountIdx === -1) return [];

  const transactions: ParsedTransaction[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ''));
    if (cols.length < Math.max(dateIdx, amountIdx) + 1) continue;

    const parsedDate = parseDate(cols[dateIdx]);
    if (!parsedDate) continue;

    const rawAmount = cols[amountIdx].replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
    const amount = Math.abs(parseFloat(rawAmount));
    if (isNaN(amount) || amount === 0) continue;

    const description = descIdx >= 0 ? cols[descIdx] : '';
    const direction: Direction = cols[amountIdx].includes('-') ? 'outflow' : 'inflow';

    transactions.push({
      occurred_at: parsedDate,
      amount,
      direction,
      description_raw: description,
      description_normalized: normalizeDescription(description),
    });
  }

  return transactions;
}

export function parseOFX(content: string): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = [];
  const blocks = content.split('<STMTTRN>');

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i].split('</STMTTRN>')[0];
    const dateMatch = block.match(/<DTPOSTED>(\d{8})/);
    const amountMatch = block.match(/<TRNAMT>([-\d.]+)/);
    const nameMatch = block.match(/<NAME>([^<]+)/);
    const memoMatch = block.match(/<MEMO>([^<]+)/);

    if (!dateMatch || !amountMatch) continue;

    const dateStr = dateMatch[1];
    const parsedDate = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
    const amount = Math.abs(parseFloat(amountMatch[1]));
    const direction: Direction = parseFloat(amountMatch[1]) < 0 ? 'outflow' : 'inflow';
    const description = nameMatch?.[1]?.trim() || memoMatch?.[1]?.trim() || '';

    transactions.push({
      occurred_at: parsedDate,
      amount,
      direction,
      description_raw: description,
      description_normalized: normalizeDescription(description),
    });
  }

  return transactions;
}

function normalizeDescription(desc: string): string {
  return desc.replace(/\s+/g, ' ').replace(/[^\w\s-]/g, '').trim().toUpperCase().substring(0, 120);
}

function parseDate(raw: string): string | null {
  const brMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return raw;
  const dashMatch = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dashMatch) return `${dashMatch[3]}-${dashMatch[2]}-${dashMatch[1]}`;
  return null;
}

function findIndex(headers: string[], candidates: string[]): number {
  for (const c of candidates) {
    const idx = headers.findIndex((h) => h.includes(c));
    if (idx !== -1) return idx;
  }
  return -1;
}
