import {logoBase64} from "../logo.js";

const bellIcon = `<?xml version="1.0" encoding="utf-8"?><svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" width="120.641px" height="122.878px" viewBox="0 0 120.641 122.878" enable-background="new 0 0 120.641 122.878" xml:space="preserve"><g><path fill="#fff" fill-rule="evenodd" clip-rule="evenodd" d="M68.16,6.889c18.129,3.653,31.889,19.757,31.889,38.921 c0,22.594-2.146,39.585,20.592,54.716c-40.277,0-80.366,0-120.641,0C22.8,85.353,20.647,68.036,20.647,45.81 c0-19.267,13.91-35.439,32.182-38.979C53.883-2.309,67.174-2.265,68.16,6.889L68.16,6.889z M76.711,109.19 c-1.398,7.785-8.205,13.688-16.392,13.688c-8.187,0-14.992-5.902-16.393-13.688H76.711L76.711,109.19z"/></g></svg>`;

export abstract class View {
    public asHtml(): string {
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>ICPS Web UI</title>
            <link rel="manifest" href="./manifest.json" />
            <script>
                window.addEventListener("load", function () {
                    if(navigator.serviceWorker) {
                        navigator.serviceWorker
                            .register("./service-worker.js", { scope: "./" })
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

                function navigate(path) {
                    window.location.href = window.location.href + "/../" + path;
                }

                async function getVapidPublicKey() {
                    try {
                        const response = await fetch("api/vapid-public-key");
                        if (!response.ok) {
                            throw new Error("Failed to fetch VAPID public key.");
                        }
                        const data = await response.json();
                        return data.publicKey;
                    } catch (error) {
                        console.error("Error fetching VAPID public key:", error);
                        return null;
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
                                    window.location.reload();
                                } else {
                                    console.warn("No active subscription found to unsubscribe.");
                                }
                                return;
                            }
                            console.error("Failed to subscribe the user: ", error);
                        }
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

                async function sendSubscriptionToServer(subscription) {
                    try {
                        const response = await fetch("api/subscribe", {
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
            </script>
            <style>
                * {
                    box-sizing: border-box;
                }
                html, body {
                    height: 100%;
                    margin: 0;
                    padding: 0;
                }
                body {
                    font-family: Arial, sans-serif;
                    background-color: #f0f0f0;
                    overflow-y: scroll;
                    overflow-x: hidden;
                }
                .container {
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    min-height: 100%;
                    flex-wrap: wrap;
                    padding: 1rem;
                }
                .content {
                    max-width: 26rem;
                    background-color: #fff;
                    overflow: hidden;
                    border-radius: 1rem;
                    box-shadow: 0 0 1rem rgba(0, 0, 0, 0.1);
                }
                .logo {
                    width: 100%;
                    margin: 0 auto;
                }
                .innerContent {
                    padding: 2rem 1rem;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                }
                button {
                    width: 80%;
                    padding: 0.5rem;
                    background-color:rgb(66, 129, 255);
                    color: #fff;
                    border: none;
                    border-radius: 0.5rem;
                    cursor: pointer;
                    margin-top: 1rem;
                    font-size: 1rem;
                }
                button.inverted {
                    background-color: #fff;
                    color: rgb(66, 129, 255);
                    border: 1px solid rgb(66, 129, 255);
                }
                input::-webkit-outer-spin-button,
                input::-webkit-inner-spin-button {
                    -webkit-appearance: none;
                    margin: 0;
                }
                input[type="number"] {
                    -moz-appearance: textfield;
                }

                @media only screen and (orientation: portrait) {
                    html {
                        font-size: 250%;
                    }
                }

                #notificationButton {
                    max-width: 26rem;
                    width: 100%;
                    box-shadow: 0 0 0.5rem rgba(0, 0, 0, 0.2);
                    display: none; /* Initially hidden */
                    align-items: center;
                    justify-content: center;
                    padding: 1rem;
                    margin-top: 0;
                    margin-bottom: 1rem;
                }

                #notificationButton #bellIcon {
                    width: 2rem;
                    height: 2rem;
                    margin-right: 0.5rem;
                }
                #notificationButton #bellIcon svg {
                    width: 100%;
                    height: 100%;
                }
                #notificationButton span {
                    font-size: 1.2rem;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <button id="notificationButton" onclick="requestNotificationPermissions()">
                    <div id="bellIcon" ">
                        ${bellIcon}
                    </div>
                    <span>Enable Notifications</span>
                </button>
                <div class="content">
                    <img src="data:image/png;base64,${logoBase64}" class="logo" alt="ICPS Logo">
                    <div class="innerContent">
                        ${this.content}
                    </div>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    protected abstract get content(): string;
}
