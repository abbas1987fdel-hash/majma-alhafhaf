import { expect, it } from 'vitest';
import { Vault, applyOperation, drain } from '../lib/offline';
import { convexTest } from 'convex-test';
import schema from '../convex/schema';
import { api, internal } from '../convex/_generated/api';
const modules = import.meta.glob('../convex/**/*.ts');
const empty = { customers: [], products: [], transactions: [], settings: { name: 'تجربة', intro: '', logo: null }, sessionExpires: 0 };
const customer = { id: 'customer-offline', name: 'علي حسن', phone: '', notes: '' };
const create = { method: 'saveCustomer', operationId: 'offline-create-customer', args: { customer } };
function disk() {
  const rows = new Map(); let fail = false;
  return { rows, setFail: value => { fail = value; }, async get(id) { return structuredClone(rows.get(id)); }, async put(id, value) { if (fail) throw Error('disk full'); rows.set(id, structuredClone(value)); } };
}
async function queue(vault, operation) {
  await vault.update(state => ({ ...state, snapshot: applyOperation(state.snapshot, operation), pending: [...state.pending, operation] }));
}
it('encrypts data and credentials, survives reopen, and rejects wrong secrets or vault substitution', async () => {
  const store = disk(), vault = await Vault.create(store, 'accounts', 'test-secret', empty, 'private-token');
  await queue(vault, create);
  expect(JSON.stringify([...store.rows.values()])).not.toContain('علي');
  expect(JSON.stringify([...store.rows.values()])).not.toContain('private-token');
  const reopened = await Vault.open(store, 'accounts', 'test-secret');
  expect(reopened.state.snapshot.customers).toEqual([{ ...customer, version: 1 }]);
  expect(reopened.state.pending).toEqual([create]);
  await expect(Vault.open(store, 'accounts', 'wrong-secret')).rejects.toThrow();
  store.rows.set('inventory', store.rows.get('accounts'));
  await expect(Vault.open(store, 'inventory', 'test-secret')).rejects.toThrow();
});
it('does not claim a failed disk write was saved, including failed password rotation', async () => {
  const store = disk(), vault = await Vault.create(store, 'accounts', 'old-test', empty, '');
  store.setFail(true);
  await expect(queue(vault, create)).rejects.toThrow('disk full');
  expect(vault.state.pending).toHaveLength(0);
  await expect(vault.rekey('new-test')).rejects.toThrow('disk full');
  store.setFail(false);
  expect((await Vault.open(store, 'accounts', 'old-test')).state.snapshot.customers).toEqual([]);
  await queue(vault, create);
  expect((await Vault.open(store, 'accounts', 'old-test')).state.pending).toHaveLength(1);
});
it('serializes edits and password rotation without losing encrypted state', async () => {
  const store = disk(), vault = await Vault.create(store, 'accounts', 'old-test', empty, '');
  await Promise.all([queue(vault, create), vault.rekey('new-test')]);
  await expect(Vault.open(store, 'accounts', 'old-test')).rejects.toThrow();
  expect((await Vault.open(store, 'accounts', 'new-test')).state.pending).toEqual([create]);
  const update = { method: 'saveCustomer', operationId: 'offline-customer-edit', args: { customer: { ...customer, notes: 'بعد التعديل' }, expectedVersion: 1 } };
  await queue(vault, update);
  expect((await Vault.open(store, 'accounts', 'new-test')).state.snapshot.customers[0]).toMatchObject({ notes: 'بعد التعديل', version: 2 });
});
it('preserves unsent queue on a lost response and drains exactly once against the real backend', async () => {
  const t = convexTest(schema, modules);
  process.env.INITIAL_PIN = '7392';
  await t.action(internal.auth.bootstrap, {});
  delete process.env.INITIAL_PIN;
  const { token } = await t.action(api.auth.login, { pin: '7392' });
  const store = disk(), vault = await Vault.create(store, 'accounts', 'secret', empty, token);
  await queue(vault, create);
  const debt = { method: 'saveTransaction', operationId: 'offline-debt-create', args: { transaction: { id: 'offline-debt-id', customer: customer.id, type: 'debt', items: [{ name: 'مادة', price: 2000 }], amount: 2000, date: '2025-01-01T00:00:00.000Z' } } };
  const payment = { method: 'saveTransaction', operationId: 'offline-payment-create', args: { transaction: { id: 'offline-payment-id', customer: customer.id, type: 'payment', items: [], amount: 500, date: '2025-01-02T00:00:00.000Z' } } };
  await queue(vault, debt); await queue(vault, payment);
  const send = op => t.mutation(api.shop[op.method], { token, ...op.args, operationId: op.operationId });
  const snapshot = () => t.query(api.shop.snapshot, { token });
  await expect(drain(vault, async op => { await send(op); throw Error('lost response'); }, snapshot, () => {})).rejects.toThrow('lost response');
  expect(vault.state.pending).toHaveLength(3);
  const restarted = await Vault.open(store, 'accounts', 'secret');
  await drain(restarted, send, snapshot, () => {});
  const result = await snapshot();
  expect(result.customers).toHaveLength(1);
  expect(result.transactions).toHaveLength(2);
  expect(result.transactions.reduce((sum, tx) => sum + (tx.type === 'debt' ? tx.amount : -tx.amount), 0)).toBe(1500);
  expect((await Vault.open(store, 'accounts', 'secret')).state.pending).toHaveLength(0);
});
it('keeps conflict data for review and rejects local overpayment and stale edits', async () => {
  const store = disk(), vault = await Vault.create(store, 'accounts', 'secret', empty, '');
  await queue(vault, create);
  await expect(drain(vault, async () => { throw Error('version conflict'); }, async () => empty, () => {})).rejects.toThrow('version conflict');
  expect((await Vault.open(store, 'accounts', 'secret')).state.pending).toHaveLength(1);
  const overpayment = { method: 'saveTransaction', operationId: 'bad-payment', args: { transaction: { id: 'bad-payment-id', customer: customer.id, type: 'payment', items: [], amount: 500, date: '2025-01-01T00:00:00Z' } } };
  await expect(queue(vault, overpayment)).rejects.toThrow('يتجاوز');
  await expect(queue(vault, create)).rejects.toThrow('تغيّرت');
  expect(vault.state.pending).toHaveLength(1);
});
