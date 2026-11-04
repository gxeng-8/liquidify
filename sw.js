const CACHE = 'liquidify-v1';

self.addEventListener('install', ev => {
  ev.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(['./', 'index.html', 'style.css', 'app.js']))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', ev => {
  ev.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// internet first (so updates show up), saved copy when offline
self.addEventListener('fetch', ev => {
  if (ev.request.method !== 'GET') return;

  ev.respondWith(
    fetch(ev.request)
      .then(res => {
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(ev.request, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(ev.request, { ignoreSearch: true })
          .then(hit => hit || caches.match('index.html'))
      )
  );
});