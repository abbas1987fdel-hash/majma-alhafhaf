import { ConvexError, v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { customerFields, productFields, transactionFields } from './schema';
import { requireSession, session, settings, digest } from './security';
import { phoneNumber, total, validLedger } from '../lib/ledger';

function text(value: string, label: string, max = 160, optional = false) {
  const result = value.trim();
  if ((!optional && !result) || result.length > max) throw new ConvexError(`تحقق من ${label}.`);
  return result;
}
function integer(value: number, label: string, positive = false, max = 1_000_000_000_000) {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0) || value > max) throw new ConvexError(`تحقق من ${label}.`);
  return value;
}
function identifier(id: string) {
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(id)) throw new ConvexError('معرّف غير صالح.');
}
function version(row: { version: number } | null, expected?: number) {
  if ((row && expected !== row.version) || (!row && expected !== undefined)) throw new ConvexError('تغيّرت البيانات أو حُذفت من جهاز آخر. أغلق النافذة وأعد المحاولة.');
}
function dueDate(value?: string) {
  if (value === undefined) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value + 'T12:00:00Z')) || new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) !== value) throw new ConvexError('تاريخ الاستحقاق غير صالح.');
  return value;
}
const publicRow = <T extends { _id: unknown; _creationTime: number }>(row: T) => {
  const { _id: _ignoredId, _creationTime: _ignoredTime, ...value } = row;
  return value;
};

