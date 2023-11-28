import {AxiosError, AxiosRequestConfig} from 'axios';
import {MFAServer, MFA_TIMEOUT_VALUE} from './mfa/mfa-server.js';
import {iCloudPhotos} from './icloud-photos/icloud-photos.js';
import {MFAMethod} from './mfa/mfa-method.js';
import {iCPSError} from '../../app/error/error.js';
import {ICLOUD_PHOTOS_ERR, MFA_ERR, AUTH_ERR} from '../../app/error/error-codes.js';
import {Resources} from '../resources/main.js';
import {COOKIE_KEYS, ENDPOINTS} from '../resources/network-types.js';
import {iCPSEventCloud, iCPSEventMFA, iCPSEventPhotos, iCPSEventRuntimeWarning} from '../resources/events-types.js';
import pTimeout from 'p-timeout';
import {jsonc} from 'jsonc';
import {iCloudCrypto} from './icloud.crypto.js';

/**
 * This class holds the iCloud connection
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
     * Creates a new iCloud Object
     * @emits iCPSEventCloud.ERROR - If the MFA code is required and the failOnMfa flag is set - the iCPSError is provided as argument
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
            })
            .on(iCPSEventCloud.SESSION_EXPIRED, async () => {
                await this.authenticate();
            })
            .on(iCPSEventCloud.PCS_REQUIRED, async () => {
                await this.acquirePCSCookies();
            });
    }

    /**
     *
     * @returns A promise that will resolve to true, if the connection was established successfully, false in case the MFA code was not provided in time or reject, in case there is an error
     */
    getReady(): Promise<boolean> {
        return pTimeout(
            new Promise<boolean>((resolve, reject) => {
                Resources.events(this)
                    .once(iCPSEventPhotos.READY, () => resolve(true))
                    .once(iCPSEventMFA.MFA_NOT_PROVIDED, () => resolve(false))
                    .once(iCPSEventCloud.ERROR, err => reject(err))
                    .once(iCPSEventMFA.ERROR, err => reject(err));
            }), {
                milliseconds: MFA_TIMEOUT_VALUE + (1000 * 60 * 5), // 5 minutes on top of mfa timeout should be sufficient
                message: new iCPSError(AUTH_ERR.SETUP_TIMEOUT),
            },
        );
    }

    /**
     * Initiates authentication flow. Tries to directly login using trustToken, otherwise starts MFA flow
     * @emits iCPSEventCloud.AUTHENTICATION_STARTED - When authentication is started
     * @emits iCPSEventCloud.MFA_REQUIRED - When MFA is required
     * @emits iCPSEventCloud.TRUSTED - When device is trusted - provides trust token as argument
     * @emits iCPSEventCloud.ERROR - When an error occurs - provides iCPSError as argument
     */
    async authenticate(): Promise<boolean> {
        const ready = this.getReady();
        Resources.logger(this).info(`Authenticating user`);
        Resources.emit(iCPSEventCloud.AUTHENTICATION_STARTED);

        const config: AxiosRequestConfig = {
            params: {
                isRememberMeEnabled: `true`,
            },
            // 409 is expected, if MFA is required - 200 is expected, if authentication succeeds immediately
            validateStatus: status => status === 409 || status === 200,
        };

        try {
            const [url, data] = Resources.manager().legacyLogin
                ? this.getLegacyLogin()
                : await this.getSRPLogin();

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

            // Does not seem to work
            // if (err instanceof AxiosError) {
            if ((err as AxiosError).isAxiosError) {
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
            return ready;
        }
    }

    /**
     * Generates the legacy plain-text login payload and url
     * @returns A tuple containing the url and payload required for the legacy login method
     */
    getLegacyLogin(): [url: string, payload: any] {
        Resources.logger(this).info(`Generating plain text login payload`);
        return [
            ENDPOINTS.AUTH.BASE + ENDPOINTS.AUTH.PATH.SIGNIN.LEGACY,
            {
                accountName: Resources.manager().username,
                password: Resources.manager().password,
                trustTokens: [
                    Resources.manager().trustToken,
                ],
            },
        ];
    }

    /**
     * Generates the SRP login payload and url from the iCloud server challenge
     * @param authenticator - The authenticator crypto instance for generating the SRP proof - parameterized for testing purposes, will be initiated by default
     * @returns A tuple containing the url and payload required for the SRP login method
     */
    async getSRPLogin(authenticator: iCloudCrypto = new iCloudCrypto()): Promise<[url: string, payload: any]> {
        Resources.logger(this).info(`Generating SRP challenge`);
        try {
            const initResponse = await Resources.network().post(ENDPOINTS.AUTH.BASE + ENDPOINTS.AUTH.PATH.SIGNIN.INIT, {
                a: await authenticator.getClientEphemeral(),
                accountName: Resources.manager().username,
                protocols: [
                    `s2k`,
                    `s2k_fo`,
                ],
            });

            const validatedInitResponse = Resources.validator().validateSigninInitResponse(initResponse);

            const derivedPassword = await authenticator.derivePassword(validatedInitResponse.data.protocol, validatedInitResponse.data.salt, validatedInitResponse.data.iteration);
            const [m1Proof, m2Proof] = await authenticator.getProofValues(derivedPassword, validatedInitResponse.data.b, validatedInitResponse.data.salt);

            return [
                ENDPOINTS.AUTH.BASE + ENDPOINTS.AUTH.PATH.SIGNIN.COMPLETE,
                {
                    accountName: Resources.manager().username,
                    trustTokens: [
                        Resources.manager().trustToken,
                    ],
                    m1: m1Proof,
                    m2: m2Proof,
                    c: validatedInitResponse.data.c,
                },
            ];
        } catch (err) {
            throw new iCPSError(AUTH_ERR.SRP_INIT_FAILED).addCause(err);
        }
    }

    /**
     * This function will ask the iCloud backend, to re-send the MFA token, using the provided method and number
     * @param method - The method to be used
     * @returns A promise that resolves once all activity has been completed
     * @emits iCPSEventRuntimeWarning.MFA_ERROR - When the resend failed - provides iCPSError as argument
     */
    async resendMFA(method: MFAMethod) {
        Resources.logger(this).info(`Resending MFA code with ${method}`);

        const url = method.getResendURL();
        const config: AxiosRequestConfig = {
            validateStatus: method.resendSuccessful.bind(method),
        };
        const data = method.getResendPayload();

        Resources.logger(this).debug(`Requesting MFA code via URL ${url} with data ${jsonc.stringify(data)}`);

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
            Resources.emit(iCPSEventRuntimeWarning.MFA_ERROR, new iCPSError(MFA_ERR.RESEND_FAILED).addCause(err));
        }
    }

    /**
     * Enters and validates the MFA code in order to acquire necessary account tokens
     * @param mfa - The MFA code
     * @emits iCPSEventCloud.AUTHENTICATED - When authentication is successful
     * @emits iCPSEventCloud.ERROR - When an error occurs - provides iCPSError as argument
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

            Resources.logger(this).debug(`Entering MFA code via URL ${url} with data ${jsonc.stringify(data)}`);
            await Resources.network().post(url, data, config);

            Resources.logger(this).info(`MFA code correct!`);
            Resources.emit(iCPSEventCloud.AUTHENTICATED);
        } catch (err) {
            if (err.response?.status === 400) {
                const augmentedErr = new iCPSError(MFA_ERR.CODE_REJECTED).addCause(err);
                if (Array.isArray(err.response?.data?.service_errors)) {
                    augmentedErr.addMessage(err.response.data.service_errors.map((serviceError: any) => serviceError?.message));
                }

                Resources.emit(iCPSEventCloud.ERROR, augmentedErr);
                return;
            }

            Resources.emit(iCPSEventCloud.ERROR, new iCPSError(MFA_ERR.SUBMIT_FAILED).addCause(err));
        }
    }

    /**
     * Acquires sessionToken and two factor trust token after successful authentication
     * @emits iCPSEventCloud.TRUSTED - When trust token has been acquired - provides trust token as argument
     * @emits iCPSEventCloud.ERROR - When an error occurs - provides iCPSError as argument
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
     * Acquiring necessary cookies from trust and auth token for further processing. Also gets the user specific domain to interact with the Photos backend
     * @emits iCPSEventCloud.ACCOUNT_READY - When account is ready to be used
     * @emits iCPSEventCloud.SESSION_EXPIRED - When the session token has expired
     * @emits iCPSEventCloud.PCS_REQUIRED - When the account is setup using ADP and PCS cookies are required
     * @emits iCPSEventCloud.ERROR - When an error occurs - provides iCPSError as argument
     */
    async setupAccount() {
        try {
            Resources.logger(this).info(`Setting up iCloud connection`);

            const url = ENDPOINTS.SETUP.BASE() + ENDPOINTS.SETUP.PATH.ACCOUNT_LOGIN;
            const data = {
                dsWebAuthToken: Resources.manager().sessionSecret,
            };

            const response = await Resources.network().post(url, data);
            const validatedResponse = Resources.validator().validateSetupResponse(response);
            if (!Resources.network().applySetupResponse(validatedResponse)) {
                Resources.logger(this).debug(`PCS required, acquiring...`);
                Resources.emit(iCPSEventCloud.PCS_REQUIRED);
                return;
            }

            Resources.logger(this).debug(`Account ready`);
            Resources.emit(iCPSEventCloud.ACCOUNT_READY);
        } catch (err) {
            if ((err as any).isAxiosError && err.response.status === 421) {
                Resources.logger(this).debug(`Session token expired, re-acquiring...`);
                Resources.emit(iCPSEventCloud.SESSION_EXPIRED);
                return;
            }

            Resources.emit(iCPSEventCloud.ERROR, new iCPSError(AUTH_ERR.ACCOUNT_SETUP).addCause(err));
        }
    }

    /**
     * Acquires PCS cookies for ADP accounts
     * @emits iCPSEventCloud.ACCOUNT_READY - When account is ready to be used
     * @emits iCPSEventCloud.PCS_NOT_READY - When PCS cookies are not ready yet
     * @emits iCPSEventCloud.PCS_REQUIRED - When the account is setup using ADP and PCS cookies are still required
     * @emits iCPSEventCloud.ERROR - When an error occurs - provides iCPSError as argument
     */
    async acquirePCSCookies() {
        try {
            Resources.logger(this).info(`Acquiring PCS cookies`);

            const url = ENDPOINTS.SETUP.BASE() + ENDPOINTS.SETUP.PATH.REQUEST_PCS;
            const data = {
                appName: `photos`,
                derivedFromUserAction: true,
            };

            const response = await Resources.network().post(url, data);
            const validatedResponse = Resources.validator().validatePCSResponse(response);

            if (validatedResponse.data.status === `failure`) {
                Resources.logger(this).info(`Failed to acquire PCS cookies: ${validatedResponse.data.message}`);
                Resources.emit(iCPSEventCloud.PCS_NOT_READY);
                setTimeout(() => Resources.emit(iCPSEventCloud.PCS_REQUIRED), 10000);
                return;
            }

            if (!validatedResponse.headers[`set-cookie`]
                || validatedResponse.headers[`set-cookie`].filter(cookieString => cookieString.startsWith(COOKIE_KEYS.PCS_PHOTOS) || cookieString.startsWith(COOKIE_KEYS.PCS_SHARING)).length !== 2) {
                throw new iCPSError(AUTH_ERR.PCS_COOKIE_MISSING).addContext(`response`, validatedResponse);
            }

            Resources.logger(this).debug(`Account ready with PCS cookies`);
            Resources.emit(iCPSEventCloud.ACCOUNT_READY);
        } catch (err) {
            Resources.emit(iCPSEventCloud.ERROR, new iCPSError(AUTH_ERR.PCS_REQUEST_FAILED).addCause(err));
        }
    }

    /**
     * Creating iCloud Photos sub-class and linking it
     * @emits iCPSEventCloud.ERROR - When an error occurs - provides iCPSError as argument
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