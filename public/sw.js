/**
 * Service worker — exists solely to receive Web Push notifications; it
 * deliberately does no offline caching, since the board is realtime and
 * stale cached order data would be worse than an offline banner (which
 * components/shared/offline-banner already handles).
 *
 * Served from /sw.js so its scope is the whole origin.
 */

// Take over immediately on install rather than waiting for every tab to
// close — a shop tablet may keep the board open for days.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Prime Production Board", body: event.data.text() };
  }

  const { title = "Prime Production Board", body = "", url = "/dashboard", tag } = payload;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      // Same-origin icons; the badge is the monochrome glyph iOS/Android
      // show in the status bar.
      icon: "/logo.jpg",
      badge: "/logo.jpg",
      tag,
      // With a tag set, renotify makes a follow-up on the same subject
      // buzz again instead of silently replacing the old one.
      renotify: Boolean(tag),
      data: { url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/dashboard";

  // Focus an already-open board rather than opening a duplicate tab.
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
