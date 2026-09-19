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

const validInventoryPassword = (password: string) => password.length >= 4 && password.length <= 64 && password.trim().length > 0;
const verifyInventory = (password: string, reserved: { salt: string; pinHash: string }) => validInventoryPassword(password) && timingSafeEqual(derive(password, reserved.salt), Buffer.from(reserved.pinHash, 'hex'));
export const unlockInventory = action({
  args: { token: v.string(), password: v.string() },
  handler: async (ctx, { token, password }): Promise<{ inventoryToken: string }> => {
    const reserved = await ctx.runMutation(internal.authState.reserveInventory, { token });
    if (!reserved) throw new ConvexError('محاولات كثيرة. حاول بعد 15 دقيقة.');
    if (!verifyInventory(password, reserved)) throw new ConvexError('كلمة سر المخزن غير صحيحة.');
    const next = newSession();
    await ctx.runMutation(internal.authState.finishInventoryLogin, { token, version: reserved.version, digest: next.digest });
    return { inventoryToken: next.token };
  },
});
export const changeInventoryPassword = action({
  args: { token: v.string(), currentPassword: v.string(), newPassword: v.string(), confirmation: v.string() },
  handler: async (ctx, args): Promise<null> => {
    const reserved = await ctx.runMutation(internal.authState.reserveInventory, { token: args.token });
    if (!reserved) throw new ConvexError('محاولات كثيرة. حاول بعد 15 دقيقة.');
    if (!verifyInventory(args.currentPassword, reserved)) throw new ConvexError('كلمة سر المخزن القديمة غير صحيحة.');
    if (!validInventoryPassword(args.newPassword)) throw new ConvexError('اكتب كلمة سر من 4 إلى 64 حرفًا.');
    if (args.newPassword !== args.confirmation) throw new ConvexError('تأكيد كلمة السر غير مطابق.');
    await ctx.runMutation(internal.authState.replaceInventoryPassword, { token: args.token, version: reserved.version, ...credentials(args.newPassword) });
    return null;
  },
});
// Run only during an explicitly approved deployment, after configuring the private environment value.
export const bootstrapInventory = internalAction({
  args: {},
  handler: async (ctx): Promise<{ initialized: boolean }> => {
    const password = process.env.INITIAL_INVENTORY_PASSWORD ?? '';
    if (!validInventoryPassword(password)) throw new ConvexError('INITIAL_INVENTORY_PASSWORD is not configured.');
    return { initialized: await ctx.runMutation(internal.authState.initializeInventory, credentials(password)) };
  },
});
