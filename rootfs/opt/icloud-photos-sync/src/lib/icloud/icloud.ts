import log from 'loglevel';

import axios, {AxiosRequestConfig, AxiosRequestHeaders} from 'axios';

import EventEmitter from 'events';
import {MFAServer} from './mfa-server/mfa-server.js';
import * as ICLOUD from './constants.js';
import * as ICLOUD_PHOTOS from './icloud-photos/constants.js';
import * as MFA_SERVER from './mfa-server/constants.js';
import {iCloudPhotos} from './icloud-photos/icloud-photos.js';
import {iCloudAuth} from './auth.js';
import {OptionValues} from 'commander';

/**
 * This class holds the iCloud connection
 * */
export class iCloud extends EventEmitter {
    /**
     * Authentication object of the current iCloud session
     */
    auth: iCloudAuth;

    /**
     * Server object to input MFA code
     */
    mfaServer: MFAServer;

    /**
     * Access to the iCloud Photos service
     */
    photos: iCloudPhotos = null;

    /**
     * Default logger for the class
     */
    logger: log.Logger = log.getLogger(`I-Cloud`);

    /**
     * A promise that will resolve, once the object is ready or reject, in case there is an error
     */
    ready: Promise<void>;

    /**
     * Creates a new iCloud Object
     * @param cliOpts - The read CLI options containing username, password and MFA server port
     */
    constructor(cliOpts: OptionValues) {
        super();
        this.logger.info(`Initiating iCloud connection for ${cliOpts.username}`);

        this.mfaServer = new MFAServer(cliOpts.port);
        this.mfaServer.on(MFA_SERVER.EVENTS.MFA_RECEIVED, this.mfaReceived.bind(this));

        this.auth = new iCloudAuth(cliOpts.username, cliOpts.password, cliOpts.data_dir);

        this.on(ICLOUD.EVENTS.MFA_REQUIRED, () => {
            try {
                this.mfaServer.startServer();
            } catch (err) {
                this.emit(ICLOUD.EVENTS.ERROR, err.message);
            }
        });
        this.on(ICLOUD.EVENTS.AUTHENTICATED, this.getTokens);
        this.on(ICLOUD.EVENTS.TRUSTED, this.getiCloudCookies);
        this.on(ICLOUD.EVENTS.ACCOUNT_READY, this.getiCloudPhotosReady);

        this.on(ICLOUD.EVENTS.READY, () => {
            this.logger.info(`iCloud connection ready!`);
        });

        this.on(ICLOUD.EVENTS.ERROR, (msg: string) => {
            this.logger.error(`Error ocurred: ${msg}`);
            // @todo Retry by calling authenticate()
        });

        this.ready = new Promise<void>((resolve, reject) => {
            this.on(ICLOUD.EVENTS.READY, resolve);
            this.on(ICLOUD.EVENTS.ERROR, reject);
        });
    }

    /**
     * Initiatiates authentication flow
     * Tries to directly login using trustToken, otherwise starts MFA flow
     */
    async authenticate(): Promise<void> {
        this.logger.info(`Authenticating user`);
        this.emit(ICLOUD.EVENTS.AUTHENTICATION_STARTED)

        const config: AxiosRequestConfig = {
            headers: ICLOUD.DEFAULT_AUTH_HEADER,
            params: {
                isRememberMeEnabled: true,
            },
        };

        const data = {
            accountName: this.auth.iCloudAccountSecrets.username,
            password: this.auth.iCloudAccountSecrets.password,
            trustTokens: [
                this.auth.iCloudAccountTokens.trustToken,
            ],
        };

        axios.post(ICLOUD.URL.SIGNIN, data, config)
            .then(res => {
                if (res.status === 200) {
                    this.logger.info(`Authentication successfull`);
                    if (this.auth.processAuthSecrets(res)) {
                        this.logger.debug(`Acquired secrets: ${JSON.stringify(this.auth.iCloudAuthSecrets)}`);
                        this.emit(ICLOUD.EVENTS.TRUSTED);
                    } else {
                        this.emit(ICLOUD.EVENTS.ERROR, `Unable to process auth response and extract necessary secrets: ${this.auth.iCloudAuthSecrets}`);
                    }
                } else {
                    this.emit(ICLOUD.EVENTS.ERROR, `Unexpected HTTP code: ${res.status}`);
                }
            })
            .catch(err => {
                if (err.response) {
                    const res = err.response;
                    if (res.status === 409) {
                        if (this.auth.processAuthSecrets(res)) {
                            this.logger.debug(`Acquired secrets, requiring MFA: ${JSON.stringify(this.auth.iCloudAuthSecrets)}`);
                            this.emit(ICLOUD.EVENTS.MFA_REQUIRED);
                        } else {
                            this.emit(ICLOUD.EVENTS.ERROR, `Unable to process auth response and extract necessary secrets: ${this.auth.iCloudAuthSecrets}`);
                        }
                    } else {
                        this.emit(ICLOUD.EVENTS.ERROR, `Unexpected HTTP code: ${res.status}, ${res.statusText}`);
                    }
                } else {
                    this.emit(ICLOUD.EVENTS.ERROR, `Error during sign-in ${err}`);
                }
            });

        return this.ready;
    }

