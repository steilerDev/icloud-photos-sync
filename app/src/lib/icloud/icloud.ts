import {AxiosError, AxiosRequestConfig} from 'axios';
import EventEmitter from 'events';
import {MFAServer} from './mfa/mfa-server.js';
import * as ICLOUD from './constants.js';
import * as MFA_SERVER from './mfa/constants.js';
import {iCloudPhotos} from './icloud-photos/icloud-photos.js';
import {getLogger} from '../logger.js';
import {MFAMethod} from './mfa/mfa-method.js';
import {HANDLER_EVENT} from '../../app/event/error-handler.js';
import {iCPSError} from '../../app/error/error.js';
import {ICLOUD_PHOTOS_ERR, MFA_ERR, AUTH_ERR} from '../../app/error/error-codes.js';
import {ResourceManager} from '../resource-manager/resource-manager.js';
import {ENDPOINTS, HEADER} from '../resource-manager/network.js';
import {Validator} from '../resource-manager/validator.js';

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
     * Server object to input MFA code
     */
    mfaServer: MFAServer;

    /**
     * Access to the iCloud Photos service
     */
    photos: iCloudPhotos;

    /**
     * A promise that will resolve, once the object is ready or reject, in case there is an error
     */
    ready: Promise<void>;

    /**
     * Creates a new iCloud Object
     */
    constructor() {
        super();
        // MFA Server & lifecycle management
        this.mfaServer = new MFAServer();
        this.mfaServer.on(MFA_SERVER.EVENTS.MFA_RECEIVED, this.submitMFA.bind(this));
        this.mfaServer.on(MFA_SERVER.EVENTS.MFA_RESEND, this.resendMFA.bind(this));

        this.photos = new iCloudPhotos();

        // ICloud lifecycle management
        if (ResourceManager.failOnMfa) {
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
     * @returns - A promise, that will resolve once this objects emits 'READY' or reject if it emits 'ERROR' or the MFA server times out
     */
    getReady(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.once(ICLOUD.EVENTS.READY, () => resolve());
            this.once(ICLOUD.EVENTS.ERROR, err => reject(err));
            this.mfaServer.once(MFA_SERVER.EVENTS.MFA_NOT_PROVIDED, err => reject(err));
        });
    }

    /**
     * Initiates authentication flow
     * Tries to directly login using trustToken, otherwise starts MFA flow
     */
    async authenticate(): Promise<void> {
        this.logger.info(`Authenticating user`);
        this.logger.trace(`  - user: ${ResourceManager.username}`);
        this.emit(ICLOUD.EVENTS.AUTHENTICATION_STARTED);

        const url = ENDPOINTS.AUTH.BASE + ENDPOINTS.AUTH.PATH.SIGNIN;

        const config: AxiosRequestConfig = {
            headers: HEADER.AUTH,
            params: {
                isRememberMeEnabled: true,
            },
            // 409 is expected, if MFA is required - 200 is expected, if authentication succeeds immediately
            validateStatus: status => status === 409 || status === 200,
        };

        const data = {
            accountName: ResourceManager.username,
            password: ResourceManager.password,
            trustTokens: [
                ResourceManager.trustToken,
            ],
        };

        try {
            const response = await ResourceManager.network.post(url, data, config);

            const validatedResponse = ResourceManager.validator.validateSigninResponse(response);
            ResourceManager.network.applySigninResponse(validatedResponse);

            this.logger.debug(`Acquired signin secrets`);

            if (response.status === 409) {
                this.logger.debug(`Response status is 409, requiring MFA`);
                this.emit(ICLOUD.EVENTS.MFA_REQUIRED, ResourceManager.mfaServerPort);
                return;
            }

            if (response.status === 200) {
                this.logger.debug(`Response status is 200, authentication successful - device trusted`);
                this.emit(ICLOUD.EVENTS.TRUSTED);
                return;
            }

            this.emit(ICLOUD.EVENTS.ERROR, new iCPSError(AUTH_ERR.ACQUIRE_AUTH_SECRETS));
        } catch (err) {
            if (err instanceof iCPSError) {
                this.emit(ICLOUD.EVENTS.ERROR, err);
                return;
            }

            if (err?.response?.status) {
                switch (err.response.status) {
                case 401:
                    this.emit(ICLOUD.EVENTS.ERROR, new iCPSError(AUTH_ERR.UNAUTHORIZED).addCause(err));
                    break;
                case 403:
                    this.emit(ICLOUD.EVENTS.ERROR, new iCPSError(AUTH_ERR.FORBIDDEN).addCause(err));
                    break;
                case 412:
                    this.emit(ICLOUD.EVENTS.ERROR, new iCPSError(AUTH_ERR.PRECONDITION_FAILED).addCause(err));
                    break;
                default:
                    this.emit(ICLOUD.EVENTS.ERROR, new iCPSError(AUTH_ERR.UNEXPECTED_RESPONSE).addCause(err));
                }

                return;
            }

            this.emit(ICLOUD.EVENTS.ERROR, new iCPSError(AUTH_ERR.UNKNOWN).addCause(err));
            return;
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

        const url = method.getResendURL();
        const config: AxiosRequestConfig = {
            headers: HEADER.AUTH,
            validateStatus: method.resendSuccessful.bind(method),
        };
        const data = method.getResendPayload();

        this.logger.debug(`Requesting MFA code via URL ${url} with data ${JSON.stringify(data)}`);

        try {
            const response = await ResourceManager.network.put(url, data, config);

            if (method.isSMS || method.isVoice) {
                const validatedResponse = ResourceManager.validator.validateResendMFAPhoneResponse(response);
                this.logger.info(`Successfully requested new MFA code using phone ${validatedResponse.data.trustedPhoneNumber.numberWithDialCode}`);
                return;
            }

            if (method.isDevice) {
                const validatedResponse = ResourceManager.validator.validateResendMFADeviceResponse(response);
                this.logger.info(`Successfully requested new MFA code using ${validatedResponse.data.trustedDeviceCount} trusted device(s)`);
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

            const url = method.getEnterURL();
            const config: AxiosRequestConfig = {
                headers: HEADER.AUTH,
                validateStatus: method.enterSuccessful.bind(method),
            };
            const data = method.getEnterPayload(mfa);

            this.logger.debug(`Entering MFA code via URL ${url} with data ${JSON.stringify(data)}`);
            await ResourceManager.network.post(url, data, config);

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

            const url = ENDPOINTS.AUTH.BASE + ENDPOINTS.AUTH.PATH.TRUST;
            const config: AxiosRequestConfig = {
                headers: HEADER.AUTH,
                validateStatus: status => status === 204,
            };

            const response = await ResourceManager.network.get(url, config);
            const validatedResponse = ResourceManager.validator.validateTrustResponse(response);
            ResourceManager.network.applyTrustResponse(validatedResponse);

            this.logger.debug(`Acquired account tokens`);
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

            const url = ENDPOINTS.SETUP.BASE + ENDPOINTS.SETUP.PATH.ACCOUNT;
            const data = {
                dsWebAuthToken: ResourceManager.network.session,
                trustToken: ResourceManager.network.trustToken,
            };

            const response = await ResourceManager.network.post(url, data);
            const validatedResponse = ResourceManager.validator.validateSetupResponse(response);
            ResourceManager.network.applySetupResponse(validatedResponse);

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