import {MockedEventManager, MockedNetworkManager, MockedResourceManager, MockedValidator, UnknownAsyncFunction, prepareResources} from '../_helpers/_general';
import {describe, test, beforeEach, expect, jest} from '@jest/globals';
import {MFAMethod} from '../../src/lib/icloud/mfa/mfa-method';
import * as Config from '../_helpers/_config';
import {iCloud} from '../../src/lib/icloud/icloud';
import {iCloudPhotos} from '../../src/lib/icloud/icloud-photos/icloud-photos';
import {MFA_ERR, VALIDATOR_ERR} from '../../src/app/error/error-codes';
import {iCPSError} from '../../src/app/error/error';
import {iCPSEventCloud, iCPSEventLog, iCPSEventMFA, iCPSEventPhotos, iCPSEventRuntimeWarning} from '../../src/lib/resources/events-types';
import {Resources} from '../../src/lib/resources/main';

let mockedResourceManager: MockedResourceManager;
let mockedEventManager: MockedEventManager;
let mockedValidator: MockedValidator;
let mockedNetworkManager: MockedNetworkManager;
let icloud: iCloud;

beforeEach(() => {
    const instances = prepareResources()!;
    mockedResourceManager = instances.manager;
    mockedEventManager = instances.event;
    mockedValidator = instances.validator;
    mockedNetworkManager = instances.network;

    icloud = new iCloud();
});

describe(`Control structure`, () => {
    test(`TRUSTED event triggered`, () => {
        icloud.setupAccount = jest.fn<typeof icloud.setupAccount>()
            .mockResolvedValue();

        mockedEventManager.emit(iCPSEventCloud.TRUSTED);

        expect(icloud.setupAccount).toHaveBeenCalled();
    });

    test(`AUTHENTICATED event triggered`, () => {
        icloud.getTokens = jest.fn<typeof icloud.getTokens>()
            .mockResolvedValue();

        mockedEventManager.emit(iCPSEventCloud.AUTHENTICATED);

        expect(icloud.getTokens).toHaveBeenCalled();
    });

    test(`ACCOUNT_READY event triggered`, () => {
        icloud.getPhotosReady = jest.fn<typeof icloud.getPhotosReady>()
            .mockResolvedValue();

        mockedEventManager.emit(iCPSEventCloud.ACCOUNT_READY);

        expect(icloud.getPhotosReady).toHaveBeenCalled();
    });

    test(`SESSION_EXPIRED event triggered`, () => {
        icloud.authenticate = jest.fn<typeof icloud.authenticate>()
            .mockResolvedValue(true);

        mockedEventManager.emit(iCPSEventCloud.SESSION_EXPIRED);

        expect(icloud.authenticate).toHaveBeenCalled();
    });

    describe(`MFA_REQUIRED event triggered`, () => {
        test(`Start MFA Server`, () => {
            icloud.mfaServer.startServer = jest.fn<typeof icloud.mfaServer.startServer>();

            mockedEventManager.emit(iCPSEventCloud.MFA_REQUIRED);

            expect(icloud.mfaServer.startServer).toHaveBeenCalled();
        });

        test(`MFA Server Startup error`, async () => {
            mockedEventManager.emit(iCPSEventMFA.ERROR, new iCPSError(MFA_ERR.STARTUP_FAILED));

            await expect(icloud.ready).rejects.toThrow(/^Unable to start MFA server$/);
        });

        test(`Fail on MFA`, async () => {
            mockedResourceManager._resources.failOnMfa = true;

            icloud.mfaServer.startServer = jest.fn<typeof icloud.mfaServer.startServer>();

            mockedEventManager.emit(iCPSEventCloud.MFA_REQUIRED);

            await expect(icloud.ready).rejects.toThrow(/^MFA code required, failing due to failOnMfa flag$/);

            expect(icloud.mfaServer.startServer).not.toHaveBeenCalled();
        });
    });

    test(`MFA_NOT_PROVIDED event triggered`, async () => {
        mockedEventManager.emit(iCPSEventMFA.MFA_NOT_PROVIDED, new iCPSError(MFA_ERR.SERVER_TIMEOUT));
        await expect(icloud.ready).resolves.toBeFalsy();
    });

    test.each([
        {
            desc: `iCloud`,
            event: iCPSEventCloud.ERROR,
        }, {
            desc: `MFA`,
            event: iCPSEventMFA.ERROR,
        },
    ])(`$desc error event triggered`, async ({event}) => {
        mockedEventManager._eventBus.removeAllListeners(event); // Not sure why this is necessary
        icloud.ready = icloud.getReady();

        mockedEventManager.emit(event, new iCPSError());
        await expect(icloud.ready).rejects.toThrow(/^Unknown error occurred$/);
    });
});

