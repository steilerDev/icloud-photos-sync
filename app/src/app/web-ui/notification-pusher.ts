import {Resources} from "../../lib/resources/main.js";
import webpush from 'web-push';
import {SerializedState, StateTrigger, StateType} from "../../lib/resources/state-manager.js";
import {iCPSState} from "../../lib/resources/events-types.js";

export class NotificationPusher {
    constructor() {
        webpush.setVapidDetails(
            `mailto:${Resources.manager().username}`,
            Resources.manager().notificationVapidCredentials.publicKey,
            Resources.manager().notificationVapidCredentials.privateKey
        );

        Resources.events(this).on(iCPSState.STATE_CHANGED, (state: SerializedState) => {
            if((state.state === StateType.READY   && state.prevTrigger === StateTrigger.SYNC) || 
               (state.state === StateType.BLOCKED && state.progressMsg === `Waiting for MFA code...`)) {
                this.sendNotifications(state);
            } 
        });
    }

    async sendNotifications(state: SerializedState): Promise<void[]> {
        const notificationSubscriptions = Resources.manager().notificationSubscriptions;
        Resources.logger(this).info(`State changed to: ${state.state}, sending notifications to ${notificationSubscriptions.length} listeners.`);
        return Promise.all(
            notificationSubscriptions.map(
                subscription => this.sendPushNotification(subscription, state)
            )
        )
    }

    async sendPushNotification(subscription: webpush.PushSubscription, state: SerializedState) {
        try {
            Resources.logger(this).debug(`Sending notification to ${subscription.endpoint}`);
            await webpush.sendNotification(subscription, JSON.stringify(state));
        } catch (err) {
            Resources.logger(this).error(`Failed to send notification to subscription: ${err.message}`);
            if (err instanceof webpush.WebPushError) {
                Resources.logger(this).error(`WebPush error: ${err.statusCode} - ${err.body}`);
                if (err.statusCode === 410) {
                    // Subscription is no longer valid, remove it
                    Resources.logger(this).warn(`Removing subscription, because it has expired`);
                    Resources.manager().removeNotificationSubscription(subscription);
                }
            }
        }
    }
}