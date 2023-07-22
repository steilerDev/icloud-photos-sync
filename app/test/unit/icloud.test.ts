import mockfs from 'mock-fs';
import {MockedNetworkManager, prepareResourceManager, spyOnEvent} from '../_helpers/_general';
import {describe, test, beforeEach, afterEach, expect, jest} from '@jest/globals';
import path from 'path';
import * as ICLOUD from '../../src/lib/icloud/constants';
import * as MFA_SERVER from '../../src/lib/icloud/mfa/constants.js';
import fs from 'fs';
import {AxiosRequestConfig} from 'axios';
import {MFAMethod} from '../../src/lib/icloud/mfa/mfa-method';
import {expectedAxiosPost, expectedAxiosPut} from '../_helpers/icloud-mfa.helper';
import * as ICLOUD_PHOTOS from '../../src/lib/icloud/icloud-photos/constants';
import {getICloudCookieHeader, iCloudFactory} from '../_helpers/icloud.helper';
import * as Config from '../_helpers/_config';
import {iCloud} from '../../src/lib/icloud/icloud';
import {iCloudPhotos} from '../../src/lib/icloud/icloud-photos/icloud-photos';
import {HANDLER_EVENT} from '../../src/app/event/error-handler';
import {ResourceManager} from '../../src/lib/resource-manager/resource-manager';
import { MFA_ERR } from '../../src/app/error/error-codes';
import { iCPSError } from '../../src/app/error/error';

beforeEach(() => {
    prepareResourceManager();
});

afterEach(() => {
    // Mockfs.restore();
});

describe(`CLI Options`, () => {
    // For some reason this 'throws' an error
    test(`Fail on MFA`, async () => {
        ResourceManager.instance._resources.failOnMfa = true;

        const icloud = new iCloud();

        icloud.emit(ICLOUD.EVENTS.MFA_REQUIRED);
        await expect(icloud.ready).rejects.toThrow(/^MFA code required, failing due to failOnMfa flag$/);

        expect(icloud.mfaServer.server.listening).toBeFalsy();
    });

    test(`MFA Server Startup error`, async () => {
        const icloud = new iCloud();

        icloud.mfaServer.startServer = jest.fn(() => {
            throw new Error(`Unable to start server`);
        });

        icloud.emit(ICLOUD.EVENTS.MFA_REQUIRED);
        await expect(icloud.ready).rejects.toThrow(`Unable to start MFA server`);

        expect(icloud.mfaServer.server.listening).toBeFalsy();
    });
});

describe(`Control structure`, () => {
    test(`TRUSTED event triggered`, () => {
        const icloud = new iCloud();
        icloud.setupAccount = jest.fn(() => Promise.resolve());

        icloud.emit(ICLOUD.EVENTS.TRUSTED);

        expect(icloud.setupAccount).toHaveBeenCalled();
    });

    test(`AUTHENTICATED event triggered`, () => {
        const icloud = new iCloud();
        icloud.getTokens = jest.fn(() => Promise.resolve());

        icloud.emit(ICLOUD.EVENTS.AUTHENTICATED);

        expect(icloud.getTokens).toHaveBeenCalled();
    });

    test(`ACCOUNT_READY event triggered`, () => {
        const icloud = new iCloud();
        icloud.getPhotosReady = jest.fn(() => Promise.resolve());

        icloud.emit(ICLOUD.EVENTS.ACCOUNT_READY);

        expect(icloud.getPhotosReady).toHaveBeenCalled();
    });
});

