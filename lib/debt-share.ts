import { money, phoneNumber } from './ledger';

export function debtShareUrl(name: string, intro: string, customer: { name: string; phone: string }, debt: number, now = new Date()) {
  const phone = phoneNumber(customer.phone);
  if (!phone) return null;
  const date = new Intl.DateTimeFormat('ar-IQ', { timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const time = new Intl.DateTimeFormat('ar-IQ', { timeZone: 'Asia/Baghdad', hour: '2-digit', minute: '2-digit', hour12: true }).format(now);
  const message = [name.trim(), intro.trim(), `الزبون: ${customer.name}`, `الدين الكلي: ${money(debt)} دينار عراقي`, `التاريخ: ${date}`, `الوقت: ${time} (بتوقيت بغداد)`].filter(Boolean).join('\n');
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
