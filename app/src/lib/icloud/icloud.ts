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
import {iCloudApp} from '../../app/icloud-app.js';
import { HANDLER_EVENT } from '../../app/error/handler.js';
import { iCloudAuthError, iCloudError, iCPSError } from '../../app/error/types.js';

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
        this.mfaServer.on(HANDLER_EVENT,(err) => this.emit(HANDLER_EVENT, err))

        // ICloud Auth object
        this.auth = new iCloudAuth(app.options.username, app.options.password, app.options.trustToken, app.options.dataDir);
        if (app.options.refreshToken) {
            this.logger.info(`Clearing token due to refresh token flag`);
            this.auth.iCloudAccountTokens.trustToken = ``;
        }

        // ICloud lifecycle management
        if (app.options.failOnMfa) {
            this.on(ICLOUD.EVENTS.MFA_REQUIRED, () => {
                this.emit(HANDLER_EVENT, new iCloudError(`MFA code required, failing due to failOnMfa flag`, "FATAL"));
            });
        } else {
            this.on(ICLOUD.EVENTS.MFA_REQUIRED, () => {
                try {
                    this.mfaServer.startServer();
                } catch (err) {
                    this.emit(HANDLER_EVENT, new iCloudError(`Unable to start MFA server`, "FATAL").addCause(err));
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
            this.on(HANDLER_EVENT, (err) => {
                if(iCPSError.fatalError(err)) {
                    reject(err)
                }
            });
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
                    this.emit(HANDLER_EVENT, new iCloudError(`Unexpected HTTP code: ${res.status}`, "FATAL")
                        .addContext('response', res));
                    return;
                }

                this.logger.info(`Authentication successfull`);
                try {
                    this.auth.processAuthSecrets(res);
                    this.logger.debug(`Acquired secrets`);
                    this.logger.trace(`  - secrets: ${JSON.stringify(this.auth.iCloudAuthSecrets)}`);
                } catch (err) {
                    this.emit(HANDLER_EVENT, err);
                }

                this.emit(ICLOUD.EVENTS.TRUSTED);
            })
            .catch(err => {
                const res = err.response;
                if (!res) {
                    this.emit(HANDLER_EVENT, new iCloudError(`No response received during authentication`, "FATAL").addCause(err));
                    return;
                }

                if (res.status !== 409) {
                    this.emit(HANDLER_EVENT, new iCloudError(`Unexpected HTTP code: ${res.status}`, "FATAL").addCause(err));
                    return;
                }

                try {
                    this.auth.processAuthSecrets(res);
                    this.logger.debug(`Acquired secrets, requiring MFA`);
                    this.logger.trace(`  - secrets: ${JSON.stringify(this.auth.iCloudAuthSecrets)}`);
                    this.emit(ICLOUD.EVENTS.MFA_REQUIRED, this.mfaServer.port);
                } catch (err) {
                    this.emit(HANDLER_EVENT, err);
                }
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
        var response: axios.AxiosResponse<any, any>

        try {
            response = await this.axios.put(url, data, config)
        } catch (err) {
            this.emit(HANDLER_EVENT, method.processResendError(err))
            return
        }

        try {
            if (!method.resendSuccesfull(response)) {
                throw new iCloudError(`Unable to request new MFA code`, "WARN")
                    .addContext('response', response)
            }

            if (method.isSMS() || method.isVoice()) {
                this.logger.info(`Sucesfully requested new MFA code using phone ${response.data.trustedPhoneNumber.numberWithDialCode}`);
                return;
            }

            if (method.isDevice()) {
                this.logger.info(`Sucesfully requested new MFA code using ${response.data.trustedDeviceCount} trusted device(s)`);
            }
        } catch(err) {
            this.emit(HANDLER_EVENT, err)
        }
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
                    this.emit(HANDLER_EVENT, new iCloudError(`Received unexpected response status code (${res.status}) during MFA validation`, 'FATAL').addContext('response', res));
                    return;
                }

                this.logger.info(`MFA code correct!`);
                this.emit(ICLOUD.EVENTS.AUTHENTICATED);
            })
            .catch(err => this.emit(HANDLER_EVENT, new iCloudError(`Received error during MFA validation: ${err.message}`, 'FATAL').addCause(err)));
    }

    /**
     * Acquires sessionToken and two factor trust token after succesfull authentication
     */
    async getTokens() {
        try {
            this.auth.validateAuthSecrets();
            this.logger.info(`Trusting device and acquiring trust tokens`);

            const config: AxiosRequestConfig = {
                "headers": this.auth.getMFAHeaders(),
            };

            var response: axios.AxiosResponse<any, any>
            try {
                response = await this.axios.get(ICLOUD.URL.TRUST, config)
            } catch(err) {
                this.emit(HANDLER_EVENT, new iCloudError('Received error while acquiring trust tokens', 'FATAL').addCause(err))
                return
            }
            await this.auth.processAccountTokens(response)

            this.logger.debug(`Acquired account tokens`);
            this.logger.trace(`  - tokens: ${JSON.stringify(this.auth.iCloudAccountTokens)}`);
            this.emit(ICLOUD.EVENTS.TRUSTED);
        } catch(err) {
            this.emit(HANDLER_EVENT, err)
        }
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
                    this.emit(HANDLER_EVENT, new iCloudError(`Received unexpected response code during iCloud Setup: ${res.status}`, "FATAL").addContext('response', res));
                    return;
                }

                try {
                    this.auth.processCloudSetupResponse(res);
                } catch (err) {
                    this.emit(HANDLER_EVENT, err);
                    return;
                }

                this.photos = new iCloudPhotos(this.auth);
                this.logger.debug(`Account ready`);
                this.emit(ICLOUD.EVENTS.ACCOUNT_READY);
            })
            .catch(err => {
                this.emit(HANDLER_EVENT, new iCloudError(`Received error during iCloud Setup`, "FATAL").addCause(err));
            });
    }

    /**
     * Creating iCloud Photos sub-class and linking it
    */
    getiCloudPhotosReady() {
        try {
            this.auth.validateCloudCookies();
        } catch (err) {
            this.emit(HANDLER_EVENT, new iCloudError(`No valid cookies for iCloud Photos setup`, "FATAL").addCause(err));
            return;
        }

        if (!this.photos) {
            this.emit(HANDLER_EVENT, new iCloudError(`Unable to setup iCloud Photos, object does not exist`, "FATAL"));
            return;
        }

        this.logger.info(`Getting iCloud Photos Service ready`);

        this.photos.on(ICLOUD_PHOTOS.EVENTS.READY, () => {
            this.emit(ICLOUD.EVENTS.READY);
        });
        this.photos.on(HANDLER_EVENT, (err: iCPSError) => {
            this.emit(HANDLER_EVENT, new iCloudError(`Error from iCloud Photos`, err.sev).addCause(err));
        });

        this.photos.on(ICLOUD_PHOTOS.EVENTS.INDEX_IN_PROGRESS, () => {
            this.emit(HANDLER_EVENT, new iCloudError(`iCloud Photos indexing in progress`, "FATAL"));
        });

        this.photos.setup();
    }
}