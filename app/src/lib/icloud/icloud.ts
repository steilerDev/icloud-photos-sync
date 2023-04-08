import axios, {AxiosInstance, AxiosRequestConfig} from 'axios';
import EventEmitter from 'events';
import {MFAServer} from './mfa/mfa-server.js';
import * as ICLOUD from './constants.js';
import * as MFA_SERVER from './mfa/constants.js';
import {iCloudPhotos} from './icloud-photos/icloud-photos.js';
import {iCloudAuth} from './auth.js';
import {getLogger} from '../logger.js';
import {MFAMethod} from './mfa/mfa-method.js';
import {iCloudApp} from '../../app/icloud-app.js';
import {HANDLER_EVENT} from '../../app/event/error-handler.js';
import {iCPSError} from '../../app/error/error.js';
import {ICLOUD_PHOTOS_ERR, MFA_ERR, AUTH_ERR} from '../../app/error/error-codes.js';

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
    axios: AxiosInstance;

    /**
     * Creates a new iCloud Object
     * @param app - The app object holding CLI options containing username, password and MFA server port
     */
    constructor(app: iCloudApp) {
        super();
        this.logger.info(`Initiating iCloud connection`);
        this.logger.trace(`  - user: ${app.options.username}`);

        this.axios = axios.create();

        // MFA Server & lifecycle management
        this.mfaServer = new MFAServer(app.options.port);
        this.mfaServer.on(MFA_SERVER.EVENTS.MFA_RECEIVED, this.submitMFA.bind(this));
        this.mfaServer.on(MFA_SERVER.EVENTS.MFA_RESEND, this.resendMFA.bind(this));
        this.mfaServer.on(HANDLER_EVENT, this.emit.bind(this, HANDLER_EVENT));

        // ICloud Auth object
        this.auth = new iCloudAuth(app.options.username, app.options.password, app.options.trustToken, app.options.dataDir);
        if (app.options.refreshToken) {
            this.logger.info(`Clearing token due to refresh token flag`);
            this.auth.iCloudAccountTokens.trustToken = ``;
        }

        this.photos = new iCloudPhotos(app, this.auth);

        // ICloud lifecycle management
        if (app.options.failOnMfa) {
            this.on(ICLOUD.EVENTS.MFA_REQUIRED, () => {
                this.emit(ICLOUD.EVENTS.ERROR, new iCPSError(MFA_ERR.FAIL_ON_MFA));
            });
        } else {
            this.on(ICLOUD.EVENTS.MFA_REQUIRED, () => {
                try {
                    this.mfaServer.startServer();
                } catch (err) {
                    this.emit(ICLOUD.EVENTS.ERROR, new iCPSError(MFA_ERR.STARTUP_FAILED).addCause(err));
                }
            });
        }

        this.on(ICLOUD.EVENTS.TRUSTED, async () => {
            await this.setupAccount();
        });
        this.on(ICLOUD.EVENTS.AUTHENTICATED, async () => {
            await this.getTokens();
        });
        this.on(ICLOUD.EVENTS.ACCOUNT_READY, async () => {
            await this.getPhotosReady();
        });

        this.ready = this.getReady();
    }

    /**
     *
     * @returns - A promise, that will resolve once this objects emits 'READY' or reject if it emits 'ERROR'
     */
    getReady(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.once(ICLOUD.EVENTS.READY, () => resolve());
            this.once(ICLOUD.EVENTS.ERROR, err => reject(err));
        });
    }

    /**
     * Initiates authentication flow
     * Tries to directly login using trustToken, otherwise starts MFA flow
     */
    async authenticate(): Promise<void> {
        this.logger.info(`Authenticating user`);
        this.emit(ICLOUD.EVENTS.AUTHENTICATION_STARTED);

        this.auth.validateAccountSecrets();

        const config: AxiosRequestConfig = {
            "headers": {...this.auth.getPhotosHeader(ICLOUD.DEFAULT_AUTH_HEADER)},
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

        try {
            // Will throw error if response is non 2XX
            const response = await this.axios.post(ICLOUD.URL.SIGNIN, data, config);
            if (response.status !== 200) {
                this.emit(ICLOUD.EVENTS.ERROR, new iCPSError(AUTH_ERR.UNEXPECTED_RESPONSE)
                    .addContext(`response`, response));
                return;
            }

            this.logger.info(`Authentication successful`);
            try {
                this.auth.processAuthSecrets(response);
                this.logger.debug(`Acquired secrets`);
                this.logger.trace(`  - secrets: ${JSON.stringify(this.auth.iCloudAuthSecrets)}`);
                this.emit(ICLOUD.EVENTS.TRUSTED);
                return;
            } catch (err) {
                this.emit(ICLOUD.EVENTS.ERROR, new iCPSError(AUTH_ERR.ACQUIRE_AUTH_SECRETS)
                    .addCause(err));
                return;
            }
        } catch (err) {
            const {response} = err;
            if (!response) {
                this.emit(ICLOUD.EVENTS.ERROR, new iCPSError(AUTH_ERR.NO_RESPONSE).addCause(err));
                return;
            }

            if (response.status === 401) {
                this.emit(ICLOUD.EVENTS.ERROR, new iCPSError(AUTH_ERR.UNAUTHORIZED).addCause(err));
                return;
            }

            if (response.status === 403) {
                this.emit(ICLOUD.EVENTS.ERROR, new iCPSError(AUTH_ERR.FORBIDDEN).addCause(err));
                return;
            }

            if (response.status === 412) {
                this.emit(ICLOUD.EVENTS.ERROR, new iCPSError(AUTH_ERR.PRECONDITION_FAILED).addCause(err));
                return;
            }

            if (response.status !== 409) {
                this.emit(ICLOUD.EVENTS.ERROR, new iCPSError(AUTH_ERR.UNEXPECTED_RESPONSE).addCause(err));
                return;
            }

            try {
                this.auth.processAuthSecrets(response);
                this.logger.debug(`Acquired secrets, requiring MFA`);
                this.logger.trace(`  - secrets: ${JSON.stringify(this.auth.iCloudAuthSecrets)}`);
                this.emit(ICLOUD.EVENTS.MFA_REQUIRED, this.mfaServer.port);
                return;
            } catch (err) {
                this.emit(ICLOUD.EVENTS.ERROR, err);
                return;
            }
        } finally {
            return this.ready;
        }
    }

    /**
     * This function will ask the iCloud backend, to re-send the MFA token, using the provided method and number
     * @param method - The method to be used
     * @returns A promise that resolves once all activity has been completed
     */
    async resendMFA(method: MFAMethod) {
        this.logger.info(`Resending MFA code with ${method}`);

        const config: AxiosRequestConfig = {
            "headers": this.auth.getMFAHeaders(),
        };
        const data = method.getResendPayload();
        const url = method.getResendURL();

        this.logger.debug(`Requesting MFA code via URL ${url} with data ${JSON.stringify(data)}`);

        try {
            const response = await this.axios.put(url, data, config);

            if (!method.resendSuccessful(response)) {
                throw new iCPSError(MFA_ERR.RESEND_REQUEST_FAILED).addContext(`response`, response);
            }

            if (method.isSMS() || method.isVoice()) {
                this.logger.info(`Successfully requested new MFA code using phone ${response.data.trustedPhoneNumber.numberWithDialCode}`);
                return;
            }

            if (method.isDevice()) {
                this.logger.info(`Successfully requested new MFA code using ${response.data.trustedDeviceCount} trusted device(s)`);
                return;
            }
        } catch (err) {
            this.emit(HANDLER_EVENT, new iCPSError(MFA_ERR.RESEND_FAILED).setWarning().addCause(method.processResendError(err)));
        }
    }

    /**
     * Enters and validates the MFA code in order to acquire necessary account tokens
     * @param mfa - The MFA code
     */
    async submitMFA(method: MFAMethod, mfa: string) {
        try {
            this.mfaServer.stopServer();
            this.logger.info(`Authenticating MFA with code ${mfa}`);

            const config: AxiosRequestConfig = {
                "headers": this.auth.getMFAHeaders(),
            };
            const data = method.getEnterPayload(mfa);
            const url = method.getEnterURL();

            this.logger.debug(`Entering MFA code via URL ${url} with data ${JSON.stringify(data)}`);
            const response = await this.axios.post(url, data, config);
            if (!method.enterSuccessful(response)) {
                throw new iCPSError(MFA_ERR.SUBMIT_FAILED).addContext(`response`, response);
            }

            this.logger.info(`MFA code correct!`);
            this.emit(ICLOUD.EVENTS.AUTHENTICATED);
        } catch (err) {
            this.emit(ICLOUD.EVENTS.ERROR, new iCPSError(MFA_ERR.SUBMIT_FAILED).addCause(err));
        }
    }

    /**
     * Acquires sessionToken and two factor trust token after successful authentication
     */
    async getTokens() {
        try {
            this.logger.info(`Trusting device and acquiring trust tokens`);
            this.auth.validateAuthSecrets();

            const config: AxiosRequestConfig = {
                "headers": this.auth.getMFAHeaders(),
            };

            const response = await this.axios.get(ICLOUD.URL.TRUST, config);

            await this.auth.processAccountTokens(response);

            this.logger.debug(`Acquired account tokens`);
            this.logger.trace(`  - tokens: ${JSON.stringify(this.auth.iCloudAccountTokens)}`);
            this.emit(ICLOUD.EVENTS.TRUSTED);
        } catch (err) {
            this.emit(ICLOUD.EVENTS.ERROR, new iCPSError(AUTH_ERR.ACQUIRE_ACCOUNT_TOKENS).addCause(err));
        }
    }

    /**
     * Acquiring necessary cookies from trust and auth token for further processing & gets the user specific domain to interact with the Photos backend
     * If trustToken has recently been acquired, this function can be used to reset the iCloud Connection
     */
    async setupAccount() {
        try {
            this.logger.info(`Setting up iCloud connection`);
            this.auth.validateAccountTokens();

            const config: AxiosRequestConfig = {
                "headers": ICLOUD.DEFAULT_HEADER,
            };
            const data = this.auth.getSetupData();

            const response = await this.axios.post(ICLOUD.URL.SETUP, data, config);

            this.auth.processCloudSetupResponse(response);

            this.logger.debug(`Account ready`);
            this.emit(ICLOUD.EVENTS.ACCOUNT_READY);
        } catch (err) {
            this.emit(ICLOUD.EVENTS.ERROR, new iCPSError(AUTH_ERR.ACCOUNT_SETUP).addCause(err));
        }
    }

    /**
     * Creating iCloud Photos sub-class and linking it
    */
    async getPhotosReady() {
        try {
            this.auth.validateCloudCookies();

            this.logger.info(`Getting iCloud Photos Service ready`);
            // Forwarding warn events
            this.photos.on(HANDLER_EVENT, this.emit.bind(this, HANDLER_EVENT));
            await this.photos.setup();
            this.emit(ICLOUD.EVENTS.READY);
        } catch (err) {
            this.emit(ICLOUD.EVENTS.ERROR, new iCPSError(ICLOUD_PHOTOS_ERR.SETUP_FAILED).addCause(err));
        }
    }
}