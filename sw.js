// Service worker : cache l'app shell pour un fonctionnement 100% hors-ligne.
// Incrémenter CACHE_VERSION à chaque déploiement pour invalider l'ancien cache.
const CACHE_VERSION = "finance-v40";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  "./js/app.js",
  "./js/db.js",
  "./js/format.js",
  "./js/calculator.js",
  "./js/state.js",
  "./js/seed.js",
  "./js/profile.js",
  "./js/security.js",
  "./js/export.js",
  "./js/util.js",
  "./js/notifications.js",
  "./js/sync.js",
  "./js/components/modal.js",
  "./js/components/icon.js",
  "./js/components/toast.js",
  "./js/views/dashboard.js",
  "./js/views/transactions.js",
  "./js/views/accounts.js",
  "./js/views/categories.js",
  "./js/views/budgets.js",
  "./js/views/statistics.js",
  "./js/views/settings.js",
  "./js/views/pinpad.js",
  "./js/views/recurring.js",
  "./js/views/goals.js",
  "./js/views/projects.js",
  "./js/views/debts.js",
  "./js/views/help.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon-180.png",
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js",
  "https://cdn.jsdelivr.net/npm/lucide@0.294.0/dist/umd/lucide.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

// Un tap sur une notification (échéance de charge/revenu récurrent) ramène au premier plan
// la fenêtre de l'app déjà ouverte, ou en ouvre une nouvelle sinon.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("./index.html");
    })
  );
});
