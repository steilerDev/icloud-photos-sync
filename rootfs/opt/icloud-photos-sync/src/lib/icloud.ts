import log from 'loglevel';

import axios, {AxiosInstance} from 'axios';
import {wrapper} from 'axios-cookiejar-support';
import {CookieJar} from 'tough-cookie';

import EventEmitter from 'events';
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
     * Asset URL for iCloud Photo Service
     */
    photoURL: string = ``;

    /**
     * Server object to input MFA code
     */
    mfaServer: MFAServer;

    /**
     * HTTP Client with cookie support
     */
    client: AxiosInstance = wrapper(axios.create({jar: new CookieJar()}));

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
            this.logger.info(`MFA code required`);
            this.mfaServer.startServer();
        });
        this.on(ICLOUD.EVENTS.MFA_RECEIVED, this.mfaReceived);
        this.on(ICLOUD.EVENTS.AUTHENTICATED, this.getTokens);
        this.on(ICLOUD.EVENTS.TRUSTED, this.setupICloud);
        this.on(ICLOUD.EVENTS.READY, () => {
            this.logger.info(`iCloud connection ready!`);
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

        const config = {
            headers: ICLOUD.DEFAULT_AUTH_HEADER,
        };

        const data = {
            accountName: this.username,
            password: this.password,
            trustTokens: [
                this.trustToken,
            ],
        };

        this.client.post(ICLOUD.URL.SIGNIN, data, config)
            .then(res => {
                if (res.status === 200) {
                    if (res.headers[ICLOUD.AUTH_RESPONSE_HEADER.SESSION_TOKEN]) {
                        this.logger.info(`Authenticated successfully`);
                        this.sessionToken = res.headers[ICLOUD.AUTH_RESPONSE_HEADER.SESSION_TOKEN];
                        this.logger.debug(`Acquired session token: ${this.sessionToken}`);
                        this.emit(ICLOUD.EVENTS.TRUSTED);
                    } else {
                        this.emit(ICLOUD.EVENTS.ERROR, `Expected Session Token, but received ${JSON.stringify(res.headers)}`);
                    }
                } else {
                    this.emit(ICLOUD.EVENTS.ERROR, `Unexpected HTTP code: ${res.status}`);
                }
            })
            .catch(err => {
                if (err.response) {
                    const res = err.response;
                    if (res.status === 409) {
                        if (res.headers[ICLOUD.AUTH_RESPONSE_HEADER.SESSION_TOKEN] && res.headers.scnt) {
                            this.sessionID = res.headers[ICLOUD.AUTH_RESPONSE_HEADER.SESSION_TOKEN];
                            this.scnt = res.headers.scnt;
                            this.logger.debug(`Acquired Session ID (${this.sessionID}) and scnt (${this.scnt})`);
                            this.emit(ICLOUD.EVENTS.MFA_REQUIRED);
                        } else {
                            this.emit(ICLOUD.EVENTS.ERROR, `Expected Session ID and scnt, but received ${JSON.stringify(res.headers)}`);
                        }
                    } else if (res.status === 401) {
                        this.emit(ICLOUD.EVENTS.ERROR, `401 (Unauthorized): username/password does not match!`);
                    } else {
                        this.emit(ICLOUD.EVENTS.ERROR, `Unexpected HTTP code: ${res.status}`);
                    }
                } else {
                    this.emit(ICLOUD.EVENTS.ERROR, `Error during sign-in ${err}`);
                }
            });
    }

    /**
     * Enter the MFA code and finalize authentication
     * @param mfa - The MFA code
     */
    mfaReceived(mfa: string) {
        this.mfaServer.stopServer();

        if (!this.scnt) {
            this.emit(ICLOUD.EVENTS.ERROR, `Unable to process MFA, because scnt is missing!`);
        } else if (!this.sessionID) {
            this.emit(ICLOUD.EVENTS.ERROR, `Unable to process MFA, because sessionID is missing!`);
        } else if (!mfa) {
            this.emit(ICLOUD.EVENTS.ERROR, `Unable to process MFA, because mfa code is missing!`);
        } else {
            this.logger.info(`Authenticating MFA with code ${mfa}`);

            const config = {
                headers: {...ICLOUD.DEFAULT_AUTH_HEADER,
                    scnt: this.scnt,
                    'X-Apple-ID-Session-Id': this.sessionID,
                },
            };

            const data = {
                securityCode: {
                    code: `${mfa}`,
                },
            };

            this.client.post(ICLOUD.URL.MFA, data, config)
                .then(res => {
                    if (res.status === 204) {
                        this.logger.info(`MFA code correct!`);
                        this.emit(ICLOUD.EVENTS.AUTHENTICATED);
                    } else {
                        this.emit(ICLOUD.EVENTS.ERROR, `Received unexpected response code during MFA validation: ${res.status} (${res.statusText})`);
                    }
                })
                .catch(err => {
                    this.emit(ICLOUD.EVENTS.ERROR, `Received error during MFA validation: ${err}`);
                });
        }
    }

    /**
     * Acquires sessionToken and two factor trust token after succesfull authentication
     */
    getTokens() {
        if (!this.scnt) {
            this.emit(ICLOUD.EVENTS.ERROR, `Unable to get trust tokens, because scnt is missing!`);
        } else if (!this.sessionID) {
            this.emit(ICLOUD.EVENTS.ERROR, `Unable to get trust tokens, because sessionID is missing!`);
        } else {
            this.logger.info(`Trusting device and acquiring trust tokens`);
        }

        const config = {
            headers: {...ICLOUD.DEFAULT_AUTH_HEADER,
                scnt: this.scnt,
                'X-Apple-ID-Session-Id': this.sessionID,
            },
        };

        this.client.get(ICLOUD.URL.TRUST, config)
            .then(res => {
                if (res.headers[ICLOUD.AUTH_RESPONSE_HEADER.SESSION_TOKEN]) {
                    this.sessionToken = res.headers[ICLOUD.AUTH_RESPONSE_HEADER.SESSION_TOKEN];
                    this.logger.debug(`Acquired session token: ${this.sessionToken}`);
                } else {
                    this.emit(ICLOUD.EVENTS.ERROR, `Unable to get session token, because it is not present in response: ${JSON.stringify(res.headers)}`);
                    return;
                }

                if (res.headers[ICLOUD.AUTH_RESPONSE_HEADER.TRUST_TOKEN]) {
                    this.trustToken = res.headers[ICLOUD.AUTH_RESPONSE_HEADER.TRUST_TOKEN];
                    this.logger.debug(`Acquired trust tokwn: ${this.trustToken}`);
                } else {
                    this.emit(ICLOUD.EVENTS.ERROR, `Unable to get trust token, because it is not present in response: ${JSON.stringify(res.headers)}`);
                    return;
                }

                this.emit(ICLOUD.EVENTS.TRUSTED);
            })
            .catch(err => {
                this.emit(ICLOUD.EVENTS.ERROR, `Received error while acquiring trust tokens: ${err}`);
            });
    }

    /**
     * Acquiring necessary cookies from session token for further processing
     */
    setupICloud() {
        if (!this.sessionToken) {
            this.emit(ICLOUD.EVENTS.ERROR, `Unable to setup iCloud, because session token is missing!`);
        } else if (!this.trustToken) {
            this.emit(ICLOUD.EVENTS.ERROR, `Unable to setup iCloud, because trust token is missing!`);
        } else {
            this.logger.info(`Setting up iCloud connection`);
            const config = {
                headers: ICLOUD.DEFAULT_SETUP_HEADER,
            };

            const data = {
                dsWebAuthToken: this.sessionToken,
                trustToken: this.trustToken,
            };

            this.client.post(ICLOUD.URL.SETUP, data, config)
                .then(res => {
                    if (res.status === 200) {
                        const {url} = res.data.webservices.ckdatabasews;
                        if (!url) {
                            this.emit(ICLOUD.EVENTS.ERROR, `Unable to parse iCloud Photos URL: ${res.data}`);
                        } else {
                            this.photoURL = url;
                            this.logger.info(`Setup succesfull!`);
                            this.emit(ICLOUD.EVENTS.READY);
                        }
                    } else {
                        this.emit(ICLOUD.EVENTS.ERROR, `Received unexpected response code during iCloud Setup: ${res.status} (${res.statusText})`);
                    }
                })
                .catch(err => {
                    this.emit(ICLOUD.EVENTS.ERROR, `Received error during iCloud Setup: ${err}`);
                });
        }
    }
}