describe(`Authenticate`, () => {
    test(`Valid Trust Token`, async () => {
        const icloud = iCloudFactory();

        // ICloud.authenticate returns ready promise. Need to modify in order to resolve at the end of the test
        icloud.ready = new Promise<void>((resolve, _reject) => {
            icloud.once(ICLOUD.EVENTS.TRUSTED, resolve);
        });
        const authenticationEvent = spyOnEvent(icloud, ICLOUD.EVENTS.AUTHENTICATION_STARTED);
        const trustedEvent = spyOnEvent(icloud, ICLOUD.EVENTS.TRUSTED);
        const errorEvent = spyOnEvent(icloud, ICLOUD.EVENTS.ERROR);

        (ResourceManager.network as MockedNetworkManager).mock
            .onPost(`https://idmsa.apple.com/appleauth/auth/signin`, {
                accountName: Config.defaultConfig.username,
                password: Config.defaultConfig.password,
                trustTokens: [
                    Config.trustToken,
                ],
            }, Config.REQUEST_HEADER.AUTH,
            )
            .reply(200, {
                authType: `hsa2`,
            }, {
                "x-apple-session-token": Config.iCloudAuthSecrets.sessionSecret,
                scnt: Config.iCloudAuthSecrets.scnt,
                "set-cookie": [Config.aaspCookieString],
            });

        await icloud.authenticate();
        expect(authenticationEvent).toHaveBeenCalled();
        expect(trustedEvent).toHaveBeenCalled();
        expect(errorEvent).not.toHaveBeenCalled();
        expect(ResourceManager.network.aaspCookie).toEqual(Config.iCloudAuthSecrets.aasp);
        expect(ResourceManager.network.sessionId).toEqual(Config.iCloudAuthSecrets.sessionSecret);
        expect(ResourceManager.network.scnt).toEqual(Config.iCloudAuthSecrets.scnt);
    });

    test(`Invalid Trust Token - MFA Required`, async () => {
        const icloud = iCloudFactory();

        ResourceManager.instance._resources.trustToken = undefined;
        // ICloud.authenticate returns ready promise. Need to modify in order to resolve at the end of the test
        icloud.ready = new Promise<void>((resolve, _reject) => {
            icloud.once(ICLOUD.EVENTS.MFA_REQUIRED, resolve);
        });
        const authenticationEvent = spyOnEvent(icloud, ICLOUD.EVENTS.AUTHENTICATION_STARTED);
        const mfaEvent = spyOnEvent(icloud, ICLOUD.EVENTS.MFA_REQUIRED);
        const trustedEvent = spyOnEvent(icloud, ICLOUD.EVENTS.TRUSTED);
        const errorEvent = spyOnEvent(icloud, ICLOUD.EVENTS.ERROR);

        (ResourceManager.network as MockedNetworkManager).mock
            .onPost(`https://idmsa.apple.com/appleauth/auth/signin`, {
                accountName: Config.defaultConfig.username,
                password: Config.defaultConfig.password,
                trustTokens: [null],
            }, Config.REQUEST_HEADER.AUTH,
            )
            .reply(409, {
                authType: `hsa2`,
            }, {
                "x-apple-session-token": Config.iCloudAuthSecrets.sessionSecret,
                scnt: Config.iCloudAuthSecrets.scnt,
                "set-cookie": [Config.aaspCookieString],
            });

        await icloud.authenticate();

        expect(trustedEvent).not.toHaveBeenCalled();
        expect(authenticationEvent).toHaveBeenCalled();
        expect(mfaEvent).toHaveBeenCalledWith(Config.defaultConfig.port);
        expect(errorEvent).not.toHaveBeenCalled();
        expect(ResourceManager.network.aaspCookie).toEqual(Config.iCloudAuthSecrets.aasp);
        expect(ResourceManager.network.sessionId).toEqual(Config.iCloudAuthSecrets.sessionSecret);
        expect(ResourceManager.network.scnt).toEqual(Config.iCloudAuthSecrets.scnt);
    });

    test(`Authentication response not matching validator`, async () => {
        const icloud = iCloudFactory();

        const authenticationEvent = spyOnEvent(icloud, ICLOUD.EVENTS.AUTHENTICATION_STARTED);

        (ResourceManager.network as MockedNetworkManager).mock
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

    test(`Unknown error`, async () => {
        const icloud = iCloudFactory();

        const authenticationEvent = spyOnEvent(icloud, ICLOUD.EVENTS.AUTHENTICATION_STARTED);

        await expect(icloud.authenticate()).rejects.toThrow(/^Received unknown error during authentication$/);
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
            const icloud = iCloudFactory();

            (ResourceManager.network as MockedNetworkManager).mock
                .onPost(`https://idmsa.apple.com/appleauth/auth/signin`, {
                    accountName: Config.defaultConfig.username,
                    password: Config.defaultConfig.password,
                    trustTokens: [
                        Config.trustToken,
                    ],
                }, Config.REQUEST_HEADER.AUTH,
                )
                .reply(status, {
                    serviceErrors: [
                        {
                            code: `-20101`,
                            message: `Some error message.`,
                            suppressDismissal: false,
                        },
                    ],
                }, {});

            const authenticationEvent = spyOnEvent(icloud, ICLOUD.EVENTS.AUTHENTICATION_STARTED);
            const trustedEvent = spyOnEvent(icloud, ICLOUD.EVENTS.TRUSTED);
            const mfaEvent = spyOnEvent(icloud, ICLOUD.EVENTS.MFA_REQUIRED);
            const errorEvent = spyOnEvent(icloud, ICLOUD.EVENTS.ERROR);

            await expect(icloud.authenticate()).rejects.toThrow(expectedError);
            expect(authenticationEvent).toHaveBeenCalled();
            expect(trustedEvent).not.toHaveBeenCalled();
            expect(mfaEvent).not.toHaveBeenCalled();
            expect(errorEvent).toHaveBeenCalledTimes(1);
        });
    });
});