export const branding = query({
  args: {},
  handler: async ctx => {
    const config = await ctx.db.query('settings').unique();
    return { name: config?.name ?? 'مجمع الهفهاف', logo: config?.logoId ? await ctx.storage.getUrl(config.logoId) : null };
  },
});
export const snapshot = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const active = await session(ctx, token);
    if (!active) return null;
    const config = await settings(ctx);
    const customers = await ctx.db.query('customers').collect();
    const products = await ctx.db.query('products').collect();
    const transactions = await ctx.db.query('transactions').collect();
    return {
      sessionExpires: active.expires,
      customers: customers.map(publicRow), products: products.map(publicRow),
      transactions: transactions.sort((a, b) => a.sequence - b.sequence).map(row => {
        const { sequence: _ignoredSequence, ...value } = publicRow(row);
        return value;
      }),
      settings: { name: config.name, intro: config.intro, logo: config.logoId ? await ctx.storage.getUrl(config.logoId) : null },
    };
  },
});
export const saveCustomer = mutation({
  args: { token: v.string(), customer: v.object(customerFields), expectedVersion: v.optional(v.number()) },
  handler: async (ctx, { token, customer, expectedVersion }) => {
    await requireSession(ctx, token);
    identifier(customer.id);
    const row = await ctx.db.query('customers').withIndex('by_client_id', q => q.eq('id', customer.id)).unique();
    version(row, expectedVersion);
    const phone = text(customer.phone, 'رقم الواتساب', 40, true);
    if (phone && !phoneNumber(phone)) throw new ConvexError('رقم الواتساب غير صالح.');
    const value = { id: customer.id, name: text(customer.name, 'الاسم'), phone, notes: text(customer.notes, 'الملاحظات', 3000, true), version: (row?.version ?? 0) + 1 };
    if (row) await ctx.db.replace(row._id, value);
    else await ctx.db.insert('customers', value);
  },
});
export const saveProduct = mutation({
  args: { token: v.string(), product: v.object(productFields), expectedVersion: v.optional(v.number()) },
  handler: async (ctx, { token, product, expectedVersion }) => {
    await requireSession(ctx, token);
    identifier(product.id);
    const row = await ctx.db.query('products').withIndex('by_client_id', q => q.eq('id', product.id)).unique();
    version(row, expectedVersion);
    const value = { id: product.id, name: text(product.name, 'اسم المادة'), buy: integer(product.buy, 'سعر الشراء'), sell: integer(product.sell, 'سعر البيع'), quantity: integer(product.quantity, 'الكمية', false, 1_000_000_000), alert: integer(product.alert, 'حد التنبيه', false, 1_000_000_000), version: (row?.version ?? 0) + 1 };
    if (row) await ctx.db.replace(row._id, value);
    else await ctx.db.insert('products', value);
  },
});
export const saveTransaction = mutation({
  args: { token: v.string(), transaction: v.object(transactionFields), expectedVersion: v.optional(v.number()) },
  handler: async (ctx, { token, transaction: tx, expectedVersion }) => {
    await requireSession(ctx, token);
    identifier(tx.id);
    const customer = await ctx.db.query('customers').withIndex('by_client_id', q => q.eq('id', tx.customer)).unique();
    if (!customer) throw new ConvexError('الزبون غير موجود.');
    const row = await ctx.db.query('transactions').withIndex('by_client_id', q => q.eq('id', tx.id)).unique();
    version(row, expectedVersion);
    if (row && (row.customer !== tx.customer || row.type !== tx.type)) throw new ConvexError('لا يمكن تغيير الزبون أو نوع المعاملة.');
    if (tx.items.length > 100 || (tx.type === 'debt' && tx.items.length === 0) || (tx.type === 'payment' && tx.items.length !== 0)) throw new ConvexError('بنود المعاملة غير صالحة.');
    const items = tx.items.map(item => ({ name: text(item.name, 'اسم المادة'), price: integer(item.price, 'سعر المادة', true) }));
    const amount = tx.type === 'debt' ? total(items) : tx.amount;
    integer(amount, 'المبلغ', true);
    if (tx.amount !== amount) throw new ConvexError('مجموع المعاملة غير صحيح.');
    const config = await settings(ctx);
    const sequence = row?.sequence ?? config.sequence + 1;
    const value = { id: tx.id, customer: tx.customer, type: tx.type, items, amount, date: row?.date ?? new Date().toISOString(), ...(tx.type === 'debt' && tx.dueDate !== undefined ? { dueDate: dueDate(tx.dueDate) } : {}), sequence, version: (row?.version ?? 0) + 1 };
    const ledger = await ctx.db.query('transactions').withIndex('by_customer', q => q.eq('customer', tx.customer)).collect();
    const next = [...ledger.filter(item => item.id !== tx.id), value].sort((a, b) => a.sequence - b.sequence);
    if (!validLedger(next)) throw new ConvexError('هذه العملية تجعل التسديد يتجاوز الدين.');
    if (row) await ctx.db.replace(row._id, value);
    else {
      await ctx.db.insert('transactions', value);
      await ctx.db.patch(config._id, { sequence });
    }
  },
});
export const remove = mutation({
  args: { token: v.string(), kind: v.union(v.literal('customer'), v.literal('product'), v.literal('transaction')), id: v.string(), expectedVersion: v.number() },
  handler: async (ctx, { token, kind, id, expectedVersion }) => {
    await requireSession(ctx, token);
    if (kind === 'customer') {
      const row = await ctx.db.query('customers').withIndex('by_client_id', q => q.eq('id', id)).unique();
      version(row, expectedVersion);
      if (await ctx.db.query('transactions').withIndex('by_customer', q => q.eq('customer', id)).first()) throw new ConvexError('لا يمكن حذف زبون لديه معاملات.');
      if (row) await ctx.db.delete(row._id);
    } else if (kind === 'product') {
      const row = await ctx.db.query('products').withIndex('by_client_id', q => q.eq('id', id)).unique();
      version(row, expectedVersion);
      if (row) await ctx.db.delete(row._id);
    } else {
      const row = await ctx.db.query('transactions').withIndex('by_client_id', q => q.eq('id', id)).unique();
      version(row, expectedVersion);
      if (!row) return;
      const ledger = await ctx.db.query('transactions').withIndex('by_customer', q => q.eq('customer', row.customer)).collect();
      if (!validLedger(ledger.filter(item => item.id !== id).sort((a, b) => a.sequence - b.sequence))) throw new ConvexError('حذف المعاملة يجعل التسديد يتجاوز الدين.');
      await ctx.db.delete(row._id);
    }
  },
});
export const saveSettings = mutation({
  args: { token: v.string(), name: v.string(), intro: v.string(), logoId: v.optional(v.id('_storage')) },
  handler: async (ctx, { token, name, intro, logoId }) => {
    const active = await requireSession(ctx, token);
    const config = await settings(ctx);
    if (logoId !== undefined && logoId !== config.logoId) {
      const upload = await ctx.db.query('uploads').withIndex('by_storage', q => q.eq('storageId', logoId)).unique();
      if (!upload || upload.session !== active._id) throw new ConvexError('ارفع الشعار من هذه الجلسة أولًا.');
      const metadata = await ctx.db.system.get(logoId);
      if (!metadata || metadata.size > 5 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(metadata.contentType ?? '')) throw new ConvexError('صورة الشعار غير صالحة.');
    }
    await ctx.db.patch(config._id, { name: text(name, 'اسم التطبيق', 80), intro: text(intro, 'مقدمة الرسالة', 2000, true), ...(logoId !== undefined ? { logoId } : {}) });
  },
});
export const uploadUrl = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const active = await requireSession(ctx, token);
    const site = process.env.CONVEX_SITE_URL;
    if (!site) throw new ConvexError('خدمة رفع الصور غير مهيأة.');
    // Convex mutation randomness is deterministic on retries and never exposed except to the authenticated caller.
    const ticket = digest(`${token}:${Date.now()}:${Math.random()}:${Math.random()}`);
    await ctx.db.insert('uploads', { ticket: digest(ticket), session: active._id, expires: Date.now() + 5 * 60_000, claimed: false });
    return `${site}/logo-upload?ticket=${ticket}`;
  },
});
export const logout = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const active = await session(ctx, token);
    if (active) await ctx.db.delete(active._id);
  },
});
