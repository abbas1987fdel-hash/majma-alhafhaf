import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../convex/schema';
import { api, internal } from '../convex/_generated/api';
const modules = import.meta.glob('../convex/**/*.ts');
const pin = '7392'; // Independent test credential; never used by the deployed application.
const customer = { id: 'customer-0001', name: 'علي حسن ياسر', phone: '07701234567', notes: '' };
const debt = { id: 'debt-0000001', customer: customer.id, type: 'debt', items: [{ name: 'حنفية', price: 2000 }], amount: 2000, date: '1900-01-01T00:00:00Z', dueDate: '2026-09-01' };
const payment = { id: 'payment-0001', customer: customer.id, type: 'payment', items: [], amount: 1500, date: '1900-01-01T00:00:00Z' };
async function setup() {
  const t = convexTest(schema, modules);
  await t.action(internal.auth.bootstrap, {});
  const { token } = await t.action(api.auth.login, { pin });
  return { t, token };
}
beforeEach(() => {
  vi.stubEnv('INITIAL_PIN', pin);
  vi.stubEnv('APP_ORIGIN', 'https://customer.example');
  vi.stubEnv('CONVEX_SITE_URL', 'https://test.convex.site');
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('authenticated durable ledger', () => {
  it('rejects anonymous data access and writes while exposing only public branding', async () => {
    const { t } = await setup();
    expect(await t.query(api.shop.snapshot, { token: '' })).toBeNull();
    await expect(t.mutation(api.shop.saveCustomer, { token: '0'.repeat(64), customer })).rejects.toThrow();
    const brand = await t.query(api.shop.branding, {});
    expect(Object.keys(brand).sort()).toEqual(['logo', 'name']);
    const data = await t.run(ctx => ctx.db.query('customers').collect());
    expect(data).toHaveLength(0);
  });
  it('persists across new sessions and rejects stale updates/deleted stale records', async () => {
    const { t, token } = await setup();
    await t.mutation(api.shop.saveCustomer, { token, customer });
    const second = await t.action(api.auth.login, { pin });
    expect((await t.query(api.shop.snapshot, second)).customers[0]).toMatchObject({ ...customer, version: 1 });
    await t.mutation(api.shop.saveCustomer, { token, customer: { ...customer, notes: 'دفعة لاحقًا' }, expectedVersion: 1 });
    await expect(t.mutation(api.shop.saveCustomer, { token: second.token, customer, expectedVersion: 1 })).rejects.toThrow();
    await t.mutation(api.shop.remove, { token, kind: 'customer', id: customer.id, expectedVersion: 2 });
    await expect(t.mutation(api.shop.saveCustomer, { token, customer, expectedVersion: 2 })).rejects.toThrow();
    expect((await t.query(api.shop.snapshot, { token })).customers).toHaveLength(0);
  });
  it('exposes only the active session expiry and arbitrates competing payments', async () => {
    const { t, token } = await setup();
    const snapshot = await t.query(api.shop.snapshot, { token });
    expect(snapshot.sessionExpires).toBeGreaterThan(Date.now() + 11 * 60 * 60_000);
    expect(snapshot.sessionExpires).toBeLessThanOrEqual(Date.now() + 12 * 60 * 60_000);
    expect(Object.keys(snapshot).sort()).toEqual(['customers', 'products', 'sessionExpires', 'settings', 'transactions']);
    await t.mutation(api.shop.saveCustomer, { token, customer });
    await t.mutation(api.shop.saveTransaction, { token, transaction: debt });
    const second = await t.action(api.auth.login, { pin });
    const results = await Promise.allSettled([
      t.mutation(api.shop.saveTransaction, { token, transaction: payment }),
      t.mutation(api.shop.saveTransaction, { token: second.token, transaction: { ...payment, id: 'payment-0002' } }),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    const saved = await t.query(api.shop.snapshot, { token });
    expect(saved.transactions.reduce((sum, item) => sum + (item.type === 'debt' ? item.amount : -item.amount), 0)).toBe(500);
  });
  it('enforces ledger amounts, chronology, partial payment and harmful debt edits/deletes atomically', async () => {
    const { t, token } = await setup();
    await t.mutation(api.shop.saveCustomer, { token, customer });
    await expect(t.mutation(api.shop.saveTransaction, { token, transaction: { ...debt, amount: 1 } })).rejects.toThrow();
    await t.mutation(api.shop.saveTransaction, { token, transaction: debt });
    await t.mutation(api.shop.saveTransaction, { token, transaction: payment });
    await expect(t.mutation(api.shop.saveTransaction, { token, transaction: { ...payment, id: 'payment-0002', amount: 501 } })).rejects.toThrow();
    await expect(t.mutation(api.shop.saveTransaction, { token, transaction: { ...debt, amount: 1000, items: [{ name: 'حنفية', price: 1000 }] }, expectedVersion: 1 })).rejects.toThrow();
    await expect(t.mutation(api.shop.remove, { token, kind: 'transaction', id: debt.id, expectedVersion: 1 })).rejects.toThrow();
    await expect(t.mutation(api.shop.remove, { token, kind: 'customer', id: customer.id, expectedVersion: 1 })).rejects.toThrow();
    const snapshot = await t.query(api.shop.snapshot, { token });
    expect(snapshot.transactions.map(item => item.id)).toEqual([debt.id, payment.id]);
    expect(snapshot.transactions[0].date).not.toBe(debt.date);
    expect(snapshot.transactions[0]).not.toHaveProperty('sequence');
    await t.mutation(api.shop.remove, { token, kind: 'transaction', id: payment.id, expectedVersion: 1 });
    expect((await t.query(api.shop.snapshot, { token })).transactions).toHaveLength(1);
  });
  it('validates inventory and date bounds on the server', async () => {
    const { t, token } = await setup();
    const product = { id: 'product-0001', name: 'أنبوب', buy: 1000, sell: 2000, quantity: 3, alert: 1 };
    await t.mutation(api.shop.saveProduct, { token, product });
    await expect(t.mutation(api.shop.saveProduct, { token, product: { ...product, quantity: -1 }, expectedVersion: 1 })).rejects.toThrow();
    await expect(t.mutation(api.shop.saveProduct, { token, product: { ...product, sell: 0.5 }, expectedVersion: 1 })).rejects.toThrow();
    await t.mutation(api.shop.saveCustomer, { token, customer });
    await expect(t.mutation(api.shop.saveTransaction, { token, transaction: { ...debt, dueDate: '2026-02-30' } })).rejects.toThrow();
    await expect(t.mutation(api.shop.saveCustomer, { token, customer: { ...customer, phone: '0770' + ' '.repeat(100) + '1234567' }, expectedVersion: 1 })).rejects.toThrow();
  });
});
describe('PIN and session boundaries', () => {
  it('records failed attempts and rate limits password guessing', async () => {
    const { t } = await setup();
    for (let i = 0; i < 5; i++) await expect(t.action(api.auth.login, { pin: '0000' })).rejects.toThrow('الرمز غير صحيح');
    await expect(t.action(api.auth.login, { pin })).rejects.toThrow('محاولات كثيرة');
    const limits = await t.run(ctx => ctx.db.query('attempts').collect());
    expect(limits[0].count).toBe(5);
  });
  it('rotates PIN/session, preserves data, revokes old sessions and cannot bootstrap-reset the PIN', async () => {
    const { t, token } = await setup();
    await t.mutation(api.shop.saveCustomer, { token, customer });
    const next = await t.action(api.auth.changePin, { token, currentPin: pin, newPin: '٨٦٥٤' });
    expect(await t.query(api.shop.snapshot, { token })).toBeNull();
    expect((await t.query(api.shop.snapshot, next)).customers).toHaveLength(1);
    expect(await t.action(internal.auth.bootstrap, {})).toEqual({ initialized: false });
    await expect(t.action(api.auth.login, { pin })).rejects.toThrow('الرمز غير صحيح');
    const login = await t.action(api.auth.login, { pin: '8654' });
    await t.mutation(api.shop.logout, login);
    expect(await t.query(api.shop.snapshot, login)).toBeNull();
  });
  it('rejects expired sessions', async () => {
    const { t, token } = await setup();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 13 * 60 * 60_000);
    expect(await t.query(api.shop.snapshot, { token })).toBeNull();
    await expect(t.mutation(api.shop.saveCustomer, { token, customer })).rejects.toThrow();
  });
});
describe('logo upload access', () => {
  it('requires allowed origin, single-use ticket and uploading-session ownership', async () => {
    const { t, token } = await setup();
    const url = await t.mutation(api.shop.uploadUrl, { token });
    const path = new URL(url).pathname + new URL(url).search;
    const bytes = new Uint8Array([137,80,78,71,13,10,26,10,0]);
    const blocked = await t.fetch(path, { method: 'POST', headers: { Origin: 'https://attacker.example' }, body: bytes });
    expect(blocked.status).toBe(403);
    const response = await t.fetch(path, { method: 'POST', headers: { Origin: 'https://customer.example', 'Content-Type': 'image/png' }, body: bytes });
    expect(response.status).toBe(200);
    const { storageId } = await response.json();
    // convex-test's storage/storeBlob omits contentType from its _storage row.
    // Verify the actual stored Blob type, then supply the metadata Convex supplies.
    await t.run(async ctx => {
      const typedStorageId = /** @type {import('../convex/_generated/dataModel').Id<'_storage'>} */ (storageId);
      const blob = await ctx.storage.get(typedStorageId);
      expect(blob.type).toBe('image/png');
      await ctx.db.patch(storageId, { contentType: blob.type });
    });
    const other = await t.action(api.auth.login, { pin });
    await expect(t.mutation(api.shop.saveSettings, { token: other.token, name: 'مجمع', intro: '', logoId: storageId })).rejects.toThrow();
    await t.mutation(api.shop.saveSettings, { token, name: 'مجمع اختبار', intro: 'مرحبًا', logoId: storageId });
    expect((await t.query(api.shop.branding, {})).logo).toBeTruthy();
    const replay = await t.fetch(path, { method: 'POST', headers: { Origin: 'https://customer.example' }, body: bytes });
    expect(replay.status).toBe(400);
  });
});
