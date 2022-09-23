import mockfs from 'mock-fs';
import {describe, test, beforeEach, afterEach, expect, jest} from '@jest/globals';
import path from 'path';
import * as ICLOUD from '../../src/lib/icloud/constants';
import {appDataDir} from '../_helpers/config';
import fs from 'fs';
import {iCloudAuth} from '../../src/lib/icloud/auth';
import {AxiosError, AxiosRequestConfig} from 'axios';
import {MFAMethod} from '../../src/lib/icloud/mfa/mfa-method';
import {expectedAxiosPost, expectedAxiosPut} from '../_helpers/icloud-mfa';
import {spyOnEvent} from '../_helpers/_general';
import {expectedTokenGet, iCloudFactory, _defaultCliOpts} from '../_helpers/icloud';
import * as Config from '../_helpers/config';
import {iCloud} from '../../src/lib/icloud/icloud';

describe(`Unit Tests - iCloud`, () => {
    describe(`CLI Options`, () => {
        test(`Refresh Token`, () => {
            const cliOpts = _defaultCliOpts;
            cliOpts.refreshToken = true;
            const icloud = iCloudFactory(cliOpts);
            expect(icloud.auth.iCloudAccountTokens.trustToken).toEqual(``);
        });

        // For some reason this 'throws' an error
        test.skip(`Fail on MFA`, () => {
            const cliOpts = _defaultCliOpts;
            cliOpts.failOnMfa = true;

            const icloud = new iCloud(cliOpts);

            const event = spyOnEvent(icloud, ICLOUD.EVENTS.ERROR);
            icloud.emit(ICLOUD.EVENTS.MFA_REQUIRED);

            expect(event).toHaveBeenCalledWith(`MFA code required, failing due to failOnMfa flag`);
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
                    "x-apple-session-token": Config.sessionToken,
                    "scnt": Config.scnt,
                    "set-cookie": [
                        `dslang=US-EN; Domain=apple.com; Path=/; Secure; HttpOnly`,
                        `site=USA; Domain=apple.com; Path=/; Secure; HttpOnly`,
                        `acn01=; Max-Age=0; Expires=Thu, 01-Jan-1970 00:00:10 GMT; Domain=apple.com; Path=/; Secure; HttpOnly`,
                        `aasp=${Config.aasp}; Domain=idmsa.apple.com; Path=/; Secure; HttpOnly`,
                    ],
                },
            }));

            await icloud.authenticate();
            expect(authenticationEvent).toHaveBeenCalled();
            expect(trustedEvent).toHaveBeenCalled();

            expect(icloud.auth.iCloudAuthSecrets.aasp).toEqual(Config.aasp);
            expect(icloud.auth.iCloudAuthSecrets.scnt).toEqual(Config.scnt);
            expect(icloud.auth.iCloudAuthSecrets.sessionId).toEqual(Config.sessionToken);
        });

        test(`Authentication - Unextected success status code`, async () => {
            const icloud = iCloudFactory();
            // ICloud.authentcate returns ready promise. Need to modify in order to resolve at the end of the test
            icloud.ready = new Promise<void>((resolve, _reject) => {
                icloud.once(ICLOUD.EVENTS.ERROR, resolve);
            });
            const authenticationEvent = spyOnEvent(icloud, ICLOUD.EVENTS.AUTHENTICATION_STARTED);
            const errorEvent = spyOnEvent(icloud, ICLOUD.EVENTS.ERROR);

            icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
                "status": 204,
            }));

            await icloud.authenticate();
            expect(authenticationEvent).toHaveBeenCalled();
            expect(errorEvent).toHaveBeenCalledWith(`Unexpected HTTP code: 204`);
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
                    "x-apple-session-token": Config.sessionToken,
                    "scnt": Config.scnt,
                    "set-cookie": [
                        `dslang=US-EN; Domain=apple.com; Path=/; Secure; HttpOnly`,
                        `site=USA; Domain=apple.com; Path=/; Secure; HttpOnly`,
                        `acn01=; Max-Age=0; Expires=Thu, 01-Jan-1970 00:00:10 GMT; Domain=apple.com; Path=/; Secure; HttpOnly`,
                        `aasp=${Config.aasp}; Domain=idmsa.apple.com; Path=/; Secure; HttpOnly`,
                    ],
                },
            };
            icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.reject(responseError));

            await icloud.authenticate();
            expect(authenticationEvent).toHaveBeenCalled();
            expect(mfaEvent).toHaveBeenCalledWith(0);

            expect(icloud.auth.iCloudAuthSecrets.aasp).toEqual(Config.aasp);
            expect(icloud.auth.iCloudAuthSecrets.scnt).toEqual(Config.scnt);
            expect(icloud.auth.iCloudAuthSecrets.sessionId).toEqual(Config.sessionToken);
        });

        test(`Authentication - Unexpected failure status code`, async () => {
            const icloud = iCloudFactory();
            // ICloud.authentcate returns ready promise. Need to modify in order to resolve at the end of the test
            icloud.ready = new Promise<void>((resolve, _reject) => {
                icloud.once(ICLOUD.EVENTS.ERROR, resolve);
            });
            const authenticationEvent = spyOnEvent(icloud, ICLOUD.EVENTS.AUTHENTICATION_STARTED);
            const errorEvent = spyOnEvent(icloud, ICLOUD.EVENTS.ERROR);

            const responseError = new Error(`Conflict`);
            (responseError as any).response = {
                "status": 500,
            };
            icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.reject(responseError));

            await icloud.authenticate();
            expect(authenticationEvent).toHaveBeenCalled();
            expect(errorEvent).toHaveBeenCalledWith(`Unexpected HTTP code: 500`);
        });

        test(`Authentication - No response`, async () => {
            const icloud = iCloudFactory();
            // ICloud.authentcate returns ready promise. Need to modify in order to resolve at the end of the test
            icloud.ready = new Promise<void>((resolve, _reject) => {
                icloud.once(ICLOUD.EVENTS.ERROR, resolve);
            });
            const authenticationEvent = spyOnEvent(icloud, ICLOUD.EVENTS.AUTHENTICATION_STARTED);
            const errorEvent = spyOnEvent(icloud, ICLOUD.EVENTS.ERROR);

            icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.reject(
                new Error(`No Network`),
            ));

            await icloud.authenticate();
            expect(authenticationEvent).toHaveBeenCalled();
            expect(errorEvent).toHaveBeenCalledWith(`No response received during authentication: No Network`);
        });

        test(`Authentication - Auth secrets missing in authentication response`, async () => {
            const icloud = iCloudFactory();
            // ICloud.authentcate returns ready promise. Need to modify in order to resolve at the end of the test
            icloud.ready = new Promise<void>((resolve, _reject) => {
                icloud.once(ICLOUD.EVENTS.ERROR, resolve);
            });
            const authenticationEvent = spyOnEvent(icloud, ICLOUD.EVENTS.AUTHENTICATION_STARTED);
            const errorEvent = spyOnEvent(icloud, ICLOUD.EVENTS.ERROR);

            icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
                "status": 200,
                "headers": {},
            }));

            await icloud.authenticate();
            expect(authenticationEvent).toHaveBeenCalled();
            expect(errorEvent).toHaveBeenCalledWith(`Unable to process auth response: No set-cookie directive found`);
        });

        test(`Authentication - Auth secrets missing in mfa response`, async () => {
            const icloud = iCloudFactory();
            // ICloud.authentcate returns ready promise. Need to modify in order to resolve at the end of the test
            icloud.ready = new Promise<void>((resolve, _reject) => {
                icloud.once(ICLOUD.EVENTS.ERROR, resolve);
            });
            const authenticationEvent = spyOnEvent(icloud, ICLOUD.EVENTS.AUTHENTICATION_STARTED);
            const errorEvent = spyOnEvent(icloud, ICLOUD.EVENTS.ERROR);

            const responseError = new Error(`Conflict`);
            (responseError as any).response = {
                "status": 409,
                "headers": {},
            };
            icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.reject(responseError));

            await icloud.authenticate();
            expect(authenticationEvent).toHaveBeenCalled();
            expect(errorEvent).toHaveBeenCalledWith(`Unable to process auth response: No set-cookie directive found`);
        });
    });

    describe(`MFA Flow`, () => {
        test(`Start MFA Server`, () => {
            const icloud = new iCloud(_defaultCliOpts);

            icloud.emit(ICLOUD.EVENTS.MFA_REQUIRED);
            expect(icloud.mfaServer.server.listening).toBeTruthy();
            icloud.mfaServer.stopServer();
        });

        describe(`Resend MFA`, () => {
            describe.each([new MFAMethod(`device`)])(`Device`, method => {
                test(`Resend MFA with ${method} - Success`, async () => {
                    const icloud = iCloudFactory();
                    icloud.auth.iCloudAuthSecrets = Config.authSecrets;

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
                    icloud.auth.iCloudAuthSecrets = Config.authSecrets;

                    // Mocking actual network request
                    icloud.axios.put = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.reject(new Error()));

                    // Will be called on rejection
                    method.processResendError = jest.fn((_err: AxiosError) => `processedError`);

                    // Checking if rejection is properly parsed
                    const errorEvent = spyOnEvent(icloud, ICLOUD.EVENTS.ERROR);

                    await icloud.resendMFA(method);

                    expect(icloud.axios.put).toHaveBeenCalledWith(...expectedAxiosPut(method));
                    expect(errorEvent).toHaveBeenCalledWith(`Received error while trying to resend MFA code: processedError`);
                });

                test(`Resend MFA with ${method} - Resend unsuccesful`, async () => {
                    const icloud = iCloudFactory();
                    icloud.auth.iCloudAuthSecrets = Config.authSecrets;

                    // Mocking actual network request
                    icloud.axios.put = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
                        "status": 404,
                    }));

                    // Checking if rejection is properly parsed
                    const errorEvent = spyOnEvent(icloud, ICLOUD.EVENTS.ERROR);

                    await icloud.resendMFA(method);

                    expect(icloud.axios.put).toHaveBeenCalledWith(...expectedAxiosPut(method));
                    expect(errorEvent).toHaveBeenCalledWith(`Unable to request new MFA code: {"status":404}`);
                });
            });

            describe.each([new MFAMethod(`voice`), new MFAMethod(`sms`)])(`Phone number`, method => {
                test(`Resend MFA with ${method} - Success`, async () => {
                    const icloud = iCloudFactory();
                    icloud.auth.iCloudAuthSecrets = Config.authSecrets;

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
                    icloud.auth.iCloudAuthSecrets = Config.authSecrets;

                    // Mocking actual network request
                    icloud.axios.put = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.reject(new Error()));

                    // Will be called on rejection
                    method.processResendError = jest.fn((_err: AxiosError) => `processedError`);

                    // Checking if rejection is properly parsed
                    const errorEvent = spyOnEvent(icloud, ICLOUD.EVENTS.ERROR);

                    await icloud.resendMFA(method);

                    expect(icloud.axios.put).toHaveBeenCalledWith(...expectedAxiosPut(method));
                    expect(errorEvent).toHaveBeenCalledWith(`Received error while trying to resend MFA code: processedError`);
                });

                test(`Resend MFA with ${method} - Resend unsuccesful`, async () => {
                    const icloud = iCloudFactory();
                    icloud.auth.iCloudAuthSecrets = Config.authSecrets;

                    // Mocking actual network request
                    icloud.axios.put = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
                        "status": 404,
                    }));

                    // Checking if rejection is properly parsed
                    const errorEvent = spyOnEvent(icloud, ICLOUD.EVENTS.ERROR);

                    await icloud.resendMFA(method);

                    expect(icloud.axios.put).toHaveBeenCalledWith(...expectedAxiosPut(method));
                    expect(errorEvent).toHaveBeenCalledWith(`Unable to request new MFA code: {"status":404}`);
                });
            });
        });

        describe(`Enter Code`, () => {
            describe.each([new MFAMethod(`device`)])(`Device`, method => {
                test(`Enter MFA with ${method} - Success`, async () => {
                    const icloud = iCloudFactory();
                    icloud.auth.iCloudAuthSecrets = Config.authSecrets;

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
                    icloud.auth.iCloudAuthSecrets = Config.authSecrets;

                    icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.reject(new Error(`Unknown error`)));

                    const errorEvent = spyOnEvent(icloud, ICLOUD.EVENTS.ERROR);

                    await icloud.submitMFA(method, `123456`);

                    expect(icloud.axios.post).toHaveBeenCalledWith(...expectedAxiosPost(method));
                    expect(errorEvent).toHaveBeenCalledWith(`Received error during MFA validation: Unknown error`);
                });

                test(`Enter MFA with ${method} - Send unsuccessful`, async () => {
                    const icloud = iCloudFactory();
                    icloud.auth.iCloudAuthSecrets = Config.authSecrets;

                    icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
                        "status": 404,
                        "statusText": `Not found`,
                    }));

                    const errorEvent = spyOnEvent(icloud, ICLOUD.EVENTS.ERROR);

                    await icloud.submitMFA(method, `123456`);

                    expect(icloud.axios.post).toHaveBeenCalledWith(...expectedAxiosPost(method));
                    expect(errorEvent).toHaveBeenCalledWith(`Received unexpected response code during MFA validation: 404 (Not found)`);
                });
            });

            describe.each([new MFAMethod(`voice`), new MFAMethod(`sms`)])(`Phone Number`, method => {
                test(`Enter MFA with ${method} - Success`, async () => {
                    const icloud = iCloudFactory();
                    icloud.auth.iCloudAuthSecrets = Config.authSecrets;

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
                    icloud.auth.iCloudAuthSecrets = Config.authSecrets;

                    icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.reject(new Error(`Unknown error`)));

                    const errorEvent = spyOnEvent(icloud, ICLOUD.EVENTS.ERROR);

                    await icloud.submitMFA(method, `123456`);

                    expect(icloud.axios.post).toHaveBeenCalledWith(...expectedAxiosPost(method));
                    expect(errorEvent).toHaveBeenCalledWith(`Received error during MFA validation: Unknown error`);
                });

                test(`Enter MFA with ${method} - Send unsuccessful`, async () => {
                    const icloud = iCloudFactory();
                    icloud.auth.iCloudAuthSecrets = Config.authSecrets;

                    icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
                        "status": 404,
                        "statusText": `Not found`,
                    }));

                    const errorEvent = spyOnEvent(icloud, ICLOUD.EVENTS.ERROR);

                    await icloud.submitMFA(method, `123456`);

                    expect(icloud.axios.post).toHaveBeenCalledWith(...expectedAxiosPost(method));
                    expect(errorEvent).toHaveBeenCalledWith(`Received unexpected response code during MFA validation: 404 (Not found)`);
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
            icloud.auth.iCloudAuthSecrets = Config.authSecrets;

            const trustedEvent = spyOnEvent(icloud, ICLOUD.EVENTS.TRUSTED);

            icloud.axios.get = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
                "status": 200,
                "headers": {
                    [ICLOUD.AUTH_RESPONSE_HEADER.SESSION_TOKEN.toLowerCase()]: Config.sessionToken,
                    [ICLOUD.AUTH_RESPONSE_HEADER.TRUST_TOKEN.toLowerCase()]: Config.trustTokenModified,
                },
            }));

            await icloud.getTokens();

            expect(icloud.axios.get).toBeCalledWith(...expectedTokenGet);
            const writtenFile = fs.readFileSync(path.join(appDataDir, ICLOUD.TRUST_TOKEN_FILE_NAME)).toString();
            expect(writtenFile).toEqual(Config.trustTokenModified);
            expect(trustedEvent).toHaveBeenCalled();
        });

        test(`Invalid trust token response`, async () => {
            const icloud = iCloudFactory();
            icloud.auth.iCloudAuthSecrets = Config.authSecrets;

            const errorEvent = spyOnEvent(icloud, ICLOUD.EVENTS.ERROR);

            icloud.axios.get = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
                "status": 500,
                "headers": {},
            }));

            await icloud.getTokens();

            expect(icloud.axios.get).toBeCalledWith(...expectedTokenGet);

            const writtenFile = fs.readFileSync(path.join(appDataDir, ICLOUD.TRUST_TOKEN_FILE_NAME)).toString();
            expect(writtenFile).toEqual(Config.trustToken);
            expect(errorEvent).toHaveBeenCalledWith(`Unable to validate account tokens: sessionToken invalid`);
        });

        test(`Acquire trust token - Network Failure`, async () => {
            const icloud = iCloudFactory();
            icloud.auth.iCloudAuthSecrets = Config.authSecrets;

            const errorEvent = spyOnEvent(icloud, ICLOUD.EVENTS.ERROR);

            const requestError = new Error(`Network Failure`);

            icloud.axios.get = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.reject(requestError));

            await icloud.getTokens();

            expect(icloud.axios.get).toBeCalledWith(...expectedTokenGet);

            const writtenFile = fs.readFileSync(path.join(appDataDir, ICLOUD.TRUST_TOKEN_FILE_NAME)).toString();
            expect(writtenFile).toEqual(Config.trustToken);
            expect(errorEvent).toHaveBeenCalledWith(`Received error while acquiring trust tokens: Network Failure`);
        });
    });

    describe(`Setup iCloud`, () => {
        test.todo(`Acquire iCloud Cookies & Photos Account Data`);
        test.todo(`Receive invalid status code during setup`);
        test.todo(`Receive invalid response during setup`);
        test.todo(`Network failure`);
    });
});