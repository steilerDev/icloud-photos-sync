import mockfs from 'mock-fs';
import {describe, test, beforeEach, afterEach, expect, jest} from '@jest/globals';
import path from 'path';
import * as ICLOUD from '../../src/lib/icloud/constants';
import {appDataDir} from '../_helpers/_config';
import fs from 'fs';
import {iCloudAuth} from '../../src/lib/icloud/auth';
import {AxiosRequestConfig} from 'axios';
import {MFAMethod} from '../../src/lib/icloud/mfa/mfa-method';
import {expectedAxiosPost, expectedAxiosPut} from '../_helpers/icloud-mfa.helper';
import * as ICLOUD_PHOTOS from '../../src/lib/icloud/icloud-photos/constants';
import {spyOnEvent} from '../_helpers/_general';
import {expectedICloudSetupHeaders, expectedTokenGetCall, getICloudCookieHeader, iCloudFactory, _defaultCliOpts} from '../_helpers/icloud.helper';
import * as Config from '../_helpers/_config';
import {iCloud} from '../../src/lib/icloud/icloud';
import {getICloudCookies} from '../_helpers/icloud-auth.helper';
import {iCloudPhotos} from '../../src/lib/icloud/icloud-photos/icloud-photos';
import {appWithOptions} from '../_helpers/app-factory.helper';
import {HANDLER_EVENT} from '../../src/app/error/handler';
import {iCloudAuthError, iCloudError} from '../../src/app/error/types';

