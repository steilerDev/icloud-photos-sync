import axios, {AxiosRequestConfig, AxiosRequestHeaders} from 'axios';

import EventEmitter from 'events';
import {MFAServer} from './mfa-server/mfa-server.js';
import * as ICLOUD from './constants.js';
import * as ICLOUD_PHOTOS from './icloud-photos/constants.js';
import * as MFA_SERVER from './mfa-server/constants.js';
import {iCloudPhotos} from './icloud-photos/icloud-photos.js';
import {iCloudAuth} from './auth.js';
import {OptionValues} from 'commander';
import {getLogger} from '../logger.js';

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
     * Holds information, which mfa method was last used, in order to validate code using the right endpoint
     * Per default, this should be 'device'
     */
    mfaMethod: ICLOUD.MFAMethod;

    /**
     * Holds information, which trusted phone number (id of number) was last used, in order to validate code using right endpoint
     */
    mfaPhoneNumberId: number;

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
            ]
        };
        console.warn(JSON.stringify(data))

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
                            console.warn(JSON.stringify(res.data))
                            this.logger.debug(`Acquired secrets, requiring MFA: ${JSON.stringify(this.auth.iCloudAuthSecrets)}`);
                            // Per default, the trusted device is pinged
                            this.mfaMethod = ICLOUD.MFAMethod.DEVICE;
                            this.emit(ICLOUD.EVENTS.MFA_REQUIRED, this.mfaServer.port);
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

    resendMFA(method: ICLOUD.MFAMethod, phoneNumberId?: number) {
        this.mfaMethod = method;
        this.mfaPhoneNumberId = phoneNumberId ? phoneNumberId : 1; // 1 is the primary registered phone number id
        this.logger.info(`Resending MFA code with ${this.mfaMethod} and phone number id ${this.mfaPhoneNumberId}`);

        const config: AxiosRequestHeaders = {
            headers: this.auth.getMFAHeaders(),
        };

        let data = {};
        let url = ``;
        switch (this.mfaMethod) {
        case ICLOUD.MFAMethod.VOICE:
            data = {
                phoneNumber: {
                    id: this.mfaPhoneNumberId,
                },
                mode: `voice`,
            };
            url = ICLOUD.URL.MFA_PHONE;
            break;
        case ICLOUD.MFAMethod.SMS:
            data = {
                phoneNumber: {
                    id: this.mfaPhoneNumberId,
                },
                mode: `sms`,
            };
            url = ICLOUD.URL.MFA_PHONE;
            break;
        default:
        case ICLOUD.MFAMethod.DEVICE:
            url = ICLOUD.URL.MFA_DEVICE;
            data = undefined;
            break;
        }

        this.logger.debug(`Requesting MFA code via URL ${url} with data ${JSON.stringify(data)}`);
        axios.put(url, data, config)
            .then(res => { // Weird difference in response code, depending on endpoint
                if ((this.mfaMethod === ICLOUD.MFAMethod.DEVICE && res.status !== 202)
                || ((this.mfaMethod === ICLOUD.MFAMethod.SMS || this.mfaMethod === ICLOUD.MFAMethod.VOICE) && res.status !== 200)) {
                    this.emit(ICLOUD.EVENTS.ERROR, `Unable to request new MFA code: ${JSON.stringify(res)}`);
                    return;
                }

                if (this.mfaMethod === ICLOUD.MFAMethod.SMS || this.mfaMethod === ICLOUD.MFAMethod.VOICE) {
                    this.logger.info(`Sucesfully requested new MFA code using phone ${res.data.trustedPhoneNumber.numberWithDialCode}`);
                } else {
                    this.logger.info(`Sucesfully requested new MFA code using ${res.data.trustedDeviceCount} trusted device(s)`);
                }
            })
            .catch(err => {
                this.emit(ICLOUD.EVENTS.ERROR, `Received error while trying to resend MFA code: ${err}`);
            });
    }

    /**
     * Enters and validates the MFA code in order to acquire necessary account tokens
     * @param mfa - The MFA code
     */
    mfaReceived(mfa: string) {
        this.mfaServer.stopServer();

        if (!this.auth.validateAuthSecrets()) {
            this.emit(ICLOUD.EVENTS.ERROR, `Unable to process MFA, because auth secrets are missing: ${JSON.stringify(this.auth.iCloudAuthSecrets)}`);
            return;
        }

        this.logger.info(`Authenticating MFA with code ${mfa}`);

        const config: AxiosRequestHeaders = {
            headers: this.auth.getMFAHeaders(),
        };

        let data = {};
        let url = ``;
        switch (this.mfaMethod) {
        case ICLOUD.MFAMethod.VOICE:
            data = {
                securityCode: {
                    code: `${mfa}`,
                },
                phoneNumber: {
                    id: this.mfaPhoneNumberId,
                },
                mode: `voice`,
            };
            url = ICLOUD.URL.MFA_PHONE_ENTER;
            break;
        case ICLOUD.MFAMethod.SMS:
            data = {
                securityCode: {
                    code: `${mfa}`,
                },
                phoneNumber: {
                    id: this.mfaPhoneNumberId,
                },
                mode: `sms`,
            };
            url = ICLOUD.URL.MFA_PHONE_ENTER;
            break;
        default:
        case ICLOUD.MFAMethod.DEVICE:
            url = ICLOUD.URL.MFA_DEVICE_ENTER;
            data = {
                securityCode: {
                    code: `${mfa}`,
                },
            };
            break;
        }

        axios.post(url, data, config)
            .then(res => { // Weird difference in response code, depending on endpoint
                if ((this.mfaMethod === ICLOUD.MFAMethod.DEVICE && res.status !== 204)
                   || ((this.mfaMethod === ICLOUD.MFAMethod.SMS || this.mfaMethod === ICLOUD.MFAMethod.VOICE) && res.status !== 200)) {
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
     * Acquiring necessary cookies from trust and auth token for further processing & gets the user specific domain to interact with the Photos backend
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
        if (this.photos && this.auth.validateCloudCookies()) {
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