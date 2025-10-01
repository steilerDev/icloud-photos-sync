/**
 * This script registers the service worker and exposes the requestNotificationPermissions() function, which will perform the necessary handshake to subscribe to push events
 */
export const notificationHandlerScript = (basePath: string) => `
window.addEventListener("load", function () {
    if(navigator.serviceWorker) {
        navigator.serviceWorker
            .register("/service-worker.js", { scope: "/" })
            .then(function () {
                console.log("Service Worker Registered");
            });
        if (Notification.permission === "granted") {
            // If notifications are already granted, subscribe the user
            console.log("Notification permission already granted. Subscribing user to push notifications.");
            subscribeUserToPush();
        } else {
            // If notifications are not granted, show the notification button
            console.log("Notification permission not granted. Showing notification button.");
            document.getElementById("notificationButton").style.display = "flex";
        }
    } else {
        console.warn("Service Worker not supported in this browser.");
    }
});

async function requestNotificationPermissions() {
    if (!("Notification" in window)) {
        // check if this is safari on iOS
        if (navigator.userAgent.includes("Safari") && !navigator.userAgent.includes("Chrome")) {
            alert("iOS devices only support notifications for applications added to the home screen. Please add this page to your home screen using the share button and try again.");
            return;
        }
        alert("This browser does not support notifications.");
        return;
    }
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
        // Hide the notification button after permission is granted
        document.getElementById("notificationButton").style.display = "none";

        console.log("Notification permission granted. Subscribing user to push notifications.");
        alert("Notification permission granted. If you want to modify or revert this, do so in your system's notification settings.");

        subscribeUserToPush();
    } else {
        console.log("Notification permission denied.");
        alert("Notification permission denied. If you weren't asked, you denied permission in the past and need to enable them in your system's notification settings.");
    }
}
    async function subscribeUserToPush() {
    const registration = await navigator.serviceWorker.ready;
    try {
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(
                await getVapidPublicKey()
            ),
        });
        console.log("User is subscribed:", subscription);
        sendSubscriptionToServer(subscription);
    } catch (error) {
        if (!window.Notification || Notification.permission === 'denied') {
            console.warn('Notifications are blocked. Showing notification button.');
            document.getElementById("notificationButton").style.display = "flex";
        } else {
            if(error.code == 11) {
                // probably the server key has changed
                const subscription = await registration.pushManager.getSubscription();
                if (subscription) {
                    await subscription.unsubscribe();
                    console.log("Unsubscribed from push notifications due to InvalidStateError.");
                    reload()
                } else {
                    console.warn("No active subscription found to unsubscribe.");
                }
                return;
            }
            console.error("Failed to subscribe the user: ", error);
        }
    }
}

async function sendSubscriptionToServer(subscription) {
    console.log("Sending subscription to server: " + JSON.stringify(subscription))
    try {
        const response = await fetch("${basePath}/api/subscribe", {
            method: "POST",
            body: JSON.stringify(subscription),
            headers: {
                "Content-Type": "application/json"
            }
        });
        if (!response.ok) {
            throw new Error("Failed to send subscription to server.");
        }
        console.log("Subscription sent to server:", subscription);
    } catch (error) {
        console.error("Error sending subscription to server:", error);
    }
}

async function getVapidPublicKey() {
    try {
        const response = await fetch("${basePath}/api/vapid-public-key");
        if (!response.ok) {
            throw new Error("Failed to fetch VAPID public key.");
        }
        const data = await response.json();
        console.log("Fetched public key: " + data.publicKey)
        return data.publicKey;
    } catch (error) {
        console.error("Error fetching VAPID public key:", error);
        return null;
    }
}

function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}
`