describe(`Unit Tests - iCloud`, () => {
    describe(`CLI Options`, () => {
        test(`Refresh Token`, () => {
            const cliOpts = _defaultCliOpts;
            cliOpts.refreshToken = true;
            const icloud = iCloudFactory(cliOpts);
            expect(icloud.auth.iCloudAccountTokens.trustToken).toEqual(``);
        });

        // For some reason this 'throws' an error
        test(`Fail on MFA`, () => {
            const cliOpts = _defaultCliOpts;
            cliOpts.failOnMfa = true;

            const icloud = new iCloud(appWithOptions(cliOpts));
            icloud.ready.catch(() => {}); // Making sure error is catched

            const event = spyOnEvent(icloud, HANDLER_EVENT);
            icloud.emit(ICLOUD.EVENTS.MFA_REQUIRED);

            expect(event).toHaveBeenCalledWith(new iCloudError(`MFA code required, failing due to failOnMfa flag`, `FATAL`));
            expect(icloud.mfaServer.server.listening).toBeFalsy();
        });

        test(`MFA Server Startup error`, () => {
            const cliOpts = _defaultCliOpts;
            cliOpts.failOnMfa = false;

            const icloud = new iCloud(appWithOptions(cliOpts));
            icloud.ready.catch(() => {}); // Making sure error is catched
            icloud.mfaServer.startServer = jest.fn(() => {
                throw new Error(`Unable to start server`);
            });
            const event = spyOnEvent(icloud, HANDLER_EVENT);

            icloud.emit(ICLOUD.EVENTS.MFA_REQUIRED);

            expect(event).toHaveBeenCalledWith(new iCloudError(`Unable to start MFA server`, `FATAL`));
            expect(icloud.mfaServer.server.listening).toBeFalsy();
        });
    });

    describe(`Load Trust Token File`, () => {
        beforeEach(() => {
            mockfs({
                [appDataDir]: {
                    [ICLOUD.TRUST_TOKEN_FILE_NAME]: Config.trustToken,
                },
            });
        });

        afterEach(() => {
            mockfs.restore();
        });

        test(`Read token from file if no trust token is supplied`, () => {
            const icloudAuth = new iCloudAuth(`testuser@steilerdev.de`, `testpassword`, ``, appDataDir);
            expect(icloudAuth.iCloudAccountTokens.trustToken).toEqual(Config.trustToken);
        });

        test(`Don't read token file, if token is supplied`, () => {
            const icloudAuth = new iCloudAuth(`testuser@steilerdev.de`, `testpassword`, Config.trustToken + `asdf`, appDataDir);
            expect(icloudAuth.iCloudAccountTokens.trustToken).toEqual(Config.trustToken + `asdf`);
        });
    });

    describe(`Authenticate`, () => {
        test(`Authentication - Valid Trust Token`, async () => {
            const icloud = iCloudFactory();
            // ICloud.authentcate returns ready promise. Need to modify in order to resolve at the end of the test
            icloud.ready = new Promise<void>((resolve, _reject) => {
                icloud.once(ICLOUD.EVENTS.TRUSTED, resolve);
            });
            const authenticationEvent = spyOnEvent(icloud, ICLOUD.EVENTS.AUTHENTICATION_STARTED);
            const trustedEvent = spyOnEvent(icloud, ICLOUD.EVENTS.TRUSTED);

            icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
                "status": 200,
                "headers": {
                    "x-apple-session-token": Config.iCloudAuthSecrets.sessionId,
                    "scnt": Config.iCloudAuthSecrets.scnt,
                    "set-cookie": [
                        `dslang=US-EN; Domain=apple.com; Path=/; Secure; HttpOnly`,
                        `site=USA; Domain=apple.com; Path=/; Secure; HttpOnly`,
                        `acn01=; Max-Age=0; Expires=Thu, 01-Jan-1970 00:00:10 GMT; Domain=apple.com; Path=/; Secure; HttpOnly`,
                        `aasp=${Config.iCloudAuthSecrets.aasp}; Domain=idmsa.apple.com; Path=/; Secure; HttpOnly`,
                    ],
                },
            }));

            await icloud.authenticate();
            expect(authenticationEvent).toHaveBeenCalled();
            expect(trustedEvent).toHaveBeenCalled();

            expect(icloud.auth.iCloudAuthSecrets).toEqual(Config.iCloudAuthSecrets);
        });

        test(`Authentication - Unextected success status code`, async () => {
            const icloud = iCloudFactory();
            // ICloud.authentcate returns ready promise. Need to modify in order to resolve at the end of the test
            icloud.ready = new Promise<void>((resolve, _reject) => {
                icloud.once(HANDLER_EVENT, resolve);
            });
            const authenticationEvent = spyOnEvent(icloud, ICLOUD.EVENTS.AUTHENTICATION_STARTED);
            const errorEvent = spyOnEvent(icloud, HANDLER_EVENT);

            icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
                "status": 204,
            }));

            await icloud.authenticate();
            expect(authenticationEvent).toHaveBeenCalled();
            expect(errorEvent).toHaveBeenCalledWith(new Error(`Unexpected HTTP code: 204`));
        });

        test(`Authentication - Invalid Trust Token`, async () => {
            const icloud = iCloudFactory();
            // ICloud.authentcate returns ready promise. Need to modify in order to resolve at the end of the test
            icloud.ready = new Promise<void>((resolve, _reject) => {
                icloud.once(ICLOUD.EVENTS.MFA_REQUIRED, resolve);
            });
            const authenticationEvent = spyOnEvent(icloud, ICLOUD.EVENTS.AUTHENTICATION_STARTED);
            const mfaEvent = spyOnEvent(icloud, ICLOUD.EVENTS.MFA_REQUIRED);

            const responseError = new Error(`Conflict`);

            (responseError as any).response = {
                "status": 409,
                "headers": {
                    "x-apple-session-token": Config.iCloudAuthSecrets.sessionId,
                    "scnt": Config.iCloudAuthSecrets.scnt,
                    "set-cookie": [
                        `dslang=US-EN; Domain=apple.com; Path=/; Secure; HttpOnly`,
                        `site=USA; Domain=apple.com; Path=/; Secure; HttpOnly`,
                        `acn01=; Max-Age=0; Expires=Thu, 01-Jan-1970 00:00:10 GMT; Domain=apple.com; Path=/; Secure; HttpOnly`,
                        `aasp=${Config.iCloudAuthSecrets.aasp}; Domain=idmsa.apple.com; Path=/; Secure; HttpOnly`,
                    ],
                },
            };
            icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.reject(responseError));

            await icloud.authenticate();
            expect(authenticationEvent).toHaveBeenCalled();
            expect(mfaEvent).toHaveBeenCalledWith(0);

            expect(icloud.auth.iCloudAuthSecrets).toEqual(Config.iCloudAuthSecrets);
        });

        test(`Authentication - Unexpected failure status code`, async () => {
            const icloud = iCloudFactory();
            // ICloud.authentcate returns ready promise. Need to modify in order to resolve at the end of the test
            icloud.ready = new Promise<void>((resolve, _reject) => {
                icloud.once(HANDLER_EVENT, resolve);
            });
            const authenticationEvent = spyOnEvent(icloud, ICLOUD.EVENTS.AUTHENTICATION_STARTED);
            const errorEvent = spyOnEvent(icloud, HANDLER_EVENT);

            const responseError = new Error(`Conflict`);
            (responseError as any).response = {
                "status": 500,
            };
            icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.reject(responseError));

            await icloud.authenticate();
            expect(authenticationEvent).toHaveBeenCalled();
            expect(errorEvent).toHaveBeenCalledWith(new Error(`Unexpected HTTP code: 500`));
        });

        test(`Authentication - No response`, async () => {
            const icloud = iCloudFactory();
            // ICloud.authentcate returns ready promise. Need to modify in order to resolve at the end of the test
            icloud.ready = new Promise<void>((resolve, _reject) => {
                icloud.once(HANDLER_EVENT, resolve);
            });
            const authenticationEvent = spyOnEvent(icloud, ICLOUD.EVENTS.AUTHENTICATION_STARTED);
            const errorEvent = spyOnEvent(icloud, HANDLER_EVENT);

            icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.reject(
                new Error(`No Network`),
            ));

            await icloud.authenticate();
            expect(authenticationEvent).toHaveBeenCalled();
            expect(errorEvent).toHaveBeenCalledWith(new Error(`No response received during authentication`));
        });

        test(`Authentication - Auth secrets missing in authentication response`, async () => {
            const icloud = iCloudFactory();
            // ICloud.authentcate returns ready promise. Need to modify in order to resolve at the end of the test
            icloud.ready = new Promise<void>((resolve, _reject) => {
                icloud.once(HANDLER_EVENT, resolve);
            });
            const authenticationEvent = spyOnEvent(icloud, ICLOUD.EVENTS.AUTHENTICATION_STARTED);
            const errorEvent = spyOnEvent(icloud, HANDLER_EVENT);

            icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
                "status": 200,
                "headers": {},
            }));

            await icloud.authenticate();
            expect(authenticationEvent).toHaveBeenCalled();
            expect(errorEvent).toHaveBeenCalledWith(new Error(`Unable to process auth response: No set-cookie directive found`));
        });

        test(`Authentication - Auth secrets missing in mfa response`, async () => {
            const icloud = iCloudFactory();
            // ICloud.authentcate returns ready promise. Need to modify in order to resolve at the end of the test
            icloud.ready = new Promise<void>((resolve, _reject) => {
                icloud.once(HANDLER_EVENT, resolve);
            });
            const authenticationEvent = spyOnEvent(icloud, ICLOUD.EVENTS.AUTHENTICATION_STARTED);
            const errorEvent = spyOnEvent(icloud, HANDLER_EVENT);

            const responseError = new Error(`Conflict`);
            (responseError as any).response = {
                "status": 409,
                "headers": {},
            };
            icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.reject(responseError));

            await icloud.authenticate();
            expect(authenticationEvent).toHaveBeenCalled();
            expect(errorEvent).toHaveBeenCalledWith(new Error(`Unable to process auth response: No set-cookie directive found`));
        });
    });

    describe(`MFA Flow`, () => {
        test(`Start MFA Server`, () => {
            const icloud = new iCloud(
                appWithOptions(
                    {
                        ..._defaultCliOpts,
                        "failOnMfa": false,
                    },
                ),
            );

            icloud.emit(ICLOUD.EVENTS.MFA_REQUIRED);
            expect(icloud.mfaServer.server.listening).toBeTruthy();
            icloud.mfaServer.stopServer();
        });

        describe(`Resend MFA`, () => {
            describe.each([new MFAMethod(`device`)])(`Device`, method => {
                test(`Resend MFA with ${method} - Success`, async () => {
                    const icloud = iCloudFactory();
                    icloud.auth.iCloudAuthSecrets = Config.iCloudAuthSecrets;

                    // Mocking actual network request
                    icloud.axios.put = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
                        "status": 202,
                        "data": {
                            "trustedDeviceCount": 1,
                        },
                    }));

                    // Only trace is found in logging
                    icloud.logger.info = jest.fn();

                    await icloud.resendMFA(method);

                    expect(icloud.axios.put).toHaveBeenCalledWith(...expectedAxiosPut(method));
                    expect(icloud.logger.info).toHaveBeenLastCalledWith(`Sucesfully requested new MFA code using 1 trusted device(s)`);
                });

                test(`Resend MFA with ${method} - Network Failure`, async () => {
                    const icloud = iCloudFactory();
                    icloud.auth.iCloudAuthSecrets = Config.iCloudAuthSecrets;

                    // Mocking actual network request
                    icloud.axios.put = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.reject(new Error()));

                    // Checking if rejection is properly parsed
                    const errorEvent = spyOnEvent(icloud, HANDLER_EVENT);

                    await icloud.resendMFA(method);

                    expect(icloud.axios.put).toHaveBeenCalledWith(...expectedAxiosPut(method));
                    expect(errorEvent).toHaveBeenCalledWith(new iCloudError(`No response received`, `FATAL`));
                });

                test(`Resend MFA with ${method} - Resend unsuccesful`, async () => {
                    const icloud = iCloudFactory();
                    icloud.auth.iCloudAuthSecrets = Config.iCloudAuthSecrets;

                    // Mocking actual network request
                    icloud.axios.put = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
                        "status": 404,
                    }));

                    // Checking if rejection is properly parsed
                    const handlerEvent = spyOnEvent(icloud, HANDLER_EVENT);

                    await icloud.resendMFA(method);

                    expect(icloud.axios.put).toHaveBeenCalledWith(...expectedAxiosPut(method));
                    expect(handlerEvent).toHaveBeenCalledWith(new iCloudError(`Unable to request new MFA code`, `FATAL`));
                });
            });

            describe.each([new MFAMethod(`voice`), new MFAMethod(`sms`)])(`Phone number`, method => {
                test(`Resend MFA with ${method} - Success`, async () => {
                    const icloud = iCloudFactory();
                    icloud.auth.iCloudAuthSecrets = Config.iCloudAuthSecrets;

                    // Mocking actual network request
                    icloud.axios.put = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
                        "status": 200,
                        "data": {
                            "trustedPhoneNumber": {
                                "numberWithDialCode": `+123`,
                            },
                        },
                    }));

                    // Only trace is found in logging
                    icloud.logger.info = jest.fn();

                    await icloud.resendMFA(method);

                    expect(icloud.axios.put).toHaveBeenCalledWith(...expectedAxiosPut(method));
                    expect(icloud.logger.info).toHaveBeenLastCalledWith(`Sucesfully requested new MFA code using phone +123`);
                });

                test(`Resend MFA with ${method} - Network Failure`, async () => {
                    const icloud = iCloudFactory();
                    icloud.auth.iCloudAuthSecrets = Config.iCloudAuthSecrets;

                    // Mocking actual network request
                    icloud.axios.put = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.reject(new Error()));

                    // Checking if rejection is properly parsed
                    const errorEvent = spyOnEvent(icloud, HANDLER_EVENT);

                    await icloud.resendMFA(method);

                    expect(icloud.axios.put).toHaveBeenCalledWith(...expectedAxiosPut(method));
                    expect(errorEvent).toHaveBeenCalledWith(new iCloudError(`No response received`, `FATAL`));
                });

                test(`Resend MFA with ${method} - Resend unsuccesful`, async () => {
                    const icloud = iCloudFactory();
                    icloud.auth.iCloudAuthSecrets = Config.iCloudAuthSecrets;

                    // Mocking actual network request
                    icloud.axios.put = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
                        "status": 404,
                    }));

                    // Checking if rejection is properly parsed
                    const errorEvent = spyOnEvent(icloud, HANDLER_EVENT);

                    await icloud.resendMFA(method);

                    expect(icloud.axios.put).toHaveBeenCalledWith(...expectedAxiosPut(method));
                    expect(errorEvent).toHaveBeenCalledWith(new iCloudError(`Unable to request new MFA code`, `FATAL`));
                });
            });
        });

        describe(`Enter Code`, () => {
            describe.each([new MFAMethod(`device`)])(`Device`, method => {
                test(`Enter MFA with ${method} - Success`, async () => {
                    const icloud = iCloudFactory();
                    icloud.auth.iCloudAuthSecrets = Config.iCloudAuthSecrets;

                    icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
                        "status": 204,
                    }));

                    const authenticatedEvent = spyOnEvent(icloud, ICLOUD.EVENTS.AUTHENTICATED);

                    await icloud.submitMFA(method, `123456`);

                    expect(icloud.axios.post).toHaveBeenCalledWith(...expectedAxiosPost(method));
                    expect(authenticatedEvent).toHaveBeenCalled();
                });

                test(`Enter MFA with ${method} - Network failure`, async () => {
                    const icloud = iCloudFactory();
                    icloud.auth.iCloudAuthSecrets = Config.iCloudAuthSecrets;

                    icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.reject(new Error(`Unknown error`)));

                    const errorEvent = spyOnEvent(icloud, HANDLER_EVENT);

                    await icloud.submitMFA(method, `123456`);

                    expect(icloud.axios.post).toHaveBeenCalledWith(...expectedAxiosPost(method));
                    expect(errorEvent).toHaveBeenCalledWith(new iCloudError(`Received error during MFA validation`, `FATAL`));
                });

                test(`Enter MFA with ${method} - Send unsuccessful`, async () => {
                    const icloud = iCloudFactory();
                    icloud.auth.iCloudAuthSecrets = Config.iCloudAuthSecrets;

                    icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
                        "status": 404,
                        "statusText": `Not found`,
                    }));

                    const errorEvent = spyOnEvent(icloud, HANDLER_EVENT);

                    await icloud.submitMFA(method, `123456`);

                    expect(icloud.axios.post).toHaveBeenCalledWith(...expectedAxiosPost(method));
                    expect(errorEvent).toHaveBeenCalledWith(new iCloudError(`Received error during MFA validation`, `FATAL`));
                });
            });

            describe.each([new MFAMethod(`voice`), new MFAMethod(`sms`)])(`Phone Number`, method => {
                test(`Enter MFA with ${method} - Success`, async () => {
                    const icloud = iCloudFactory();
                    icloud.auth.iCloudAuthSecrets = Config.iCloudAuthSecrets;

                    icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
                        "status": 200,
                    }));

                    const authenticatedEvent = spyOnEvent(icloud, ICLOUD.EVENTS.AUTHENTICATED);

                    await icloud.submitMFA(method, `123456`);

                    expect(icloud.axios.post).toHaveBeenCalledWith(...expectedAxiosPost(method));
                    expect(authenticatedEvent).toHaveBeenCalled();
                });

                test(`Enter MFA with ${method} - Network failure`, async () => {
                    const icloud = iCloudFactory();
                    icloud.auth.iCloudAuthSecrets = Config.iCloudAuthSecrets;

                    icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.reject(new Error(`Unknown error`)));

                    const errorEvent = spyOnEvent(icloud, HANDLER_EVENT);

                    await icloud.submitMFA(method, `123456`);

                    expect(icloud.axios.post).toHaveBeenCalledWith(...expectedAxiosPost(method));
                    expect(errorEvent).toHaveBeenCalledWith(new Error(`Received error during MFA validation`));
                });

                test(`Enter MFA with ${method} - Send unsuccessful`, async () => {
                    const icloud = iCloudFactory();
                    icloud.auth.iCloudAuthSecrets = Config.iCloudAuthSecrets;

                    icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
                        "status": 404,
                        "statusText": `Not found`,
                    }));

                    const errorEvent = spyOnEvent(icloud, HANDLER_EVENT);

                    await icloud.submitMFA(method, `123456`);

                    expect(icloud.axios.post).toHaveBeenCalledWith(...expectedAxiosPost(method));
                    expect(errorEvent).toHaveBeenCalledWith(new iCloudError(`Received error during MFA validation`, `FATAL`));
                });
            });
        });
    });

    describe(`Trust Token`, () => {
        beforeEach(() => {
            mockfs({
                [appDataDir]: {
                    [ICLOUD.TRUST_TOKEN_FILE_NAME]: Config.trustToken,
                },
            });
        });

        afterEach(() => {
            mockfs.restore();
        });

        test(`Acquire trust token`, async () => {
            const icloud = iCloudFactory();
            icloud.auth.iCloudAuthSecrets = Config.iCloudAuthSecrets;

            const trustedEvent = spyOnEvent(icloud, ICLOUD.EVENTS.TRUSTED);

            icloud.axios.get = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
                "status": 200,
                "headers": {
                    [ICLOUD.AUTH_RESPONSE_HEADER.SESSION_TOKEN.toLowerCase()]: Config.iCloudAuthSecrets.sessionId,
                    [ICLOUD.AUTH_RESPONSE_HEADER.TRUST_TOKEN.toLowerCase()]: Config.trustTokenModified,
                },
            }));

            await icloud.getTokens();

            expect(icloud.axios.get).toBeCalledWith(...expectedTokenGetCall);
            const writtenFile = fs.readFileSync(path.join(appDataDir, ICLOUD.TRUST_TOKEN_FILE_NAME)).toString();
            expect(writtenFile).toEqual(Config.trustTokenModified);
            expect(trustedEvent).toHaveBeenCalled();
        });

        test(`Invalid trust token response`, async () => {
            const icloud = iCloudFactory();
            icloud.auth.iCloudAuthSecrets = Config.iCloudAuthSecrets;

            const errorEvent = spyOnEvent(icloud, HANDLER_EVENT);

            icloud.axios.get = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
                "status": 500,
                "headers": {},
            }));

            await icloud.getTokens();

            expect(icloud.axios.get).toBeCalledWith(...expectedTokenGetCall);

            const writtenFile = fs.readFileSync(path.join(appDataDir, ICLOUD.TRUST_TOKEN_FILE_NAME)).toString();
            expect(writtenFile).toEqual(Config.trustToken);
            expect(errorEvent).toHaveBeenCalledWith(new iCloudAuthError(`Unable to validate account tokens: sessionToken invalid`, `FATAL`));
        });

        test(`Acquire trust token - Network Failure`, async () => {
            const icloud = iCloudFactory();
            icloud.auth.iCloudAuthSecrets = Config.iCloudAuthSecrets;

            const errorEvent = spyOnEvent(icloud, HANDLER_EVENT);

            const requestError = new Error(`Network Failure`);

            icloud.axios.get = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.reject(requestError));

            await icloud.getTokens();

            expect(icloud.axios.get).toBeCalledWith(...expectedTokenGetCall);

            const writtenFile = fs.readFileSync(path.join(appDataDir, ICLOUD.TRUST_TOKEN_FILE_NAME)).toString();
            expect(writtenFile).toEqual(Config.trustToken);
            expect(errorEvent).toHaveBeenCalledWith(new iCloudError(`Received error while acquiring trust tokens`, `FATAL`));
        });
    });

    describe(`Setup iCloud`, () => {
        test(`Acquire iCloud Cookies & Photos Account Data`, async () => {
            const icloud = iCloudFactory();
            icloud.auth.iCloudAccountTokens.sessionToken = Config.iCloudAuthSecrets.sessionId;
            icloud.auth.iCloudAccountTokens.trustToken = Config.trustToken;

            icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
                "status": 200,
                "data": { // Actuall response contains significant more -potential useful- data, only the following is really necessary
                    "webservices": {
                        "ckdatabasews": {
                            "url": `https://p00-ckdatabasews.icloud.com:443`,
                        },
                    },
                },
                "headers": getICloudCookieHeader(),
            }));

            const readyEvent = spyOnEvent(icloud, ICLOUD.EVENTS.ACCOUNT_READY);

            await icloud.getiCloudCookies();

            expect(icloud.axios.post).toHaveBeenCalledWith(
                `https://setup.icloud.com/setup/ws/1/accountLogin`,
                {
                    "dsWebAuthToken": Config.iCloudAuthSecrets.sessionId,
                    "trustToken": Config.trustToken,
                },
                {
                    "headers": expectedICloudSetupHeaders,
                },
            );
            expect(readyEvent).toHaveBeenCalled();
            expect(icloud.auth.iCloudCookies.length).toEqual(17);
            expect(icloud.photos).toBeDefined();
        });

        test(`Receive empty set-cookies during setup`, async () => {
            const icloud = iCloudFactory();
            icloud.auth.iCloudAccountTokens.sessionToken = Config.iCloudAuthSecrets.sessionId;
            icloud.auth.iCloudAccountTokens.trustToken = Config.trustToken;

            icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
                "status": 200,
                "data": { // Actuall response contains significant more -potential useful- data, only the following is really necessary
                    "webservices": {
                        "ckdatabasews": {
                            "url": `https://p00-ckdatabasews.icloud.com:443`,
                        },
                    },
                },
                "headers": {
                    'set-cookie': [],
                },
            }));

            const errorEvent = spyOnEvent(icloud, HANDLER_EVENT);

            await icloud.getiCloudCookies();

            expect(icloud.axios.post).toHaveBeenCalledWith(
                `https://setup.icloud.com/setup/ws/1/accountLogin`,
                {
                    "dsWebAuthToken": Config.iCloudAuthSecrets.sessionId,
                    "trustToken": Config.trustToken,
                },
                {
                    "headers": expectedICloudSetupHeaders,
                },
            );
            expect(errorEvent).toHaveBeenCalledWith(new iCloudError(`Received error during iCloud Setup`, `FATAL`));
            expect(icloud.photos).toBeNull();
        });

        test(`Receive expired iCloud Cookies during setup`, async () => {
            const icloud = iCloudFactory();
            icloud.auth.iCloudAccountTokens.sessionToken = Config.iCloudAuthSecrets.sessionId;
            icloud.auth.iCloudAccountTokens.trustToken = Config.trustToken;

            icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
                "status": 200,
                "data": { // Actuall response contains significant more -potential useful- data, only the following is really necessary
                    "webservices": {
                        "ckdatabasews": {
                            "url": `https://p00-ckdatabasews.icloud.com:443`,
                        },
                    },
                },
                "headers": getICloudCookieHeader(true),
            }));

            const errorEvent = spyOnEvent(icloud, HANDLER_EVENT);

            await icloud.getiCloudCookies();

            expect(icloud.axios.post).toHaveBeenCalledWith(
                `https://setup.icloud.com/setup/ws/1/accountLogin`,
                {
                    "dsWebAuthToken": Config.iCloudAuthSecrets.sessionId,
                    "trustToken": Config.trustToken,
                },
                {
                    "headers": expectedICloudSetupHeaders,
                },
            );
            expect(errorEvent).toHaveBeenCalledWith(new iCloudError(`Received error during iCloud Setup`, `FATAL`));
            expect(icloud.photos).toBeNull();
        });

        test(`Receive invalid status code during setup`, async () => {
            const icloud = iCloudFactory();
            icloud.auth.iCloudAccountTokens.sessionToken = Config.iCloudAuthSecrets.sessionId;
            icloud.auth.iCloudAccountTokens.trustToken = Config.trustToken;

            icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
                "status": 500,
            }));

            const errorEvent = spyOnEvent(icloud, HANDLER_EVENT);

            await icloud.getiCloudCookies();

            expect(icloud.axios.post).toHaveBeenCalledWith(
                `https://setup.icloud.com/setup/ws/1/accountLogin`,
                {
                    "dsWebAuthToken": Config.iCloudAuthSecrets.sessionId,
                    "trustToken": Config.trustToken,
                },
                {
                    "headers": expectedICloudSetupHeaders,
                },
            );
            expect(errorEvent).toHaveBeenCalledWith(new iCloudError(`Received error during iCloud Setup`, `FATAL`));
            expect(icloud.photos).toBeNull();
        });

        test(`Receive invalid response during setup`, async () => {
            const icloud = iCloudFactory();
            icloud.auth.iCloudAccountTokens.sessionToken = Config.iCloudAuthSecrets.sessionId;
            icloud.auth.iCloudAccountTokens.trustToken = Config.trustToken;

            icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
                "status": 200,
                "data": {},
                "headers": getICloudCookieHeader(true),
            }));

            const errorEvent = spyOnEvent(icloud, HANDLER_EVENT);

            await icloud.getiCloudCookies();

            expect(icloud.axios.post).toHaveBeenCalledWith(
                `https://setup.icloud.com/setup/ws/1/accountLogin`,
                {
                    "dsWebAuthToken": Config.iCloudAuthSecrets.sessionId,
                    "trustToken": Config.trustToken,
                },
                {
                    "headers": expectedICloudSetupHeaders,
                },
            );
            expect(errorEvent).toHaveBeenCalledWith(new iCloudError(`Received error during iCloud Setup`, `FATAL`));
            expect(icloud.photos).toBeNull();
        });

        test(`Network failure`, async () => {
            const icloud = iCloudFactory();
            icloud.auth.iCloudAccountTokens.sessionToken = Config.iCloudAuthSecrets.sessionId;
            icloud.auth.iCloudAccountTokens.trustToken = Config.trustToken;

            icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.reject(new Error(`Network down!`)));

            const errorEvent = spyOnEvent(icloud, HANDLER_EVENT);

            await icloud.getiCloudCookies();

            expect(icloud.axios.post).toHaveBeenCalledWith(
                `https://setup.icloud.com/setup/ws/1/accountLogin`,
                {
                    "dsWebAuthToken": Config.iCloudAuthSecrets.sessionId,
                    "trustToken": Config.trustToken,
                },
                {
                    "headers": expectedICloudSetupHeaders,
                },
            );
            expect(errorEvent).toHaveBeenCalledWith(new iCloudError(`Received error during iCloud Setup`, `FATAL`));
            expect(icloud.photos).toBeNull();
        });

        describe(`Get iCloud Photos Ready`, () => {
            test(`Get iCloud Photos Ready`, () => {
                const icloud = iCloudFactory();
                icloud.auth.iCloudCookies = getICloudCookies();
                icloud.photos = new iCloudPhotos(icloud.auth);
                icloud.photos.setup = jest.fn(() => Promise.resolve());

                icloud.getiCloudPhotosReady();

                expect(icloud.photos.listenerCount(ICLOUD_PHOTOS.EVENTS.READY)).toBe(1);
                expect(icloud.photos.listenerCount(HANDLER_EVENT)).toBe(1);
                expect(icloud.photos.listenerCount(ICLOUD_PHOTOS.EVENTS.INDEX_IN_PROGRESS)).toBe(1);
                expect(icloud.photos.setup).toHaveBeenCalled();
            });

            test(`Cookies invalid`, () => {
                const icloud = iCloudFactory();
                icloud.auth.iCloudCookies = getICloudCookies(true);
                const errorEvent = spyOnEvent(icloud, HANDLER_EVENT);
                icloud.photos = new iCloudPhotos(icloud.auth);
                icloud.photos.setup = jest.fn(() => Promise.resolve());

                icloud.getiCloudPhotosReady();

                expect(errorEvent).toHaveBeenCalledWith(new iCloudError(`No valid cookies for iCloud Photos setup`, `FATAL`));

                expect(icloud.photos.setup).not.toHaveBeenCalled();
            });

            test(`Photos Object invalid`, () => {
                const icloud = iCloudFactory();
                icloud.auth.iCloudCookies = getICloudCookies();
                const errorEvent = spyOnEvent(icloud, HANDLER_EVENT);

                icloud.getiCloudPhotosReady();

                expect(errorEvent).toHaveBeenCalledWith(new iCloudError(`Unable to setup iCloud Photos, object does not exist`, `FATAL`));
            });
        });
    });
});