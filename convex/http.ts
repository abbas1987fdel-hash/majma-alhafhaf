import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { internal } from './_generated/api';

const http = httpRouter();
function headers(request: Request) {
  const origin = request.headers.get('Origin');
  const allowed = [process.env.APP_ORIGIN, process.env.DEV_APP_ORIGIN].filter(Boolean);
  if (!origin || !allowed.includes(origin)) return null;
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin', 'Cache-Control': 'no-store' };
}
http.route({ path: '/logo-upload', method: 'OPTIONS', handler: httpAction(async (_ctx, request) => {
  const cors = headers(request);
  return new Response(null, { status: cors ? 204 : 403, ...(cors ? { headers: cors } : {}) });
}) });
http.route({ path: '/logo-upload', method: 'POST', handler: httpAction(async (ctx, request) => {
  const cors = headers(request);
  if (!cors) return new Response('Forbidden', { status: 403 });
  const ticket = new URL(request.url).searchParams.get('ticket');
  if (!ticket || !/^[a-f0-9]{64}$/.test(ticket)) return new Response('Invalid upload', { status: 400, headers: cors });
  let storageId;
  try {
    const uploadId = await ctx.runMutation(internal.uploads.claim, { ticket });
    if (Number(request.headers.get('Content-Length')) > 5 * 1024 * 1024) throw new Error('size');
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new Error('size');
    let type: string;
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) type = 'image/jpeg';
    else if ([137,80,78,71,13,10,26,10].every((value, i) => bytes[i] === value)) type = 'image/png';
    else if (new TextDecoder().decode(bytes.slice(0,4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8,12)) === 'WEBP') type = 'image/webp';
    else throw new Error('format');
    storageId = await ctx.storage.store(new Blob([bytes], { type }));
    await ctx.runMutation(internal.uploads.complete, { uploadId, storageId });
    return Response.json({ storageId }, { headers: cors });
  } catch {
    if (storageId) await ctx.storage.delete(storageId);
    return new Response('تعذر رفع الصورة. أعد تسجيل الدخول واستخدم صورة PNG أو JPEG أو WebP حتى 5 ميغابايت.', { status: 400, headers: cors });
  }
}) });
export default http;
