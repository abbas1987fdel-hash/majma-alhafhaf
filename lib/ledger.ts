export type Transaction = {
  id: string;
  customer: string;
  type: 'debt' | 'payment';
  items: { name: string; price: number }[];
  amount: number;
  date: string;
  dueDate?: string;
};
export const money = (n: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
export const normalize = (s: string) =>
  s
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 1776))
    .replace(/[أإآ]/g, 'ا')
    .replace(/[\u064B-\u065Fـ]/g, '')
    .toLowerCase();
export const total = (items: { price: number }[]) =>
  items.reduce((n, i) => n + i.price, 0);
export const balance = (tx: Transaction[]) =>
  tx.reduce((n, t) => n + (t.type === 'debt' ? t.amount : -t.amount), 0);
export function validLedger(tx: Transaction[]) {
  let amount = 0;
  return tx.every((t) => {
    amount += t.type === 'debt' ? t.amount : -t.amount;
    return (
      Number.isSafeInteger(t.amount) &&
      t.amount > 0 &&
      Number.isSafeInteger(amount) &&
      amount >= 0
    );
  });
}
export function phoneNumber(s: string) {
  let p = normalize(s).replace(/[\s()+-]/g, '');
  if (p.startsWith('00')) p = p.slice(2);
  if (/^07\d{9}$/.test(p)) p = '964' + p.slice(1);
  return /^[1-9]\d{7,14}$/.test(p) ? p : '';
}
export function dateKey(now: number | string = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now));
}
export function dueAfter(date: string, days = 30) {
  const d = new Date(dateKey(date) + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
// Payments settle the oldest outstanding debt first, within one customer's ledger.
export function overdueDebts(tx: Transaction[], now = Date.now()) {
  const unpaid: { id: string; remaining: number; dueDate: string }[] = [];
  for (const t of tx) {
    if (t.type === 'debt')
      unpaid.push({
        id: t.id,
        remaining: t.amount,
        dueDate: t.dueDate || dueAfter(t.date),
      });
    else {
      let payment = t.amount;
      for (const d of unpaid) {
        const used = Math.min(payment, d.remaining);
        d.remaining -= used;
        payment -= used;
        if (!payment) break;
      }
    }
  }
  const today = dateKey(now);
  return unpaid.filter((d) => d.remaining > 0 && d.dueDate < today);
}
// Match a prefix starting at any word, while retaining full-name/phrase search.
export function matchesName(name: string, query: string) {
  const search = normalize(query).trim().replace(/\s+/g, ' ');
  if (!search) return true;
  const words = normalize(name).trim().split(/\s+/);
  return words.some((_, index) =>
    words.slice(index).join(' ').startsWith(search),
  );
}
