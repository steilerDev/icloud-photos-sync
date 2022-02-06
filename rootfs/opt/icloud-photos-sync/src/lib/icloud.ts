import log from 'loglevel';
import EventEmitter from 'events';
import unirest from 'unirest';
import http from 'http';

const CLIENT_ID = `d39ba9916b7251055b22c7f910e2ea796ee65e98b2ddecea8f5dde8d9d1a815d`;
const USER_AGENT = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:97.0) Gecko/20100101 Firefox/97.0`;
const CLIENT_INFO = JSON.stringify({
    U: USER_AGENT,
    L: `en-US`,
    Z: `GMT+01:00`,
    V: `1.1`,
    F: ``,
});

const ENDPOINT = `/mfa`;

/**
 * Header used for authentication
 */
const DEFAULT_AUTH_HEADER = {
    'User-Agent': USER_AGENT,
    Accept: `application/json`,
    Connection: `keep-alive`,
    Origin: `https://idmsa.apple.com`,
    Referer: `https://idmsa.apple.com/`,
    'Accept-Encoding': `gzip, deflate, br`,
    'Content-Type': `application/json`,
    'X-Apple-Widget-Key': CLIENT_ID,
    'X-Apple-OAuth-Client-Id': CLIENT_ID,
    'X-Apple-I-FD-Client-Info': CLIENT_INFO,
    'X-Apple-OAuth-Response-Type': `code`,
    'X-Apple-OAuth-Response-Mode': `web_message`,
    'X-Apple-OAuth-Client-Type': `firstPartyAuth`,
};