describe.each([
    {
        desc: `Initial setup`,
        photosDomain: undefined,
    }, {
        desc: `Re-authentication`,
        photosDomain: Config.photosDomain,
    },
])(`Setup iCloud: $desc`, ({photosDomain}) => {
    beforeEach(() => {
        mockedResourceManager._readResourceFile
            .mockReturnValue({
                libraryVersion: 1,
                trustToken: Config.trustToken,
            });

        if (photosDomain) {
            mockedNetworkManager.photosUrl = photosDomain;
        }
    });

    describe(`Authenticate`, () => {
        test(`Valid Trust Token`, async () => {
            // ICloud.authenticate returns ready promise. Need to modify in order to resolve at the end of the test
            icloud.ready = new Promise<boolean>((resolve, _reject) => resolve(true));

            const authenticationEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.AUTHENTICATION_STARTED);
            const trustedEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.TRUSTED);
            const errorEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.ERROR);

            mockedValidator.validateSigninResponse = jest.fn<typeof mockedValidator.validateSigninResponse>();
            mockedNetworkManager.applySigninResponse = jest.fn<typeof mockedNetworkManager.applySigninResponse>();

            mockedNetworkManager.mock
                .onPost(`https://idmsa.apple.com/appleauth/auth/signin`, {
                    accountName: Config.defaultConfig.username,
                    password: Config.defaultConfig.password,
                    trustTokens: [
                        Config.trustToken,
                    ],
                }, Config.REQUEST_HEADER.AUTH,
                )
                .reply(200);

            await icloud.authenticate();

            expect(authenticationEvent).toHaveBeenCalled();
            expect(trustedEvent).toHaveBeenCalled();
            expect(errorEvent).not.toHaveBeenCalled();
            expect(mockedValidator.validateSigninResponse).toHaveBeenCalled();
            expect(mockedNetworkManager.applySigninResponse).toHaveBeenCalled();
        });

        test(`Invalid Trust Token - MFA Required`, async () => {
            mockedResourceManager._readResourceFile
                .mockReturnValue({
                    libraryVersion: 1,
                    trustToken: undefined,
                });

            // ICloud.authenticate returns ready promise. Need to modify in order to resolve at the end of the test
            icloud.ready = new Promise<boolean>((resolve, _reject) => resolve(true));

            const authenticationEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.AUTHENTICATION_STARTED);
            const mfaEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.MFA_REQUIRED);
            const trustedEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.TRUSTED);
            const errorEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.ERROR);

            mockedValidator.validateSigninResponse = jest.fn<typeof mockedValidator.validateSigninResponse>();
            mockedNetworkManager.applySigninResponse = jest.fn<typeof mockedNetworkManager.applySigninResponse>();

            mockedNetworkManager.mock
                .onPost(`https://idmsa.apple.com/appleauth/auth/signin`, {
                    accountName: Config.defaultConfig.username,
                    password: Config.defaultConfig.password,
                    trustTokens: [null],
                }, Config.REQUEST_HEADER.AUTH)
                .reply(409);

            await icloud.authenticate();

            expect(trustedEvent).not.toHaveBeenCalled();
            expect(authenticationEvent).toHaveBeenCalled();
            expect(mfaEvent).toHaveBeenCalled();
            expect(errorEvent).not.toHaveBeenCalled();
            expect(mockedValidator.validateSigninResponse).toHaveBeenCalled();
            expect(mockedNetworkManager.applySigninResponse).toHaveBeenCalled();
            jest.resetAllMocks();
        });

        test(`Authentication response not matching validator`, async () => {
            const authenticationEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.AUTHENTICATION_STARTED);

            mockedValidator.validateSigninResponse = jest.fn<typeof mockedValidator.validateSigninResponse>(() => {
                throw new iCPSError(VALIDATOR_ERR.SIGNIN_RESPONSE);
            });

            mockedNetworkManager.mock
                .onPost(`https://idmsa.apple.com/appleauth/auth/signin`, {
                    accountName: Config.defaultConfig.username,
                    password: Config.defaultConfig.password,
                    trustTokens: [
                        Config.trustToken,
                    ],
                }, Config.REQUEST_HEADER.AUTH,
                )
                .reply(200);

            await expect(icloud.authenticate()).rejects.toThrow(/^Unable to parse and validate signin response$/);
            expect(authenticationEvent).toHaveBeenCalled();
        });

        describe(`Authentication backend error`, () => {
            test.each([
                {
                    desc: `Unknown username`,
                    status: 403,
                    expectedError: /^Username does not seem to exist$/,
                }, {
                    desc: `Wrong username/password combination`,
                    status: 401,
                    expectedError: /^Username\/Password does not seem to match$/,
                }, {
                    desc: `PreCondition failed`,
                    status: 412,
                    expectedError: /^iCloud refused login - you might need to update your password$/,
                }, {
                    desc: `Unexpected failure status code`,
                    status: 500,
                    expectedError: /^Unexpected HTTP response$/,
                },
            ])(`$desc`, async ({status, expectedError}) => {
                mockedNetworkManager.mock
                    .onPost(`https://idmsa.apple.com/appleauth/auth/signin`, {
                        accountName: Config.defaultConfig.username,
                        password: Config.defaultConfig.password,
                        trustTokens: [
                            Config.trustToken,
                        ],
                    }, Config.REQUEST_HEADER.AUTH,
                    )
                    .reply(status);

                const authenticationEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.AUTHENTICATION_STARTED);
                const trustedEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.TRUSTED);
                const mfaEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.MFA_REQUIRED);
                const errorEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.ERROR, false); // Required for promise to resolve

                await expect(icloud.authenticate()).rejects.toThrow(expectedError);
                expect(authenticationEvent).toHaveBeenCalled();
                expect(trustedEvent).not.toHaveBeenCalled();
                expect(mfaEvent).not.toHaveBeenCalled();
                expect(errorEvent).toHaveBeenCalledTimes(1);
            });
        });

        test(`Unknown authentication error`, async () => {
            mockedNetworkManager.post = (jest.fn<UnknownAsyncFunction>() as any)
                .mockRejectedValue(new Error(`Unknown Error`));

            const authenticationEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.AUTHENTICATION_STARTED);
            const trustedEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.TRUSTED);
            const mfaEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.MFA_REQUIRED);
            const errorEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.ERROR, false); // Required for promise to resolve

            await expect(icloud.authenticate()).rejects.toThrow(/^Received unknown error during authentication$/);
            expect(authenticationEvent).toHaveBeenCalled();
            expect(trustedEvent).not.toHaveBeenCalled();
            expect(mfaEvent).not.toHaveBeenCalled();
            expect(errorEvent).toHaveBeenCalledTimes(1);
        });
    });

    describe(`MFA Flow`, () => {
        describe(`Resend MFA`, () => {
            describe.each([
                {
                    method: `device`,
                    endpoint: `https://idmsa.apple.com/appleauth/auth/verify/trusteddevice`,
                    payload: undefined,
                    codes: {
                        success: 202,
                        invalid: 403,
                    },
                    validatedResponse: {
                        data: {
                            trustedDeviceCount: 1,
                        },
                    },
                    successMessage: `Successfully requested new MFA code using 1 trusted device(s)`,
                },
                {
                    method: `voice`,
                    endpoint: `https://idmsa.apple.com/appleauth/auth/verify/phone`,
                    payload: undefined,
                    codes: {
                        success: 200,
                        invalid: 403,
                    },
                    validatedResponse: {
                        data: {
                            trustedPhoneNumber: {
                                numberWithDialCode: `someNumber`,
                            },
                        },
                    },
                    successMessage: `Successfully requested new MFA code using phone someNumber`,
                },
                {
                    method: `sms`,
                    endpoint: `https://idmsa.apple.com/appleauth/auth/verify/phone`,
                    payload: undefined,
                    codes: {
                        success: 200,
                        invalid: 403,
                    },
                    validatedResponse: {
                        data: {
                            trustedPhoneNumber: {
                                numberWithDialCode: `someNumber`,
                            },
                        },
                    },
                    successMessage: `Successfully requested new MFA code using phone someNumber`,
                },

            ])(`Method: $method`, ({method, endpoint, payload, codes, validatedResponse, successMessage}) => {
                test(`Success`, async () => {
                    mockedNetworkManager._headerJar.setCookie(Config.aaspCookieString);
                    mockedNetworkManager.scnt = Config.iCloudAuthSecrets.scnt;
                    mockedNetworkManager.sessionId = Config.iCloudAuthSecrets.sessionSecret;

                    if (method === `device`) {
                        mockedValidator.validateResendMFADeviceResponse = jest.fn<typeof mockedValidator.validateResendMFADeviceResponse>()
                            .mockReturnValue(validatedResponse as any);
                    }

                    if (method === `sms` || method === `voice`) {
                        mockedValidator.validateResendMFAPhoneResponse = jest.fn<typeof mockedValidator.validateResendMFAPhoneResponse>()
                            .mockReturnValue(validatedResponse as any);
                    }

                    mockedNetworkManager.mock
                        .onPut(endpoint,
                            payload,
                            {
                                ...Config.REQUEST_HEADER.AUTH,
                                scnt: Config.iCloudAuthSecrets.scnt,
                                Cookie: `aasp=${Config.iCloudAuthSecrets.aasp}`,
                                'X-Apple-ID-Session-Id': Config.iCloudAuthSecrets.sessionSecret,
                            },
                        )
                        .reply(codes.success);

                    const infoLogEvent = mockedEventManager.spyOnEvent(iCPSEventLog.INFO);

                    await icloud.resendMFA(new MFAMethod(method as any));

                    if (method === `device`) {
                        expect(mockedValidator.validateResendMFADeviceResponse).toHaveBeenCalled();
                    }

                    if (method === `sms` || method === `voice`) {
                        expect(mockedValidator.validateResendMFAPhoneResponse).toHaveBeenCalled();
                    }

                    // Event is called with 'this' and message - getting the second argument of the last call
                    expect(infoLogEvent.mock.calls.pop()?.pop()).toEqual(successMessage);
                });

                test(`Response not matching validator`, async () => {
                    mockedNetworkManager._headerJar.setCookie(Config.aaspCookieString);
                    mockedNetworkManager.scnt = Config.iCloudAuthSecrets.scnt;
                    mockedNetworkManager.sessionId = Config.iCloudAuthSecrets.sessionSecret;

                    if (method === `device`) {
                        mockedValidator.validateResendMFADeviceResponse = jest.fn<typeof mockedValidator.validateResendMFADeviceResponse>(() => {
                            throw new iCPSError(VALIDATOR_ERR.RESEND_MFA_DEVICE_RESPONSE);
                        });
                    }

                    if (method === `sms` || method === `voice`) {
                        mockedValidator.validateResendMFAPhoneResponse = jest.fn<typeof mockedValidator.validateResendMFAPhoneResponse>(() => {
                            throw new iCPSError(VALIDATOR_ERR.RESEND_MFA_PHONE_RESPONSE);
                        });
                    }

                    mockedNetworkManager.mock
                        .onPut(endpoint,
                            payload,
                            {
                                ...Config.REQUEST_HEADER.AUTH,
                                scnt: Config.iCloudAuthSecrets.scnt,
                                Cookie: `aasp=${Config.iCloudAuthSecrets.aasp}`,
                                'X-Apple-ID-Session-Id': Config.iCloudAuthSecrets.sessionSecret,
                            },
                        )
                        .reply(codes.success);

                    // Checking if rejection is properly parsed
                    const warnEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.MFA_ERROR);

                    await icloud.resendMFA(new MFAMethod(method as any));

                    if (method === `device`) {
                        expect(mockedValidator.validateResendMFADeviceResponse).toHaveBeenCalled();
                    }

                    if (method === `sms` || method === `voice`) {
                        expect(mockedValidator.validateResendMFAPhoneResponse).toHaveBeenCalled();
                    }

                    expect(warnEvent).toHaveBeenCalled();
                });

                test(`Resend unsuccessful`, async () => {
                    mockedNetworkManager._headerJar.setCookie(Config.aaspCookieString);
                    mockedNetworkManager.scnt = Config.iCloudAuthSecrets.scnt;
                    mockedNetworkManager.sessionId = Config.iCloudAuthSecrets.sessionSecret;

                    mockedNetworkManager.mock
                        .onPut(endpoint,
                            payload,
                            {
                                ...Config.REQUEST_HEADER.AUTH,
                                scnt: Config.iCloudAuthSecrets.scnt,
                                Cookie: `aasp=${Config.iCloudAuthSecrets.aasp}`,
                                'X-Apple-ID-Session-Id': Config.iCloudAuthSecrets.sessionSecret,
                            },
                        )
                        .reply(codes.invalid);

                    // Checking if rejection is properly parsed
                    const warnEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.MFA_ERROR);

                    await icloud.resendMFA(new MFAMethod(method as any));

                    expect(warnEvent).toHaveBeenCalled();
                });
            });
        });

        describe(`Enter Code`, () => {
            describe.each([
                {
                    method: `device`,
                    endpoint: `https://idmsa.apple.com/appleauth/auth/verify/trusteddevice/securitycode`,
                    payload: {
                        securityCode: {
                            code: `123456`,
                        },
                    },
                    codes: {
                        success: 204,
                        failure: 403,
                    },
                }, {
                    method: `sms`,
                    endpoint: `https://idmsa.apple.com/appleauth/auth/verify/phone/securitycode`,
                    payload: {
                        securityCode: {
                            code: `123456`,
                        },
                        phoneNumber: {
                            id: 1,
                        },
                        mode: `sms`,
                    },
                    codes: {
                        success: 200,
                        failure: 403,
                    },
                }, {
                    method: `voice`,
                    endpoint: `https://idmsa.apple.com/appleauth/auth/verify/phone/securitycode`,
                    payload: {
                        securityCode: {
                            code: `123456`,
                        },
                        phoneNumber: {
                            id: 1,
                        },
                        mode: `voice`,
                    },
                    codes: {
                        success: 200,
                        failure: 403,
                    },
                },
            ])(`Method: $method`, ({method, endpoint, payload, codes}) => {
                test(`Success`, async () => {
                    mockedNetworkManager._headerJar.setCookie(Config.aaspCookieString);
                    mockedNetworkManager.scnt = Config.iCloudAuthSecrets.scnt;
                    mockedNetworkManager.sessionId = Config.iCloudAuthSecrets.sessionSecret;

                    mockedNetworkManager.mock
                        .onPost(endpoint,
                            payload,
                            {
                                ...Config.REQUEST_HEADER.AUTH,
                                scnt: Config.iCloudAuthSecrets.scnt,
                                Cookie: `aasp=${Config.iCloudAuthSecrets.aasp}`,
                                'X-Apple-ID-Session-Id': Config.iCloudAuthSecrets.sessionSecret,
                            },
                        )
                        .reply(codes.success);

                    // Checking if rejection is properly parsed
                    const authenticatedEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.AUTHENTICATED);

                    await icloud.submitMFA(new MFAMethod(method as any), `123456`);

                    expect(authenticatedEvent).toHaveBeenCalled();
                });

                test(`Failure`, async () => {
                    mockedNetworkManager._headerJar.setCookie(Config.aaspCookieString);
                    mockedNetworkManager.scnt = Config.iCloudAuthSecrets.scnt;
                    mockedNetworkManager.sessionId = Config.iCloudAuthSecrets.sessionSecret;

                    mockedNetworkManager.mock
                        .onPost(endpoint,
                            payload,
                            {
                                ...Config.REQUEST_HEADER.AUTH,
                                scnt: Config.iCloudAuthSecrets.scnt,
                                Cookie: `aasp=${Config.iCloudAuthSecrets.aasp}`,
                                'X-Apple-ID-Session-Id': Config.iCloudAuthSecrets.sessionSecret,
                            },
                        )
                        .reply(codes.failure);

                    await icloud.submitMFA(new MFAMethod(method as any), `123456`);

                    await expect(icloud.ready).rejects.toThrow(/^Unable to submit MFA code$/);
                });
            });
        });
    });

    describe(`Trust Token`, () => {
        test(`Success`, async () => {
            mockedNetworkManager._headerJar.setCookie(Config.aaspCookieString);
            mockedNetworkManager.scnt = Config.iCloudAuthSecrets.scnt;
            mockedNetworkManager.sessionId = Config.iCloudAuthSecrets.sessionSecret;

            mockedValidator.validateTrustResponse = jest.fn<typeof mockedValidator.validateTrustResponse>();
            mockedNetworkManager.applyTrustResponse = jest.fn<typeof mockedNetworkManager.applyTrustResponse>();

            const trustedEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.TRUSTED);

            mockedNetworkManager.mock
                .onGet(`https://idmsa.apple.com/appleauth/auth/2sv/trust`, {}, {
                    ...Config.REQUEST_HEADER.AUTH,
                    scnt: Config.iCloudAuthSecrets.scnt,
                    Cookie: `aasp=${Config.iCloudAuthSecrets.aasp}`,
                    'X-Apple-ID-Session-Id': Config.iCloudAuthSecrets.sessionSecret,
                })
                .reply(204);

            await icloud.getTokens();

            expect(mockedValidator.validateTrustResponse).toHaveBeenCalled();
            expect(mockedNetworkManager.applyTrustResponse).toHaveBeenCalled();
            expect(trustedEvent).toHaveBeenCalled();
        });

        test(`Error - Invalid Response`, async () => {
            mockedNetworkManager._headerJar.setCookie(Config.aaspCookieString);
            mockedNetworkManager.scnt = Config.iCloudAuthSecrets.scnt;
            mockedNetworkManager.sessionId = Config.iCloudAuthSecrets.sessionSecret;

            mockedValidator.validateTrustResponse = jest.fn<typeof mockedValidator.validateTrustResponse>(() => {
                throw new iCPSError(VALIDATOR_ERR.TRUST_RESPONSE);
            });

            mockedNetworkManager.mock
                .onGet(`https://idmsa.apple.com/appleauth/auth/2sv/trust`, {}, {
                    ...Config.REQUEST_HEADER.AUTH,
                    scnt: Config.iCloudAuthSecrets.scnt,
                    Cookie: `aasp=${Config.iCloudAuthSecrets.aasp}`,
                    'X-Apple-ID-Session-Id': Config.iCloudAuthSecrets.sessionSecret,
                })
                .reply(204);

            await icloud.getTokens();
            await expect(icloud.ready).rejects.toThrow(/^Unable to acquire account tokens$/);

            expect(mockedValidator.validateTrustResponse).toHaveBeenCalled();
        });

        test(`Error - Invalid Status Code`, async () => {
            mockedNetworkManager._headerJar.setCookie(Config.aaspCookieString);
            mockedNetworkManager.scnt = Config.iCloudAuthSecrets.scnt;
            mockedNetworkManager.sessionId = Config.iCloudAuthSecrets.sessionSecret;

            mockedNetworkManager.mock
                .onGet(`https://idmsa.apple.com/appleauth/auth/2sv/trust`, {}, {
                    ...Config.REQUEST_HEADER.AUTH,
                    scnt: Config.iCloudAuthSecrets.scnt,
                    Cookie: `aasp=${Config.iCloudAuthSecrets.aasp}`,
                    'X-Apple-ID-Session-Id': Config.iCloudAuthSecrets.sessionSecret,
                })
                .reply(500);

            await icloud.getTokens();
            await expect(icloud.ready).rejects.toThrow(/^Unable to acquire account tokens$/);
        });
    });

    describe(`Setup iCloud`, () => {
        test(`Success`, async () => {
            mockedNetworkManager.sessionId = Config.iCloudAuthSecrets.sessionSecret;
            mockedResourceManager._resources.trustToken = Config.trustToken;

            mockedValidator.validateSetupResponse = jest.fn<typeof mockedValidator.validateSetupResponse>();
            mockedNetworkManager.applySetupResponse = jest.fn<typeof mockedNetworkManager.applySetupResponse>();

            const accountReadyEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.ACCOUNT_READY);

            mockedNetworkManager.mock
                .onPost(`https://setup.icloud.com/setup/ws/1/accountLogin`, {
                    dsWebAuthToken: Config.iCloudAuthSecrets.sessionSecret,
                    trustToken: Config.trustToken,
                }, Config.REQUEST_HEADER.DEFAULT,
                )
                .reply(200);

            await icloud.setupAccount();

            expect(mockedValidator.validateSetupResponse).toHaveBeenCalled();
            expect(mockedNetworkManager.applySetupResponse).toHaveBeenCalled();
            expect(accountReadyEvent).toHaveBeenCalledTimes(1);
            expect(icloud.photos).toBeDefined();
        });

        test(`Session expired`, async () => {
            mockedNetworkManager.sessionToken = Config.iCloudAuthSecrets.sessionSecret;

            mockedValidator.validateSetupResponse = jest.fn<typeof mockedValidator.validateSetupResponse>(() => {
                throw new iCPSError(VALIDATOR_ERR.SETUP_RESPONSE);
            });

            const sessionExpiredEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.SESSION_EXPIRED);

            mockedNetworkManager.mock
                .onAny()
                .reply(421);

            await icloud.setupAccount();

            expect(sessionExpiredEvent).toHaveBeenCalled();
            expect(mockedValidator.validateSetupResponse).not.toHaveBeenCalled();
        });

        test(`Error - Invalid Response`, async () => {
            mockedNetworkManager.sessionToken = Config.iCloudAuthSecrets.sessionSecret;

            mockedValidator.validateSetupResponse = jest.fn<typeof mockedValidator.validateSetupResponse>(() => {
                throw new iCPSError(VALIDATOR_ERR.SETUP_RESPONSE);
            });

            mockedNetworkManager.mock
                .onAny()
                .reply(200);

            await icloud.setupAccount();
            await expect(icloud.ready).rejects.toThrow(/^Unable to setup iCloud Account$/);

            expect(mockedValidator.validateSetupResponse).toHaveBeenCalled();
        });

        test(`Error - Invalid Status Code`, async () => {
            mockedNetworkManager.sessionToken = Config.iCloudAuthSecrets.sessionSecret;

            mockedNetworkManager.mock
                .onAny()
                .reply(500);

            await icloud.setupAccount();
            await expect(icloud.ready).rejects.toThrow(/^Unable to setup iCloud Account$/);
        });

        describe(`Get iCloud Photos Ready`, () => {
            beforeEach(() => {
                icloud.photos = new iCloudPhotos();
            });

            test(`Setup resolves`, async () => {
                icloud.photos.setup = jest.fn<typeof icloud.photos.setup>(() => {
                    Resources.emit(iCPSEventPhotos.READY);
                    return Promise.resolve();
                });

                await icloud.getPhotosReady();

                await expect(icloud.ready).resolves.not.toThrow();

                expect(icloud.photos.setup).toHaveBeenCalled();
            });

            test(`Setup rejects`, async () => {
                icloud.photos.setup = jest.fn<typeof icloud.photos.setup>()
                    .mockRejectedValue(new Error());

                await icloud.getPhotosReady();
                await expect(icloud.ready).rejects.toThrow(/^Unable to get iCloud Photos service ready$/);

                expect(icloud.photos.setup).toHaveBeenCalled();
            });

            test(`Photos Object invalid`, async () => {
                icloud.photos = undefined as any;
                await icloud.getPhotosReady();

                await expect(icloud.ready).rejects.toThrow(/^Unable to get iCloud Photos service ready$/);
            });
        });
    });
});