export const serviceWorker = `
self.addEventListener("install", (_event) => {
    console.log("Service_Worker_Installing...")
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    console.log("Service_Worker_Activated");
    event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
    if(event.request.method !== "GET") return;
    if(event.request.mode !== 'navigate' && event.request.destination !== 'document') return;

    // Use a "State while revalidate" strategy to cache HTML pages
    event.respondWith(
        caches.open("offline").then((cache) => {
            return cache.match(event.request).then((cachedResponse) => {
                const networkResponse = fetch(event.request).then((networkResponse) => {
                    cache.put(event.request, networkResponse.clone());
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
        state: "error",
        errorMessage: "Failed to retrieve push notification from pushed data.."
    };

    if(data.state == "error") {
        self.registration.showNotification("iCloud Photo Sync failed", {
            body: data.errorMessage || "An error occurred during the iCloud Photo Sync process.",
            icon: "./icon.png",
            vibrate: [200, 100, 200],
            tag: "error-notification"
        });

        Navigator.setAppBadge(1);
        return;
    }

    if(data.state == "success") {
        self.registration.showNotification("iCloud Photo Sync completed successfully", {
            body: "The iCloud Photo Sync recovered from error.",
            icon: "./icon.png",
            vibrate: [200, 100, 200],
            tag: "success-notification"
        });
        Navigator.setAppBadge(0);
        return;
    }
});
`;