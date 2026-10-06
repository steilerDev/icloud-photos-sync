import {AxiosRequestConfig, AxiosResponse, isAxiosError} from 'axios';
import {jsonc} from 'jsonc';
import {AUTH_ERR, ICLOUD_PHOTOS_ERR, MFA_ERR} from '../../app/error/error-codes.js';
import {iCPSError} from '../../app/error/error.js';
import {iCPSEventCloud, iCPSEventMFA, iCPSEventPhotos, iCPSEventRuntimeWarning} from '../resources/events-types.js';
import {Resources} from '../resources/main.js';
import {COOKIE_KEYS, ENDPOINTS, TrustedPhoneNumber} from '../resources/network-types.js';
import {iCloudPhotos} from './icloud-photos/icloud-photos.js';
import {iCloudCrypto} from './icloud.crypto.js';
import {MFAMethod} from './mfa/mfa-method.js';

/**
 * This class holds the iCloud connection
 */
/**
 * The service error code returned by the backend, if an incorrect MFA code was entered
 */
const MFA_INCORRECT_CODE_ERROR = `-21669`;

export class iCloud {
    /**
     * Access to the iCloud Photos service
     */
    photos: iCloudPhotos;

    /**
     * Timeout for MFA code submission - set while waiting for an MFA code
     */
    mfaTimeout?: NodeJS.Timeout;