describe(`MFA Flow`, () => {
    test(`Start MFA Server`, () => {
        const icloud = new iCloud();

        icloud.emit(ICLOUD.EVENTS.MFA_REQUIRED);
        expect(icloud.mfaServer.server.listening).toBeTruthy();
        icloud.mfaServer.stopServer();
    });

    describe(`Resend MFA`, () => {
        describe.each([
            {
                method: `device`,
                endpoint: 'https://idmsa.apple.com/appleauth/auth/verify/trusteddevice',
                payload: undefined,
                codes: {
                    success: 202,
                    invalid: 403,
                },
                expectedResponse: {
                    trustedDeviceCount: 1,
                    securityCode: {
                        length: 6,
                        tooManyCodesSent: false,
                        tooManyCodesValidated: false,
                        securityCodeLocked: false,
                        securityCodeCooldown: false,
                    },
                    phoneNumberVerification: {
                        trustedPhoneNumbers: [
                            {
                                id: 1,
                                numberWithDialCode: `someNumber`,
                                pushMode: `sms`,
                                obfuscatedNumber: `••••• •••••11`,
                                lastTwoDigits: `11`,
                            },
                        ],
                        securityCode: {
                            length: 6,
                            tooManyCodesSent: false,
                            tooManyCodesValidated: false,
                            securityCodeLocked: false,
                            securityCodeCooldown: false,
                        },
                        trustedPhoneNumber: {
                            id: 1,
                            numberWithDialCode: `someNumber`,
                            pushMode: `sms`,
                            obfuscatedNumber: `••••• •••••11`,
                            lastTwoDigits: `11`,
                        },
                        hsa2Account: true,
                        restrictedAccount: false,
                        authenticationType: `hsa2`,
                    },
                },
                successMessage: 'Successfully requested new MFA code using 1 trusted device(s)'
            },
            {
                method: `voice`,
                endpoint: 'https://idmsa.apple.com/appleauth/auth/verify/phone',
                payload: undefined,
                codes: {
                    success: 200,
                    invalid: 403,
                },
                expectedResponse: {
                    trustedPhoneNumbers: [
                        {
                            id: 1,
                            numberWithDialCode: `someNumber`,
                            pushMode: `voice`,
                            obfuscatedNumber: `••••• •••••11`,
                            lastTwoDigits: `11`,
                        },
                    ],
                    securityCode: {
                        length: 6,
                        tooManyCodesSent: false,
                        tooManyCodesValidated: false,
                        securityCodeLocked: false,
                        securityCodeCooldown: false,
                    },
                    trustedPhoneNumber: {
                        id: 1,
                        numberWithDialCode: `someNumber`,
                        pushMode: `voice`,
                        obfuscatedNumber: `••••• •••••11`,
                        lastTwoDigits: `11`,
                    },
                    hsa2Account: true,
                    restrictedAccount: false,
                    authenticationType: `hsa2`,
                },
                successMessage: 'Successfully requested new MFA code using phone someNumber'
            },
            {
                method: `sms`,
                endpoint: 'https://idmsa.apple.com/appleauth/auth/verify/phone',
                payload: undefined,
                codes: {
                    success: 200,
                    invalid: 403,
                },
                expectedResponse: {
                    trustedPhoneNumbers: [
                        {
                            id: 1,
                            numberWithDialCode: `someNumber`,
                            pushMode: `sms`,
                            obfuscatedNumber: `••••• •••••11`,
                            lastTwoDigits: `11`,
                        },
                    ],
                    securityCode: {
                        length: 6,
                        tooManyCodesSent: false,
                        tooManyCodesValidated: false,
                        securityCodeLocked: false,
                        securityCodeCooldown: false,
                    },
                    trustedPhoneNumber: {
                        id: 1,
                        numberWithDialCode: `someNumber`,
                        pushMode: `sms`,
                        obfuscatedNumber: `••••• •••••11`,
                        lastTwoDigits: `11`,
                    },
                    hsa2Account: true,
                    restrictedAccount: false,
                    authenticationType: `hsa2`,
                },
                successMessage: 'Successfully requested new MFA code using phone someNumber'
            }
            
            ])(`Method: $method`, ({method, endpoint, payload, codes, expectedResponse, successMessage}) => {
            test(`Success`, async () => {
                const icloud = iCloudFactory();

                ResourceManager.network.aaspCookie = [Config.aaspCookieString];
                ResourceManager.network.scnt = Config.iCloudAuthSecrets.scnt;
                ResourceManager.network.sessionId = Config.iCloudAuthSecrets.sessionSecret;

                (ResourceManager.network as MockedNetworkManager).mock
                    .onPut(endpoint,
                        payload,
                        {
                            ...Config.REQUEST_HEADER.AUTH,
                            scnt: Config.iCloudAuthSecrets.scnt,
                            Cookie: `aasp=${Config.iCloudAuthSecrets.aasp}`,
                            'X-Apple-ID-Session-Id': Config.iCloudAuthSecrets.sessionSecret,
                        },
                    )
                    .reply(codes.success, expectedResponse);

                // Only trace is found in logging
                icloud.logger.info = jest.fn();

                await icloud.resendMFA(new MFAMethod(method as any));

                expect(icloud.logger.info).toHaveBeenLastCalledWith(successMessage);
            });

            test(`Invalid response`, async () => {
                const icloud = iCloudFactory();

                ResourceManager.network.aaspCookie = [Config.aaspCookieString];
                ResourceManager.network.scnt = Config.iCloudAuthSecrets.scnt;
                ResourceManager.network.sessionId = Config.iCloudAuthSecrets.sessionSecret;

                (ResourceManager.network as MockedNetworkManager).mock
                    .onPut(endpoint,
                        payload,
                        {
                            ...Config.REQUEST_HEADER.AUTH,
                            scnt: Config.iCloudAuthSecrets.scnt,
                            Cookie: `aasp=${Config.iCloudAuthSecrets.aasp}`,
                            'X-Apple-ID-Session-Id': Config.iCloudAuthSecrets.sessionSecret,
                        },
                    )
                    .reply(codes.success, {});

                // Checking if rejection is properly parsed
                const warnEvent = spyOnEvent(icloud, HANDLER_EVENT);

                await icloud.resendMFA(new MFAMethod(method as any));

                expect(warnEvent).toHaveBeenCalledWith(new Error(`Unable to request new MFA code`));
            });

            test(`Resend unsuccessful`, async () => {
                const icloud = iCloudFactory();

                ResourceManager.network.aaspCookie = [Config.aaspCookieString];
                ResourceManager.network.scnt = Config.iCloudAuthSecrets.scnt;
                ResourceManager.network.sessionId = Config.iCloudAuthSecrets.sessionSecret;

                (ResourceManager.network as MockedNetworkManager).mock
                    .onPut(endpoint,
                        payload,
                        {
                            ...Config.REQUEST_HEADER.AUTH,
                            scnt: Config.iCloudAuthSecrets.scnt,
                            Cookie: `aasp=${Config.iCloudAuthSecrets.aasp}`,
                            'X-Apple-ID-Session-Id': Config.iCloudAuthSecrets.sessionSecret,
                        },
                    )
                    .reply(codes.invalid, {});

                // Checking if rejection is properly parsed
                const warnEvent = spyOnEvent(icloud, HANDLER_EVENT);

                await icloud.resendMFA(new MFAMethod(method as any));

                expect(warnEvent).toHaveBeenCalledWith(new Error(`Unable to request new MFA code`));
            });
        });
    });

    describe(`Enter Code`, () => {
        describe.each([
            {
                method: `device`,
                endpoint: 'https://idmsa.apple.com/appleauth/auth/verify/trusteddevice/securitycode',
                payload: {
                    securityCode: {
                        code: `123456`,
                    },
                },
                codes: {
                    success: 204,
                    failure: 403,
                }
            }, {
                method: `sms`,
                endpoint: 'https://idmsa.apple.com/appleauth/auth/verify/phone/securitycode',
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
                }
            }, {
                method: `voice`,
                endpoint: 'https://idmsa.apple.com/appleauth/auth/verify/phone/securitycode',
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
                }
            }
        ])(`Method: $method`, ({method, endpoint, payload, codes}) => {
            test(`Success`, async () => {
                const icloud = iCloudFactory();

                ResourceManager.network.aaspCookie = [Config.aaspCookieString];
                ResourceManager.network.scnt = Config.iCloudAuthSecrets.scnt;
                ResourceManager.network.sessionId = Config.iCloudAuthSecrets.sessionSecret;

                (ResourceManager.network as MockedNetworkManager).mock
                    .onPost(endpoint,
                        payload,
                        {
                            ...Config.REQUEST_HEADER.AUTH,
                            scnt: Config.iCloudAuthSecrets.scnt,
                            Cookie: `aasp=${Config.iCloudAuthSecrets.aasp}`,
                            'X-Apple-ID-Session-Id': Config.iCloudAuthSecrets.sessionSecret,
                        },
                    )
                    .reply(codes.success, {});

                // Checking if rejection is properly parsed
                const authenticatedEvent = spyOnEvent(icloud, ICLOUD.EVENTS.AUTHENTICATED);

                await icloud.submitMFA(new MFAMethod(method as any), `123456`);

                expect(authenticatedEvent).toHaveBeenCalled();
            })

            test(`Failure`, async () => {
                const icloud = iCloudFactory();

                ResourceManager.network.aaspCookie = [Config.aaspCookieString];
                ResourceManager.network.scnt = Config.iCloudAuthSecrets.scnt;
                ResourceManager.network.sessionId = Config.iCloudAuthSecrets.sessionSecret;

                (ResourceManager.network as MockedNetworkManager).mock
                    .onPost(endpoint,
                        payload,
                        {
                            ...Config.REQUEST_HEADER.AUTH,
                            scnt: Config.iCloudAuthSecrets.scnt,
                            Cookie: `aasp=${Config.iCloudAuthSecrets.aasp}`,
                            'X-Apple-ID-Session-Id': Config.iCloudAuthSecrets.sessionSecret,
                        },
                    )
                    .reply(codes.failure, {});

                await icloud.submitMFA(new MFAMethod(method as any), `123456`);

                await expect(icloud.ready).rejects.toThrow(/^Unable to submit MFA code$/);
            })
        });
    });

    test('Timeout', async () => {
        const icloud = iCloudFactory();
        icloud.mfaServer.emit(MFA_SERVER.EVENTS.MFA_NOT_PROVIDED, new iCPSError(MFA_ERR.SERVER_TIMEOUT));
        await expect(icloud.ready).rejects.toThrow(/^MFA server timeout (code needs to be provided within 10 minutes)$/);
    })
});

