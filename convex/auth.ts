'use node';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { bytesToHex } from '@noble/hashes/utils.js';
import { ConvexError, v } from 'convex/values';
import { action, internalAction } from './_generated/server';
import { internal } from './_generated/api';

const normalizePin = (pin: string) => pin.replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776)).trim();
const derive = (pin: string, salt: string) => scryptSync(pin, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
const credentials = (pin: string) => {
  const salt = bytesToHex(randomBytes(32));
  return { salt, pinHash: bytesToHex(derive(pin, salt)) };
};
const newSession = () => {
  const token = bytesToHex(randomBytes(32));
  return { token, digest: createHash('sha256').update(token).digest('hex') };
};
const verify = (pin: string, reserved: { salt: string; pinHash: string }) => /^[0-9]{4,8}$/.test(pin) && timingSafeEqual(derive(pin, reserved.salt), Buffer.from(reserved.pinHash, 'hex'));

export const login = action({
  args: { pin: v.string() },
  handler: async (ctx, { pin }): Promise<{ token: string }> => {
    const reserved = await ctx.runMutation(internal.authState.reserve, {});
    if (!reserved) throw new ConvexError('محاولات كثيرة. حاول بعد 15 دقيقة.');
    if (!verify(normalizePin(pin), reserved)) throw new ConvexError('الرمز غير صحيح.');
    const next = newSession();
    await ctx.runMutation(internal.authState.finishLogin, { authVersion: reserved.authVersion, digest: next.digest });
    return { token: next.token };
  },
});
export const changePin = action({
  args: { token: v.string(), currentPin: v.string(), newPin: v.string() },
  handler: async (ctx, args): Promise<{ token: string }> => {
    const reserved = await ctx.runMutation(internal.authState.reserve, { token: args.token });
    if (!reserved) throw new ConvexError('محاولات كثيرة. حاول بعد 15 دقيقة.');
    if (!verify(normalizePin(args.currentPin), reserved)) throw new ConvexError('الرمز الحالي غير صحيح.');
    const normalized = normalizePin(args.newPin);
    if (!/^[0-9]{4,8}$/.test(normalized)) throw new ConvexError('اكتب رمزًا من 4 إلى 8 أرقام.');
    const next = newSession();
    await ctx.runMutation(internal.authState.replacePin, { token: args.token, authVersion: reserved.authVersion, ...credentials(normalized), digest: next.digest });
    return { token: next.token };
  },
});
// CLI-only internal bootstrap; it never overwrites an existing shop or password.
export const bootstrap = internalAction({
  args: {},
  handler: async (ctx): Promise<{ initialized: boolean }> => {
    const pin = normalizePin(process.env.INITIAL_PIN ?? '');
    if (!/^[0-9]{4,8}$/.test(pin)) throw new ConvexError('INITIAL_PIN is not configured.');
    return { initialized: await ctx.runMutation(internal.authState.initialize, credentials(pin)) };
  },
});
