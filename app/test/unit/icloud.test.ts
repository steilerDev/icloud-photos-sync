import {MockedResourceManager, prepareResourceManager, spyOnEvent} from '../_helpers/_general';
import {describe, test, beforeEach, expect, jest} from '@jest/globals';
import * as ICLOUD from '../../src/lib/icloud/constants';
import * as MFA_SERVER from '../../src/lib/icloud/mfa/constants.js';
import {MFAMethod} from '../../src/lib/icloud/mfa/mfa-method';
import * as ICLOUD_PHOTOS from '../../src/lib/icloud/icloud-photos/constants';
import {iCloudFactory} from '../_helpers/icloud.helper';
import * as Config from '../_helpers/_config';
import {iCloud} from '../../src/lib/icloud/icloud';
import {iCloudPhotos} from '../../src/lib/icloud/icloud-photos/icloud-photos';
import {HANDLER_EVENT} from '../../src/app/event/error-handler';
import {ResourceManager} from '../../src/lib/resource-manager/resource-manager';
import {MFA_ERR, VALIDATOR_ERR} from '../../src/app/error/error-codes';
import {iCPSError} from '../../src/app/error/error';

let mockedResourceManager: MockedResourceManager;
let mockedICloud: iCloud;

beforeEach(() => {
    mockedResourceManager = prepareResourceManager()!;
    mockedICloud = iCloudFactory();
});

describe(`CLI Options`, () => {
    // For some reason this 'throws' an error
    test(`Fail on MFA`, async () => {
        mockedResourceManager._resources.failOnMfa = true;
        // Need to re-initiate the iCloud instance to apply the new config
        mockedICloud = new iCloud();

        mockedICloud.emit(ICLOUD.EVENTS.MFA_REQUIRED);
        await expect(mockedICloud.ready).rejects.toThrow(/^MFA code required, failing due to failOnMfa flag$/);

        expect(mockedICloud.mfaServer.server.listening).toBeFalsy();
    });
});

describe(`Control structure`, () => {
    beforeEach(() => {
        mockedICloud = new iCloud();
    });

    test(`TRUSTED event triggered`, () => {
        mockedICloud.setupAccount = jest.fn<typeof mockedICloud.setupAccount>()
            .mockResolvedValue();

        mockedICloud.emit(ICLOUD.EVENTS.TRUSTED);

        expect(mockedICloud.setupAccount).toHaveBeenCalled();
    });

    test(`AUTHENTICATED event triggered`, () => {
        mockedICloud.getTokens = jest.fn<typeof mockedICloud.getTokens>()
            .mockResolvedValue();

        mockedICloud.emit(ICLOUD.EVENTS.AUTHENTICATED);

        expect(mockedICloud.getTokens).toHaveBeenCalled();
    });

    test(`ACCOUNT_READY event triggered`, () => {
        mockedICloud.getPhotosReady = jest.fn<typeof mockedICloud.getPhotosReady>()
            .mockResolvedValue();

        mockedICloud.emit(ICLOUD.EVENTS.ACCOUNT_READY);

        expect(mockedICloud.getPhotosReady).toHaveBeenCalled();
    });

    describe(`MFA_REQUIRED event triggered`, () => {
        test(`Start MFA Server`, () => {
            mockedICloud.mfaServer.startServer = jest.fn<typeof mockedICloud.mfaServer.startServer>();

            mockedICloud.emit(ICLOUD.EVENTS.MFA_REQUIRED);

            expect(mockedICloud.mfaServer.startServer).toHaveBeenCalled();
        });

        test(`MFA Server Startup error`, async () => {
            mockedICloud.mfaServer.startServer = jest.fn<typeof mockedICloud.mfaServer.startServer>(() => {
                throw new Error(`Unable to start server`);
            });

            mockedICloud.emit(ICLOUD.EVENTS.MFA_REQUIRED);

            await expect(mockedICloud.ready).rejects.toThrow(`Unable to start MFA server`);
        });
    });

    test(`MFA_NOT_PROVIDED event triggered`, async () => {
        mockedICloud.mfaServer.emit(MFA_SERVER.EVENTS.MFA_NOT_PROVIDED, new iCPSError(MFA_ERR.SERVER_TIMEOUT));
        await expect(mockedICloud.ready).rejects.toThrow(/^MFA server timeout \(code needs to be provided within 10 minutes\)$/);
    });
});

