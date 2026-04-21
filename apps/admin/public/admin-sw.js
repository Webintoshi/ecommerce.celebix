self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  const payload = event.data ? event.data.json() : {};
  const title = payload.title || "Celebix Admin";
  const href = payload.href || "/admin";

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "Yeni bir yönetim bildirimi var.",
      icon: payload.icon || "/pwa/admin-icon.svg",
      badge: payload.badge || "/pwa/admin-icon-maskable.svg",
      tag: payload.tag || payload.type || "admin-notification",
      data: {
        href,
        type: payload.type || null,
        entityType: payload.entityType || null,
        entityId: payload.entityId || null,
      },
      renotify: true,
    }),
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
