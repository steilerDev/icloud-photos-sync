import axios, {AxiosRequestConfig, AxiosRequestHeaders} from 'axios';

import EventEmitter from 'events';
import {MFAServer} from './mfa/mfa-server.js';
import * as ICLOUD from './constants.js';
import * as ICLOUD_PHOTOS from './icloud-photos/constants.js';
import * as MFA_SERVER from './mfa/constants.js';
import {iCloudPhotos} from './icloud-photos/icloud-photos.js';
import {iCloudAuth} from './auth.js';
import {OptionValues} from 'commander';
import {getLogger} from '../logger.js';
import {MFAMethod} from './mfa/mfa-method.js';

/**
 * This class holds the iCloud connection
 * */
export class iCloud extends EventEmitter {
    /**
     * Default logger for the class
     */
    private logger = getLogger(this);

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

        // MFA Server & lifecycle management
        this.mfaServer = new MFAServer(cliOpts.port);
        this.mfaServer.on(MFA_SERVER.EVENTS.MFA_RECEIVED, this.mfaReceived.bind(this));
        this.mfaServer.on(MFA_SERVER.EVENTS.MFA_RESEND, this.resendMFA.bind(this));

        // ICloud Auth object
        this.auth = new iCloudAuth(cliOpts.username, cliOpts.password, cliOpts.trustToken, cliOpts.dataDir);
        if (cliOpts.refreshToken) {
            this.logger.info(`Clearing token due to refresh token flag`);
            this.auth.iCloudAccountTokens.trustToken = ``;
        }

        // ICloud lifecycle management
        if (cliOpts.failOnMfa) {
            this.on(ICLOUD.EVENTS.MFA_REQUIRED, () => this.emit(ICLOUD.EVENTS.ERROR, `MFA code required, failing due to failOnMfa flag`));
        } else {
            this.on(ICLOUD.EVENTS.MFA_REQUIRED, () => {
                try {
                    this.mfaServer.startServer();
                } catch (err) {
                    this.emit(ICLOUD.EVENTS.ERROR, err.message);
                }
            });
        }

        this.on(ICLOUD.EVENTS.AUTHENTICATED, this.getTokens);
        this.on(ICLOUD.EVENTS.TRUSTED, this.getiCloudCookies);
        this.on(ICLOUD.EVENTS.ACCOUNT_READY, this.getiCloudPhotosReady);

        this.on(ICLOUD.EVENTS.READY, () => {
            this.logger.info(`iCloud connection ready!`);
        });

        this.on(ICLOUD.EVENTS.ERROR, (msg: string) => {
            this.logger.error(`Error ocurred: ${msg}`);
        });