describe(`Authenticate`, () => {
    test(`Valid Trust Token`, async () => {
        // ICloud.authenticate returns ready promise. Need to modify in order to resolve at the end of the test
        mockedICloud.ready = new Promise<void>((resolve, _reject) => resolve());

        const authenticationEvent = spyOnEvent(mockedICloud, ICLOUD.EVENTS.AUTHENTICATION_STARTED);
        const trustedEvent = spyOnEvent(mockedICloud, ICLOUD.EVENTS.TRUSTED);
        const errorEvent = spyOnEvent(mockedICloud, ICLOUD.EVENTS.ERROR);

        mockedResourceManager._validator.validateSigninResponse = jest.fn<typeof ResourceManager.validator.validateSigninResponse>();
        mockedResourceManager._network.applySigninResponse = jest.fn<typeof ResourceManager.network.applySigninResponse>();

        mockedResourceManager._network.mock
            .onPost(`https://idmsa.apple.com/appleauth/auth/signin`, {
                accountName: Config.defaultConfig.username,
                password: Config.defaultConfig.password,
                trustTokens: [
                    Config.trustToken,
                ],
            }, Config.REQUEST_HEADER.AUTH,
            )
            .reply(200);

        await mockedICloud.authenticate();

        expect(authenticationEvent).toHaveBeenCalled();
        expect(trustedEvent).toHaveBeenCalled();
        expect(errorEvent).not.toHaveBeenCalled();
        expect(mockedResourceManager._validator.validateSigninResponse).toHaveBeenCalled();
        expect(mockedResourceManager._network.applySigninResponse).toHaveBeenCalled();
    });

    test(`Invalid Trust Token - MFA Required`, async () => {
        mockedResourceManager._resources.trustToken = undefined;

        // ICloud.authenticate returns ready promise. Need to modify in order to resolve at the end of the test
        mockedICloud.ready = new Promise<void>((resolve, _reject) => resolve());

        const authenticationEvent = spyOnEvent(mockedICloud, ICLOUD.EVENTS.AUTHENTICATION_STARTED);
        const mfaEvent = spyOnEvent(mockedICloud, ICLOUD.EVENTS.MFA_REQUIRED);
        const trustedEvent = spyOnEvent(mockedICloud, ICLOUD.EVENTS.TRUSTED);
        const errorEvent = spyOnEvent(mockedICloud, ICLOUD.EVENTS.ERROR);

        mockedResourceManager._validator.validateSigninResponse = jest.fn<typeof mockedResourceManager._validator.validateSigninResponse>();
        mockedResourceManager._network.applySigninResponse = jest.fn<typeof mockedResourceManager._network.applySigninResponse>();

        mockedResourceManager._network.mock
            .onPost(`https://idmsa.apple.com/appleauth/auth/signin`, {
                accountName: Config.defaultConfig.username,
                password: Config.defaultConfig.password,
                trustTokens: [null],
            }, Config.REQUEST_HEADER.AUTH)
            .reply(409);

        await mockedICloud.authenticate();

        expect(trustedEvent).not.toHaveBeenCalled();
        expect(authenticationEvent).toHaveBeenCalled();
        expect(mfaEvent).toHaveBeenCalledWith(Config.defaultConfig.port);
        expect(errorEvent).not.toHaveBeenCalled();
        expect(mockedResourceManager._validator.validateSigninResponse).toHaveBeenCalled();
        expect(mockedResourceManager._network.applySigninResponse).toHaveBeenCalled();
    });

    test(`Authentication response not matching validator`, async () => {
        const authenticationEvent = spyOnEvent(mockedICloud, ICLOUD.EVENTS.AUTHENTICATION_STARTED);

        mockedResourceManager._validator.validateSigninResponse = jest.fn<typeof ResourceManager.validator.validateSigninResponse>(() => {
            throw new iCPSError(VALIDATOR_ERR.SIGNIN_RESPONSE);
        });

        mockedResourceManager._network.mock
            .onPost(`https://idmsa.apple.com/appleauth/auth/signin`, {
                accountName: Config.defaultConfig.username,
                password: Config.defaultConfig.password,
                trustTokens: [
                    Config.trustToken,
                ],
            }, Config.REQUEST_HEADER.AUTH,
            )
            .reply(200);

        await expect(mockedICloud.authenticate()).rejects.toThrow(/^Unable to parse and validate signin response$/);
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
            mockedResourceManager._network.mock
                .onPost(`https://idmsa.apple.com/appleauth/auth/signin`, {
                    accountName: Config.defaultConfig.username,
                    password: Config.defaultConfig.password,
                    trustTokens: [
                        Config.trustToken,
                    ],
                }, Config.REQUEST_HEADER.AUTH,
                )
                .reply(status);

            const authenticationEvent = spyOnEvent(mockedICloud, ICLOUD.EVENTS.AUTHENTICATION_STARTED);
            const trustedEvent = spyOnEvent(mockedICloud, ICLOUD.EVENTS.TRUSTED);
            const mfaEvent = spyOnEvent(mockedICloud, ICLOUD.EVENTS.MFA_REQUIRED);
            const errorEvent = spyOnEvent(mockedICloud, ICLOUD.EVENTS.ERROR);

            await expect(mockedICloud.authenticate()).rejects.toThrow(expectedError);
            expect(authenticationEvent).toHaveBeenCalled();
            expect(trustedEvent).not.toHaveBeenCalled();
            expect(mfaEvent).not.toHaveBeenCalled();
            expect(errorEvent).toHaveBeenCalledTimes(1);
        });
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
                mockedResourceManager._network.aaspCookie = [Config.aaspCookieString];
                mockedResourceManager._network.scnt = Config.iCloudAuthSecrets.scnt;
                mockedResourceManager._network.sessionId = Config.iCloudAuthSecrets.sessionSecret;

                if (method === `device`) {
                    mockedResourceManager._validator.validateResendMFADeviceResponse = jest.fn<typeof mockedResourceManager._validator.validateResendMFADeviceResponse>()
                        .mockReturnValue(validatedResponse as any);
                }

                if (method === `sms` || method === `voice`) {
                    mockedResourceManager._validator.validateResendMFAPhoneResponse = jest.fn<typeof mockedResourceManager._validator.validateResendMFAPhoneResponse>()
                        .mockReturnValue(validatedResponse as any);
                }

                mockedResourceManager._network.mock
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

                // Only trace is found in logging
                mockedICloud.logger.info = jest.fn();

                await mockedICloud.resendMFA(new MFAMethod(method as any));

                if (method === `device`) {
                    expect(mockedResourceManager._validator.validateResendMFADeviceResponse).toHaveBeenCalled();
                }

                if (method === `sms` || method === `voice`) {
                    expect(mockedResourceManager._validator.validateResendMFAPhoneResponse).toHaveBeenCalled();
                }

                expect(mockedICloud.logger.info).toHaveBeenLastCalledWith(successMessage);
            });

            test(`Response not matching validator`, async () => {
                mockedResourceManager._network.aaspCookie = [Config.aaspCookieString];
                mockedResourceManager._network.scnt = Config.iCloudAuthSecrets.scnt;
                mockedResourceManager._network.sessionId = Config.iCloudAuthSecrets.sessionSecret;

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

                mockedResourceManager._network.mock
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
                const warnEvent = spyOnEvent(mockedICloud, HANDLER_EVENT);

                await mockedICloud.resendMFA(new MFAMethod(method as any));

                if (method === `device`) {
                    expect(mockedResourceManager._validator.validateResendMFADeviceResponse).toHaveBeenCalled();
                }

                if (method === `sms` || method === `voice`) {
                    expect(mockedResourceManager._validator.validateResendMFAPhoneResponse).toHaveBeenCalled();
                }

                expect(warnEvent).toHaveBeenCalledWith(new Error(`Unable to request new MFA code`));
            });

            test(`Resend unsuccessful`, async () => {
                mockedResourceManager._network.aaspCookie = [Config.aaspCookieString];
                mockedResourceManager._network.scnt = Config.iCloudAuthSecrets.scnt;
                mockedResourceManager._network.sessionId = Config.iCloudAuthSecrets.sessionSecret;

                mockedResourceManager._network.mock
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
                const warnEvent = spyOnEvent(mockedICloud, HANDLER_EVENT);

                await mockedICloud.resendMFA(new MFAMethod(method as any));

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
                mockedResourceManager._network.aaspCookie = [Config.aaspCookieString];
                mockedResourceManager._network.scnt = Config.iCloudAuthSecrets.scnt;
                mockedResourceManager._network.sessionId = Config.iCloudAuthSecrets.sessionSecret;

                mockedResourceManager._network.mock
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
                const authenticatedEvent = spyOnEvent(mockedICloud, ICLOUD.EVENTS.AUTHENTICATED);

                await mockedICloud.submitMFA(new MFAMethod(method as any), `123456`);

                expect(authenticatedEvent).toHaveBeenCalled();
            });

            test(`Failure`, async () => {
                mockedResourceManager._network.aaspCookie = [Config.aaspCookieString];
                mockedResourceManager._network.scnt = Config.iCloudAuthSecrets.scnt;
                mockedResourceManager._network.sessionId = Config.iCloudAuthSecrets.sessionSecret;

                mockedResourceManager._network.mock
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

                await mockedICloud.submitMFA(new MFAMethod(method as any), `123456`);

                await expect(mockedICloud.ready).rejects.toThrow(/^Unable to submit MFA code$/);
            });
        });
    });
});

