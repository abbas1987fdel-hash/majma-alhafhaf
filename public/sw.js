// The Pages build prepends a versioned manifest. Never cache customer data here.
const shell = self.__HAFHAF_SHELL__;
const scope = new URL(self.registration.scope);
const cacheName = shell && `hafhaf-shell-${shell.version}`;
self.addEventListener('install', event => {
  if (!shell) return;
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    try {
      await cache.addAll(shell.assets.map(path => new Request(new URL(path, scope), {cache:'reload'})));
    } catch (error) {
      await caches.delete(cacheName);
      throw error;
    }
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  // Keep earlier versions: already-open tabs may still need their lazy chunks.
  event.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (!shell || request.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  const path = url.pathname.slice(scope.pathname.length);
  if (request.mode === 'navigate' && (path === '' || path === 'index.html')) {
    event.respondWith((async () => {
      // HTML and chunks always belong to one completely installed release.
      const cached = await (await caches.open(cacheName)).match(new URL('index.html', scope));
      return cached || fetch(request);
    })());
    return;
  }
  if (!shell.assets.includes(path) && !path.startsWith('assets/')) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(url.pathname) || await caches.match(url.pathname);
    return cached || fetch(request);
  })());
});
