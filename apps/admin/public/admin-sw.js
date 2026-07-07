const SHELL_CACHE = "celebix-admin-shell-v4";
const RUNTIME_CACHE = "celebix-admin-runtime-v4";
const PRECACHE_URLS = [
  "/manifest.webmanifest",
  "/pwa/admin-icon.svg",
  "/pwa/admin-icon-maskable.svg",
  "/Logo/celebix-beyaz-logo.svg",
  "/branding/toshi-mascot.png",
  "/branding/toshi-mascot-launcher.png",
  "/branding/toshi-profile.png",
  "/branding/celebix-x.svg",
];

function shouldCacheRuntimeAsset(url, request) {
  if (url.origin !== self.location.origin) {
    return false;
  }

  if (url.pathname.startsWith("/api/")) {
    return false;
  }

  if (url.pathname.startsWith("/_next/image")) {
    return false;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    return true;
  }

  if (PRECACHE_URLS.includes(url.pathname)) {
    return true;
  }

  return ["image", "style", "script", "font"].includes(request.destination);
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);

  return cached || networkPromise;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => null)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => ![SHELL_CACHE, RUNTIME_CACHE].includes(key))
          .map((key) => caches.delete(key)),
      );

      if ("navigationPreload" in self.registration) {
        try {
          await self.registration.navigationPreload.enable();
        } catch {
          // Navigation preload is best-effort only.
        }
      }

      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  if (event.data?.type === "CLEAR_BADGE") {
    const badgeNavigator = self.navigator;

    if (typeof badgeNavigator?.clearAppBadge === "function") {
      event.waitUntil(badgeNavigator.clearAppBadge().catch(() => null));
    }
  }
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const url = new URL(event.request.url);
  if (!shouldCacheRuntimeAsset(url, event.request)) {
    return;
  }

  event.respondWith(staleWhileRevalidate(event.request));
});

self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || "Celebix Admin";
  const href = payload.href || "/admin";
  const badgeCount = Number(payload.badgeCount || payload.unreadCount || 0);

  event.waitUntil(
    (async () => {
      const badgeNavigator = self.navigator;

      if (badgeCount > 0 && typeof badgeNavigator?.setAppBadge === "function") {
        try {
          await badgeNavigator.setAppBadge(badgeCount);
        } catch {
          // ignore badge failures
        }
      }

      await self.registration.showNotification(title, {
        body: payload.body || "Yeni bir yönetim bildirimi var.",
        icon: payload.icon || "/pwa/admin-icon.svg",
        badge: payload.badge || "/pwa/admin-icon-maskable.svg",
        tag: payload.tag || payload.type || "admin-notification",
        requireInteraction: payload.type === "payment_failed",
        renotify: true,
        data: {
          href,
          type: payload.type || null,
          entityType: payload.entityType || null,
          entityId: payload.entityId || null,
          badgeCount,
        },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data?.href || "/admin";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const matchingClient = clients.find((client) => {
        try {
          return new URL(client.url).pathname.startsWith("/admin");
        } catch {
          return false;
        }
      });

      if (matchingClient) {
        matchingClient.focus();
        if ("navigate" in matchingClient) {
          return matchingClient.navigate(href);
        }
        return matchingClient;
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(href);
      }

      return null;
    }),
  );
});