describe(`Trust Token`, () => {
    test(`Success`, async () => {
        mockedResourceManager._network.aaspCookie = [Config.aaspCookieString];
        mockedResourceManager._network.scnt = Config.iCloudAuthSecrets.scnt;
        mockedResourceManager._network.sessionId = Config.iCloudAuthSecrets.sessionSecret;

        mockedResourceManager._validator.validateTrustResponse = jest.fn<typeof mockedResourceManager._validator.validateTrustResponse>();
        mockedResourceManager._network.applyTrustResponse = jest.fn<typeof mockedResourceManager._network.applyTrustResponse>();

        const trustedEvent = spyOnEvent(mockedICloud, ICLOUD.EVENTS.TRUSTED);

        mockedResourceManager._network.mock
            .onGet(`https://idmsa.apple.com/appleauth/auth/2sv/trust`, {}, {
                ...Config.REQUEST_HEADER.AUTH,
                scnt: Config.iCloudAuthSecrets.scnt,
                Cookie: `aasp=${Config.iCloudAuthSecrets.aasp}`,
                'X-Apple-ID-Session-Id': Config.iCloudAuthSecrets.sessionSecret,
            })
            .reply(204);

        await mockedICloud.getTokens();

        expect(mockedResourceManager._validator.validateTrustResponse).toHaveBeenCalled();
        expect(mockedResourceManager._network.applyTrustResponse).toHaveBeenCalled();
        expect(trustedEvent).toHaveBeenCalled();
    });

    test(`Error - Invalid Response`, async () => {
        mockedResourceManager._network.aaspCookie = [Config.aaspCookieString];
        mockedResourceManager._network.scnt = Config.iCloudAuthSecrets.scnt;
        mockedResourceManager._network.sessionId = Config.iCloudAuthSecrets.sessionSecret;

        mockedResourceManager._validator.validateTrustResponse = jest.fn<typeof mockedResourceManager._validator.validateTrustResponse>(() => {
            throw new iCPSError(VALIDATOR_ERR.TRUST_RESPONSE);
        });

        mockedResourceManager._network.mock
            .onGet(`https://idmsa.apple.com/appleauth/auth/2sv/trust`, {}, {
                ...Config.REQUEST_HEADER.AUTH,
                scnt: Config.iCloudAuthSecrets.scnt,
                Cookie: `aasp=${Config.iCloudAuthSecrets.aasp}`,
                'X-Apple-ID-Session-Id': Config.iCloudAuthSecrets.sessionSecret,
            })
            .reply(204);

        await mockedICloud.getTokens();
        await expect(mockedICloud.ready).rejects.toThrow(/^Unable to acquire account tokens$/);

        expect(mockedResourceManager._validator.validateTrustResponse).toHaveBeenCalled();
    });

    test(`Error - Invalid Status Code`, async () => {
        mockedResourceManager._network.aaspCookie = [Config.aaspCookieString];
        mockedResourceManager._network.scnt = Config.iCloudAuthSecrets.scnt;
        mockedResourceManager._network.sessionId = Config.iCloudAuthSecrets.sessionSecret;

        mockedResourceManager._network.mock
            .onGet(`https://idmsa.apple.com/appleauth/auth/2sv/trust`, {}, {
                ...Config.REQUEST_HEADER.AUTH,
                scnt: Config.iCloudAuthSecrets.scnt,
                Cookie: `aasp=${Config.iCloudAuthSecrets.aasp}`,
                'X-Apple-ID-Session-Id': Config.iCloudAuthSecrets.sessionSecret,
            })
            .reply(500);

        await mockedICloud.getTokens();
        await expect(mockedICloud.ready).rejects.toThrow(/^Unable to acquire account tokens$/);
    });
});

