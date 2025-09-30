/**
 * Expected data for a push subscription
 */
export type PushSubscription = {
    /**
     * The Push Subscription Endpoint
     * @minLength 1
     */
    endpoint: string;
    expirationTime?: number;
    keys: {
        /**
         * @minLength 1
         */
        p256dh: string;
        /**
         * @minLength 1
         */
        auth: string;
    };
}