describe(`Trust Token`, () => {
    test(`Acquire trust token`, async () => {
        const icloud = iCloudFactory();
        ResourceManager.network.aaspCookie = [Config.aaspCookieString];
        ResourceManager.network.scnt = Config.iCloudAuthSecrets.scnt;
        ResourceManager.network.sessionId = Config.iCloudAuthSecrets.sessionSecret;

        const trustedEvent = spyOnEvent(icloud, ICLOUD.EVENTS.TRUSTED);

        (ResourceManager.network as MockedNetworkManager).mock
            .onGet(`https://idmsa.apple.com/appleauth/auth/2sv/trust`, {}, {
                ...Config.REQUEST_HEADER.AUTH,
                scnt: Config.iCloudAuthSecrets.scnt,
                Cookie: `aasp=${Config.iCloudAuthSecrets.aasp}`,
                'X-Apple-ID-Session-Id': Config.iCloudAuthSecrets.sessionSecret,
            })
            .reply(204, {}, {
                'x-apple-twosv-trust-token': Config.trustTokenModified, // eslint-disable-line
                'x-apple-session-token': Config.iCloudAuthSecrets.sessionSecretModified
            })


        await icloud.getTokens();

        expect(ResourceManager.instance.writeResourceFile).toHaveBeenCalledTimes(1);
        expect(ResourceManager.trustToken).toEqual(Config.trustTokenModified);
        expect(ResourceManager.network.session).toEqual(Config.iCloudAuthSecrets.sessionSecretModified);
        expect(ResourceManager.network.sessionToken).toEqual(Config.iCloudAuthSecrets.sessionSecretModified);
        expect(ResourceManager.network.sessionId).toEqual(Config.iCloudAuthSecrets.sessionSecret);
        expect(trustedEvent).toHaveBeenCalled();
    });

    test(`Invalid trust token response`, async () => {
        const icloud = iCloudFactory();
        ResourceManager.network.aaspCookie = [Config.aaspCookieString];
        ResourceManager.network.scnt = Config.iCloudAuthSecrets.scnt;
        ResourceManager.network.sessionId = Config.iCloudAuthSecrets.sessionSecret;
        ResourceManager.instance._resources.trustToken = undefined;

        const trustedEvent = spyOnEvent(icloud, ICLOUD.EVENTS.TRUSTED);

        (ResourceManager.network as MockedNetworkManager).mock
            .onGet(`https://idmsa.apple.com/appleauth/auth/2sv/trust`, {}, {
                ...Config.REQUEST_HEADER.AUTH,
                scnt: Config.iCloudAuthSecrets.scnt,
                Cookie: `aasp=${Config.iCloudAuthSecrets.aasp}`,
                'X-Apple-ID-Session-Id': Config.iCloudAuthSecrets.sessionSecret,
            })
            .reply(204)


        await icloud.getTokens();

        await expect(icloud.ready).rejects.toThrow(/^Unable to acquire account tokens$/);

        expect(ResourceManager.instance.writeResourceFile).not.toHaveBeenCalled();
        expect(ResourceManager.trustToken).toBeUndefined()
        expect(ResourceManager.network.session).toEqual(Config.iCloudAuthSecrets.sessionSecret);
        expect(ResourceManager.network.sessionToken).toBeUndefined()
        expect(ResourceManager.network.sessionId).toEqual(Config.iCloudAuthSecrets.sessionSecret);
        expect(trustedEvent).not.toHaveBeenCalled();
    });

    test(`Server Error`, async () => {
        const icloud = iCloudFactory();
        ResourceManager.network.aaspCookie = [Config.aaspCookieString];
        ResourceManager.network.scnt = Config.iCloudAuthSecrets.scnt;
        ResourceManager.network.sessionId = Config.iCloudAuthSecrets.sessionSecret;
        ResourceManager.instance._resources.trustToken = undefined;

        const trustedEvent = spyOnEvent(icloud, ICLOUD.EVENTS.TRUSTED);

        (ResourceManager.network as MockedNetworkManager).mock
            .onGet(`https://idmsa.apple.com/appleauth/auth/2sv/trust`, {}, {
                ...Config.REQUEST_HEADER.AUTH,
                scnt: Config.iCloudAuthSecrets.scnt,
                Cookie: `aasp=${Config.iCloudAuthSecrets.aasp}`,
                'X-Apple-ID-Session-Id': Config.iCloudAuthSecrets.sessionSecret,
            })
            .reply(500)


        await icloud.getTokens();

        await expect(icloud.ready).rejects.toThrow(/^Unable to acquire account tokens$/);

        expect(ResourceManager.instance.writeResourceFile).not.toHaveBeenCalled();
        expect(ResourceManager.trustToken).toBeUndefined()
        expect(ResourceManager.network.session).toEqual(Config.iCloudAuthSecrets.sessionSecret);
        expect(ResourceManager.network.sessionToken).toBeUndefined()
        expect(ResourceManager.network.sessionId).toEqual(Config.iCloudAuthSecrets.sessionSecret);
        expect(trustedEvent).not.toHaveBeenCalled();
    });
});

