// ═══════════════════════════════════════════════════════
// Service Worker — Desayunos PWA
// Estrategia:
//  - Apps Script (datos): SIEMPRE network, NUNCA cache → datos siempre frescos
//  - Archivos de la app: cache-first → carga rápida aunque la red esté lenta
// ═══════════════════════════════════════════════════════

const CACHE_NAME = 'desayunos-v1';

// Archivos locales que se precachean al instalar la app
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon_192x192.png',
  './icons/icon_512x512.png'
];

// ── INSTALL ── precachear estáticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ── limpiar caches viejas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH ── la regla principal
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Solo GET
  if (event.request.method !== 'GET') return;

  // 1) Apps Script / Google Sheets → NETWORK ONLY (nunca cachear)
  if (
    url.hostname === 'script.google.com' ||
    url.hostname.endsWith('.googleusercontent.com') ||
    url.hostname === 'sheets.googleapis.com'
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 2) Mismo origen (los archivos de la app en GitHub Pages) → CACHE FIRST
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((resp) => {
          // Guardamos en cache para próxima vez
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, copy));
          return resp;
        });
      })
    );
    return;
  }

  // 3) Recursos externos (fuentes Google, Tabler Icons, Leaflet, tiles del mapa)
  //    → STALE WHILE REVALIDATE: devolvemos cache si hay, y actualizamos en background
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((resp) => {
          if (resp && resp.status === 200) {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, copy));
          }
          return resp;
        })
        .catch(() => cached); // si falla la red, usamos el cache
      return cached || fetchPromise;
    })
  );
});
