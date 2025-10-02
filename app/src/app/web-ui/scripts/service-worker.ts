export const serviceWorker = (basePath: string) => `
/**
 * Service Worker for iCloud Photos Sync Web UI
 * Caches static assets and handles push notifications
 */
self.addEventListener("install", (_event) => {
    console.log("Service_Worker_Installing...")
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    console.log("Service_Worker_Activated");
    event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
    // only cache requests that don't contain /api/ in the path
    if (event.request.url.includes("/api/")) return;

    // Use a "State while revalidate" strategy to cache HTML pages
    event.respondWith(
        caches.open("offline").then((cache) => {
            return cache.match(event.request).then((cachedResponse) => {
                const networkResponse = fetch(${basePath}event.request).then((networkResponse) => {
                    cache.put(${basePath}event.request, networkResponse.clone());
                    return networkResponse;
                });
                return cachedResponse || networkResponse;
            });
        })
    );
});

self.addEventListener("push", (event) => {
    console.log("Push notification received:", event);
    const data = event.data?.json() ?? {
        state: "ready",
        prevError: {
            message: "Failed to retrieve push notification from pushed data!"
        }
    };

    console.log('Presenting notification: ' + JSON.stringify(data))

    let title = "iCloud Photo Sync"
    let body = ""
    let badge = 0

    switch(data.state) {
        case 'ready':
            if(data.prevError) {
                title = "iCloud Photo Sync failed"
                body = "Last " + (data.prevTrigger ?? "operation") + " failed: " + data.prevError.message
            } else {
                title = "iCloud Photo Sync succeeded"
                body = "Last " + (data.prevTrigger ?? "operation") + " succeeded!"
            }
            if(data.nextSync) {
                body += " Next sync scheduled for " + new Date(data.nextSync).toLocaleString()
            }
            break;
        case 'mfa_required':
            title = "iCloud Photo Sync requires MFA code"
            body = "In order to continue operation, please provide a valid MFA code"
            badge = 1
            break;
        default:
        case 'syncing':
        case 'authenticating':
            break;
    }

    self.registration.showNotification(title, {
        body,
        icon: "/icon.png"
    });

    Navigator.setAppBadge(badge);
});
`;