import log from 'loglevel';
import EventEmitter from 'events';
import unirest from 'unirest';
import {MFAServer} from './icloud.mfa-server.js';
import * as ICLOUD from './icloud.constants.js';

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

    /**
     * Server object to input MFA code
     */
    mfaServer: MFAServer;

    /**
     * Holding the cookies necessary for authentication
     */
    cookieJar = unirest.jar();

    logger: log.Logger = log.getLogger(`I-Cloud`);

    private constructor(username: string, password: string, mfaPort: number) {
        super();
        this.logger.info(`Initiating iCloud connection`);
        this.logger.debug(`Using ${username}, ${password}, ${mfaPort}`);
        this.username = username;
        this.password = password;
        this.mfaServer = new MFAServer(mfaPort, this);

        this.on(ICLOUD.EVENTS.ERROR, (msg: string) => {
            this.logger.error(`Error ocurred: ${msg}`);
        });

        this.on(ICLOUD.EVENTS.MFA_REQUIRED, () => {
            this.mfaServer.startServer();
        });
        this.on(ICLOUD.EVENTS.MFA_RECEIVED, this.mfaReceived);
        this.on(ICLOUD.EVENTS.AUTHENTICATED, this.getTokens);
        this.on(ICLOUD.EVENTS.SETUP_REQUIRED, this.setupICloud);
        this.on(ICLOUD.EVENTS.READY, () => {
            this.logger.info('iCloud connection ready!')
        });
    }

    /**
     * Facilitator function for iCloud
     * @param mfaPort - The port for the MFA receiving server
     */
    public static getInstance(username: string, password: string, mfaPort: number) {
        if (!this._instance) {
            this._instance = new this(username, password, mfaPort);
        }

        return this._instance;
    }

    authenticate() {
        this.logger.info(`Authenticating user`);
        unirest(`POST`, `${ICLOUD.AUTH_ENDPOINT}/signin`)
            .headers(ICLOUD.DEFAULT_AUTH_HEADER)
            .jar(this.cookieJar)
            .send(JSON.stringify({
                accountName: this.username,
                password: this.password,
                trustTokens: [
                    this.trustToken,
                ],
            }))
            .end(res => {
                if (res.code === 200) {
                    if (res.headers[ICLOUD.AUTH_RESPONSE_HEADER.SESSION_TOKEN]) {
                        this.logger.info(`Authenticated successfully`);
                        this.sessionToken = res.headers[ICLOUD.AUTH_RESPONSE_HEADER.SESSION_TOKEN];
                        this.logger.debug(`Acquired session token: ${this.sessionToken}`);
                        this.emit(ICLOUD.EVENTS.SETUP_REQUIRED);
                    } else {
                        this.emit(ICLOUD.EVENTS.ERROR, `Expected Session Token, but received ${JSON.stringify(res.headers)}`);
                    }
                } else if (res.code === 409) {
                    if (res.headers[ICLOUD.AUTH_RESPONSE_HEADER.SESSION_TOKEN] && res.headers.scnt) {
                        this.sessionID = res.headers[ICLOUD.AUTH_RESPONSE_HEADER.SESSION_TOKEN];
                        this.scnt = res.headers.scnt;
                        this.logger.debug(`Acquired Session ID (${this.sessionID}) and scnt (${this.scnt})`);
                        this.emit(ICLOUD.EVENTS.MFA_REQUIRED);
                    } else {
                        this.emit(ICLOUD.EVENTS.ERROR, `Expected Session ID and scnt, but received ${JSON.stringify(res.headers)}`);
                    }
                } else if (res.code === 401) {
                    this.emit(ICLOUD.EVENTS.ERROR, `401 (Unauthorized): username/password does not match!`);
                } else {
                    this.emit(ICLOUD.EVENTS.ERROR, `Unexpected HTTP code: ${res.code}`);
                }
            });
    }

    /**
     * Enter the MFA code and finalize authentication
     * @param mfa - The MFA code
     */
    mfaReceived(mfa: string) {
        this.mfaServer.stopServer();

        this.logger.debug(`Authenticating MFA with code ${mfa}`);

        if (this.scnt && this.sessionID) {
            const header = {...ICLOUD.DEFAULT_AUTH_HEADER,
                scnt: this.scnt,
                'X-Apple-ID-Session-Id': this.sessionID};

            unirest(`POST`, `${ICLOUD.AUTH_ENDPOINT}/verify/trusteddevice/securitycode`)
                .headers(header)
                .jar(this.cookieJar)
                .send({
                    securityCode: {
                        code: `${mfa}`,
                    },
                })
                .end(res => {
                    if (res.code === 204) {
                        this.logger.info(`MFA code correct!`);
                        this.emit(ICLOUD.EVENTS.AUTHENTICATED);
                    } else {
                        this.logger.debug(`Received error during MSA validation: ${JSON.stringify(res.headers)}`);
                        this.emit(ICLOUD.EVENTS.ERROR, res.error);
                    }
                });
        }
    }

    /**
     * Acquires sessionToken and two factor trust token after succesfull authentication
     */
    getTokens() {
        this.logger.info(`Trusting device and acquiring tokens`);
        unirest(`GET`, `${ICLOUD.AUTH_ENDPOINT}/2sv/trust`)
            .headers({...ICLOUD.DEFAULT_AUTH_HEADER,
                scnt: this.scnt,
                'X-Apple-ID-Session-Id': this.sessionID})
            .jar(this.cookieJar)
            .end(res => {
                if (res.headers[ICLOUD.AUTH_RESPONSE_HEADER.SESSION_TOKEN]) {
                    this.sessionToken = res.headers[ICLOUD.AUTH_RESPONSE_HEADER.SESSION_TOKEN];
                    this.logger.debug(`Acquired session token: ${this.sessionToken}`);

                    if (res.headers[ICLOUD.AUTH_RESPONSE_HEADER.TRUST_TOKEN]) {
                        this.trustToken = res.headers[ICLOUD.AUTH_RESPONSE_HEADER.TRUST_TOKEN];
                        this.logger.debug(`Acquired trust tokwn: ${this.trustToken}`);
                    }

                    this.emit(ICLOUD.EVENTS.SETUP_REQUIRED);
                } else {
                    this.emit(ICLOUD.EVENTS.ERROR, `Expected Session Token, but received ${JSON.stringify(res.headers)}`);
                }
            });
    }

    /**
     * Acquiring necessary cookies from session token for further processing
     */
    setupICloud() {
        this.logger.info(`Setting up iCloud connection`);
        this.cookieJar = unirest.jar();
        unirest(`POST`, ICLOUD.SETUP_ENDPOINT)
            .headers(ICLOUD.DEFAULT_SETUP_HEADER)
            .jar(this.cookieJar)
            .send(JSON.stringify({
                dsWebAuthToken: this.sessionToken,
                trustToken: this.trustToken,
            }))
            .end(res => {
                if (res.code === 200) {
                    res.body.apps.photos
                    this.emit(ICLOUD.EVENTS.READY)
                } else {
                    this.emit(ICLOUD.EVENTS.ERROR, `Got non-200 response while setting up iCloud connection: ${res.code} (${res.error})`)
                }
            });
    }
}