describe(`Setup iCloud`, () => {
    test(`Success`, async () => {
        mockedResourceManager._network.sessionToken = Config.iCloudAuthSecrets.sessionSecret;

        mockedResourceManager._validator.validateSetupResponse = jest.fn<typeof mockedResourceManager._validator.validateSetupResponse>();
        mockedResourceManager._network.applySetupResponse = jest.fn<typeof mockedResourceManager._network.applySetupResponse>();

        const accountReadyEvent = spyOnEvent(mockedICloud, ICLOUD.EVENTS.ACCOUNT_READY);
        const readyEvent = spyOnEvent(mockedICloud, ICLOUD.EVENTS.ACCOUNT_READY);

        mockedResourceManager._network.mock
            .onPost(`https://setup.icloud.com/setup/ws/1/accountLogin`, {
                dsWebAuthToken: Config.iCloudAuthSecrets.sessionSecret,
                trustToken: Config.trustToken,
            }, Config.REQUEST_HEADER.DEFAULT,
            )
            .reply(200);

        await mockedICloud.setupAccount();

        expect(mockedResourceManager._validator.validateSetupResponse).toHaveBeenCalled();
        expect(mockedResourceManager._network.applySetupResponse).toHaveBeenCalled();
        expect(readyEvent).toHaveBeenCalled();
        expect(accountReadyEvent).toHaveBeenCalledTimes(1);
        expect(mockedICloud.photos).toBeDefined();
    });

    test(`Error - Invalid Response`, async () => {
        mockedResourceManager._network.sessionToken = Config.iCloudAuthSecrets.sessionSecret;

        mockedResourceManager._validator.validateSetupResponse = jest.fn<typeof mockedResourceManager._validator.validateSetupResponse>(() => {
            throw new iCPSError(VALIDATOR_ERR.SETUP_RESPONSE);
        });

        mockedResourceManager._network.mock
            .onPost(`https://setup.icloud.com/setup/ws/1/accountLogin`, {
                dsWebAuthToken: Config.iCloudAuthSecrets.sessionSecret,
                trustToken: Config.trustToken,
            }, Config.REQUEST_HEADER.DEFAULT,
            )
            .reply(200);

        await mockedICloud.setupAccount();
        await expect(mockedICloud.ready).rejects.toThrow(/^Unable to setup iCloud Account$/);

        expect(mockedResourceManager._validator.validateSetupResponse).toHaveBeenCalled();
    });

    test(`Error - Invalid Status Code`, async () => {
        mockedResourceManager._network.sessionToken = Config.iCloudAuthSecrets.sessionSecret;

        mockedResourceManager._network.mock
            .onPost(`https://setup.icloud.com/setup/ws/1/accountLogin`, {
                dsWebAuthToken: Config.iCloudAuthSecrets.sessionSecret,
                trustToken: Config.trustToken,
            }, Config.REQUEST_HEADER.DEFAULT,
            )
            .reply(500);

        await mockedICloud.setupAccount();
        await expect(mockedICloud.ready).rejects.toThrow(/^Unable to setup iCloud Account$/);
    });

    describe(`Get iCloud Photos Ready`, () => {
        test(`Setup resolves`, async () => {
            mockedICloud.photos = new iCloudPhotos();
            mockedICloud.photos.setup = jest.fn<typeof mockedICloud.photos.setup>()
                .mockResolvedValue();

            await mockedICloud.getPhotosReady();

            expect(mockedICloud.photos.listenerCount(HANDLER_EVENT)).toBe(1);
            await expect(mockedICloud.ready).resolves.not.toThrow();

            expect(mockedICloud.photos.listenerCount(ICLOUD_PHOTOS.EVENTS.READY)).toBe(1);
            expect(mockedICloud.photos.setup).toHaveBeenCalled();
        });

        test(`Setup rejects`, async () => {
            mockedICloud.photos = new iCloudPhotos();
            mockedICloud.photos.setup = jest.fn<typeof mockedICloud.photos.setup>()
                .mockRejectedValue(new Error());

            await mockedICloud.getPhotosReady();

            await expect(mockedICloud.ready).rejects.toThrow(/^Unable to get iCloud Photos service ready$/);

            expect(mockedICloud.photos.listenerCount(HANDLER_EVENT)).toBe(1);
            expect(mockedICloud.photos.setup).toHaveBeenCalled();
        });

        test(`Photos Object invalid`, async () => {
            await mockedICloud.getPhotosReady();

            await expect(mockedICloud.ready).rejects.toThrow(/^Unable to get iCloud Photos service ready$/);
        });
    });
});