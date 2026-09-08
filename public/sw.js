// Online-only: no customer data or application assets are stored in Cache Storage.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request, {cache:'no-store'}).catch(() => new Response('<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>مجمع الهفهاف</title><body style="background:#101723;color:white;font:18px Arial;padding:32px"><h1>مجمع الهفهاف</h1><p>يلزم اتصال بالإنترنت لفتح هذه النسخة.</p><button onclick="location.reload()">إعادة المحاولة</button></body></html>',{headers:{'Content-Type':'text/html; charset=utf-8'}})));
  }
});
