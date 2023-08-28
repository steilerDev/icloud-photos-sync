import {AxiosRequestConfig} from 'axios';
import {MFAServer} from './mfa/mfa-server.js';
import {iCloudPhotos} from './icloud-photos/icloud-photos.js';
import {MFAMethod} from './mfa/mfa-method.js';
import {iCPSError} from '../../app/error/error.js';
import {ICLOUD_PHOTOS_ERR, MFA_ERR, AUTH_ERR} from '../../app/error/error-codes.js';
import {Resources} from '../resources/main.js';
import {ENDPOINTS} from '../resources/network-types.js';
import {iCPSEventCloud, iCPSEventMFA, iCPSEventPhotos, iCPSEventRuntimeWarning} from '../resources/events-types.js';

/**
 * This class holds the iCloud connection
 * The authentication flow -followed by this class- is documented in a [Miro Board](https://miro.com/app/board/uXjVOxcisIM=/?share_link_id=646572552229).
 */
export class iCloud {
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
        // MFA Server & lifecycle management
        this.mfaServer = new MFAServer();
        Resources.events(this)
            .on(iCPSEventMFA.MFA_RECEIVED, this.submitMFA.bind(this))
            .on(iCPSEventMFA.MFA_RESEND, this.resendMFA.bind(this));

        this.photos = new iCloudPhotos();

        // ICloud lifecycle management

