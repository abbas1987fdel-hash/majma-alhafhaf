import { v, ConvexError } from 'convex/values';
import { internalMutation } from './_generated/server';
import { requireSession, settings } from './security';

// Reservation commits before the expensive password comparison, including failures.
export const reserve = internalMutation({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, { token }) => {
    if (token !== undefined) await requireSession(ctx, token);
    const config = await settings(ctx);
    const key = token === undefined ? 'login' : 'changePin';
    const row = await ctx.db.query('attempts').withIndex('by_key', q => q.eq('key', key)).unique();
    const now = Date.now();
    if (row && now - row.start < 15 * 60_000 && row.count >= 5) return null;
    if (!row) await ctx.db.insert('attempts', { key, start: now, count: 1 });
    else await ctx.db.patch(row._id, now - row.start >= 15 * 60_000 ? { start: now, count: 1 } : { count: row.count + 1 });
    return { salt: config.salt, pinHash: config.pinHash, authVersion: config.authVersion };
  },
});
export const initialize = internalMutation({
  args: { salt: v.string(), pinHash: v.string() },
  handler: async (ctx, args) => {
    if (await ctx.db.query('settings').unique()) return false;
    await ctx.db.insert('settings', { ...args, name: 'مجمع الهفهاف', intro: 'أهلًا بكم، إليكم تفاصيل حسابكم. شكرًا لتعاملكم معنا.', authVersion: 1, sequence: 0 });
    return true;
  },
});
export const finishLogin = internalMutation({
  args: { authVersion: v.number(), digest: v.string() },
  handler: async (ctx, args) => {
    const config = await settings(ctx);
    if (config.authVersion !== args.authVersion) throw new ConvexError('تغيّر الرمز. حاول مجددًا.');
    await ctx.db.insert('sessions', { ...args, expires: Date.now() + 12 * 60 * 60_000 });
    const limit = await ctx.db.query('attempts').withIndex('by_key', q => q.eq('key', 'login')).unique();
    if (limit) await ctx.db.delete(limit._id);
  },
});
export const replacePin = internalMutation({
  args: { token: v.string(), authVersion: v.number(), salt: v.string(), pinHash: v.string(), digest: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);
    const config = await settings(ctx);
    if (config.authVersion !== args.authVersion) throw new ConvexError('تغيّر الرمز. حاول مجددًا.');
    const nextVersion = config.authVersion + 1;
    await ctx.db.patch(config._id, { salt: args.salt, pinHash: args.pinHash, authVersion: nextVersion });
    await ctx.db.insert('sessions', { digest: args.digest, authVersion: nextVersion, expires: Date.now() + 12 * 60 * 60_000 });
    const limit = await ctx.db.query('attempts').withIndex('by_key', q => q.eq('key', 'changePin')).unique();
    if (limit) await ctx.db.delete(limit._id);
  },
});
