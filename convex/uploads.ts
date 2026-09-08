import { v, ConvexError } from 'convex/values';
import { internalMutation } from './_generated/server';
import { digest, settings } from './security';

export const claim = internalMutation({
  args: { ticket: v.string() },
  handler: async (ctx, { ticket }) => {
    const row = await ctx.db.query('uploads').withIndex('by_ticket', q => q.eq('ticket', digest(ticket))).unique();
    if (!row || row.claimed || row.expires <= Date.now()) throw new ConvexError('طلب الرفع منتهي أو غير صالح.');
    const active = await ctx.db.get(row.session);
    const config = await settings(ctx);
    if (!active || active.expires <= Date.now() || active.authVersion !== config.authVersion) throw new ConvexError('انتهت الجلسة.');
    await ctx.db.patch(row._id, { claimed: true });
    return row._id;
  },
});
export const complete = internalMutation({
  args: { uploadId: v.id('uploads'), storageId: v.id('_storage') },
  handler: async (ctx, { uploadId, storageId }) => {
    const row = await ctx.db.get(uploadId);
    if (!row || !row.claimed || row.storageId || row.expires <= Date.now()) throw new ConvexError('انتهى طلب الرفع.');
    const active = await ctx.db.get(row.session);
    const config = await settings(ctx);
    if (!active || active.expires <= Date.now() || active.authVersion !== config.authVersion) throw new ConvexError('انتهت الجلسة.');
    await ctx.db.patch(uploadId, { storageId });
  },
});
