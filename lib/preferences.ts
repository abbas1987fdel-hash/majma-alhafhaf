import { normalize, money, type Transaction } from './ledger';
export const DEFAULT_NAME = 'مجمع الهفهاف';
export const DEFAULT_INTRO =
  'أهلًا بكم، إليكم تفاصيل حسابكم. شكرًا لتعاملكم معنا.';
export const normalizePin = (pin: string) => normalize(pin).trim();
export const validPin = (pin: string) => /^\d{4,8}$/.test(normalizePin(pin));
export function whatsappText(
  name: string,
  intro: string,
  customer: string,
  t: Transaction,
  debt: number,
) {
  return [
    name.trim(),
    intro.trim(),
    `الزبون: ${customer}`,
    `${t.type === 'debt' ? 'دين' : 'تسديد'} • ${new Date(t.date).toLocaleDateString('ar-IQ')}`,
    ...t.items.map((i) => `${i.name}: ${money(i.price)} د.ع`),
    `المبلغ: ${money(t.amount)} د.ع`,
    `الدين المتبقي: ${money(debt)} د.ع`,
  ]
    .filter(Boolean)
    .join('\n');
}