describe(`Setup iCloud`, () => {
    test(`Acquire iCloud Cookies & Photos Account Data`, async () => {
        const icloud = iCloudFactory();
        ResourceManager.network.sessionToken = Config.iCloudAuthSecrets.sessionSecret;

        (ResourceManager.network as MockedNetworkManager).mock
            .onPost(`https://setup.icloud.com/setup/ws/1/accountLogin`, {
                dsWebAuthToken: Config.iCloudAuthSecrets.sessionSecret,
                trustToken: Config.trustToken,
                }, 
                Config.REQUEST_HEADER.DEFAULT
            )
            .reply(200, {
                dsInfo: {
                    isWebAccessAllowed: true
                },
                webservices: {
                    ckdatabasews: {
                        url: Config.photosDomain,
                        status: `active`
                    }
                }
            }, getICloudCookieHeader())

        const readyEvent = spyOnEvent(icloud, ICLOUD.EVENTS.ACCOUNT_READY);

        await icloud.setupAccount();

        expect(readyEvent).toHaveBeenCalled();
        expect(ResourceManager.network._resources.cookies?.length).toEqual(17);
        expect(ResourceManager.network.photosUrl).toEqual(Config.photosDomain);
        expect(ResourceManager.network._axios.defaults.baseURL).toEqual(Config.photosDomain + '/database/1/com.apple.photos.cloud/production/private');
        expect(icloud.photos).toBeDefined();
    });

    test.only(`Receive empty set-cookies during setup`, async () => {
        const icloud = iCloudFactory();
        ResourceManager.network.sessionToken = Config.iCloudAuthSecrets.sessionSecret;

        (ResourceManager.network as MockedNetworkManager).mock
            .onPost(`https://setup.icloud.com/setup/ws/1/accountLogin`, {
                dsWebAuthToken: Config.iCloudAuthSecrets.sessionSecret,
                trustToken: Config.trustToken,
                }, 
                Config.REQUEST_HEADER.DEFAULT
            )
            .reply(200, {
                dsInfo: {
                    isWebAccessAllowed: true
                },
                webservices: {
                    ckdatabasews: {
                        url: Config.photosDomain,
                        status: `active`
                    }
                }
            }, {})

        await icloud.setupAccount();

        expect(ResourceManager.network._resources.cookies?.length).toEqual(0);

        await expect(icloud.ready).rejects.toThrow(/^Unable to parse and validate setup response$/);
    });
})