    /**
     * Creates a new iCloud Object
     * @param ignoreFailOnMfa - If set to true, the authentication will still continue even if MFA is required and the failOnMfa flag is set
     * @emits iCPSEventCloud.ERROR - If the MFA code is required and the failOnMfa flag is set - the iCPSError is provided as argument
     */
    constructor() {
        Resources.events(this)
            .on(iCPSEventMFA.MFA_RECEIVED, this.submitMFA.bind(this))
            .on(iCPSEventMFA.MFA_RESEND, this.resendMFA.bind(this));

        this.photos = new iCloudPhotos();

        // ICloud lifecycle management
        Resources.events(this)
            .on(iCPSEventCloud.MFA_REQUIRED, () => {
                // MFA code needs to be provided within timeout period
                this.mfaTimeout = setTimeout(() => {
                    Resources.emit(iCPSEventMFA.MFA_NOT_PROVIDED, new iCPSError(MFA_ERR.MFA_TIMEOUT));
                }, Resources.manager().mfaTimeout * 1000);
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
        return new Promise<boolean>((resolve, reject) => {
            const timeout = setTimeout(
                () => reject(new iCPSError(AUTH_ERR.SETUP_TIMEOUT)),
                Resources.manager().mfaTimeout + (1000 * 60 * 5), // 5 minutes on top of mfa timeout should be sufficient
            );

            Resources.events(this)
                .once(iCPSEventPhotos.READY, () => {
                    clearTimeout(timeout);
                    resolve(true);
                })
                .once(iCPSEventMFA.MFA_NOT_PROVIDED, () => {
                    clearTimeout(timeout);
                    resolve(false);
                })
                .once(iCPSEventCloud.ERROR, err => {
                    clearTimeout(timeout);
                    reject(err);
                });
        });
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

            if (response.status === 409 && this.requiresEscrow(response)) {
                Resources.logger(this).debug(`Response status is 409, trust token accepted but escrow required`);
                await this.completeEscrow();
                Resources.emit(iCPSEventCloud.TRUSTED, Resources.manager().trustToken);
                return ready;
            }

            if (response.status === 409) {
                Resources.logger(this).debug(`Response status is 409, requiring MFA`);
                const trustedPhoneNumbers = await this.getTrustedPhoneNumbers();
                // Since iOS 26.4 the MFA code is no longer pushed to trusted devices automatically
                await this.resendMFA(new MFAMethod(`device`));
                Resources.emit(iCPSEventCloud.MFA_REQUIRED, trustedPhoneNumbers);
                return ready;
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
                return ready;
            }

            // Using the isAxiosError type guard, since `err instanceof AxiosError` does not seem to work
            if (isAxiosError(err)) {
                switch (err.response?.status) {
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

                return ready;
            }

            Resources.emit(iCPSEventCloud.ERROR, new iCPSError(AUTH_ERR.UNKNOWN).addCause(err));
            return ready;
        } finally {
            // Return in finally is required because control flow of try/catch block is complicated
            // eslint-disable-next-line no-unsafe-finally
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
     * Fetches the trusted phone numbers of the account, which can be used to receive MFA codes via sms or voice
     * The backend either provides the information as JSON, or embedded in the HTML 'boot_args' of the iCloud web frontend
     * @returns The list of trusted phone numbers, or an empty array if they could not be retrieved
     * @emits iCPSEventRuntimeWarning.TRUSTED_PHONE_NUMBERS_ERROR - When the phone numbers could not be retrieved - provides iCPSError as argument
     */
    async getTrustedPhoneNumbers(): Promise<TrustedPhoneNumber[]> {
        Resources.logger(this).info(`Getting trusted phone numbers`);

        try {
            const response = await Resources.network().get(ENDPOINTS.AUTH.BASE, {
                headers: {
                    Accept: `application/json`,
                },
            });

            const authInformation = typeof response.data === `string`
                ? this.extractBootArgsFromHTML(response.data)?.direct?.twoSV
                : response.data;

            const validatedAuthInformationResponse = Resources.validator().validateAuthInformationResponse({
                data: {
                    trustedPhoneNumbers: this.findTrustedPhoneNumbers(authInformation),
                },
            });
            Resources.logger(this).debug(`Found ${validatedAuthInformationResponse.data.trustedPhoneNumbers.length} trusted phone number(s)`);
            return validatedAuthInformationResponse.data.trustedPhoneNumbers;
        } catch (err) {
            Resources.emit(iCPSEventRuntimeWarning.TRUSTED_PHONE_NUMBERS_ERROR, new iCPSError(MFA_ERR.NO_PHONE_NUMBERS).addCause(err));
        }

        return [];
    }

    /**
     * Locates the list of trusted phone numbers within the auth information provided by the backend
     * Depending on the account and flow, the list is provided on top level, nested in the phone number verification object or (since iOS 26.4) nested in the bridge's initiate data
     * @param authInformation - The auth information object provided by the backend
     * @returns The list of trusted phone numbers, or undefined if it could not be found
     */
    findTrustedPhoneNumbers(authInformation: any): unknown {
        return authInformation?.trustedPhoneNumbers
            ?? authInformation?.phoneNumberVerification?.trustedPhoneNumbers
            ?? authInformation?.bridgeInitiateData?.phoneNumberVerification?.trustedPhoneNumbers;
    }

    /**
     * Extracts the 'boot_args' object from the HTML document of the iCloud web frontend
     * @param html - The HTML document returned by the backend
     * @returns The parsed 'boot_args' object, or undefined if it could not be found
     */
    extractBootArgsFromHTML(html: string): any {
        const bootArgs = html.match(/<script[^>]*class="boot_args"[^>]*>([\s\S]*?)<\/script>/)?.[1];
        return bootArgs ? JSON.parse(bootArgs) : undefined;
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

        Resources.logger(this).debug(`Requesting MFA code via PUT ${url} with data ${jsonc.stringify(data)}`);

        try {
            const response = await Resources.network().put(url, data, config);

            if (method.isSMS || method.isVoice) {
                const validatedResponse = Resources.validator().validateResendMFAPhoneResponse(response);
                Resources.logger(this).info(`Successfully requested new MFA code using phone ${validatedResponse.data.trustedPhoneNumber.numberWithDialCode}`);
                return;
            }

            if (method.isDevice) {
                const validatedResponse = Resources.validator().validateResendMFADeviceResponse(response);
                const trustedDeviceCount = validatedResponse.data ? validatedResponse.data.trustedDeviceCount : undefined;
                Resources.logger(this).info(`Successfully requested new MFA code using ${trustedDeviceCount ?? `all`} trusted device(s)`);
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
            Resources.logger(this).info(`Authenticating MFA with code ${mfa}`);

            const url = method.getEnterURL();
            const config: AxiosRequestConfig = {
                validateStatus: method.enterSuccessful.bind(method),
            };
            const data = method.getEnterPayload(mfa);

            Resources.logger(this).debug(`Entering MFA code via URL ${url} with data ${jsonc.stringify(data)}`);
            const response = await Resources.network().post(url, data, config);

            if (response.status === 409) {
                // Since iOS 26.4 the backend acknowledges a valid code with status 409
                if (response.data?.securityCode?.valid !== true && !response.headers[`x-apple-session-token`]) {
                    const rejectedErr = new iCPSError(MFA_ERR.CODE_REJECTED)
                        .addContext(`responseData`, response.data);
                    if (Array.isArray(response.data?.service_errors)) {
                        rejectedErr.addMessage(...response.data.service_errors.map((serviceError: any) => serviceError?.message));
                    }

                    throw rejectedErr;
                }

                Resources.network().applySessionTokenUpdate(response);

                if (this.requiresEscrow(response)) {
                    await this.completeEscrow();
                }
            }

            Resources.logger(this).info(`MFA code correct!`);
            Resources.emit(iCPSEventCloud.AUTHENTICATED);

            if (this.mfaTimeout) {
                clearTimeout(this.mfaTimeout);
                this.mfaTimeout = undefined
            }
        } catch (err) {
            if (err instanceof iCPSError) {
                Resources.emit(iCPSEventCloud.ERROR, err);
                return;
            }

            if (isAxiosError(err) && (err.response?.status === 400 || this.hasServiceError(err.response?.data, MFA_INCORRECT_CODE_ERROR))) {
                const augmentedErr = new iCPSError(MFA_ERR.CODE_REJECTED).addCause(err);
                if (Array.isArray(err.response?.data?.service_errors)) {
                    augmentedErr.addMessage(...err.response!.data.service_errors.map((serviceError: any) => serviceError?.message));
                }

                Resources.emit(iCPSEventCloud.ERROR, augmentedErr);
                return;
            }

            Resources.emit(iCPSEventCloud.ERROR, new iCPSError(MFA_ERR.SUBMIT_FAILED).addCause(err));
        }
    }

    /**
     * Checks if the backend requires the escrow flow - signaled through the 'X-Apple-EDP' or 'X-Apple-PDP' header on a 409 response
     * @param response - The response received from the backend
     * @returns True, if the escrow flow needs to be completed
     */
    requiresEscrow(response: AxiosResponse): boolean {
        return Boolean(response.headers[`x-apple-edp`] || response.headers[`x-apple-pdp`]);
    }

    /**
     * Completes the escrow flow, which is a second SRP-based password proof (using an empty account name), required by the backend since iOS 26.4
     * The backend issues an updated session token upon completion
     * @param authenticator - The authenticator crypto instance for generating the SRP proof - parameterized for testing purposes, will be initiated by default
     * @throws An iCPSError, if the escrow flow could not be completed
     */
    async completeEscrow(authenticator: iCloudCrypto = new iCloudCrypto(``)) {
        Resources.logger(this).info(`Completing escrow password verification`);
        try {
            const initResponse = await Resources.network().post(ENDPOINTS.AUTH.BASE + ENDPOINTS.AUTH.PATH.ESCROW.INIT, {
                a: await authenticator.getClientEphemeral(),
                accountName: ``,
                protocols: [
                    `s2k`,
                    `s2k_fo`,
                ],
            });

            const validatedInitResponse = Resources.validator().validateEscrowInitResponse(initResponse);

            const derivedPassword = await authenticator.derivePassword(validatedInitResponse.data.protocol, validatedInitResponse.data.salt, validatedInitResponse.data.iteration);
            const [m1Proof, m2Proof] = await authenticator.getProofValues(derivedPassword, validatedInitResponse.data.b, validatedInitResponse.data.salt);

            const completeResponse = await Resources.network().post(ENDPOINTS.AUTH.BASE + ENDPOINTS.AUTH.PATH.ESCROW.COMPLETE, {
                m1: m1Proof,
                m2: m2Proof,
                c: validatedInitResponse.data.c,
                k: await authenticator.getSessionKey(),
            });

            Resources.network().applySessionTokenUpdate(completeResponse);
            Resources.logger(this).debug(`Escrow completed`);
        } catch (err) {
            throw new iCPSError(AUTH_ERR.ESCROW_FAILED).addCause(err);
        }
    }

    /**
     * Checks if the response data contains a specific service error code
     * @param data - The response data
     * @param code - The service error code to look for
     * @returns True, if the service error is present
     */
    hasServiceError(data: any, code: string): boolean {
        return Array.isArray(data?.service_errors) && data.service_errors.some((serviceError: any) => serviceError?.code === code);
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
            // Matching the iCloud web frontend, which provides the trust token in order to register this client as trusted browser
            const data = {
                dsWebAuthToken: Resources.manager().sessionSecret,
                accountCountryCode: Resources.network().accountCountry,
                extended_login: true,
                trustToken: Resources.manager().trustToken,
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
            if (isAxiosError(err) && err.response?.status === 421) {
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
     * Performs a logout, while retaining the trust token
     */
    async logout() {
        try {
            const url = ENDPOINTS.SETUP.BASE() + ENDPOINTS.SETUP.PATH.LOGOUT;
            const data = {
                trustBrowser: true,
                allBrowsers: false,
            };

            const config: AxiosRequestConfig = {
                // 421 is expected, if user was not logged in - 200 is expected, if logout was successful
                validateStatus: status => status === 421 || status === 200,
            };

            Resources.logger(this).info(`Logging current account out`);

            await Resources.network().post(url, data, config);
        } catch (err) {
            throw new iCPSError(AUTH_ERR.LOGOUT_FAILED).addCause(err);
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