// Service worker minimal — requis par les navigateurs pour proposer
// l'installation de la webapp (critère PWA). Ne met rien en cache
// pour l'instant : chaque page est simplement chargée depuis le réseau.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Passthrough réseau — pas de mise en cache pour l'instant.
  event.respondWith(fetch(event.request));
});
