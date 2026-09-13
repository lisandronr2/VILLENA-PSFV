// ═══════════════════════════════════════════════════════════
// SERVICE WORKER — VILLENA PSFV PWA v1
// ═══════════════════════════════════════════════════════════
const SHELL_CACHE  = 'villena-shell-v1';
const SHEETS_CACHE = 'villena-sheets-v1';
const SHELL_FILES  = ['./', './index.html', './manifest.json', './icon.svg'];

// INSTALL — precargar shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL_CACHE)
      .then(c => c.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())   // Activar inmediatamente
  );
});

// ACTIVATE — limpiar caches anteriores
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== SHELL_CACHE && k !== SHEETS_CACHE)
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// FETCH — estrategia según tipo de recurso
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Shell de la app: Cache First (instantáneo) + actualizar en bg
  if (isShell(url)) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        const network = fetch(e.request).then(resp => {
          if (resp && resp.status === 200 && resp.type !== 'opaque') {
            caches.open(SHELL_CACHE).then(c => c.put(e.request, resp.clone()));
          }
          return resp;
        }).catch(() => null);
        return cached || network;
      })
    );
    return;
  }

  // Google Sheets: Network First → caché si offline
  if (isSheets(url)) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .then(resp => {
          if (resp && resp.status === 200 && resp.type !== 'opaque') {
            caches.open(SHEETS_CACHE).then(c => c.put(e.request, resp.clone()));
          }
          return resp;
        })
        .catch(() => caches.match(e.request)
          .then(c => c || new Response('', { status: 503 }))
        )
    );
    return;
  }

  // Resto: network only
  e.respondWith(fetch(e.request).catch(() => new Response('', { status: 503 })));
});

// SKIP WAITING desde la app
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// BACKGROUND SYNC — avisar a la app para que sincronice
self.addEventListener('sync', e => {
  if (e.tag === 'villena-sync') {
    e.waitUntil(notifyClients());
  }
});

async function notifyClients() {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach(c => c.postMessage({ type: 'BACKGROUND_SYNC' }));
}

function isShell(url) {
  return url.includes(self.location.origin) &&
    (url.endsWith('.html') || url.endsWith('.js') || url.endsWith('.json') ||
     url.endsWith('.svg')  || url.endsWith('.png') || url.endsWith('.ico') ||
     url.endsWith('/'));
}
function isSheets(url) {
  return url.includes('docs.google.com/spreadsheets') ||
         url.includes('sheets.googleapis.com');
}