//     test(`Receive expired iCloud Cookies during setup`, async () => {
//         const icloud = iCloudFactory();
//         icloud.auth.iCloudAuthSecrets.sessionSecret = Config.iCloudAuthSecrets.sessionSecret;

//         icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
//             status: 200,
//             data: { // Actual response contains significant more -potential useful- data, only the following is really necessary
//                 webservices: {
//                     ckdatabasews: {
//                         url: `https://p00-ckdatabasews.icloud.com:443`,
//                     },
//                 },
//             },
//             headers: getICloudCookieHeader(true),
//         }));

//         await icloud.setupAccount();

//         expect(icloud.axios.post).toHaveBeenCalledWith(
//             `https://setup.icloud.com/setup/ws/1/accountLogin`,
//             {
//                 dsWebAuthToken: Config.iCloudAuthSecrets.sessionSecret,
//                 trustToken: Config.trustToken,
//             },
//             {
//                 headers: expectedICloudSetupHeaders,
//             },
//         );
//         await expect(icloud.ready).rejects.toThrow(/^Unable to setup iCloud Account$/);
//     });

//     test(`Receive invalid status code during setup`, async () => {
//         const icloud = iCloudFactory();
//         icloud.auth.iCloudAuthSecrets.sessionSecret = Config.iCloudAuthSecrets.sessionSecret;

