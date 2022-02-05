import log from 'loglevel';
const logger = log.getLogger(`iCloud`);
import EventEmitter from 'events';
import needle from 'needle';

const LOCALE: string = `en_US`;
// Const LANG: string = `en-us`;
const AGENT: string = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.2 Safari/605.1.15`;
const X_APPLE_WIDGET_KEY = `83545bf919730e51dbfba24e7e8a78d2`;
const X_APPLE_I_FD_CLIENT_INFO = {
    U: AGENT,
    L: LOCALE,
    Z: `GMT+02:00`,
    V: `1.1`,
    F: ``,
};

/**
 * This class holds the iCloud connection
 *
 * Emits:
 *   * 'ready' when the instance is authenticated and ready to process requests
 *
 */
export class iCloud extends EventEmitter {
    /**
     * Singleton
     */
    private static _instance: iCloud;

    username: string;
    password: string;
    account: Account = null;
    auth: Auth = {token: null, xAppleTwosvTrustToken: null, cookies: []};

    private constructor(username: string, password: string) {
        super();
        logger.info(`Initiating iCloud connection...`);
        this.username = username;
        this.password = password;
    }

    /**
     * Facilitator function for iCloud
     */
    public static getInstance(username: string, password: string) {
        if (!this._instance) {
            this._instance = new this(username, password);
        }

        return this._instance;
    }

    login() {
        logger.info(`Initiating login`);
        this.getAuthToken(this.username, this.password, (error: any, authToken?: AuthToken) => {
            logger.warn(error);
            logger.info(authToken);
        });
    }

    getAuthToken(username: string, password: string, callback: AuthCallback) {
        const needleOptions = {
            json: true,
            headers: {
                Referer: `https://idmsa.apple.com/appleauth/auth/signin`,
                Accept: `application/json, text/javascript, */*; q=0.01`,
                'User-Agent': AGENT,
                Origin: `https://idmsa.apple.com`,
                'X-Apple-Widget-Key': X_APPLE_WIDGET_KEY,
                'X-Requested-With': `XMLHttpRequest`,
                'X-Apple-I-FD-Client-Info': JSON.stringify(X_APPLE_I_FD_CLIENT_INFO),
            },
        };

        const loginData = {
            accountName: username,
            password,
            rememberMe: true,
            trustTokens: [],
        };

        needle(`post`, `https://idmsa.apple.com/appleauth/auth/signin`, loginData, needleOptions)
            .then(response => {
                logger.debug(`Received response!`);
                const {headers} = response;
                if (`x-apple-session-token` in headers
                    && `x-apple-id-session-id` in headers
                    && `scnt` in headers
                ) {
                    const authToken: AuthToken = {token: response.headers[`x-apple-session-token`], sessionID: response.headers[`x-apple-id-session-id`], scnt: response.headers.scnt, response: response.body};
                    callback(null, authToken);
                } else {
                    callback({error: `Error`});
                }
            })
            .catch(callback);
    }
}

interface AuthCallback {
    (error: any, authToken?: AuthToken): void
}

type AuthToken = {
    token: string,
    sessionID: string,
    scnt: string,
    response: string
}

export type Auth = {
    token: any,
    xAppleTwosvTrustToken: any,
    cookies: any[]
}

type Account = any