import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../convex/schema';
import { api, internal } from '../convex/_generated/api';
const modules = import.meta.glob('../convex/**/*.ts');
const customer = { id: 'offline-customer', name: 'علي', phone: '', notes: '' };
const product = { id: 'offline-product', name: 'برغي', buy: 500, sell: 1000, quantity: 10, alert: 2 };
const transaction = { id: 'offline-transaction', customer: customer.id, type: 'debt', items: [{ name: 'برغي', price: 1000 }], amount: 1000, date: '2025-01-02T11:00:00.000Z' };
beforeEach(() => { vi.stubEnv('INITIAL_PIN', '7392'); vi.stubEnv('INITIAL_INVENTORY_PASSWORD', 'stock-test-only'); });
afterEach(() => vi.unstubAllEnvs());
async function setup() {
  const t = convexTest(schema, modules);
  await t.action(internal.auth.bootstrap, {});
  await t.action(internal.auth.bootstrapInventory, {});
  const { token } = await t.action(api.auth.login, { pin: '7392' });
  const { inventoryToken } = await t.action(api.auth.unlockInventory, { token, password: 'stock-test-only' });
  return { t, token, inventoryToken };
}
it('replays customer creates, updates and deletes without incrementing versions or recreating deleted records', async () => {
  const { t, token } = await setup();
  const create = { token, customer, operationId: 'customer-create' };
  await t.mutation(api.shop.saveCustomer, create);
  await t.mutation(api.shop.saveCustomer, create);
  expect((await t.query(api.shop.snapshot, { token })).customers).toEqual([{ ...customer, version: 1 }]);
  const edit = { token, customer: { ...customer, notes: 'ملاحظة' }, expectedVersion: 1, operationId: 'customer-edit' };
  await t.mutation(api.shop.saveCustomer, edit);
  await t.mutation(api.shop.saveCustomer, edit);
  expect((await t.query(api.shop.snapshot, { token })).customers[0].version).toBe(2);
  const remove = { token, kind: 'customer', id: customer.id, expectedVersion: 2, operationId: 'customer-remove' };
  await t.mutation(api.shop.remove, remove);
  await t.mutation(api.shop.remove, remove);
  await t.mutation(api.shop.saveCustomer, create);
  expect((await t.query(api.shop.snapshot, { token })).customers).toEqual([]);
});
it('never doubles offline debt and retains occurrence date, server order and ledger validation', async () => {
  const { t, token } = await setup();
  await t.mutation(api.shop.saveCustomer, { token, customer });
  const create = { token, transaction, operationId: 'transaction-create' };
  await t.mutation(api.shop.saveTransaction, create);
  await t.mutation(api.shop.saveTransaction, create);
  const payment = { ...transaction, id: 'offline-payment', type: 'payment', items: [], amount: 500, date: '2024-01-01T00:00:00.000Z' };
  await t.mutation(api.shop.saveTransaction, { token, transaction: payment, operationId: 'payment-create' });
  const edit = { token, transaction: { ...transaction, items: [{ name: 'برغي', price: 2000 }], amount: 2000 }, expectedVersion: 1, operationId: 'transaction-edit' };
  await t.mutation(api.shop.saveTransaction, edit);
  await t.mutation(api.shop.saveTransaction, edit);
  const snapshot = await t.query(api.shop.snapshot, { token });
  expect(snapshot.transactions.map(tx => tx.id)).toEqual([transaction.id, payment.id]);
  expect(snapshot.transactions[0]).toMatchObject({ date: transaction.date, version: 2 });
  expect(snapshot.transactions.reduce((sum, tx) => sum + (tx.type === 'debt' ? tx.amount : -tx.amount), 0)).toBe(1500);
  await expect(t.mutation(api.shop.remove, { token, kind: 'transaction', id: transaction.id, expectedVersion: 2, operationId: 'harmful-delete' })).rejects.toThrow('يتجاوز');
  const remove = { token, kind: 'transaction', id: payment.id, expectedVersion: 1, operationId: 'payment-delete' };
  await t.mutation(api.shop.remove, remove);
  await t.mutation(api.shop.remove, remove);
  expect((await t.query(api.shop.snapshot, { token })).transactions).toHaveLength(1);
});
it('rejects operation key reuse and preserves version conflicts for new operations', async () => {
  const { t, token } = await setup();
  const args = { token, customer, operationId: 'reuse-operation' };
  await t.mutation(api.shop.saveCustomer, args);
  await expect(t.mutation(api.shop.saveCustomer, { ...args, customer: { ...customer, notes: 'changed' } })).rejects.toThrow('مختلفة');
  await expect(t.mutation(api.shop.remove, { token, kind: 'customer', id: customer.id, expectedVersion: 1, operationId: args.operationId })).rejects.toThrow('مختلفة');
  await expect(t.mutation(api.shop.saveCustomer, { ...args, operationId: 'stale-new-operation' })).rejects.toThrow('تغيّرت');
  expect(await t.run(ctx => ctx.db.query('operationReceipts').collect())).toHaveLength(1);
});
it('checks renewed app and inventory authorization before returning existing receipts', async () => {
  const { t, token, inventoryToken } = await setup();
  const args = { token, inventoryToken, product, operationId: 'product-create' };
  await t.mutation(api.shop.saveProduct, args);
  await t.mutation(api.shop.saveProduct, args);
  const update = { ...args, product: { ...product, quantity: 9 }, expectedVersion: 1, operationId: 'product-update' };
  await t.mutation(api.shop.saveProduct, update);
  await t.mutation(api.shop.saveProduct, update);
  expect((await t.query(api.shop.inventory, { token, inventoryToken })).products[0].version).toBe(2);
  const remove = { token, inventoryToken, kind: 'product', id: product.id, expectedVersion: 2, operationId: 'product-delete' };
  await t.mutation(api.shop.remove, remove);
  await t.mutation(api.shop.remove, remove);
  await expect(t.mutation(api.shop.remove, { ...remove, inventoryToken: '' })).rejects.toThrow();
  await expect(t.mutation(api.shop.saveProduct, { ...args, inventoryToken: '' })).rejects.toThrow();
  await t.mutation(api.shop.logout, { token });
  await expect(t.mutation(api.shop.saveProduct, args)).rejects.toThrow();
  const next = await t.action(api.auth.login, { pin: '7392' });
  const unlocked = await t.action(api.auth.unlockInventory, { ...next, password: 'stock-test-only' });
  await t.mutation(api.shop.saveProduct, { ...args, ...next, ...unlocked });
  expect((await t.query(api.shop.inventory, { ...next, ...unlocked })).products).toEqual([]);
});
it('rejects invalid/future offline dates without committing receipts', async () => {
  const { t, token } = await setup();
  await t.mutation(api.shop.saveCustomer, { token, customer });
  for (const date of ['invalid', '2025-02-30T00:00:00Z', new Date(Date.now() + 60 * 60_000).toISOString()]) {
    await expect(t.mutation(api.shop.saveTransaction, { token, transaction: { ...transaction, date }, operationId: 'bad-date-operation' })).rejects.toThrow();
  }
  expect(await t.run(ctx => ctx.db.query('operationReceipts').collect())).toEqual([]);
  expect((await t.query(api.shop.snapshot, { token })).transactions).toEqual([]);
});
