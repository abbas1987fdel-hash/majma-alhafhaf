import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { ConvexError } from 'convex/values';
import type { QueryCtx } from './_generated/server';
export const digest = (value: string) => bytesToHex(sha256(new TextEncoder().encode(value)));
export async function settings(ctx: QueryCtx) {
  const value = await ctx.db.query('settings').unique();
  if (!value) throw new ConvexError('التطبيق قيد التجهيز، حاول لاحقًا.');
  return value;
}
export async function session(ctx: QueryCtx, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const found = await ctx.db.query('sessions').withIndex('by_digest', q => q.eq('digest', digest(token))).unique();
  if (!found || found.expires <= Date.now()) return null;
  const config = await settings(ctx);
  return found.authVersion === config.authVersion ? found : null;
}
export async function requireSession(ctx: QueryCtx, token: string) {
  const found = await session(ctx, token);
  if (!found) throw new ConvexError('انتهت الجلسة. أدخل رمز الدخول مجددًا.');
  return found;
}
