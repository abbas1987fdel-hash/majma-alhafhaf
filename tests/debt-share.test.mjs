import { describe, it, expect } from 'vitest';
import { debtShareUrl } from '../lib/debt-share';
describe('direct total debt WhatsApp link', () => {
 it('addresses the customer and encodes current balance and Baghdad date/time', () => {
  const url = new URL(debtShareUrl('المجمع', 'أهلًا بك', {name:'علي حسن & ياسر',phone:'٠٧٨٠١١٧٠٦٣٥'}, 114000, new Date('2026-09-19T22:15:00Z')));
  expect(url.hostname).toBe('wa.me'); expect(url.pathname).toBe('/9647801170635');
  const text=url.searchParams.get('text');
  expect(text).toContain('الزبون: علي حسن & ياسر');expect(text).toContain('114,000 دينار عراقي');
  expect(text).toContain('٢٠');expect(text).toContain('٠١:١٥');expect(text).toContain('بتوقيت بغداد');
 });
 it('keeps zero balance and rejects an invalid phone', () => {
  expect(new URL(debtShareUrl('المجمع','',{name:'علي',phone:'07700000000'},0)).searchParams.get('text')).toContain('الدين الكلي: 0');
  expect(debtShareUrl('المجمع','',{name:'علي',phone:'invalid'},0)).toBeNull();
 });
});