enum ICLOUD_EVENTS {
    MFA_REQUIRED = `mfa_req`,
    MFA_RECEIVED = `mfa_rec`,
    AUTHENTICATED = `auth`,
    SETUP_REQUIRED = `setup_req`,
    READY = `ready`,
    ERROR = `error`
}

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

    /**
     * AppleID username
     */
    username: string;

    /**
     * AppleID password
     */
    password: string;

    /**
     * Apple provided variable to identify requests
     */
    scnt: string = ``;

    /**
     * Tracking session during 2FA ('X-Apple-ID-Session-Id')
     */
    sessionID: string = ``;

    /**
     * Token provided to 'trusted' devices who don't require 2FA ('X-Apple-TwoSV-Trust-Token')
     */
    trustToken: string = ``;

    /**
     * Validator for all future transactions ('X-Apple-Session-Token')
     */
    sessionToken: string = ``;

    mfaServer: http.Server;
    logger: log.Logger;

    mfaPort: number;

    private constructor(username: string, password: string, mfaPort: number) {
        super();
        this.logger = log.getLogger(`I-Cloud`);
        this.logger.info(`Initiating iCloud connection...`);
        this.username = username;
        this.password = password;
        this.mfaPort = mfaPort;

        this.on(ICLOUD_EVENTS.ERROR, (msg: string) => {
            this.logger.error(`Error ocurred: ${msg}`);
        });

        this.on(ICLOUD_EVENTS.MFA_REQUIRED, this.mfaRequired);
        this.on(ICLOUD_EVENTS.MFA_RECEIVED, this.mfaReceived);
        this.on(ICLOUD_EVENTS.AUTHENTICATED, this.getTokens);
    }

    /**
     * Facilitator function for iCloud
     * @param mfaPort The port for the MFA receiving server
     */
    public static getInstance(username: string, password: string, mfaPort: number) {
        if (!this._instance) {
            this._instance = new this(username, password, mfaPort);
        }

        return this._instance;
    }

    authenticate() {
        this.logger.info(`Authenticating user`);
        unirest(`POST`, `https://idmsa.apple.com/appleauth/auth/signin`)
            .headers(DEFAULT_AUTH_HEADER)
            .send(JSON.stringify({
                accountName: this.username,
                password: this.password,
                trustTokens: [
                    this.trustToken,
                ],
            }))
            .end(res => {
                if (res.code === 200) {
                    if (res.headers[`x-apple-session-token`]) {
                        this.logger.info(`Authenticated successfully`);
                        this.sessionToken = res.headers[`x-apple-session-token`];
                        this.logger.debug(`Acquired session token: ${this.sessionToken}`);
                        this.emit(ICLOUD_EVENTS.SETUP_REQUIRED);
                    } else {
                        this.emit(ICLOUD_EVENTS.ERROR, `Expected Session Token, but received ${JSON.stringify(res.headers)}`);
                    }
                } else if (res.code === 409) {
                    if (res.headers[`x-apple-id-session-id`] && res.headers.scnt) {
                        this.sessionID = res.headers[`x-apple-id-session-id`];
                        this.scnt = res.headers.scnt;
                        this.logger.debug(`Acquired Session ID (${this.sessionID}) and scnt (${this.scnt})`);
                        this.emit(ICLOUD_EVENTS.MFA_REQUIRED);
                    } else {
                        this.emit(ICLOUD_EVENTS.ERROR, `Expected Session ID and scnt, but received ${JSON.stringify(res.headers)}`);
                    }
                } else {
                    this.emit(ICLOUD_EVENTS.ERROR, `Unexpected HTTP code: ${res.code}`);
                }
            });
    }

    /**
     * This function is triggered, once the MFA code is required. It will spin up a web server to receive MFA code
     * @todo Add functions to re-send code and switch device
     */
    mfaRequired() {
        // Creating a server, that waits for MFA code
        this.mfaServer = http.createServer((req, res) => {
            if (req.url.startsWith(ENDPOINT) && req.url.match(/\?code=\d{6}$/) && req.method === `POST`) {
                log.getLogger(`MFA Server`).debug(`Received MFA: ${req.url}`);

                const mfa: string = req.url.slice(-6);

                res.writeHead(200, {"Content-Type": `application/json`});
                res.write(`Read MFA code: ${mfa}`);
                this.emit(ICLOUD_EVENTS.MFA_RECEIVED, mfa);
                res.end();
            } else {
                log.getLogger(`MFA Server`).warn(`Received unknown request to endpoint ${req.url}`);
                res.writeHead(404, {"Content-Type": `application/json`});
                res.end(JSON.stringify({message: `Route not found`}));
            }
        });

        this.mfaServer.listen(this.mfaPort, () => {
            log.getLogger(`MFA Server`).info(`MFA server started on port ${this.mfaPort}, awaiting POST request on ${ENDPOINT}`);
        });

        this.mfaServer.on(`close`, () => {
            log.getLogger(`MFA Server`).info(`MFA server stopped`);
        });
    }

    mfaReceived(mfa: string) {
        this.mfaServer.close();

        this.logger.debug(`Authenticating MFA with code ${mfa}`);
        if (this.scnt && this.sessionID) {
            unirest(`POST`, `https://idmsa.apple.com/appleauth/auth/verify/trusteddevice/securitycode`)
                .headers({...DEFAULT_AUTH_HEADER,
                    scnt: this.scnt,
                    'X-Apple-ID-Session-Id': this.sessionID,
                })
                .send(JSON.stringify({
                    securityCode: {
                        code: mfa,
                    },
                }))
                .end(res => {
                    if (res.code === 204) {
                        this.logger.info(`MFA code correct!`);
                        this.emit(ICLOUD_EVENTS.AUTHENTICATED);
                    } else {
                        this.emit(ICLOUD_EVENTS.ERROR, res.error);
                    }
                });
        }
    }

    /**
     * Acquires sessionToken and two factor trust token after succesfull authentication
     */
    getTokens() {
        this.logger.info(`Trusting device and acquiring tokens`);
        const req = unirest(`GET`, `https://idmsa.apple.com/appleauth/auth/2sv/trust`)
            .headers({...DEFAULT_AUTH_HEADER, scnt: this.scnt,
                'X-Apple-ID-Session-Id': this.sessionID})
            .end(res => {
                if (res.headers[`x-apple-session-token`]) {
                    if (res.headers[`x-apple-twosv-trust-token`]) {
                        this.trustToken = res.headers[`x-apple-twosv-trust-token`];
                        this.logger.debug(`Acquired trust tokwn: ${this.trustToken}`);
                    }

                    this.sessionToken = res.headers[`x-apple-session-token`];
                    this.logger.debug(`Acquired session token: ${this.sessionToken}`);
                    this.emit(ICLOUD_EVENTS.SETUP_REQUIRED);
                } else {
                    this.emit(ICLOUD_EVENTS.ERROR, `Expected Session Token, but received ${JSON.stringify(res.headers)}`);
                }
            });
    }
}