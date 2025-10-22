import { test, afterAll, afterEach, beforeAll, beforeEach, describe, expect, jest} from '@jest/globals';
import { iCPSError } from '../../src/app/error/error';
import { MFA_ERR, VALIDATOR_ERR } from '../../src/app/error/error-codes';
import { iCloud } from '../../src/lib/icloud/icloud';
import { iCloudPhotos } from '../../src/lib/icloud/icloud-photos/icloud-photos';
import { iCloudCrypto } from '../../src/lib/icloud/icloud.crypto';
import { MFAMethod } from '../../src/lib/icloud/mfa/mfa-method';
import { iCPSEventCloud, iCPSEventLog, iCPSEventMFA, iCPSEventPhotos, iCPSEventRuntimeWarning } from '../../src/lib/resources/events-types';
import { Resources } from '../../src/lib/resources/main';
import { Header } from '../../src/lib/resources/network-manager';
import { SigninInitResponse } from '../../src/lib/resources/network-types';
import * as Config from '../_helpers/_config';
import { MockedEventManager, MockedNetworkManager, MockedResourceManager, MockedValidator, UnknownAsyncFunction, prepareResources, spyOnEvent } from '../_helpers/_general';

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
    jest.useFakeTimers();
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

    test(`PCS_REQUIRED event triggered`, () => {
        icloud.acquirePCSCookies = jest.fn<typeof icloud.acquirePCSCookies>()
            .mockResolvedValue();

        mockedEventManager.emit(iCPSEventCloud.PCS_REQUIRED);

        expect(icloud.acquirePCSCookies).toHaveBeenCalled();
    });

    describe(`MFA_REQUIRED event triggered`, () => {
        test(`Should emit error when FAIL_ON_MFA is set`, () => {
            mockedResourceManager._resources.failOnMfa = true
            const errorEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.ERROR)

            mockedEventManager.emit(iCPSEventCloud.MFA_REQUIRED)

            expect(errorEvent).toHaveBeenCalledWith(new Error(`MFA code required, failing due to failOnMfa flag`))
        })

        test(`Should not emit error when FAIL_ON_MFA and ignoreFailOnMFA is set`, () => {
            const cleanInstances = prepareResources()!;
            mockedResourceManager = cleanInstances.manager;

            icloud = new iCloud(true)
            cleanInstances.manager._resources.failOnMfa = true
            const errorEvent = cleanInstances.event.spyOnEvent(iCPSEventCloud.ERROR)

            cleanInstances.event.emit(iCPSEventCloud.MFA_REQUIRED)

            expect(errorEvent).not.toHaveBeenCalled()
        })

        test(`Should timeout`, () => {
            mockedResourceManager._resources.failOnMfa = false
            const errorEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.ERROR)
            const mfaEvent = mockedEventManager.spyOnEvent(iCPSEventMFA.MFA_NOT_PROVIDED)

            mockedEventManager.emit(iCPSEventCloud.MFA_REQUIRED)
            jest.advanceTimersByTime(1000*60*10 + 10)

            expect(errorEvent).not.toHaveBeenCalled()
            expect(mfaEvent).toHaveBeenCalledWith(new Error(`MFA code timeout (code needs to be provided within 10 minutes)`))

        })
    })


    test(`MFA_NOT_PROVIDED event triggered`, async () => {
        const iCloudReady = icloud.getReady();
        mockedEventManager.emit(iCPSEventMFA.MFA_NOT_PROVIDED, new iCPSError(MFA_ERR.MFA_TIMEOUT));
        await expect(iCloudReady).resolves.toBeFalsy();
    });

    test.each([
        {
            desc: `iCloud`,
            event: iCPSEventCloud.ERROR,
        }
    ])(`$desc error event triggered`, async ({event}) => {
        mockedEventManager._eventBus.removeAllListeners(event); // Not sure why this is necessary
        const iCloudReady = icloud.getReady();

        mockedEventManager.emit(event, new iCPSError());
        await expect(iCloudReady).rejects.toThrow(/^Unknown error occurred$/);
    });

    test(`Authentication timeout`, async () => {
        const iCloudReady = icloud.getReady();
        const timeoutValue = 1000 * 60 * (10 + 5);
        jest.advanceTimersByTime(timeoutValue + 1);
        await expect(iCloudReady).rejects.toThrow(/iCloud setup did not complete successfully within expected amount of time$/);
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

    describe.each([
        {
            desc: `Legacy Login`,
            legacy: true,
        }, {
            desc: `SRP Login`,
            legacy: false,
        },
    ])(`Authenticate - $desc`, ({legacy}) => {
        const authenticationUrl = `https://idmsa.apple.com/appleauth/`;
        const authenticationPayload = {someData: `someValue`};

        beforeEach(() => {
            mockedResourceManager._resources.legacyLogin = legacy;
            if (legacy) {
                icloud.getLegacyLogin = jest.fn<typeof icloud.getLegacyLogin>()
                    .mockReturnValue([authenticationUrl, authenticationPayload]);
            } else {
                icloud.getSRPLogin = jest.fn<typeof icloud.getSRPLogin>()
                    .mockResolvedValue([authenticationUrl, authenticationPayload]);
            }
        });

        test(`Valid Trust Token`, async () => {
            // ICloud.authenticate returns ready promise. Need to modify in order to resolve at the end of the test
            icloud.getReady = jest.fn<typeof icloud.getReady>().mockResolvedValue(true);

            const authenticationEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.AUTHENTICATION_STARTED);
            const trustedEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.TRUSTED);
            const errorEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.ERROR);

            mockedValidator.validateSigninResponse = jest.fn<typeof mockedValidator.validateSigninResponse>();
            mockedNetworkManager.applySigninResponse = jest.fn<typeof mockedNetworkManager.applySigninResponse>();

            mockedNetworkManager.mock
                .onPost(authenticationUrl, authenticationPayload, {headers: Config.REQUEST_HEADER.AUTH})
                .reply(200);

            await icloud.authenticate();

            expect(authenticationEvent).toHaveBeenCalled();
            expect(trustedEvent).toHaveBeenCalled();
            expect(errorEvent).not.toHaveBeenCalled();
            expect(mockedValidator.validateSigninResponse).toHaveBeenCalled();
            expect(mockedNetworkManager.applySigninResponse).toHaveBeenCalled();
            expect(legacy ? icloud.getLegacyLogin : icloud.getSRPLogin).toHaveBeenCalled();
        });

        test(`Invalid Trust Token - MFA Required`, async () => {
            // ICloud.authenticate returns ready promise. Need to modify in order to resolve at the end of the test
            icloud.getReady = jest.fn<typeof icloud.getReady>().mockResolvedValue(true);
            icloud.getTrustedPhoneNumbers = jest.fn<typeof icloud.getTrustedPhoneNumbers>().mockResolvedValue(`someVal` as any)

            const authenticationEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.AUTHENTICATION_STARTED);
            const mfaEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.MFA_REQUIRED);
            const trustedEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.TRUSTED);
            const errorEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.ERROR);

            mockedValidator.validateSigninResponse = jest.fn<typeof mockedValidator.validateSigninResponse>();
            mockedNetworkManager.applySigninResponse = jest.fn<typeof mockedNetworkManager.applySigninResponse>();

            mockedNetworkManager.mock
                .onPost(authenticationUrl, authenticationPayload, {headers: Config.REQUEST_HEADER.AUTH})
                .reply(409);

            await icloud.authenticate();

            expect(icloud.getTrustedPhoneNumbers).toHaveBeenCalled()
            expect(trustedEvent).not.toHaveBeenCalled();
            expect(authenticationEvent).toHaveBeenCalled();
            expect(mfaEvent).toHaveBeenCalledWith(`someVal`);
            expect(errorEvent).not.toHaveBeenCalled();
            expect(mockedValidator.validateSigninResponse).toHaveBeenCalled();
            expect(mockedNetworkManager.applySigninResponse).toHaveBeenCalled();
            expect(legacy ? icloud.getLegacyLogin : icloud.getSRPLogin).toHaveBeenCalled();
            jest.resetAllMocks();
        });

        test(`Authentication response not matching validator`, async () => {
            const authenticationEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.AUTHENTICATION_STARTED);

            mockedValidator.validateSigninResponse = jest.fn<typeof mockedValidator.validateSigninResponse>(() => {
                throw new iCPSError(VALIDATOR_ERR.SIGNIN_RESPONSE);
            });

            mockedNetworkManager.mock
                .onPost(authenticationUrl, authenticationPayload, {headers: Config.REQUEST_HEADER.AUTH})
                .reply(200);

            await expect(icloud.authenticate()).rejects.toThrow(/^Unable to parse and validate signin response$/);
            expect(authenticationEvent).toHaveBeenCalled();
            expect(legacy ? icloud.getLegacyLogin : icloud.getSRPLogin).toHaveBeenCalled();
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
                    .onPost(authenticationUrl, authenticationPayload, {headers: Config.REQUEST_HEADER.AUTH})
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
                expect(legacy ? icloud.getLegacyLogin : icloud.getSRPLogin).toHaveBeenCalled();
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
            expect(legacy ? icloud.getLegacyLogin : icloud.getSRPLogin).toHaveBeenCalled();
        });
    });

    describe.each([{
        desc: `with trust token`,
        trustTokenResourceFile: Config.trustToken,
        expectedTrustTokensArray: [Config.trustToken],
    }, {
        desc: `without trust token`,
        trustTokenResourceFile: undefined,
        expectedTrustTokensArray: [],
    }])(`Authentication Payload - $desc`, ({trustTokenResourceFile, expectedTrustTokensArray}) => {
        beforeEach(() => {
            mockedResourceManager._readResourceFile
                .mockReturnValue({
                    libraryVersion: 1,
                    trustToken: trustTokenResourceFile,
                });
        });

        test(`Legacy`, () => {
            expect(icloud.getLegacyLogin()).toEqual([
                `https://idmsa.apple.com/appleauth/auth/signin`,
                {
                    accountName: Config.defaultConfig.username,
                    password: Config.defaultConfig.password,
                    trustTokens: expectedTrustTokensArray,
                },
            ]);
        });

        describe(`SRP`, () => {
            test(`Success`, async () => {
                const authenticator = new iCloudCrypto();
                authenticator.getClientEphemeral = jest.fn<typeof authenticator.getClientEphemeral>()
                    .mockResolvedValue(`clientEphemeral`);

                authenticator.getProofValues = jest.fn<typeof authenticator.getProofValues>()
                    .mockResolvedValue([`m1Proof`, `m2Proof`]);

                mockedNetworkManager.mock
                    .onPost(`https://idmsa.apple.com/appleauth/auth/signin/init`,
                        {
                            a: `clientEphemeral`,
                            accountName: Config.defaultConfig.username,
                            protocols: [`s2k`, `s2k_fo`],
                        },
                        {
                            headers: Config.REQUEST_HEADER.AUTH,
                        },
                    )
                    .reply(200);

                mockedValidator.validateSigninInitResponse = jest.fn<typeof mockedValidator.validateSigninInitResponse>()
                    .mockReturnValue({
                        data: {
                            protocol: `s2k`,
                            salt: `salt`,
                            iteration: 1,
                            b: `b`,
                            c: `c`,
                        },
                    } as SigninInitResponse);

                expect(await icloud.getSRPLogin(authenticator)).toEqual([
                    `https://idmsa.apple.com/appleauth/auth/signin/complete`,
                    {
                        accountName: Config.defaultConfig.username,
                        trustTokens: expectedTrustTokensArray,
                        m1: `m1Proof`,
                        m2: `m2Proof`,
                        c: `c`,
                    },
                ]);
            });

            test(`Init request fails with server error`, async () => {
                const authenticator = new iCloudCrypto();
                authenticator.getClientEphemeral = jest.fn<typeof authenticator.getClientEphemeral>()
                    .mockResolvedValue(`clientEphemeral`);

                authenticator.getProofValues = jest.fn<typeof authenticator.getProofValues>()
                    .mockResolvedValue([`m1Proof`, `m2Proof`]);

                mockedNetworkManager.mock
                    .onAny()
                    .reply(500);

                await expect(icloud.getSRPLogin()).rejects.toThrow(/^Unable to initialize SRP authentication protocol$/);
            });

            test(`Init response does not match validator`, async () => {
                const authenticator = new iCloudCrypto();
                authenticator.getClientEphemeral = jest.fn<typeof authenticator.getClientEphemeral>()
                    .mockResolvedValue(`clientEphemeral`);

                authenticator.getProofValues = jest.fn<typeof authenticator.getProofValues>()
                    .mockResolvedValue([`m1Proof`, `m2Proof`]);

                mockedNetworkManager.mock
                    .onAny()
                    .reply(200);

                mockedValidator.validateSigninInitResponse = jest.fn<typeof mockedValidator.validateSigninInitResponse>(() => {
                    throw new iCPSError(VALIDATOR_ERR.SIGNIN_INIT_RESPONSE);
                });

                await expect(icloud.getSRPLogin()).rejects.toThrow(/^Unable to initialize SRP authentication protocol$/);
            });
        });
    });

    describe(`MFA Flow`, () => {

        describe(`Trusted Phone Numbers`, () => {
            test(`Success`, async () => {
                const runtimeWarningEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.TRUSTED_PHONE_NUMBERS_ERROR)
                mockedNetworkManager.mock
                    .onGet(`https://idmsa.apple.com/appleauth/auth`)
                    .reply(200, {data: `someData`});
                mockedValidator.validateAuthInformationResponse = jest.fn<typeof mockedValidator.validateAuthInformationResponse>()
                    .mockReturnValue({data: {trustedPhoneNumbers: [`someData`]}} as any)

                await expect(icloud.getTrustedPhoneNumbers()).resolves.toEqual([`someData`])
                expect(runtimeWarningEvent).not.toHaveBeenCalled()
            })

            test(`Invalid response`, async () => {
                const runtimeWarningEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.TRUSTED_PHONE_NUMBERS_ERROR)
                mockedNetworkManager.mock
                    .onGet(`https://idmsa.apple.com/appleauth/auth`)
                    .reply(200, {data: `invalidData`});
                mockedValidator.validateAuthInformationResponse = jest.fn<typeof mockedValidator.validateAuthInformationResponse>(() => {
                    throw new iCPSError(VALIDATOR_ERR.AUTH_INFORMATION_RESPONSE);
                });

                await expect(icloud.getTrustedPhoneNumbers()).resolves.toEqual([])
                expect(runtimeWarningEvent).toHaveBeenCalled()
            })

            test(`Server error`, async () => {
                const runtimeWarningEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.TRUSTED_PHONE_NUMBERS_ERROR)
                mockedNetworkManager.mock
                    .onGet(`https://idmsa.apple.com/appleauth/auth`)
                    .reply(500);

                await expect(icloud.getTrustedPhoneNumbers()).resolves.toEqual([])
                expect(runtimeWarningEvent).toHaveBeenCalled()
            })
        })

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
                    mockedNetworkManager._headerJar.setHeader(new Header(`idmsa.apple.com`, `scnt`, Config.iCloudAuthSecrets.scnt));
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
                                headers: {
                                    ...Config.REQUEST_HEADER.AUTH,
                                    scnt: Config.iCloudAuthSecrets.scnt,
                                    Cookie: `aasp=${Config.iCloudAuthSecrets.aasp}`,
                                    'X-Apple-ID-Session-Id': Config.iCloudAuthSecrets.sessionSecret,
                                },
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
                    mockedNetworkManager._headerJar.setHeader(new Header(`idmsa.apple.com`, `scnt`, Config.iCloudAuthSecrets.scnt));
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
                                headers: {
                                    ...Config.REQUEST_HEADER.AUTH,
                                    scnt: Config.iCloudAuthSecrets.scnt,
                                    Cookie: `aasp=${Config.iCloudAuthSecrets.aasp}`,
                                    'X-Apple-ID-Session-Id': Config.iCloudAuthSecrets.sessionSecret,
                                },
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
                    mockedNetworkManager._headerJar.setHeader(new Header(`idmsa.apple.com`, `scnt`, Config.iCloudAuthSecrets.scnt));
                    mockedNetworkManager.sessionId = Config.iCloudAuthSecrets.sessionSecret;

                    mockedNetworkManager.mock
                        .onPut(endpoint,
                            payload,
                            {
                                headers: {
                                    ...Config.REQUEST_HEADER.AUTH,
                                    scnt: Config.iCloudAuthSecrets.scnt,
                                    Cookie: `aasp=${Config.iCloudAuthSecrets.aasp}`,
                                    'X-Apple-ID-Session-Id': Config.iCloudAuthSecrets.sessionSecret,
                                },
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
            beforeEach(() => {
                jest.useFakeTimers()
                icloud.mfaTimeout = setTimeout(() => {}, 1500)
            })
            afterEach(() => {
                jest.clearAllTimers()
            })
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
                        failure: 500,
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
                        failure: 500,
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
                        failure: 500,
                    },
                },
            ])(`Method: $method`, ({method, endpoint, payload, codes}) => {
                test(`Success`, async () => {
                    mockedNetworkManager._headerJar.setCookie(Config.aaspCookieString);
                    mockedNetworkManager._headerJar.setHeader(new Header(`idmsa.apple.com`, `scnt`, Config.iCloudAuthSecrets.scnt));
                    mockedNetworkManager.sessionId = Config.iCloudAuthSecrets.sessionSecret;

                    mockedNetworkManager.mock
                        .onPost(endpoint,
                            payload,
                            {
                                headers: {
                                    ...Config.REQUEST_HEADER.AUTH,
                                    scnt: Config.iCloudAuthSecrets.scnt,
                                    Cookie: `aasp=${Config.iCloudAuthSecrets.aasp}`,
                                    'X-Apple-ID-Session-Id': Config.iCloudAuthSecrets.sessionSecret,
                                },
                            },
                        )
                        .reply(codes.success);

                    // Checking if rejection is properly parsed
                    const authenticatedEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.AUTHENTICATED);

                    await icloud.submitMFA(new MFAMethod(method as any), `123456`);

                    expect(authenticatedEvent).toHaveBeenCalled();
                    expect(icloud.mfaTimeout).toBeUndefined()
                });

                test(`Failure`, async () => {
                    const iCloudReady = icloud.getReady();
                    mockedNetworkManager._headerJar.setCookie(Config.aaspCookieString);
                    mockedNetworkManager._headerJar.setHeader(new Header(`idmsa.apple.com`, `scnt`, Config.iCloudAuthSecrets.scnt));
                    mockedNetworkManager.sessionId = Config.iCloudAuthSecrets.sessionSecret;

                    mockedNetworkManager.mock
                        .onPost(endpoint,
                            payload,
                            {
                                headers: {
                                    ...Config.REQUEST_HEADER.AUTH,
                                    scnt: Config.iCloudAuthSecrets.scnt,
                                    Cookie: `aasp=${Config.iCloudAuthSecrets.aasp}`,
                                    'X-Apple-ID-Session-Id': Config.iCloudAuthSecrets.sessionSecret,
                                },
                            },
                        )
                        .reply(codes.failure);

                    await icloud.submitMFA(new MFAMethod(method as any), `123456`);

                    await expect(iCloudReady).rejects.toThrow(/^Unable to submit MFA code$/);
                    expect(icloud.mfaTimeout).toBeDefined()
                });

                test.each([{
                    replyPayload: {
                        service_errors: [  
                            {
                                code: `-21669`,
                                message: `Incorrect verification code.`,
                                title: `Incorrect Verification Code`,
                            },
                        ],
                    },
                    desc: `with service error`,
                }, {
                    replyPayload: {
                        service_errors: [],  
                    },
                    desc: `without service error`,
                }, {
                    replyPayload: {
                        service_errors: [  
                            {
                                code: `-21669`,
                                message: `Incorrect verification code.`,
                                title: `Incorrect Verification Code`,
                            }, {
                                code: `-21669`,
                                message: `Incorrect verification code.`,
                                title: `Incorrect Verification Code`,
                            },
                        ],
                    },
                    desc: `with multiple service error`,
                }])(`Incorrect code $desc`, async ({replyPayload}) => {
                    const iCloudReady = icloud.getReady();
                    mockedNetworkManager._headerJar.setCookie(Config.aaspCookieString);
                    mockedNetworkManager._headerJar.setHeader(new Header(`idmsa.apple.com`, `scnt`, Config.iCloudAuthSecrets.scnt));
                    mockedNetworkManager.sessionId = Config.iCloudAuthSecrets.sessionSecret;

                    mockedNetworkManager.mock
                        .onPost(endpoint,
                            payload,
                            {
                                headers: {
                                    ...Config.REQUEST_HEADER.AUTH,
                                    scnt: Config.iCloudAuthSecrets.scnt,
                                    Cookie: `aasp=${Config.iCloudAuthSecrets.aasp}`,
                                    'X-Apple-ID-Session-Id': Config.iCloudAuthSecrets.sessionSecret,
                                },
                            },
                        )
                        .reply(400, replyPayload);

                    await icloud.submitMFA(new MFAMethod(method as any), `123456`);

                    await expect(iCloudReady).rejects.toThrow(/^MFA code rejected$/);
                    expect(icloud.mfaTimeout).toBeDefined()
                });
            });
        });
    });

    describe(`Trust Token`, () => {
        test(`Success`, async () => {
            mockedNetworkManager._headerJar.setCookie(Config.aaspCookieString);
            mockedNetworkManager._headerJar.setHeader(new Header(`idmsa.apple.com`, `scnt`, Config.iCloudAuthSecrets.scnt));
            mockedNetworkManager.sessionId = Config.iCloudAuthSecrets.sessionSecret;

            mockedValidator.validateTrustResponse = jest.fn<typeof mockedValidator.validateTrustResponse>();
            mockedNetworkManager.applyTrustResponse = jest.fn<typeof mockedNetworkManager.applyTrustResponse>();

            const trustedEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.TRUSTED);

            mockedNetworkManager.mock
                .onGet(`https://idmsa.apple.com/appleauth/auth/2sv/trust`, {
                    headers: {
                        ...Config.REQUEST_HEADER.AUTH,
                        scnt: Config.iCloudAuthSecrets.scnt,
                        Cookie: `aasp=${Config.iCloudAuthSecrets.aasp}`,
                        'X-Apple-ID-Session-Id': Config.iCloudAuthSecrets.sessionSecret,
                    },
                })
                .reply(204);

            await icloud.getTokens();

            expect(mockedValidator.validateTrustResponse).toHaveBeenCalled();
            expect(mockedNetworkManager.applyTrustResponse).toHaveBeenCalled();
            expect(trustedEvent).toHaveBeenCalled();
        });

        test(`Error - Invalid Response`, async () => {
            const iCloudReady = icloud.getReady();
            mockedNetworkManager._headerJar.setCookie(Config.aaspCookieString);
            mockedNetworkManager._headerJar.setHeader(new Header(`idmsa.apple.com`, `scnt`, Config.iCloudAuthSecrets.scnt));
            mockedNetworkManager.sessionId = Config.iCloudAuthSecrets.sessionSecret;

            mockedValidator.validateTrustResponse = jest.fn<typeof mockedValidator.validateTrustResponse>(() => {
                throw new iCPSError(VALIDATOR_ERR.TRUST_RESPONSE);
            });

            mockedNetworkManager.mock
                .onGet(`https://idmsa.apple.com/appleauth/auth/2sv/trust`, {
                    headers: {
                        ...Config.REQUEST_HEADER.AUTH,
                        scnt: Config.iCloudAuthSecrets.scnt,
                        Cookie: `aasp=${Config.iCloudAuthSecrets.aasp}`,
                        'X-Apple-ID-Session-Id': Config.iCloudAuthSecrets.sessionSecret,
                    },
                })
                .reply(204);

            await icloud.getTokens();
            await expect(iCloudReady).rejects.toThrow(/^Unable to acquire account tokens$/);

            expect(mockedValidator.validateTrustResponse).toHaveBeenCalled();
        });

        test(`Error - Invalid Status Code`, async () => {
            const iCloudReady = icloud.getReady();
            mockedNetworkManager._headerJar.setCookie(Config.aaspCookieString);
            mockedNetworkManager._headerJar.setHeader(new Header(`idmsa.apple.com`, `scnt`, Config.iCloudAuthSecrets.scnt));
            mockedNetworkManager.sessionId = Config.iCloudAuthSecrets.sessionSecret;

            mockedNetworkManager.mock
                .onGet(`https://idmsa.apple.com/appleauth/auth/2sv/trust`, {
                    headers: {
                        ...Config.REQUEST_HEADER.AUTH,
                        scnt: Config.iCloudAuthSecrets.scnt,
                        Cookie: `aasp=${Config.iCloudAuthSecrets.aasp}`,
                        'X-Apple-ID-Session-Id': Config.iCloudAuthSecrets.sessionSecret,
                    },
                })
                .reply(500);

            await icloud.getTokens();
            await expect(iCloudReady).rejects.toThrow(/^Unable to acquire account tokens$/);
        });
    });

    describe(`Setup iCloud`, () => {
        test(`Success`, async () => {
            mockedNetworkManager.sessionId = Config.iCloudAuthSecrets.sessionSecret;
            mockedResourceManager._resources.trustToken = Config.trustToken;

            mockedValidator.validateSetupResponse = jest.fn<typeof mockedValidator.validateSetupResponse>()
                .mockReturnValue({
                    headers: {
                        'set-cookie': [
                            `X-APPLE-WEBAUTH-PCS-Photos="someVal";Path=/;Domain=.icloud.com;Secure;HttpOnly`,
                            `X-APPLE-WEBAUTH-PCS-Sharing="someOtherVal";Path=/;Domain=.icloud.com;Secure;HttpOnly`,
                        ],
                    },
                    data: {
                        dsInfo: {
                            isWebAccessAllowed: true,
                        },
                        webservices: {
                            ckdatabasews: {
                                url: `someURL`,
                                status: `active`,
                            },
                        },
                    },
                });
            mockedNetworkManager.applySetupResponse = jest.fn<typeof mockedNetworkManager.applySetupResponse>()
                .mockReturnValue(true);

            const accountReadyEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.ACCOUNT_READY);

            mockedNetworkManager.mock
                .onPost(`https://setup.icloud.com/setup/ws/1/accountLogin`, {
                    dsWebAuthToken: Config.iCloudAuthSecrets.sessionSecret,
                }, {
                    headers: Config.REQUEST_HEADER.DEFAULT,
                })
                .reply(200);

            await icloud.setupAccount();

            expect(mockedValidator.validateSetupResponse).toHaveBeenCalled();
            expect(mockedNetworkManager.applySetupResponse).toHaveBeenCalled();
            expect(accountReadyEvent).toHaveBeenCalledTimes(1);
            expect(icloud.photos).toBeDefined();
        });

        test(`PCS Required`, async () => {
            mockedNetworkManager.sessionId = Config.iCloudAuthSecrets.sessionSecret;
            mockedResourceManager._resources.trustToken = Config.trustToken;

            mockedValidator.validateSetupResponse = jest.fn<typeof mockedValidator.validateSetupResponse>()
                .mockReturnValue({
                    headers: {
                        'set-cookie': [],   
                    },
                    data: {
                        dsInfo: {
                            isWebAccessAllowed: true,
                        },
                        webservices: {
                            ckdatabasews: {
                                url: `someURL`,
                                pcsRequired: true,
                                status: `active`,
                            },
                        },
                    },
                });
            mockedNetworkManager.applySetupResponse = jest.fn<typeof mockedNetworkManager.applySetupResponse>();

            const pcsRequiredEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.PCS_REQUIRED);

            mockedNetworkManager.mock
                .onPost(`https://setup.icloud.com/setup/ws/1/accountLogin`, {
                    dsWebAuthToken: Config.iCloudAuthSecrets.sessionSecret,
                }, {
                    headers: Config.REQUEST_HEADER.DEFAULT,
                })
                .reply(200);

            await icloud.setupAccount();

            expect(mockedValidator.validateSetupResponse).toHaveBeenCalled();
            expect(mockedNetworkManager.applySetupResponse).toHaveBeenCalled();
            expect(pcsRequiredEvent).toHaveBeenCalledTimes(1);
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
            const iCloudReady = icloud.getReady();
            mockedNetworkManager.sessionToken = Config.iCloudAuthSecrets.sessionSecret;

            mockedValidator.validateSetupResponse = jest.fn<typeof mockedValidator.validateSetupResponse>(() => {
                throw new iCPSError(VALIDATOR_ERR.SETUP_RESPONSE);
            });

            mockedNetworkManager.mock
                .onAny()
                .reply(200);

            await icloud.setupAccount();
            await expect(iCloudReady).rejects.toThrow(/^Unable to setup iCloud Account$/);

            expect(mockedValidator.validateSetupResponse).toHaveBeenCalled();
        });

        test(`Error - Invalid Status Code`, async () => {
            const iCloudReady = icloud.getReady();
            mockedNetworkManager.sessionToken = Config.iCloudAuthSecrets.sessionSecret;

            mockedNetworkManager.mock
                .onAny()
                .reply(500);

            await icloud.setupAccount();
            await expect(iCloudReady).rejects.toThrow(/^Unable to setup iCloud Account$/);
        });
    });

    describe(`Acquire PCS Cookie`, () => {
        beforeAll(() => {
            jest.useFakeTimers();
        });

        afterAll(() => {
            jest.useRealTimers();
        });

        test(`Success`, async () => {
            mockedNetworkManager.sessionId = Config.iCloudAuthSecrets.sessionSecret;

            mockedValidator.validatePCSResponse = jest.fn<typeof mockedValidator.validatePCSResponse>()
                .mockReturnValue({
                    headers: {
                        'set-cookie': [
                            `X-APPLE-WEBAUTH-PCS-Photos="someVal";Path=/;Domain=.icloud.com;Secure;HttpOnly`,
                            `X-APPLE-WEBAUTH-PCS-Sharing="someOtherVal";Path=/;Domain=.icloud.com;Secure;HttpOnly`,
                        ],
                    },
                    data: {
                        isWebAccessAllowed: true,
                        message: `Cookies attached.`,
                        status: `success`,
                    },
                });

            const accountReadyEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.ACCOUNT_READY);

            mockedNetworkManager.mock
                .onPost(`https://setup.icloud.com/setup/ws/1/requestPCS`, {
                    appName: `photos`,
                    derivedFromUserAction: true,
                }, {
                    headers: Config.REQUEST_HEADER.DEFAULT,
                })
                .reply(200);

            await icloud.acquirePCSCookies();

            // Expect(mockedValidator.validatePCSResponse).toHaveBeenCalled();
            expect(accountReadyEvent).toHaveBeenCalledTimes(1);
            expect(icloud.photos).toBeDefined();
        });

        test(`Retry when request has not yet been authorized`, async () => {
            mockedNetworkManager.sessionId = Config.iCloudAuthSecrets.sessionSecret;

            mockedValidator.validatePCSResponse = jest.fn<typeof mockedValidator.validatePCSResponse>()
                .mockReturnValue({
                    headers: {},
                    data: {
                        isWebAccessAllowed: true,
                        message: `Requested a new device arming to upload cookies.`,
                        status: `failure`,
                    },
                });

            const pcsNotReadyEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.PCS_NOT_READY);
            const pcsRequiredEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.PCS_REQUIRED);

            mockedNetworkManager.mock
                .onPost(`https://setup.icloud.com/setup/ws/1/requestPCS`, {
                    appName: `photos`,
                    derivedFromUserAction: true,
                }, {
                    headers: Config.REQUEST_HEADER.DEFAULT,
                })
                .reply(200);

            await icloud.acquirePCSCookies();

            expect(mockedValidator.validatePCSResponse).toHaveBeenCalled();
            expect(pcsNotReadyEvent).toHaveBeenCalledTimes(1);
            expect(pcsRequiredEvent).not.toHaveBeenCalled();

            jest.advanceTimersByTime(10000);
            expect(pcsRequiredEvent).toHaveBeenCalledTimes(1);
            expect(icloud.photos).toBeDefined();
        });

        test(`Successful response, but missing set-cookies header`, async () => {
            const iCloudReady = icloud.getReady();
            mockedNetworkManager.sessionId = Config.iCloudAuthSecrets.sessionSecret;

            mockedValidator.validatePCSResponse = jest.fn<typeof mockedValidator.validatePCSResponse>()
                .mockReturnValue({
                    headers: {},
                    data: {
                        isWebAccessAllowed: true,
                        message: `Cookies attached.`,
                        status: `success`,
                    },
                });

            mockedNetworkManager.mock
                .onPost(`https://setup.icloud.com/setup/ws/1/requestPCS`, {
                    appName: `photos`,
                    derivedFromUserAction: true,
                }, {
                    headers: Config.REQUEST_HEADER.DEFAULT,
                })
                .reply(200);

            await icloud.acquirePCSCookies();
            await expect(iCloudReady).rejects.toThrow(/^Unable to acquire PCS cookies$/);

            expect(mockedValidator.validatePCSResponse).toHaveBeenCalled();
        });

        test(`Successful response, but missing PCS cookies`, async () => {
            const iCloudReady = icloud.getReady();
            mockedNetworkManager.sessionId = Config.iCloudAuthSecrets.sessionSecret;

            mockedValidator.validatePCSResponse = jest.fn<typeof mockedValidator.validatePCSResponse>()
                .mockReturnValue({
                    headers: {
                        "set-cookie": [],
                    },
                    data: {
                        isWebAccessAllowed: true,
                        message: `Cookies attached.`,
                        status: `success`,
                    },
                });

            mockedNetworkManager.mock
                .onPost(`https://setup.icloud.com/setup/ws/1/requestPCS`, {
                    appName: `photos`,
                    derivedFromUserAction: true,
                }, {
                    headers: Config.REQUEST_HEADER.DEFAULT,
                })
                .reply(200);

            await icloud.acquirePCSCookies();
            await expect(iCloudReady).rejects.toThrow(/^Unable to acquire PCS cookies$/);

            expect(mockedValidator.validatePCSResponse).toHaveBeenCalled();
        });

        test(`Error - Invalid Response`, async () => {
            const iCloudReady = icloud.getReady();
            mockedNetworkManager.sessionId = Config.iCloudAuthSecrets.sessionSecret;

            mockedValidator.validatePCSResponse = jest.fn<typeof mockedValidator.validatePCSResponse>(() => {
                throw new iCPSError(VALIDATOR_ERR.PCS_RESPONSE);
            });

            mockedNetworkManager.mock
                .onAny()
                .reply(200);

            await icloud.acquirePCSCookies();
            await expect(iCloudReady).rejects.toThrow(/^Unable to acquire PCS cookies$/);

            expect(mockedValidator.validatePCSResponse).toHaveBeenCalled();
        });

        test(`Error - Invalid Status Code`, async () => {
            const iCloudReady = icloud.getReady();
            mockedNetworkManager.sessionId = Config.iCloudAuthSecrets.sessionSecret;

            mockedValidator.validatePCSResponse = jest.fn<typeof mockedValidator.validatePCSResponse>();

            mockedNetworkManager.mock
                .onAny()
                .reply(500);

            await icloud.acquirePCSCookies();
            await expect(iCloudReady).rejects.toThrow(/^Unable to acquire PCS cookies$/);

            expect(mockedValidator.validatePCSResponse).not.toHaveBeenCalled();
        });
    });

    describe(`Logout`, () => {
        test(`Success`, async () => {
            mockedNetworkManager.mock
                .onPost(`https://setup.icloud.com/setup/ws/1/logout`, {
                    trustBrowser: true,
                    allBrowsers: false,
                }, {
                    headers: Config.REQUEST_HEADER.DEFAULT,
                })
                .reply(200);

            await expect(icloud.logout()).resolves.not.toThrow();
        });

        test(`Success - not logged in`, async () => {
            mockedNetworkManager.mock
                .onPost(`https://setup.icloud.com/setup/ws/1/logout`, {
                    trustBrowser: true,
                    allBrowsers: false,
                }, {
                    headers: Config.REQUEST_HEADER.DEFAULT,
                })
                .reply(421);

            await expect(icloud.logout()).resolves.not.toThrow();
        });

        test(`Error - Invalid Status Code`, async () => {
            mockedNetworkManager.mock
                .onAny()
                .reply(500);

            await expect(icloud.logout()).rejects.toThrow(/^Failed to logout from iCloud$/);
        });
    })

    describe(`Get iCloud Photos Ready`, () => {
        beforeEach(() => {
            icloud.photos = new iCloudPhotos();
        });

        test(`Setup resolves`, async () => {
            const iCloudReady = icloud.getReady();
            icloud.photos.setup = jest.fn<typeof icloud.photos.setup>(() => {
                Resources.emit(iCPSEventPhotos.READY);
                return Promise.resolve();
            });

            await icloud.getPhotosReady();

            await expect(iCloudReady).resolves.not.toThrow();

            expect(icloud.photos.setup).toHaveBeenCalled();
        });

        test(`Setup rejects`, async () => {
            const iCloudReady = icloud.getReady();
            icloud.photos.setup = jest.fn<typeof icloud.photos.setup>()
                .mockRejectedValue(new Error());

            await icloud.getPhotosReady();
            await expect(iCloudReady).rejects.toThrow(/^Unable to get iCloud Photos service ready$/);

            expect(icloud.photos.setup).toHaveBeenCalled();
        });

        test(`Photos Object invalid`, async () => {
            const iCloudReady = icloud.getReady();
            icloud.photos = undefined as any;
            await icloud.getPhotosReady();

            await expect(iCloudReady).rejects.toThrow(/^Unable to get iCloud Photos service ready$/);
        });
    });
});