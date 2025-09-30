import {Resources} from "../../lib/resources/main.js";
import webpush from 'web-push';
import {State} from "./state.js";

export class NotificationPusher {
    constructor() {
        webpush.setVapidDetails(
            `mailto:${Resources.manager().username}`,
            Resources.manager().notificationVapidCredentials.publicKey,
            Resources.manager().notificationVapidCredentials.privateKey
        );
    }

    async sendNotifications(state: State): Promise<void[]> {
        const notificationSubscriptions = Resources.manager().notificationSubscriptions;
        Resources.logger(this).info(`State changed to: ${state}, sending notifications to ${notificationSubscriptions.length} listeners.`);
        return Promise.all(
            notificationSubscriptions.map(
                subscription => this.sendPushNotification(subscription, state)
            )
        )
    }

    async sendPushNotification(subscription: webpush.PushSubscription, state: State) {
        try {
            await webpush.sendNotification(subscription, JSON.stringify(state.serialize()));
        } catch (err) {
            Resources.logger(this).error(`Failed to send notification to subscription: ${err.message}`);
            if (err instanceof webpush.WebPushError) {
                Resources.logger(this).error(`WebPush error: ${err.statusCode} - ${err.body}`);
                if (err.statusCode === 410) {
                    // Subscription is no longer valid, remove it
                    Resources.manager().removeNotificationSubscription(subscription);
                }
            }
        }
    }
}