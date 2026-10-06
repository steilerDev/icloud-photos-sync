import { test, afterAll, afterEach, beforeAll, beforeEach, describe, expect, jest} from '@jest/globals';
import { iCPSError } from '../../src/app/error/error';
import { AUTH_ERR, MFA_ERR, VALIDATOR_ERR } from '../../src/app/error/error-codes';
import { iCloud } from '../../src/lib/icloud/icloud';
import { iCloudPhotos } from '../../src/lib/icloud/icloud-photos/icloud-photos';
import { iCloudCrypto } from '../../src/lib/icloud/icloud.crypto';
import { MFAMethod } from '../../src/lib/icloud/mfa/mfa-method';
import { iCPSEventCloud, iCPSEventLog, iCPSEventMFA, iCPSEventPhotos, iCPSEventRuntimeWarning } from '../../src/lib/resources/events-types';
import { Resources } from '../../src/lib/resources/main';
import { Header } from '../../src/lib/resources/http-client';
import { SigninInitResponse } from '../../src/lib/resources/network-types';
import * as Config from '../_helpers/_config';
import { MockedEventManager, MockedNetworkManager, MockedResourceManager, MockedValidator, UnknownAsyncFunction, prepareResources } from '../_helpers/_general';

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
        test(`Should emit error when MFA_TIMEOUT is set to zero`, () => {
            mockedResourceManager._resources.mfaTimeout = 0
            const mfaEvent = mockedEventManager.spyOnEvent(iCPSEventMFA.MFA_NOT_PROVIDED)

            mockedEventManager.emit(iCPSEventCloud.MFA_REQUIRED)
            jest.advanceTimersByTime(1)

            expect(mfaEvent).toHaveBeenCalledWith(new Error(`MFA code timeout (consider increasing '--mfa-timeout' if necessary)`))
        })

        test(`Should timeout`, () => {
            mockedResourceManager._resources.mfaTimeout = 1
            const errorEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.ERROR)
            const mfaEvent = mockedEventManager.spyOnEvent(iCPSEventMFA.MFA_NOT_PROVIDED)

            mockedEventManager.emit(iCPSEventCloud.MFA_REQUIRED)
            jest.advanceTimersByTime(1000 + 10)

            expect(errorEvent).not.toHaveBeenCalled()
            expect(mfaEvent).toHaveBeenCalledWith(new Error(`MFA code timeout (consider increasing '--mfa-timeout' if necessary)`))

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
        mockedResourceManager._resources.mfaTimeout = 60 * 10; // Seconds
        const iCloudReady = icloud.getReady();
        const timeoutValue = 1000 * 60 * (10 + 5);

        jest.advanceTimersByTime(timeoutValue - 1);
        mockedEventManager.emit(iCPSEventPhotos.READY);
        await expect(iCloudReady).resolves.toBeTruthy();

        const timedOutICloudReady = icloud.getReady();
        jest.advanceTimersByTime(timeoutValue + 1);
        await expect(timedOutICloudReady).rejects.toThrow(/iCloud setup did not complete successfully within expected amount of time$/);
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

            mockedValidator.validateSigninResponse = jest.fn<typeof mockedValidator.validateSigninResponse>(response => response as any);
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
            icloud.getTrustedPhoneNumbers = jest.fn<typeof icloud.getTrustedPhoneNumbers>().mockResolvedValue(`someVal` as any);
            icloud.resendMFA = jest.fn<typeof icloud.resendMFA>().mockResolvedValue();

            const authenticationEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.AUTHENTICATION_STARTED);
            const mfaEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.MFA_REQUIRED);
            const trustedEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.TRUSTED);
            const errorEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.ERROR);

            mockedValidator.validateSigninResponse = jest.fn<typeof mockedValidator.validateSigninResponse>(response => response as any);
            mockedNetworkManager.applySigninResponse = jest.fn<typeof mockedNetworkManager.applySigninResponse>();

            mockedNetworkManager.mock
                .onPost(authenticationUrl, authenticationPayload, {headers: Config.REQUEST_HEADER.AUTH})
                .reply(409);

            await icloud.authenticate();

            expect(icloud.getTrustedPhoneNumbers).toHaveBeenCalled();
            // Since iOS 26.4 the code needs to be explicitly pushed to the trusted devices
            expect(icloud.resendMFA).toHaveBeenCalledWith(new MFAMethod(`device`));
            expect(trustedEvent).not.toHaveBeenCalled();
            expect(authenticationEvent).toHaveBeenCalled();
            expect(mfaEvent).toHaveBeenCalledWith(`someVal`);
            expect(errorEvent).not.toHaveBeenCalled();
            expect(mockedValidator.validateSigninResponse).toHaveBeenCalled();
            expect(mockedNetworkManager.applySigninResponse).toHaveBeenCalled();
            expect(legacy ? icloud.getLegacyLogin : icloud.getSRPLogin).toHaveBeenCalled();
            jest.resetAllMocks();
        });

        test.each([
            {header: `x-apple-edp`},
            {header: `x-apple-pdp`},
        ])(`Valid Trust Token - Escrow required ($header)`, async ({header}) => {
            icloud.getReady = jest.fn<typeof icloud.getReady>().mockResolvedValue(true);
            icloud.getTrustedPhoneNumbers = jest.fn<typeof icloud.getTrustedPhoneNumbers>();
            icloud.resendMFA = jest.fn<typeof icloud.resendMFA>();
            icloud.completeEscrow = jest.fn<typeof icloud.completeEscrow>().mockResolvedValue();
            mockedResourceManager._resources.trustToken = Config.trustToken;

            const mfaEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.MFA_REQUIRED);
            const trustedEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.TRUSTED);
            const errorEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.ERROR);

            mockedValidator.validateSigninResponse = jest.fn<typeof mockedValidator.validateSigninResponse>(response => response as any);
            mockedNetworkManager.applySigninResponse = jest.fn<typeof mockedNetworkManager.applySigninResponse>();

            mockedNetworkManager.mock
                .onPost(authenticationUrl, authenticationPayload, {headers: Config.REQUEST_HEADER.AUTH})
                .reply(409, {authType: `hsa2`}, {[header]: `true`});

            await icloud.authenticate();

            expect(icloud.completeEscrow).toHaveBeenCalled();
            expect(trustedEvent).toHaveBeenCalledWith(Config.trustToken);
            expect(mfaEvent).not.toHaveBeenCalled();
            expect(errorEvent).not.toHaveBeenCalled();
            // No MFA code is pushed to the trusted devices
            expect(icloud.getTrustedPhoneNumbers).not.toHaveBeenCalled();
            expect(icloud.resendMFA).not.toHaveBeenCalled();
        });

        test(`Valid Trust Token - Escrow failed`, async () => {
            icloud.getReady = jest.fn<typeof icloud.getReady>().mockResolvedValue(true);
            icloud.completeEscrow = jest.fn<typeof icloud.completeEscrow>().mockRejectedValue(new iCPSError(AUTH_ERR.ESCROW_FAILED));

            const mfaEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.MFA_REQUIRED);
            const trustedEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.TRUSTED);
            const errorEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.ERROR);

            mockedValidator.validateSigninResponse = jest.fn<typeof mockedValidator.validateSigninResponse>(response => response as any);
            mockedNetworkManager.applySigninResponse = jest.fn<typeof mockedNetworkManager.applySigninResponse>();

            mockedNetworkManager.mock
                .onPost(authenticationUrl, authenticationPayload, {headers: Config.REQUEST_HEADER.AUTH})
                .reply(409, {authType: `hsa2`}, {'x-apple-edp': `true`});

            await icloud.authenticate();

            expect(errorEvent).toHaveBeenCalledWith(new iCPSError(AUTH_ERR.ESCROW_FAILED));
            expect(trustedEvent).not.toHaveBeenCalled();
            expect(mfaEvent).not.toHaveBeenCalled();
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

            describe(`Response formats`, () => {
                const trustedPhoneNumber = {
                    id: 2,
                    numberWithDialCode: `+49 •••• •••••12`,
                    pushMode: `sms`,
                    obfuscatedNumber: `•••• •••••12`,
                    lastTwoDigits: `12`,
                    nonFTEU: true,
                };

                const bootArgsHTML = (bootArgs: unknown) => `<html><head><script type="application/json" class="boot_args">${JSON.stringify(bootArgs)}</script></head><body></body></html>`;

                test.each([
                    {
                        desc: `JSON - top level`,
                        response: {trustedPhoneNumbers: [trustedPhoneNumber]},
                    },
                    {
                        desc: `JSON - nested in phone number verification`,
                        response: {phoneNumberVerification: {trustedPhoneNumbers: [trustedPhoneNumber]}},
                    },
                    {
                        desc: `HTML - nested in phone number verification`,
                        response: bootArgsHTML({direct: {twoSV: {phoneNumberVerification: {trustedPhoneNumbers: [trustedPhoneNumber]}}}}),
                    },
                    {
                        desc: `HTML - nested in bridge initiate data`,
                        response: bootArgsHTML({direct: {twoSV: {bridgeInitiateData: {phoneNumberVerification: {trustedPhoneNumbers: [trustedPhoneNumber]}}}}}),
                    },
                ])(`$desc`, async ({response}) => {
                    const runtimeWarningEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.TRUSTED_PHONE_NUMBERS_ERROR);
                    mockedNetworkManager.mock
                        .onGet(`https://idmsa.apple.com/appleauth/auth`, undefined, {headers: {...Config.REQUEST_HEADER.AUTH, Accept: `application/json`}})
                        .reply(200, response);

                    await expect(icloud.getTrustedPhoneNumbers()).resolves.toEqual([trustedPhoneNumber]);
                    expect(runtimeWarningEvent).not.toHaveBeenCalled();
                });

                test.each([
                    {
                        desc: `HTML without boot args`,
                        response: `<html><body>No boot args</body></html>`,
                    },
                    {
                        desc: `HTML without phone numbers`,
                        response: bootArgsHTML({direct: {twoSV: {}}}),
                    },
                    {
                        desc: `JSON without phone numbers`,
                        response: {securityCode: {length: 6}},
                    },
                ])(`$desc`, async ({response}) => {
                    const runtimeWarningEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.TRUSTED_PHONE_NUMBERS_ERROR);
                    mockedNetworkManager.mock
                        .onGet(`https://idmsa.apple.com/appleauth/auth`)
                        .reply(200, response);

                    await expect(icloud.getTrustedPhoneNumbers()).resolves.toEqual([]);
                    expect(runtimeWarningEvent).toHaveBeenCalled();
                });
            });
        })

        describe(`Resend MFA`, () => {
            describe.each([
                {
                    method: `device`,
                    endpoint: `https://idmsa.apple.com/appleauth/auth/verify/trusteddevice/securitycode`,
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

            test.each([
                {
                    desc: `sms`,
                    method: `sms`,
                },
                {
                    desc: `voice`,
                    method: `voice`,
                },
            ])(`Forwards phone number flags when requesting code via $desc`, async ({method}) => {
                mockedNetworkManager._headerJar.setCookie(Config.aaspCookieString);
                mockedNetworkManager._headerJar.setHeader(new Header(`idmsa.apple.com`, `scnt`, Config.iCloudAuthSecrets.scnt));
                mockedNetworkManager.sessionId = Config.iCloudAuthSecrets.sessionSecret;

                mockedValidator.validateResendMFAPhoneResponse = jest.fn<typeof mockedValidator.validateResendMFAPhoneResponse>()
                    .mockReturnValue({
                        data: {
                            trustedPhoneNumber: {
                                numberWithDialCode: `someNumber`,
                            },
                        },
                    } as any);

                // Mock only matches the exact payload - any other body throws
                mockedNetworkManager.mock
                    .onPut(`https://idmsa.apple.com/appleauth/auth/verify/phone`,
                        {
                            phoneNumber: {
                                id: 2,
                                nonFTEU: true,
                            },
                            mode: method,
                        },
                    )
                    .reply(200);

                const warnEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.MFA_ERROR);

                await icloud.resendMFA(new MFAMethod(method as any, 2, true));

                expect(mockedValidator.validateResendMFAPhoneResponse).toHaveBeenCalled();
                expect(warnEvent).not.toHaveBeenCalled();
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

                describe(`Status 409 (since iOS 26.4)`, () => {
                    const mock409Reply = (data: unknown, headers: Record<string, string> = {}) => {
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
                            .reply(409, data, headers);
                    };

                    test.each([
                        {
                            desc: `valid code flag and session token`,
                            data: {securityCode: {code: `123456`, valid: true}},
                            headers: {'x-apple-session-token': `newSessionToken`},
                            expectedSessionSecret: `newSessionToken`,
                        }, {
                            desc: `valid code flag only`,
                            data: {securityCode: {code: `123456`, valid: true}},
                            headers: {},
                            expectedSessionSecret: Config.iCloudAuthSecrets.sessionSecret,
                        }, {
                            desc: `session token only`,
                            data: {},
                            headers: {'x-apple-session-token': `newSessionToken`},
                            expectedSessionSecret: `newSessionToken`,
                        },
                    ])(`Success - $desc`, async ({data, headers, expectedSessionSecret}) => {
                        mockedResourceManager._resources.sessionSecret = Config.iCloudAuthSecrets.sessionSecret;
                        mock409Reply(data, headers);
                        const authenticatedEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.AUTHENTICATED);
                        const errorEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.ERROR);

                        await icloud.submitMFA(new MFAMethod(method as any), `123456`);

                        expect(authenticatedEvent).toHaveBeenCalled();
                        expect(errorEvent).not.toHaveBeenCalled();
                        expect(mockedResourceManager.sessionSecret).toEqual(expectedSessionSecret);
                        expect(icloud.mfaTimeout).toBeUndefined();
                    });

                    test.each([
                        {
                            desc: `without validation information`,
                            data: {securityCode: {code: `123456`}},
                        }, {
                            desc: `with invalid code flag`,
                            data: {securityCode: {code: `123456`, valid: false}},
                        }, {
                            desc: `with service error`,
                            data: {
                                service_errors: [{
                                    code: `-21669`,
                                    message: `Incorrect verification code.`,
                                    title: `Incorrect Verification Code`,
                                }],
                            },
                        },
                    ])(`Rejected - $desc`, async ({data}) => {
                        const iCloudReady = icloud.getReady();
                        mock409Reply(data);
                        const authenticatedEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.AUTHENTICATED);

                        await icloud.submitMFA(new MFAMethod(method as any), `123456`);

                        await expect(iCloudReady).rejects.toThrow(/^MFA code rejected$/);
                        expect(authenticatedEvent).not.toHaveBeenCalled();
                        expect(icloud.mfaTimeout).toBeDefined();
                    });
                });
            });

            test(`Incorrect code - service error with unexpected status`, async () => {
                const iCloudReady = icloud.getReady();
                mockedNetworkManager.mock
                    .onPost(`https://idmsa.apple.com/appleauth/auth/verify/trusteddevice/securitycode`)
                    .reply(412, {
                        service_errors: [{
                            code: `-21669`,
                            message: `Incorrect verification code.`,
                        }],
                    });

                await icloud.submitMFA(new MFAMethod(`device`), `123456`);

                await expect(iCloudReady).rejects.toThrow(/^MFA code rejected$/);
            });
        });
    });

    describe(`Escrow`, () => {
        const escrowInitData = {
            protocol: `s2k`,
            salt: `salt`,
            iteration: 1,
            b: `b`,
            c: `c`,
        };

        function mockAuthenticator(): iCloudCrypto {
            const authenticator = new iCloudCrypto(``);
            authenticator.getClientEphemeral = jest.fn<typeof authenticator.getClientEphemeral>()
                .mockResolvedValue(`clientEphemeral`);
            authenticator.derivePassword = jest.fn<typeof authenticator.derivePassword>()
                .mockResolvedValue(new Uint8Array([1, 2, 3]));
            authenticator.getProofValues = jest.fn<typeof authenticator.getProofValues>()
                .mockResolvedValue([`m1Proof`, `m2Proof`]);
            authenticator.getSessionKey = jest.fn<typeof authenticator.getSessionKey>()
                .mockResolvedValue(`sessionKey`);
            return authenticator;
        }

        test(`Success`, async () => {
            const authenticator = mockAuthenticator();
            mockedResourceManager._resources.sessionSecret = `oldSessionToken`;

            mockedNetworkManager.mock
                .onPost(`https://idmsa.apple.com/appleauth/auth/escrow/init`, {
                    a: `clientEphemeral`,
                    accountName: ``,
                    protocols: [`s2k`, `s2k_fo`],
                }, {
                    headers: Config.REQUEST_HEADER.AUTH,
                })
                .reply(200, escrowInitData)
                .onPost(`https://idmsa.apple.com/appleauth/auth/escrow/complete`, {
                    m1: `m1Proof`,
                    m2: `m2Proof`,
                    c: `c`,
                    k: `sessionKey`,
                }, {
                    headers: Config.REQUEST_HEADER.AUTH,
                })
                .reply(200, {}, {'x-apple-session-token': `escrowSessionToken`});

            await icloud.completeEscrow(authenticator);

            expect(authenticator.derivePassword).toHaveBeenCalledWith(`s2k`, `salt`, 1);
            expect(authenticator.getProofValues).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]), `b`, `salt`);
            expect(mockedResourceManager.sessionSecret).toEqual(`escrowSessionToken`);
        });

        test.each([
            {
                desc: `init request fails`,
                initStatus: 500,
                initData: escrowInitData,
                completeStatus: 200,
            }, {
                desc: `init response invalid`,
                initStatus: 200,
                initData: {salt: `salt`},
                completeStatus: 200,
            }, {
                desc: `complete request fails`,
                initStatus: 200,
                initData: escrowInitData,
                completeStatus: 401,
            },
        ])(`Failure - $desc`, async ({initStatus, initData, completeStatus}) => {
            mockedNetworkManager.mock
                .onPost(`https://idmsa.apple.com/appleauth/auth/escrow/init`)
                .reply(initStatus, initData)
                .onPost(`https://idmsa.apple.com/appleauth/auth/escrow/complete`)
                .reply(completeStatus);

            await expect(icloud.completeEscrow(mockAuthenticator())).rejects.toThrow(/^Unable to complete the escrow password verification$/);
        });

        test.each([
            {headers: {'x-apple-edp': `true`}, expected: true},
            {headers: {'x-apple-pdp': `true`}, expected: true},
            {headers: {}, expected: false},
        ])(`Requires escrow - $headers`, ({headers, expected}) => {
            expect(icloud.requiresEscrow({headers} as any)).toBe(expected);
        });

        describe(`After MFA code`, () => {
            beforeEach(() => {
                jest.useFakeTimers();
                icloud.mfaTimeout = setTimeout(() => {}, 1500);
            });

            afterEach(() => {
                jest.clearAllTimers();
            });

            test(`Success`, async () => {
                icloud.completeEscrow = jest.fn<typeof icloud.completeEscrow>().mockResolvedValue();
                mockedNetworkManager.mock
                    .onPost(`https://idmsa.apple.com/appleauth/auth/verify/trusteddevice/securitycode`)
                    .reply(409, {securityCode: {valid: true}}, {'x-apple-session-token': `newSessionToken`, 'x-apple-edp': `true`});
                const authenticatedEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.AUTHENTICATED);
                const errorEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.ERROR);

                await icloud.submitMFA(new MFAMethod(`device`), `123456`);

                expect(icloud.completeEscrow).toHaveBeenCalled();
                expect(authenticatedEvent).toHaveBeenCalled();
                expect(errorEvent).not.toHaveBeenCalled();
            });

            test(`Not required`, async () => {
                icloud.completeEscrow = jest.fn<typeof icloud.completeEscrow>().mockResolvedValue();
                mockedNetworkManager.mock
                    .onPost(`https://idmsa.apple.com/appleauth/auth/verify/trusteddevice/securitycode`)
                    .reply(409, {securityCode: {valid: true}});
                const authenticatedEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.AUTHENTICATED);

                await icloud.submitMFA(new MFAMethod(`device`), `123456`);

                expect(icloud.completeEscrow).not.toHaveBeenCalled();
                expect(authenticatedEvent).toHaveBeenCalled();
            });

            test(`Failure`, async () => {
                const iCloudReady = icloud.getReady();
                icloud.completeEscrow = jest.fn<typeof icloud.completeEscrow>().mockRejectedValue(new iCPSError(AUTH_ERR.ESCROW_FAILED));
                mockedNetworkManager.mock
                    .onPost(`https://idmsa.apple.com/appleauth/auth/verify/trusteddevice/securitycode`)
                    .reply(409, {securityCode: {valid: true}}, {'x-apple-edp': `true`});
                const authenticatedEvent = mockedEventManager.spyOnEvent(iCPSEventCloud.AUTHENTICATED);

                await icloud.submitMFA(new MFAMethod(`device`), `123456`);

                await expect(iCloudReady).rejects.toThrow(/^Unable to complete the escrow password verification$/);
                expect(authenticatedEvent).not.toHaveBeenCalled();
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
            mockedNetworkManager.sessionToken = Config.iCloudAuthSecrets.sessionSecret;
            mockedNetworkManager.accountCountry = `DEU`;
            mockedResourceManager._resources.trustToken = Config.trustToken;

            mockedValidator.validateSetupResponse = jest.fn<typeof mockedValidator.validateSetupResponse>()
                .mockReturnValue({
                    headers: {
                        'set-cookie': [
                            `X-APPLE-WEBAUTH-PCS-Photos="someVal";Path=/;Domain=.icloud.com;Secure;HttpOnly`,
                            `X-APPLE-WEBAUTH-PCS-Sharing="someOtherVal";Path=/;Domain=.icloud.com;Secure;HttpOnly`,
                            `X-APPLE-WEBAUTH-TOKEN="someToken";Path=/;Domain=.icloud.com;Secure;HttpOnly`,
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
                    accountCountryCode: `DEU`,
                    extended_login: true,
                    trustToken: Config.trustToken,
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
            mockedNetworkManager.sessionToken = Config.iCloudAuthSecrets.sessionSecret;
            mockedNetworkManager.accountCountry = `DEU`;
            mockedResourceManager._resources.trustToken = Config.trustToken;

            mockedValidator.validateSetupResponse = jest.fn<typeof mockedValidator.validateSetupResponse>()
                .mockReturnValue({
                    headers: {
                        'set-cookie': [
                            `X-APPLE-WEBAUTH-TOKEN="someToken";Path=/;Domain=.icloud.com;Secure;HttpOnly`,
                        ],
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
                    accountCountryCode: `DEU`,
                    extended_login: true,
                    trustToken: Config.trustToken,
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

        test.each([
            {
                desc: `repair needed`,
                data: {isRepairNeeded: true},
                cookies: [`X-APPLE-WEBAUTH-TOKEN="someToken";Path=/;Domain=.icloud.com;Secure;HttpOnly`],
            }, {
                desc: `terms update needed`,
                data: {termsUpdateNeeded: true},
                cookies: [`X-APPLE-WEBAUTH-TOKEN="someToken";Path=/;Domain=.icloud.com;Secure;HttpOnly`],
            }, {
                desc: `web auth token missing`,
                data: {isRepairNeeded: false, termsUpdateNeeded: false},
                cookies: [`X-APPLE-WEBAUTH-REPAIR="someVal";Path=/;Domain=.icloud.com;Secure;HttpOnly`],
            },
        ])(`Error - Account setup incomplete ($desc)`, async ({data, cookies}) => {
            const iCloudReady = icloud.getReady();
            mockedNetworkManager.sessionToken = Config.iCloudAuthSecrets.sessionSecret;

            mockedValidator.validateSetupResponse = jest.fn<typeof mockedValidator.validateSetupResponse>()
                .mockReturnValue({
                    headers: {
                        'set-cookie': cookies,
                    },
                    data: {
                        ...data,
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
                .onAny()
                .reply(200);

            await icloud.setupAccount();
            const err = await iCloudReady.catch(err => err) as iCPSError;

            expect(err.message).toEqual(`Unable to setup iCloud Account`);
            expect((err.cause as iCPSError).code).toEqual(AUTH_ERR.ACCOUNT_SETUP_INCOMPLETE.code);
            expect(mockedNetworkManager.applySetupResponse).not.toHaveBeenCalled();
            expect(pcsRequiredEvent).not.toHaveBeenCalled();
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
            mockedNetworkManager.sessionToken = Config.iCloudAuthSecrets.sessionSecret;
            mockedNetworkManager.accountCountry = `DEU`;

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
            mockedNetworkManager.sessionToken = Config.iCloudAuthSecrets.sessionSecret;
            mockedNetworkManager.accountCountry = `DEU`;

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
            mockedNetworkManager.sessionToken = Config.iCloudAuthSecrets.sessionSecret;
            mockedNetworkManager.accountCountry = `DEU`;

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
            mockedNetworkManager.sessionToken = Config.iCloudAuthSecrets.sessionSecret;
            mockedNetworkManager.accountCountry = `DEU`;

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
            mockedNetworkManager.sessionToken = Config.iCloudAuthSecrets.sessionSecret;
            mockedNetworkManager.accountCountry = `DEU`;

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
            mockedNetworkManager.sessionToken = Config.iCloudAuthSecrets.sessionSecret;
            mockedNetworkManager.accountCountry = `DEU`;

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

        test(`Repeated setup rejects after previous success`, async () => {
            icloud.photos.checkingIndexingStatus = jest.fn<typeof icloud.photos.checkingIndexingStatus>(async () => {
                Resources.emit(iCPSEventPhotos.READY);
            });
            mockedValidator.validatePhotosSetupResponse = jest.fn<typeof mockedValidator.validatePhotosSetupResponse>()
                .mockReturnValue({data: {zones: []}} as any);
            mockedNetworkManager.applyZones = jest.fn<typeof mockedNetworkManager.applyZones>();
            mockedNetworkManager.mock
                .onPost(/changes\/database$/)
                .replyOnce(200)
                .onPost(/changes\/database$/)
                .replyOnce(200)
                .onPost(/changes\/database$/)
                .replyOnce(500);

            const firstICloudReady = icloud.getReady();
            await icloud.getPhotosReady();
            await expect(firstICloudReady).resolves.toBeTruthy();

            // Re-establishing the connection, e.g. during a sync retry
            const secondICloudReady = icloud.getReady();
            await icloud.getPhotosReady();
            await expect(secondICloudReady).rejects.toThrow(/^Unable to get iCloud Photos service ready$/);
        });

        test(`Photos Object invalid`, async () => {
            const iCloudReady = icloud.getReady();
            icloud.photos = undefined as any;
            await icloud.getPhotosReady();

            await expect(iCloudReady).rejects.toThrow(/^Unable to get iCloud Photos service ready$/);
        });
    });
});