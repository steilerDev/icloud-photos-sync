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
    // only use responses from cache, if network request fails
    if (event.request.method === "GET") {
        // Use a "Network First" strategy for HTML pages
        event.respondWith(
            fetch(event.request)
                .then(networkResponse => {
                    // If the request is for a navigation or the initial page load, we can cache the response
                    if (event.request.mode === 'navigate' || event.request.destination === 'document') {
                        return caches.open("offline").then(cache => {
                            cache.put(event.request, networkResponse.clone());
                            return networkResponse;
                        });
                    }
                    // For other requests, we can return the network response directly
                    return networkResponse;
                }).catch((networkError) => {
                    // If the request wasn't for a navigation or the initial page load, we don't try to return the response from the cache
                    // this duplicate check is needed here, because we have an API endpoint and a view that are both served from the same URL with different accepted content types
                    if (event.request.destination !== 'document' && event.request.mode !== 'navigate') {
                        throw networkError;
                    }
                    
                    return caches.open("offline").then((cache) => {
                        return cache.match(event.request).then((response) => {
                            if(response) {
                                return response;
                            }
                            // Fallback for navigation requests
                            if (event.request.mode === 'navigate') {
                                // redirect to /state
                                return cache.match('/state').then((fallbackResponse) => {
                                    if (fallbackResponse) {
                                        return fallbackResponse;
                                    }
                                    // If no cached response is found, throw an error
                                    throw new Error("No cached response found for " + event.request.url);
                                });
                            }
                            console.warn("Service Worker: Network request failed and no cached response found for " + event.request.url, networkError);
                            throw networkError;
                        });
                    });
                })
        );
    }
});
`;