//         icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
//             status: 500,
//         }));

//         await icloud.setupAccount();

//         expect(icloud.axios.post).toHaveBeenCalledWith(
//             `https://setup.icloud.com/setup/ws/1/accountLogin`,
//             {
//                 dsWebAuthToken: Config.iCloudAuthSecrets.sessionSecret,
//                 trustToken: Config.trustToken,
//             },
//             {
//                 headers: expectedICloudSetupHeaders,
//             },
//         );
//         await expect(icloud.ready).rejects.toThrow(/^Unable to setup iCloud Account$/);
//     });

//     test(`Receive invalid response during setup`, async () => {
//         const icloud = iCloudFactory();
//         icloud.auth.iCloudAuthSecrets.sessionSecret = Config.iCloudAuthSecrets.sessionSecret;

//         icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
//             status: 200,
//             data: {},
//             headers: getICloudCookieHeader(true),
//         }));

//         await icloud.setupAccount();

//         expect(icloud.axios.post).toHaveBeenCalledWith(
//             `https://setup.icloud.com/setup/ws/1/accountLogin`,
//             {
//                 dsWebAuthToken: Config.iCloudAuthSecrets.sessionSecret,
//                 trustToken: Config.trustToken,
//             },
//             {
//                 headers: expectedICloudSetupHeaders,
//             },
//         );
//         await expect(icloud.ready).rejects.toThrow(/^Unable to setup iCloud Account$/);
//     });

