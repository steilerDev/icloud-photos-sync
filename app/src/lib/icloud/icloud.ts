import axios, {Axios, AxiosRequestConfig, AxiosRequestHeaders} from 'axios';
import EventEmitter from 'events';
import {MFAServer} from './mfa/mfa-server.js';
import * as ICLOUD from './constants.js';
import * as ICLOUD_PHOTOS from './icloud-photos/constants.js';
import * as MFA_SERVER from './mfa/constants.js';
import {iCloudPhotos} from './icloud-photos/icloud-photos.js';
import {iCloudAuth} from './auth.js';
import {getLogger} from '../logger.js';
import {MFAMethod} from './mfa/mfa-method.js';
import {iCloudApp} from '../../app/app-icloud.js';

/**
 * This class holds the iCloud connection
 * The authentication flow -followed by this class- is documented in a [Miro Board](https://miro.com/app/board/uXjVOxcisIM=/?share_link_id=646572552229).
 */
export class iCloud extends EventEmitter {
    /**
     * Default logger for the class
     */
    logger = getLogger(this);

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
     * Local axios instance to handle network requests
     */
    axios: Axios;

    /**
     * Creates a new iCloud Object
     * @param app - The app object holding CLI options containing username, password and MFA server port
     */
    constructor(app: iCloudApp) {
        super();
        this.logger.info(`Initiating iCloud connection`);
        this.logger.trace(`  - user: ${app.options.username}`);

        this.axios = (axios as unknown as Axios);

        // MFA Server & lifecycle management
        this.mfaServer = new MFAServer(app.options.port);
        this.mfaServer.on(MFA_SERVER.EVENTS.MFA_RECEIVED, this.submitMFA.bind(this));
        this.mfaServer.on(MFA_SERVER.EVENTS.MFA_RESEND, this.resendMFA.bind(this));

        // ICloud Auth object
        this.auth = new iCloudAuth(app.options.username, app.options.password, app.options.trustToken, app.options.dataDir);
        if (app.options.refreshToken) {
            this.logger.info(`Clearing token due to refresh token flag`);
            this.auth.iCloudAccountTokens.trustToken = ``;
        }

        // ICloud lifecycle management
        if (app.options.failOnMfa) {
            this.on(ICLOUD.EVENTS.MFA_REQUIRED, () => {
                this.emit(ICLOUD.EVENTS.ERROR, `MFA code required, failing due to failOnMfa flag`);
            });
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

        this.axios.post(ICLOUD.URL.SIGNIN, data, config)
            .then(res => {
                if (res.status !== 200) {
                    this.emit(ICLOUD.EVENTS.ERROR, `Unexpected HTTP code: ${res.status}`);
                    return;
                }

                this.logger.info(`Authentication successfull`);
                try {
                    this.auth.processAuthSecrets(res);
                    this.logger.debug(`Acquired secrets`);
                    this.logger.trace(`  - secrets: ${JSON.stringify(this.auth.iCloudAuthSecrets)}`);
                } catch (err) {
                    this.emit(ICLOUD.EVENTS.ERROR, err.message);
                }

                this.emit(ICLOUD.EVENTS.TRUSTED);
            })
            .catch(err => {
                const res = err.response;
                if (!res) {
                    this.emit(ICLOUD.EVENTS.ERROR, `No response received during authentication: ${err.message}`);
                    return;
                }

                if (res.status !== 409) {
                    this.emit(ICLOUD.EVENTS.ERROR, `Unexpected HTTP code: ${res.status}`);
                    return;
                }

                try {
                    this.auth.processAuthSecrets(res);
                } catch (err) {
                    this.emit(ICLOUD.EVENTS.ERROR, err.message);
                }

                this.logger.debug(`Acquired secrets, requiring MFA`);
                this.logger.trace(`  - secrets: ${JSON.stringify(this.auth.iCloudAuthSecrets)}`);
                this.emit(ICLOUD.EVENTS.MFA_REQUIRED, this.mfaServer.port);
            });

        return this.ready;
    }

    /**
     * This function will ask the iCloud backend, to re-send the MFA token, using the provided method and number
     * @param method - The method to be used
     * @returns A promise that resolves once all activity has been completed
     */
    async resendMFA(method: MFAMethod) {
        this.logger.info(`Resending MFA code with ${method}`);

        const config: AxiosRequestHeaders = {
            "headers": this.auth.getMFAHeaders(),
        };

        const data = method.getResendPayload();
        const url = method.getResendURL();

        this.logger.debug(`Requesting MFA code via URL ${url} with data ${JSON.stringify(data)}`);
        return this.axios.put(url, data, config)
            .then(res => {
                if (!method.resendSuccesfull(res)) {
                    this.emit(ICLOUD.EVENTS.ERROR, `Unable to request new MFA code: ${JSON.stringify(res)}`);
                    return;
                }

                if (method.isSMS() || method.isVoice()) {
                    this.logger.info(`Sucesfully requested new MFA code using phone ${res.data.trustedPhoneNumber.numberWithDialCode}`);
                    return;
                }

                if (method.isDevice()) {
                    this.logger.info(`Sucesfully requested new MFA code using ${res.data.trustedDeviceCount} trusted device(s)`);
                }
            })
            .catch(err => {
                this.emit(ICLOUD.EVENTS.ERROR, `Received error while trying to resend MFA code: ${method.processResendError(err)}`);
            });
    }

    /**
     * Enters and validates the MFA code in order to acquire necessary account tokens
     * @param mfa - The MFA code
     */
    async submitMFA(method: MFAMethod, mfa: string) {
        this.mfaServer.stopServer();
        this.logger.info(`Authenticating MFA with code ${mfa}`);

        const config: AxiosRequestHeaders = {
            "headers": this.auth.getMFAHeaders(),
        };

        const data = method.getEnterPayload(mfa);
        const url = method.getEnterURL();

        this.logger.debug(`Entering MFA code via URL ${url} with data ${JSON.stringify(data)}`);
        return this.axios.post(url, data, config)
            .then(res => {
                if (!method.enterSuccesfull(res)) {
                    this.emit(ICLOUD.EVENTS.ERROR, `Received unexpected response code during MFA validation: ${res.status} (${res.statusText})`);
                    return;
                }

                this.logger.info(`MFA code correct!`);
                this.emit(ICLOUD.EVENTS.AUTHENTICATED);
            })
            .catch(err => this.emit(ICLOUD.EVENTS.ERROR, `Received error during MFA validation: ${err.message}`));
    }

    /**
     * Acquires sessionToken and two factor trust token after succesfull authentication
     */
    async getTokens() {
        this.auth.validateAuthSecrets();
        this.logger.info(`Trusting device and acquiring trust tokens`);

        const config: AxiosRequestConfig = {
            "headers": this.auth.getMFAHeaders(),
        };

        return this.axios.get(ICLOUD.URL.TRUST, config)
            .then(res => {
                try {
                    this.auth.processAccountTokens(res);
                } catch (err) {
                    this.emit(ICLOUD.EVENTS.ERROR, err.message);
                    return;
                }

                this.logger.debug(`Acquired account tokens`);
                this.logger.trace(`  - tokens: ${JSON.stringify(this.auth.iCloudAccountTokens)}`);
                this.emit(ICLOUD.EVENTS.TRUSTED);
            })
            .catch(err => {
                this.emit(ICLOUD.EVENTS.ERROR, `Received error while acquiring trust tokens: ${err.message}`);
            });
    }

    /**
     * Acquiring necessary cookies from trust and auth token for further processing & gets the user specific domain to interact with the Photos backend
     * If trustToken has recently been acquired, this function can be used to reset the iCloud Connection
     */
    async getiCloudCookies() {
        this.auth.validateAccountTokens();
        this.logger.info(`Setting up iCloud connection`);
        const config: AxiosRequestConfig = {
            "headers": ICLOUD.DEFAULT_HEADER,
        };

        // Validate setup data
        const data = this.auth.getSetupData();

        return this.axios.post(ICLOUD.URL.SETUP, data, config)
            .then(res => {
                if (res.status !== 200) {
                    this.emit(ICLOUD.EVENTS.ERROR, `Received unexpected response code during iCloud Setup: ${res.status}`);
                    return;
                }

                try {
                    this.auth.processCloudSetupResponse(res);
                } catch (err) {
                    this.emit(ICLOUD.EVENTS.ERROR, err.message);
                    return;
                }

                this.photos = new iCloudPhotos(this.auth);
                this.logger.debug(`Account ready`);
                this.emit(ICLOUD.EVENTS.ACCOUNT_READY);
            })
            .catch(err => {
                this.emit(ICLOUD.EVENTS.ERROR, `Received error during iCloud Setup: ${err.message}`);
            });
    }

    /**
     * Creating iCloud Photos sub-class and linking it
    */
    getiCloudPhotosReady() {
        try {
            this.auth.validateCloudCookies();
        } catch (err) {
            this.emit(ICLOUD.EVENTS.ERROR, err.message);
            return;
        }

        if (!this.photos) {
            this.emit(ICLOUD.EVENTS.ERROR, `Unable to setup iCloud Photos, object does not exist!`);
            return;
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