        this.ready = this.getReady();
    }

    /**
     *
     * @returns - A promise, that will resolve once this objects emits 'READY' or reject if it emits 'ERROR'
     */
    getReady(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.once(ICLOUD.EVENTS.READY, resolve);
            this.once(ICLOUD.EVENTS.ERROR, reject);
        });
    }

    /**
     * Initiatiates authentication flow
     * Tries to directly login using trustToken, otherwise starts MFA flow
     */
    async authenticate(): Promise<void> {
        this.logger.info(`Authenticating user`);
        this.emit(ICLOUD.EVENTS.AUTHENTICATION_STARTED);

        this.auth.validateAccountSecrets();

        const config: AxiosRequestConfig = {
            "headers": ICLOUD.DEFAULT_AUTH_HEADER,
            "params": {
                "isRememberMeEnabled": true,
            },
        };

        const data = {
            "accountName": this.auth.iCloudAccountSecrets.username,
            "password": this.auth.iCloudAccountSecrets.password,
            "trustTokens": [
                this.auth.iCloudAccountTokens.trustToken,
            ],
        };

        axios.post(ICLOUD.URL.SIGNIN, data, config)
            .then(res => {
                if (res.status !== 200) {
                    this.emit(ICLOUD.EVENTS.ERROR, `Unexpected HTTP code: ${res.status}`);
                    return;
                }

                this.logger.info(`Authentication successfull`);
                this.auth.processAuthSecrets(res);
                this.logger.debug(`Acquired secrets: ${JSON.stringify(this.auth.iCloudAuthSecrets)}`);
                this.emit(ICLOUD.EVENTS.TRUSTED);
            })
            .catch(err => {
                const res = err.response;
                if (!res) {
                    this.emit(ICLOUD.EVENTS.ERROR, `Error during sign-in ${err}`);
                    return;
                }

                if (res.status !== 409) {
                    this.emit(ICLOUD.EVENTS.ERROR, `Unexpected HTTP code: ${res.status}`);
                    return;
                }

                this.auth.processAuthSecrets(res);
                this.logger.debug(`Acquired secrets, requiring MFA: ${JSON.stringify(this.auth.iCloudAuthSecrets)}`);
                this.emit(ICLOUD.EVENTS.MFA_REQUIRED, this.mfaServer.port);
            });

        return this.ready;
    }

    /* MFA flow not testable in automation */
    /* c8 ignore start */
    /**
     * This function will ask the iCloud backend, to re-send the MFA token, using the provided method and number
     * @param method - The method to be used
     * @param phoneNumberId - Optionally, the phoneNumberId. Will use ID 1 (first number) per default.
     */
    resendMFA(method: MFAMethod) {
        this.logger.info(`Resending MFA code with ${method}`);

        const config: AxiosRequestHeaders = {
            "headers": this.auth.getMFAHeaders(),
        };

        const data = method.getResendPayload();
        const url = method.getResendURL();

        this.logger.debug(`Requesting MFA code via URL ${url} with data ${JSON.stringify(data)}`);
        axios.put(url, data, config)
            .then(res => {
                if (!method.resendSuccesfull(res)) {
                    this.emit(ICLOUD.EVENTS.ERROR, `Unable to request new MFA code: ${JSON.stringify(res)}`);
                    return;
                }

                if (method.isSMS() || method.isVoice()) {
                    this.logger.info(`Sucesfully requested new MFA code using phone ${res.data.trustedPhoneNumber.numberWithDialCode}`);
                } else {
                    this.logger.info(`Sucesfully requested new MFA code using ${res.data.trustedDeviceCount} trusted device(s)`);
                }
            })
            .catch(err => {
                this.emit(ICLOUD.EVENTS.ERROR, `Received error while trying to resend MFA code: ${method.processResendError(err)}`);
            });
    }
    /* c8 ignore stop */

    /* MFA flow not testable in automation */
    /* c8 ignore start */
    /**
     * Enters and validates the MFA code in order to acquire necessary account tokens
     * @param mfa - The MFA code
     */
    mfaReceived(method: MFAMethod, mfa: string) {
        this.mfaServer.stopServer();
        this.auth.validateAuthSecrets();
        this.logger.info(`Authenticating MFA with code ${mfa}`);

        const config: AxiosRequestHeaders = {
            "headers": this.auth.getMFAHeaders(),
        };

        const data = method.getEnterPayload(mfa);
        const url = method.getEnterURL();

        this.logger.debug(`Entering MFA code via URL ${url} with data ${JSON.stringify(data)}`);
        axios.post(url, data, config)
            .then(res => { // Weird difference in response code, depending on endpoint
                if (!method.enterSuccesfull(res)) {
                    this.emit(ICLOUD.EVENTS.ERROR, `Received unexpected response code during MFA validation: ${res.status} (${res.statusText})`);
                    return;
                }

                this.logger.info(`MFA code correct!`);
                this.emit(ICLOUD.EVENTS.AUTHENTICATED);
            })
            .catch(err => {
                this.emit(ICLOUD.EVENTS.ERROR, `Received error during MFA validation: ${err}`);
            });
    }
    /* c8 ignore stop */

    /* This is only called as part of non-testable MFA flow */
    /* c8 ignore start */
    /**
     * Acquires sessionToken and two factor trust token after succesfull authentication
     */
    getTokens() {
        this.auth.validateAuthSecrets();
        this.logger.info(`Trusting device and acquiring trust tokens`);

        const config: AxiosRequestConfig = {
            "headers": this.auth.getMFAHeaders(),
        };

        axios.get(ICLOUD.URL.TRUST, config)
            .then(res => this.auth.processAccountTokens(res))
            .then(() => {
                this.logger.debug(`Acquired account tokens: ${JSON.stringify(this.auth.iCloudAccountTokens)}`);
                this.emit(ICLOUD.EVENTS.TRUSTED);
            })
            .catch(err => {
                this.emit(ICLOUD.EVENTS.ERROR, `Received error while acquiring trust tokens: ${err}`);
            });
    }
    /* c8 ignore stop */

    /**
     * Acquiring necessary cookies from trust and auth token for further processing & gets the user specific domain to interact with the Photos backend
     */
    getiCloudCookies() {
        this.auth.validateAccountTokens();
        this.logger.info(`Setting up iCloud connection`);
        const config: AxiosRequestConfig = {
            "headers": ICLOUD.DEFAULT_HEADER,
        };

        const data = this.auth.getSetupData();

        axios.post(ICLOUD.URL.SETUP, data, config)
            .then(res => {
                if (res.status !== 200) {
                    this.emit(ICLOUD.EVENTS.ERROR, `Received unexpected response code during iCloud Setup: ${res.status} (${res.statusText})`);
                    return;
                }

                this.auth.processCloudSetupResponse(res);
                this.photos = new iCloudPhotos(this.auth);
                this.logger.debug(`Account ready`);
                this.emit(ICLOUD.EVENTS.ACCOUNT_READY);
            })
            .catch(err => {
                this.emit(ICLOUD.EVENTS.ERROR, `Received error during iCloud Setup: ${err}`);
            });
    }

    /**
     * Creating iCloud Photos sub-class and linking it
    */
    getiCloudPhotosReady() {
        this.auth.validateCloudCookies();
        if (!this.photos) {
            this.emit(ICLOUD.EVENTS.ERROR, `Unable to setup iCloud Photos, object does not exist!`);
        }

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
    }
}