    /**
     * Enters and validates the MFA code in order to acquire necessary account tokens
     * @param mfa - The MFA code
     */
    mfaReceived(mfa: string) {
        this.mfaServer.stopServer();

        if (!this.auth.validateAuthSecrets()) {
            this.emit(ICLOUD.EVENTS.ERROR, `Unable to process MFA, because auth secrets are missing: ${JSON.stringify(this.auth.iCloudAuthSecrets)}`);
        } else {
            this.logger.info(`Authenticating MFA with code ${mfa}`);

            const config: AxiosRequestHeaders = {
                headers: this.auth.getMFAHeaders(),
            };

            const data = {
                securityCode: {
                    code: `${mfa}`,
                },
            };

            axios.post(ICLOUD.URL.MFA, data, config)
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
        if (!this.auth.validateAuthSecrets()) {
            this.emit(ICLOUD.EVENTS.ERROR, `Unable to get trust tokens, because auth secrets are missing: ${JSON.stringify(this.auth.iCloudAuthSecrets)}`);
        } else {
            this.logger.info(`Trusting device and acquiring trust tokens`);

            const config: AxiosRequestConfig = {
                headers: this.auth.getMFAHeaders(),
            };

            axios.get(ICLOUD.URL.TRUST, config)
                .then(res => {
                    if (this.auth.processAccountTokens(res)) {
                        this.logger.debug(`Acquired account tokens: ${JSON.stringify(this.auth.iCloudAccountTokens)}`);
                        this.emit(ICLOUD.EVENTS.TRUSTED);
                    } else {
                        this.emit(ICLOUD.EVENTS.ERROR, `Unable to process token response and extract necessary secrets: ${JSON.stringify(this.auth.iCloudAccountTokens)}`);
                    }
                })
                .catch(err => {
                    this.emit(ICLOUD.EVENTS.ERROR, `Received error while acquiring trust tokens: ${err}`);
                });
        }
    }

    /**
     * Acquiring necessary cookies from trust and auth token for further processing
     */
    getiCloudCookies() {
        if (!this.auth.validateAccountTokens()) {
            this.emit(ICLOUD.EVENTS.ERROR, `Unable to setup iCloud, because tokens are missing: ${JSON.stringify(this.auth.iCloudAccountTokens)}!`);
        } else {
            this.logger.info(`Setting up iCloud connection`);
            const config: AxiosRequestConfig = {
                headers: ICLOUD.DEFAULT_HEADER,
            };

            const data = this.auth.getSetupData();

            axios.post(ICLOUD.URL.SETUP, data, config)
                .then(res => {
                    if (res.status === 200) {
                        if (this.auth.processCloudSetupResponse(res)) {
                            this.photos = new iCloudPhotos(this.auth);
                            this.logger.debug(`Account ready`);
                            this.emit(ICLOUD.EVENTS.ACCOUNT_READY);
                        } else {
                            this.emit(ICLOUD.EVENTS.ERROR, `Unable to get iCloud Auth Object: ${res.headers[`set-cookie`]}`);
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

    /**
     * Creating iCloud Photos sub-class and linking it
    */
    getiCloudPhotosReady() {
        if (this.photos && this.photos.auth.validateCloudCookies()) {
            this.logger.info(`Getting iCloud Photos Service ready`);

            this.photos.on(ICLOUD_PHOTOS.EVENTS.READY, () => {
                this.emit(ICLOUD.EVENTS.READY);
            });
            this.photos.on(ICLOUD_PHOTOS.EVENTS.ERROR, msg => {
                this.emit(ICLOUD.EVENTS.ERROR, `Error from iCloud Photos: ${msg}`);
            });
            this.photos.on(ICLOUD_PHOTOS.EVENTS.INDEX_IN_PROGRESS, () => {
                this.emit(ICLOUD.EVENTS.ERROR, `iCloud Photos indexing in progress`);
            });

            this.photos.setup();
        } else {
            this.emit(ICLOUD.EVENTS.ERROR, `Unable to setup iCloud Photos, object does not exist!`);
        }
    }
}