        Resources.events(this)
            .on(iCPSEventCloud.MFA_REQUIRED, () => {
                if (Resources.manager().failOnMfa) {
                    Resources.emit(iCPSEventCloud.ERROR, new iCPSError(MFA_ERR.FAIL_ON_MFA));
                    return;
                }

                this.mfaServer.startServer();
            })
            .on(iCPSEventCloud.TRUSTED, async () => {
                await this.setupAccount();
            })
            .on(iCPSEventCloud.AUTHENTICATED, async () => {
                await this.getTokens();
            })
            .on(iCPSEventCloud.ACCOUNT_READY, async () => {
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
            Resources.events(this)
                .once(iCPSEventPhotos.READY, () => resolve())
                .once(iCPSEventCloud.ERROR, err => reject(err))
                .once(iCPSEventMFA.MFA_NOT_PROVIDED, err => reject(err))
                .once(iCPSEventMFA.ERROR, err => reject(err));
        });
    }

    /**
     * Initiates authentication flow
     * Tries to directly login using trustToken, otherwise starts MFA flow
     */
    async authenticate(): Promise<void> {
        Resources.logger(this).info(`Authenticating user`);
        Resources.emit(iCPSEventCloud.AUTHENTICATION_STARTED);

        const url = ENDPOINTS.AUTH.BASE + ENDPOINTS.AUTH.PATH.SIGNIN;

        const config: AxiosRequestConfig = {
            params: {
                isRememberMeEnabled: true,
            },
            // 409 is expected, if MFA is required - 200 is expected, if authentication succeeds immediately
            validateStatus: status => status === 409 || status === 200,
        };

        const data = {
            accountName: Resources.manager().username,
            password: Resources.manager().password,
            trustTokens: [
                Resources.manager().trustToken,
            ],
        };

        try {
            const response = await Resources.network().post(url, data, config);

            const validatedResponse = Resources.validator().validateSigninResponse(response);
            Resources.network().applySigninResponse(validatedResponse);

            Resources.logger(this).debug(`Acquired signin secrets`);

            if (response.status === 409) {
                Resources.logger(this).debug(`Response status is 409, requiring MFA`);
                Resources.emit(iCPSEventCloud.MFA_REQUIRED);
                return;
            }

            if (response.status === 200) {
                Resources.logger(this).debug(`Response status is 200, authentication successful - device trusted`);
                Resources.emit(iCPSEventCloud.TRUSTED, Resources.manager().trustToken);
            }

            // This should never happen
            // Resources.emit(iCPSEventCloud.ERROR, new iCPSError(AUTH_ERR.ACQUIRE_AUTH_SECRETS));
        } catch (err) {
            if (err instanceof iCPSError) {
                Resources.emit(iCPSEventCloud.ERROR, err);
                return;
            }

            if (err?.response?.status) {
                switch (err.response.status) {
                case 401:
                    Resources.emit(iCPSEventCloud.ERROR, new iCPSError(AUTH_ERR.UNAUTHORIZED).addCause(err));
                    break;
                case 403:
                    Resources.emit(iCPSEventCloud.ERROR, new iCPSError(AUTH_ERR.FORBIDDEN).addCause(err));
                    break;
                case 412:
                    Resources.emit(iCPSEventCloud.ERROR, new iCPSError(AUTH_ERR.PRECONDITION_FAILED).addCause(err));
                    break;
                default:
                    Resources.emit(iCPSEventCloud.ERROR, new iCPSError(AUTH_ERR.UNEXPECTED_RESPONSE).addCause(err));
                }

                return;
            }

            Resources.emit(iCPSEventCloud.ERROR, new iCPSError(AUTH_ERR.UNKNOWN).addCause(err));
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
        Resources.logger(this).info(`Resending MFA code with ${method}`);

        const url = method.getResendURL();
        const config: AxiosRequestConfig = {
            validateStatus: method.resendSuccessful.bind(method),
        };
        const data = method.getResendPayload();

        Resources.logger(this).debug(`Requesting MFA code via URL ${url} with data ${JSON.stringify(data)}`);

        try {
            const response = await Resources.network().put(url, data, config);

            if (method.isSMS || method.isVoice) {
                const validatedResponse = Resources.validator().validateResendMFAPhoneResponse(response);
                Resources.logger(this).info(`Successfully requested new MFA code using phone ${validatedResponse.data.trustedPhoneNumber.numberWithDialCode}`);
                return;
            }

            if (method.isDevice) {
                const validatedResponse = Resources.validator().validateResendMFADeviceResponse(response);
                Resources.logger(this).info(`Successfully requested new MFA code using ${validatedResponse.data.trustedDeviceCount} trusted device(s)`);
            }
        } catch (err) {
            Resources.emit(iCPSEventRuntimeWarning.MFA_ERROR, err);
        }
    }

    /**
     * Enters and validates the MFA code in order to acquire necessary account tokens
     * @param mfa - The MFA code
     */
    async submitMFA(method: MFAMethod, mfa: string) {
        try {
            this.mfaServer.stopServer();
            Resources.logger(this).info(`Authenticating MFA with code ${mfa}`);

            const url = method.getEnterURL();
            const config: AxiosRequestConfig = {
                validateStatus: method.enterSuccessful.bind(method),
            };
            const data = method.getEnterPayload(mfa);

            Resources.logger(this).debug(`Entering MFA code via URL ${url} with data ${JSON.stringify(data)}`);
            await Resources.network().post(url, data, config);

            Resources.logger(this).info(`MFA code correct!`);
            Resources.emit(iCPSEventCloud.AUTHENTICATED);
        } catch (err) {
            Resources.emit(iCPSEventCloud.ERROR, new iCPSError(MFA_ERR.SUBMIT_FAILED).addCause(err));
        }
    }

    /**
     * Acquires sessionToken and two factor trust token after successful authentication
     */
    async getTokens() {
        try {
            Resources.logger(this).info(`Trusting device and acquiring trust tokens`);

            const url = ENDPOINTS.AUTH.BASE + ENDPOINTS.AUTH.PATH.TRUST;
            const config: AxiosRequestConfig = {
                validateStatus: status => status === 204,
            };

            const response = await Resources.network().get(url, config);
            const validatedResponse = Resources.validator().validateTrustResponse(response);
            Resources.network().applyTrustResponse(validatedResponse);

            Resources.logger(this).debug(`Acquired account tokens`);
            Resources.emit(iCPSEventCloud.TRUSTED, Resources.manager().trustToken);
        } catch (err) {
            Resources.emit(iCPSEventCloud.ERROR, new iCPSError(AUTH_ERR.ACQUIRE_ACCOUNT_TOKENS).addCause(err));
        }
    }

    /**
     * Acquiring necessary cookies from trust and auth token for further processing & gets the user specific domain to interact with the Photos backend
     * If trustToken has recently been acquired, this function can be used to reset the iCloud Connection
     */
    async setupAccount() {
        try {
            Resources.logger(this).info(`Setting up iCloud connection`);

            const url = ENDPOINTS.SETUP.BASE + ENDPOINTS.SETUP.PATH.ACCOUNT;
            const data = {
                dsWebAuthToken: Resources.manager().sessionSecret,
                trustToken: Resources.manager().trustToken,
            };

            const response = await Resources.network().post(url, data);
            const validatedResponse = Resources.validator().validateSetupResponse(response);
            Resources.network().applySetupResponse(validatedResponse);

            Resources.logger(this).debug(`Account ready`);
            Resources.emit(iCPSEventCloud.ACCOUNT_READY);
        } catch (err) {
            Resources.emit(iCPSEventCloud.ERROR, new iCPSError(AUTH_ERR.ACCOUNT_SETUP).addCause(err));
        }
    }

    /**
     * Creating iCloud Photos sub-class and linking it
    */
    async getPhotosReady() {
        try {
            Resources.logger(this).info(`Getting iCloud Photos Service ready`);
            await this.photos.setup();
        } catch (err) {
            Resources.emit(iCPSEventCloud.ERROR, new iCPSError(ICLOUD_PHOTOS_ERR.SETUP_FAILED).addCause(err));
        }
    }
}