//     test(`Network failure`, async () => {
//         const icloud = iCloudFactory();
//         icloud.auth.iCloudAuthSecrets.sessionSecret = Config.iCloudAuthSecrets.sessionSecret;

//         icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.reject(new Error(`Network down!`)));

//         await icloud.setupAccount();

//         expect(icloud.axios.post).toHaveBeenCalledWith(
//             `https://setup.icloud.com/setup/ws/1/accountLogin`,
//             {
//                 dsWebAuthToken: Config.iCloudAuthSecrets.sessionSecret,
//                 trustToken: Config.trustToken,
//             },
//             {
//                 headers: expectedICloudSetupHeaders,
//             },
//         );
//         await expect(icloud.ready).rejects.toThrow(/^Unable to setup iCloud Account$/);
//     });

//     describe(`Get iCloud Photos Ready`, () => {
//         test(`Get iCloud Photos Ready`, async () => {
//             const icloud = iCloudFactory();
//             icloud.auth.iCloudCookies = getICloudCookies();
//             icloud.photos = new iCloudPhotos(icloud.auth);
//             icloud.photos.setup = jest.fn(() => Promise.resolve());

//             await icloud.getPhotosReady();

//             expect(icloud.photos.listenerCount(HANDLER_EVENT)).toBe(1);
//             await expect(icloud.ready).resolves.not.toThrow();

//             expect(icloud.photos.listenerCount(ICLOUD_PHOTOS.EVENTS.READY)).toBe(1);
//             expect(icloud.photos.setup).toHaveBeenCalled();
//         });

//         test(`Cookies invalid`, async () => {
//             const icloud = iCloudFactory();
//             icloud.auth.iCloudCookies = getICloudCookies(true);
//             icloud.photos = new iCloudPhotos(icloud.auth);
//             icloud.photos.setup = jest.fn(() => Promise.resolve());

//             await icloud.getPhotosReady();

//             await expect(icloud.ready).rejects.toThrow(/^Unable to get iCloud Photos service ready$/);
//             expect(icloud.photos.setup).not.toHaveBeenCalled();
//         });

//         test(`Photos Object invalid`, async () => {
//             const icloud = iCloudFactory();
//             icloud.auth.iCloudCookies = getICloudCookies();

//             await icloud.getPhotosReady();

//             await expect(icloud.ready).rejects.toThrow(/^Unable to get iCloud Photos service ready$/);
//         });
//     });
// });