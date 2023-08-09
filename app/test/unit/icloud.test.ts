import {MockedResourceManager, UnknownAsyncFunction, prepareResourceManager} from '../_helpers/_general';
import {describe, test, beforeEach, expect, jest} from '@jest/globals';
import {MFAMethod} from '../../src/lib/icloud/mfa/mfa-method';
import * as Config from '../_helpers/_config';
import {iCloud} from '../../src/lib/icloud/icloud';
import {iCloudPhotos} from '../../src/lib/icloud/icloud-photos/icloud-photos';
import {ResourceManager} from '../../src/lib/resource-manager/resource-manager';
import {MFA_ERR, VALIDATOR_ERR} from '../../src/app/error/error-codes';
import {iCPSError} from '../../src/app/error/error';
import {iCPSEventCloud, iCPSEventLog, iCPSEventMFA, iCPSEventPhotos} from '../../src/lib/resource-manager/events';

let mockedResourceManager: MockedResourceManager;
let icloud: iCloud;

beforeEach(() => {
    mockedResourceManager = prepareResourceManager()!;
    icloud = new iCloud();
});

describe(`Control structure`, () => {
    test(`TRUSTED event triggered`, () => {
        icloud.setupAccount = jest.fn<typeof icloud.setupAccount>()
            .mockResolvedValue();

        mockedResourceManager._eventManager.emit(iCPSEventCloud.TRUSTED);

        expect(icloud.setupAccount).toHaveBeenCalled();
    });

    test(`AUTHENTICATED event triggered`, () => {
        icloud.getTokens = jest.fn<typeof icloud.getTokens>()
            .mockResolvedValue();

        mockedResourceManager._eventManager.emit(iCPSEventCloud.AUTHENTICATED);

        expect(icloud.getTokens).toHaveBeenCalled();
    });

    test(`ACCOUNT_READY event triggered`, () => {
        icloud.getPhotosReady = jest.fn<typeof icloud.getPhotosReady>()
            .mockResolvedValue();

        mockedResourceManager._eventManager.emit(iCPSEventCloud.ACCOUNT_READY);

        expect(icloud.getPhotosReady).toHaveBeenCalled();
    });

    describe(`MFA_REQUIRED event triggered`, () => {
        test(`Start MFA Server`, () => {
            icloud.mfaServer.startServer = jest.fn<typeof icloud.mfaServer.startServer>();

            mockedResourceManager._eventManager.emit(iCPSEventCloud.MFA_REQUIRED);

            expect(icloud.mfaServer.startServer).toHaveBeenCalled();
        });

        test(`MFA Server Startup error`, async () => {
            mockedResourceManager._eventManager.emit(iCPSEventMFA.ERROR, new iCPSError(MFA_ERR.STARTUP_FAILED));

            await expect(icloud.ready).rejects.toThrow(/^Unable to start MFA server$/);
        });

        test(`Fail on MFA`, async () => {
            mockedResourceManager._resources.failOnMfa = true;

            icloud.mfaServer.startServer = jest.fn<typeof icloud.mfaServer.startServer>();

            mockedResourceManager._eventManager.emit(iCPSEventCloud.MFA_REQUIRED);

            await expect(icloud.ready).rejects.toThrow(/^MFA code required, failing due to failOnMfa flag$/);

            expect(icloud.mfaServer.startServer).not.toHaveBeenCalled();
        });
    });

    test(`MFA_NOT_PROVIDED event triggered`, async () => {
        mockedResourceManager._eventManager.emit(iCPSEventMFA.MFA_NOT_PROVIDED, new iCPSError(MFA_ERR.SERVER_TIMEOUT));
        await expect(icloud.ready).rejects.toThrow(/^MFA server timeout \(code needs to be provided within 10 minutes\)$/);
    });

    test.each([
        {
            desc: `iCloud`,
            event: iCPSEventCloud.ERROR,
        }, {
            desc: `MFA`,
            event: iCPSEventMFA.ERROR,
        }, {
            desc: `Photos`,
            event: iCPSEventPhotos.ERROR,
        },
    ])(`$desc error event triggered`, async ({event}) => {
        mockedResourceManager._eventManager._eventBus.removeAllListeners(event); // Not sure why this is necessary
        icloud.ready = icloud.getReady();

        mockedResourceManager._eventManager.emit(event, new iCPSError());
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
        mockedResourceManager._networkManager.photosUrl = photosDomain;
    });

    describe(`Authenticate`, () => {
        test(`Valid Trust Token`, async () => {
            // ICloud.authenticate returns ready promise. Need to modify in order to resolve at the end of the test
            icloud.ready = new Promise<void>((resolve, _reject) => resolve());

            const authenticationEvent = mockedResourceManager.spyOnEvent(iCPSEventCloud.AUTHENTICATION_STARTED);
            const trustedEvent = mockedResourceManager.spyOnEvent(iCPSEventCloud.TRUSTED);
            const errorEvent = mockedResourceManager.spyOnEvent(iCPSEventCloud.ERROR);

            mockedResourceManager._validator.validateSigninResponse = jest.fn<typeof ResourceManager.validator.validateSigninResponse>();
            mockedResourceManager._networkManager.applySigninResponse = jest.fn<typeof ResourceManager.network.applySigninResponse>();

            mockedResourceManager._networkManager.mock
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
            expect(mockedResourceManager._validator.validateSigninResponse).toHaveBeenCalled();
            expect(mockedResourceManager._networkManager.applySigninResponse).toHaveBeenCalled();
        });

        test(`Invalid Trust Token - MFA Required`, async () => {
            jest.spyOn(ResourceManager.prototype, `_trustToken`, `get`).mockReturnValue(undefined);

            // ICloud.authenticate returns ready promise. Need to modify in order to resolve at the end of the test
            icloud.ready = new Promise<void>((resolve, _reject) => resolve());

            const authenticationEvent = mockedResourceManager.spyOnEvent(iCPSEventCloud.AUTHENTICATION_STARTED);
            const mfaEvent = mockedResourceManager.spyOnEvent(iCPSEventCloud.MFA_REQUIRED);
            const trustedEvent = mockedResourceManager.spyOnEvent(iCPSEventCloud.TRUSTED);
            const errorEvent = mockedResourceManager.spyOnEvent(iCPSEventCloud.ERROR);

            mockedResourceManager._validator.validateSigninResponse = jest.fn<typeof mockedResourceManager._validator.validateSigninResponse>();
            mockedResourceManager._networkManager.applySigninResponse = jest.fn<typeof mockedResourceManager._networkManager.applySigninResponse>();

            mockedResourceManager._networkManager.mock
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
            expect(mockedResourceManager._validator.validateSigninResponse).toHaveBeenCalled();
            expect(mockedResourceManager._networkManager.applySigninResponse).toHaveBeenCalled();
            jest.resetAllMocks();
        });

        test(`Authentication response not matching validator`, async () => {
            const authenticationEvent = mockedResourceManager.spyOnEvent(iCPSEventCloud.AUTHENTICATION_STARTED);

            mockedResourceManager._validator.validateSigninResponse = jest.fn<typeof ResourceManager.validator.validateSigninResponse>(() => {
                throw new iCPSError(VALIDATOR_ERR.SIGNIN_RESPONSE);
            });

            mockedResourceManager._networkManager.mock
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
                mockedResourceManager._networkManager.mock
                    .onPost(`https://idmsa.apple.com/appleauth/auth/signin`, {
                        accountName: Config.defaultConfig.username,
                        password: Config.defaultConfig.password,
                        trustTokens: [
                            Config.trustToken,
                        ],
                    }, Config.REQUEST_HEADER.AUTH,
                    )
                    .reply(status);

                const authenticationEvent = mockedResourceManager.spyOnEvent(iCPSEventCloud.AUTHENTICATION_STARTED);
                const trustedEvent = mockedResourceManager.spyOnEvent(iCPSEventCloud.TRUSTED);
                const mfaEvent = mockedResourceManager.spyOnEvent(iCPSEventCloud.MFA_REQUIRED);
                const errorEvent = mockedResourceManager.spyOnEvent(iCPSEventCloud.ERROR, false); // Required for promise to resolve

                await expect(icloud.authenticate()).rejects.toThrow(expectedError);
                expect(authenticationEvent).toHaveBeenCalled();
                expect(trustedEvent).not.toHaveBeenCalled();
                expect(mfaEvent).not.toHaveBeenCalled();
                expect(errorEvent).toHaveBeenCalledTimes(1);
            });
        });

        test(`Unknown authentication error`, async () => {
            mockedResourceManager._networkManager.post = (jest.fn<UnknownAsyncFunction>() as any)
                .mockRejectedValue(new Error(`Unknown Error`));

            const authenticationEvent = mockedResourceManager.spyOnEvent(iCPSEventCloud.AUTHENTICATION_STARTED);
            const trustedEvent = mockedResourceManager.spyOnEvent(iCPSEventCloud.TRUSTED);
            const mfaEvent = mockedResourceManager.spyOnEvent(iCPSEventCloud.MFA_REQUIRED);
            const errorEvent = mockedResourceManager.spyOnEvent(iCPSEventCloud.ERROR, false); // Required for promise to resolve

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
                    mockedResourceManager._networkManager._headerJar.setCookie(Config.aaspCookieString);
                    mockedResourceManager._networkManager.scnt = Config.iCloudAuthSecrets.scnt;
                    mockedResourceManager._networkManager.sessionId = Config.iCloudAuthSecrets.sessionSecret;

                    if (method === `device`) {
                        mockedResourceManager._validator.validateResendMFADeviceResponse = jest.fn<typeof mockedResourceManager._validator.validateResendMFADeviceResponse>()
                            .mockReturnValue(validatedResponse as any);
                    }

                    if (method === `sms` || method === `voice`) {
                        mockedResourceManager._validator.validateResendMFAPhoneResponse = jest.fn<typeof mockedResourceManager._validator.validateResendMFAPhoneResponse>()
                            .mockReturnValue(validatedResponse as any);
                    }

                    mockedResourceManager._networkManager.mock
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

                    const infoLogEvent = mockedResourceManager.spyOnEvent(iCPSEventLog.INFO);

                    await icloud.resendMFA(new MFAMethod(method as any));

                    if (method === `device`) {
                        expect(mockedResourceManager._validator.validateResendMFADeviceResponse).toHaveBeenCalled();
                    }

                    if (method === `sms` || method === `voice`) {
                        expect(mockedResourceManager._validator.validateResendMFAPhoneResponse).toHaveBeenCalled();
                    }

                    // Event is called with 'this' and message - getting the second argument of the last call
                    expect(infoLogEvent.mock.calls.pop()?.pop()).toEqual(successMessage);
                });

                test(`Response not matching validator`, async () => {
                    mockedResourceManager._networkManager._headerJar.setCookie(Config.aaspCookieString);
                    mockedResourceManager._networkManager.scnt = Config.iCloudAuthSecrets.scnt;
                    mockedResourceManager._networkManager.sessionId = Config.iCloudAuthSecrets.sessionSecret;

                    if (method === `device`) {
                        mockedResourceManager._validator.validateResendMFADeviceResponse = jest.fn<typeof mockedResourceManager._validator.validateResendMFADeviceResponse>(() => {
                            throw new iCPSError(VALIDATOR_ERR.RESEND_MFA_DEVICE_RESPONSE);
                        });
                    }

                    if (method === `sms` || method === `voice`) {
                        mockedResourceManager._validator.validateResendMFAPhoneResponse = jest.fn<typeof mockedResourceManager._validator.validateResendMFAPhoneResponse>(() => {
                            throw new iCPSError(VALIDATOR_ERR.RESEND_MFA_PHONE_RESPONSE);
                        });
                    }

                    mockedResourceManager._networkManager.mock
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
                    const warnEvent = mockedResourceManager.spyOnHandlerEvent();

                    await icloud.resendMFA(new MFAMethod(method as any));

                    if (method === `device`) {
                        expect(mockedResourceManager._validator.validateResendMFADeviceResponse).toHaveBeenCalled();
                    }

                    if (method === `sms` || method === `voice`) {
                        expect(mockedResourceManager._validator.validateResendMFAPhoneResponse).toHaveBeenCalled();
                    }

                    expect(warnEvent).toHaveBeenCalledWith(new Error(`Unable to request new MFA code`));
                });

                test(`Resend unsuccessful`, async () => {
                    mockedResourceManager._networkManager._headerJar.setCookie(Config.aaspCookieString);
                    mockedResourceManager._networkManager.scnt = Config.iCloudAuthSecrets.scnt;
                    mockedResourceManager._networkManager.sessionId = Config.iCloudAuthSecrets.sessionSecret;

                    mockedResourceManager._networkManager.mock
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
                    const warnEvent = mockedResourceManager.spyOnHandlerEvent();

                    await icloud.resendMFA(new MFAMethod(method as any));

                    expect(warnEvent).toHaveBeenCalledWith(new Error(`Unable to request new MFA code`));
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
                    mockedResourceManager._networkManager._headerJar.setCookie(Config.aaspCookieString);
                    mockedResourceManager._networkManager.scnt = Config.iCloudAuthSecrets.scnt;
                    mockedResourceManager._networkManager.sessionId = Config.iCloudAuthSecrets.sessionSecret;

                    mockedResourceManager._networkManager.mock
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
                    const authenticatedEvent = mockedResourceManager.spyOnEvent(iCPSEventCloud.AUTHENTICATED);

                    await icloud.submitMFA(new MFAMethod(method as any), `123456`);

                    expect(authenticatedEvent).toHaveBeenCalled();
                });

                test(`Failure`, async () => {
                    mockedResourceManager._networkManager._headerJar.setCookie(Config.aaspCookieString);
                    mockedResourceManager._networkManager.scnt = Config.iCloudAuthSecrets.scnt;
                    mockedResourceManager._networkManager.sessionId = Config.iCloudAuthSecrets.sessionSecret;

                    mockedResourceManager._networkManager.mock
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
            mockedResourceManager._networkManager._headerJar.setCookie(Config.aaspCookieString);
            mockedResourceManager._networkManager.scnt = Config.iCloudAuthSecrets.scnt;
            mockedResourceManager._networkManager.sessionId = Config.iCloudAuthSecrets.sessionSecret;

            mockedResourceManager._validator.validateTrustResponse = jest.fn<typeof mockedResourceManager._validator.validateTrustResponse>();
            mockedResourceManager._networkManager.applyTrustResponse = jest.fn<typeof mockedResourceManager._networkManager.applyTrustResponse>();

            const trustedEvent = mockedResourceManager.spyOnEvent(iCPSEventCloud.TRUSTED);

            mockedResourceManager._networkManager.mock
                .onGet(`https://idmsa.apple.com/appleauth/auth/2sv/trust`, {}, {
                    ...Config.REQUEST_HEADER.AUTH,
                    scnt: Config.iCloudAuthSecrets.scnt,
                    Cookie: `aasp=${Config.iCloudAuthSecrets.aasp}`,
                    'X-Apple-ID-Session-Id': Config.iCloudAuthSecrets.sessionSecret,
                })
                .reply(204);

            await icloud.getTokens();

            expect(mockedResourceManager._validator.validateTrustResponse).toHaveBeenCalled();
            expect(mockedResourceManager._networkManager.applyTrustResponse).toHaveBeenCalled();
            expect(trustedEvent).toHaveBeenCalled();
        });

        test(`Error - Invalid Response`, async () => {
            mockedResourceManager._networkManager._headerJar.setCookie(Config.aaspCookieString);
            mockedResourceManager._networkManager.scnt = Config.iCloudAuthSecrets.scnt;
            mockedResourceManager._networkManager.sessionId = Config.iCloudAuthSecrets.sessionSecret;

            mockedResourceManager._validator.validateTrustResponse = jest.fn<typeof mockedResourceManager._validator.validateTrustResponse>(() => {
                throw new iCPSError(VALIDATOR_ERR.TRUST_RESPONSE);
            });

            mockedResourceManager._networkManager.mock
                .onGet(`https://idmsa.apple.com/appleauth/auth/2sv/trust`, {}, {
                    ...Config.REQUEST_HEADER.AUTH,
                    scnt: Config.iCloudAuthSecrets.scnt,
                    Cookie: `aasp=${Config.iCloudAuthSecrets.aasp}`,
                    'X-Apple-ID-Session-Id': Config.iCloudAuthSecrets.sessionSecret,
                })
                .reply(204);

            await icloud.getTokens();
            await expect(icloud.ready).rejects.toThrow(/^Unable to acquire account tokens$/);

            expect(mockedResourceManager._validator.validateTrustResponse).toHaveBeenCalled();
        });

        test(`Error - Invalid Status Code`, async () => {
            mockedResourceManager._networkManager._headerJar.setCookie(Config.aaspCookieString);
            mockedResourceManager._networkManager.scnt = Config.iCloudAuthSecrets.scnt;
            mockedResourceManager._networkManager.sessionId = Config.iCloudAuthSecrets.sessionSecret;

            mockedResourceManager._networkManager.mock
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
            mockedResourceManager._networkManager.sessionId = Config.iCloudAuthSecrets.sessionSecret;

            mockedResourceManager._validator.validateSetupResponse = jest.fn<typeof mockedResourceManager._validator.validateSetupResponse>();
            mockedResourceManager._networkManager.applySetupResponse = jest.fn<typeof mockedResourceManager._networkManager.applySetupResponse>();

            const accountReadyEvent = mockedResourceManager.spyOnEvent(iCPSEventCloud.ACCOUNT_READY);

            mockedResourceManager._networkManager.mock
                .onPost(`https://setup.icloud.com/setup/ws/1/accountLogin`, {
                    dsWebAuthToken: Config.iCloudAuthSecrets.sessionSecret,
                    trustToken: Config.trustToken,
                }, Config.REQUEST_HEADER.DEFAULT,
                )
                .reply(200);

            await icloud.setupAccount();

            expect(mockedResourceManager._validator.validateSetupResponse).toHaveBeenCalled();
            expect(mockedResourceManager._networkManager.applySetupResponse).toHaveBeenCalled();
            expect(accountReadyEvent).toHaveBeenCalledTimes(1);
            expect(icloud.photos).toBeDefined();
        });

        test(`Error - Invalid Response`, async () => {
            mockedResourceManager._networkManager.sessionToken = Config.iCloudAuthSecrets.sessionSecret;

            mockedResourceManager._validator.validateSetupResponse = jest.fn<typeof mockedResourceManager._validator.validateSetupResponse>(() => {
                throw new iCPSError(VALIDATOR_ERR.SETUP_RESPONSE);
            });

            mockedResourceManager._networkManager.mock
                .onPost(`https://setup.icloud.com/setup/ws/1/accountLogin`, {
                    dsWebAuthToken: Config.iCloudAuthSecrets.sessionSecret,
                    trustToken: Config.trustToken,
                }, Config.REQUEST_HEADER.DEFAULT,
                )
                .reply(200);

            await icloud.setupAccount();
            await expect(icloud.ready).rejects.toThrow(/^Unable to setup iCloud Account$/);

            expect(mockedResourceManager._validator.validateSetupResponse).toHaveBeenCalled();
        });

        test(`Error - Invalid Status Code`, async () => {
            mockedResourceManager._networkManager.sessionToken = Config.iCloudAuthSecrets.sessionSecret;

            mockedResourceManager._networkManager.mock
                .onPost(`https://setup.icloud.com/setup/ws/1/accountLogin`, {
                    dsWebAuthToken: Config.iCloudAuthSecrets.sessionSecret,
                    trustToken: Config.trustToken,
                }, Config.REQUEST_HEADER.DEFAULT,
                )
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
                    ResourceManager.emit(iCPSEventPhotos.READY);
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