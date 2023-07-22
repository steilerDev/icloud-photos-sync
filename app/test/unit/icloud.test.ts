import mockfs from 'mock-fs';
import {describe, test, beforeEach, afterEach, expect, jest} from '@jest/globals';
import path from 'path';
import * as ICLOUD from '../../src/lib/icloud/constants';
import {appDataDir} from '../_helpers/_config';
import fs from 'fs';
import {AxiosRequestConfig} from 'axios';
import {MFAMethod} from '../../src/lib/icloud/mfa/mfa-method';
import {expectedAxiosPost, expectedAxiosPut} from '../_helpers/icloud-mfa.helper';
import * as ICLOUD_PHOTOS from '../../src/lib/icloud/icloud-photos/constants';
import {prepareResourceManager, spyOnEvent} from '../_helpers/_general';
import {expectedICloudSetupHeaders, expectedTokenGetCall, getICloudCookieHeader, iCloudFactory} from '../_helpers/icloud.helper';
import * as Config from '../_helpers/_config';
import {iCloud} from '../../src/lib/icloud/icloud';
import {getICloudCookies} from '../_helpers/icloud-auth.helper';
import {iCloudPhotos} from '../../src/lib/icloud/icloud-photos/icloud-photos';
import {HANDLER_EVENT} from '../../src/app/event/error-handler';
import {ResourceManager} from '../../src/lib/resource-manager/resource-manager';

beforeEach(() => {
    prepareResourceManager();
});

afterEach(() => {
    mockfs.restore();
});

describe(`CLI Options`, () => {
    // For some reason this 'throws' an error
    test(`Fail on MFA`, async () => {
        ResourceManager.instance._appOptions.failOnMfa = true;

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
    test(`Authentication - Valid Trust Token`, async () => {
        const icloud = iCloudFactory();
        // ICloud.authenticate returns ready promise. Need to modify in order to resolve at the end of the test
        icloud.ready = new Promise<void>((resolve, _reject) => {
            icloud.once(ICLOUD.EVENTS.TRUSTED, resolve);
        });
        const authenticationEvent = spyOnEvent(icloud, ICLOUD.EVENTS.AUTHENTICATION_STARTED);
        const trustedEvent = spyOnEvent(icloud, ICLOUD.EVENTS.TRUSTED);
        const errorEvent = spyOnEvent(icloud, ICLOUD.EVENTS.ERROR);

        icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
            status: 200,
            headers: {
                "x-apple-session-token": Config.iCloudAuthSecrets.sessionSecret,
                scnt: Config.iCloudAuthSecrets.scnt,
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
        expect(errorEvent).not.toHaveBeenCalled();
        expect(icloud.auth.iCloudAuthSecrets).toEqual(Config.iCloudAuthSecrets);
    });

    test(`Authentication - Invalid Trust Token - MFA Required`, async () => {
        const icloud = iCloudFactory();
        // ICloud.authenticate returns ready promise. Need to modify in order to resolve at the end of the test
        icloud.ready = new Promise<void>((resolve, _reject) => {
            icloud.once(ICLOUD.EVENTS.MFA_REQUIRED, resolve);
        });
        const authenticationEvent = spyOnEvent(icloud, ICLOUD.EVENTS.AUTHENTICATION_STARTED);
        const mfaEvent = spyOnEvent(icloud, ICLOUD.EVENTS.MFA_REQUIRED);
        const trustedEvent = spyOnEvent(icloud, ICLOUD.EVENTS.TRUSTED);
        const errorEvent = spyOnEvent(icloud, ICLOUD.EVENTS.ERROR);
        const responseError = new Error(`Conflict`);

        (responseError as any).response = {
            status: 409,
            headers: {
                "x-apple-session-token": Config.iCloudAuthSecrets.sessionSecret,
                scnt: Config.iCloudAuthSecrets.scnt,
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

        expect(trustedEvent).not.toHaveBeenCalled();
        expect(authenticationEvent).toHaveBeenCalled();
        expect(mfaEvent).toHaveBeenCalledWith(0);
        expect(errorEvent).not.toHaveBeenCalled();
        expect(icloud.auth.iCloudAuthSecrets).toEqual(Config.iCloudAuthSecrets);
    });

    test(`Authentication - Auth secrets missing in authentication response`, async () => {
        const icloud = iCloudFactory();

        const authenticationEvent = spyOnEvent(icloud, ICLOUD.EVENTS.AUTHENTICATION_STARTED);

        icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
            status: 200,
            headers: {},
        }));

        await expect(icloud.authenticate()).rejects.toThrow(/^Unable to process auth secrets$/);
        expect(authenticationEvent).toHaveBeenCalled();
    });

    test(`Authentication - Auth secrets missing in mfa response`, async () => {
        const icloud = iCloudFactory();

        const authenticationEvent = spyOnEvent(icloud, ICLOUD.EVENTS.AUTHENTICATION_STARTED);

        const responseError = new Error(`Conflict`);
        (responseError as any).response = {
            status: 409,
            headers: {},
        };
        icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.reject(responseError));

        await expect(icloud.authenticate()).rejects.toThrow(/^Unable to process cookies$/);
        expect(authenticationEvent).toHaveBeenCalled();
    });

    test(`Authentication - Unexpected success status code`, async () => {
        const icloud = iCloudFactory();
        const authenticationEvent = spyOnEvent(icloud, ICLOUD.EVENTS.AUTHENTICATION_STARTED);
        const errorEvent = spyOnEvent(icloud, ICLOUD.EVENTS.ERROR);
        const trustedEvent = spyOnEvent(icloud, ICLOUD.EVENTS.TRUSTED);
        const mfaEvent = spyOnEvent(icloud, ICLOUD.EVENTS.MFA_REQUIRED);

        icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
            status: 204,
        }));

        const expectedError = /^Unexpected HTTP response$/;
        await expect(icloud.authenticate()).rejects.toThrow(expectedError);

        expect(authenticationEvent).toHaveBeenCalled();
        expect(trustedEvent).not.toHaveBeenCalled();
        expect(mfaEvent).not.toHaveBeenCalled();
        expect(errorEvent).toHaveBeenCalledTimes(1);
    });

    test.each([
        {
            desc: `Unknown username`,
            axiosErrorMessage: `Conflict`,
            axiosErrorResponse: {
                status: 403,
            },
            expectedError: /^Username does not seem to exist$/,
        }, {
            desc: `Wrong username/password combination`,
            axiosErrorMessage: `Unauthorized`,
            axiosErrorResponse: {
                status: 401,
            },
            expectedError: /^Username\/Password does not seem to match$/,
        }, {
            desc: `PreCondition failed`,
            axiosErrorMessage: `PreCondition Failed`,
            axiosErrorResponse: {
                status: 412,
            },
            expectedError: /^iCloud refused login - you might need to update your password$/,
        }, {
            desc: `Unexpected failure status code`,
            axiosErrorMessage: `Conflict`,
            axiosErrorResponse: {
                status: 500,
            },
            expectedError: /^Unexpected HTTP response$/,
        }, {
            desc: `No response`,
            axiosErrorMessage: `No Network`,
            axiosErrorResponse: undefined,
            expectedError: /^No response received during authentication$/,
        },
    ])(`Authentication backend error - $desc`, async ({axiosErrorMessage, axiosErrorResponse, expectedError}) => {
        const icloud = iCloudFactory();
        const authenticationEvent = spyOnEvent(icloud, ICLOUD.EVENTS.AUTHENTICATION_STARTED);
        const trustedEvent = spyOnEvent(icloud, ICLOUD.EVENTS.TRUSTED);
        const mfaEvent = spyOnEvent(icloud, ICLOUD.EVENTS.MFA_REQUIRED);
        const errorEvent = spyOnEvent(icloud, ICLOUD.EVENTS.ERROR);

        const responseError = new Error(axiosErrorMessage);
        (responseError as any).response = axiosErrorResponse;
        icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.reject(responseError));

        await expect(icloud.authenticate()).rejects.toThrow(expectedError);
        expect(authenticationEvent).toHaveBeenCalled();
        expect(trustedEvent).not.toHaveBeenCalled();
        expect(mfaEvent).not.toHaveBeenCalled();
        expect(errorEvent).toHaveBeenCalledTimes(1);
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
        describe.each([new MFAMethod(`device`)])(`Device`, method => {
            test(`Resend MFA with ${method} - Success`, async () => {
                const icloud = iCloudFactory();
                icloud.auth.iCloudAuthSecrets = Config.iCloudAuthSecrets;

                // Mocking actual network request
                icloud.axios.put = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
                    status: 202,
                    data: {
                        trustedDeviceCount: 1,
                    },
                }));

                // Only trace is found in logging
                icloud.logger.info = jest.fn();

                await icloud.resendMFA(method);

                expect(icloud.axios.put).toHaveBeenCalledWith(...expectedAxiosPut(method));
                expect(icloud.logger.info).toHaveBeenLastCalledWith(`Successfully requested new MFA code using 1 trusted device(s)`);
            });

            test(`Resend MFA with ${method} - Network Failure`, async () => {
                const icloud = iCloudFactory();
                icloud.auth.iCloudAuthSecrets = Config.iCloudAuthSecrets;

                // Mocking actual network request
                icloud.axios.put = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.reject(new Error()));

                // Checking if rejection is properly parsed
                const warnEvent = spyOnEvent(icloud, HANDLER_EVENT);

                await icloud.resendMFA(method);

                expect(icloud.axios.put).toHaveBeenCalledWith(...expectedAxiosPut(method));
                expect(warnEvent).toHaveBeenCalledWith(new Error(`Unable to request new MFA code`));
            });

            test(`Resend MFA with ${method} - Resend unsuccessful`, async () => {
                const icloud = iCloudFactory();
                icloud.auth.iCloudAuthSecrets = Config.iCloudAuthSecrets;

                // Mocking actual network request
                icloud.axios.put = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
                    status: 404,
                }));

                // Checking if rejection is properly parsed
                const warnEvent = spyOnEvent(icloud, HANDLER_EVENT);

                await icloud.resendMFA(method);

                expect(icloud.axios.put).toHaveBeenCalledWith(...expectedAxiosPut(method));
                expect(warnEvent).toHaveBeenCalledWith(new Error(`Unable to request new MFA code`));
            });
        });

        describe.each([new MFAMethod(`voice`), new MFAMethod(`sms`)])(`Phone number`, method => {
            test(`Resend MFA with ${method} - Success`, async () => {
                const icloud = iCloudFactory();
                icloud.auth.iCloudAuthSecrets = Config.iCloudAuthSecrets;

                // Mocking actual network request
                icloud.axios.put = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
                    status: 200,
                    data: {
                        trustedPhoneNumber: {
                            numberWithDialCode: `+123`,
                        },
                    },
                }));

                // Only trace is found in logging
                icloud.logger.info = jest.fn();

                await icloud.resendMFA(method);

                expect(icloud.axios.put).toHaveBeenCalledWith(...expectedAxiosPut(method));
                expect(icloud.logger.info).toHaveBeenLastCalledWith(`Successfully requested new MFA code using phone +123`);
            });

            test(`Resend MFA with ${method} - Network Failure`, async () => {
                const icloud = iCloudFactory();
                icloud.auth.iCloudAuthSecrets = Config.iCloudAuthSecrets;

                // Mocking actual network request
                icloud.axios.put = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.reject(new Error()));

                // Checking if rejection is properly parsed
                const warnEvent = spyOnEvent(icloud, HANDLER_EVENT);

                await icloud.resendMFA(method);

                expect(icloud.axios.put).toHaveBeenCalledWith(...expectedAxiosPut(method));
                expect(warnEvent).toHaveBeenCalledWith(new Error(`Unable to request new MFA code`));
            });

            test(`Resend MFA with ${method} - Resend unsuccessful`, async () => {
                const icloud = iCloudFactory();
                icloud.auth.iCloudAuthSecrets = Config.iCloudAuthSecrets;

                // Mocking actual network request
                icloud.axios.put = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
                    status: 404,
                }));

                // Checking if rejection is properly parsed
                const warnEvent = spyOnEvent(icloud, HANDLER_EVENT);

                await icloud.resendMFA(method);

                expect(icloud.axios.put).toHaveBeenCalledWith(...expectedAxiosPut(method));
                expect(warnEvent).toHaveBeenCalledWith(new Error(`Unable to request new MFA code`));
            });
        });
    });

    describe(`Enter Code`, () => {
        describe.each([new MFAMethod(`device`)])(`Device`, method => {
            test(`Enter MFA with ${method} - Success`, async () => {
                const icloud = iCloudFactory();
                icloud.auth.iCloudAuthSecrets = Config.iCloudAuthSecrets;

                icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
                    status: 204,
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

                await icloud.submitMFA(method, `123456`);

                expect(icloud.axios.post).toHaveBeenCalledWith(...expectedAxiosPost(method));
                await expect(icloud.ready).rejects.toThrow(/^Unable to submit MFA code$/);
            });

            test(`Enter MFA with ${method} - Send unsuccessful`, async () => {
                const icloud = iCloudFactory();
                icloud.auth.iCloudAuthSecrets = Config.iCloudAuthSecrets;

                icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
                    status: 404,
                    statusText: `Not found`,
                }));

                await icloud.submitMFA(method, `123456`);

                expect(icloud.axios.post).toHaveBeenCalledWith(...expectedAxiosPost(method));
                await expect(icloud.ready).rejects.toThrow(/^Unable to submit MFA code$/);
            });
        });

        describe.each([new MFAMethod(`voice`), new MFAMethod(`sms`)])(`Phone Number`, method => {
            test(`Enter MFA with ${method} - Success`, async () => {
                const icloud = iCloudFactory();
                icloud.auth.iCloudAuthSecrets = Config.iCloudAuthSecrets;

                icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
                    status: 200,
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

                await icloud.submitMFA(method, `123456`);

                expect(icloud.axios.post).toHaveBeenCalledWith(...expectedAxiosPost(method));
                await expect(icloud.ready).rejects.toThrow(/^Unable to submit MFA code$/);
            });

            test(`Enter MFA with ${method} - Send unsuccessful`, async () => {
                const icloud = iCloudFactory();
                icloud.auth.iCloudAuthSecrets = Config.iCloudAuthSecrets;

                icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
                    status: 404,
                    statusText: `Not found`,
                }));

                await icloud.submitMFA(method, `123456`);

                expect(icloud.axios.post).toHaveBeenCalledWith(...expectedAxiosPost(method));
                await expect(icloud.ready).rejects.toThrow(/^Unable to submit MFA code$/);
            });
        });
    });
});

describe(`Trust Token`, () => {
    test(`Acquire trust token`, async () => {
        ResourceManager.instance.writeResourceFile = jest.fn<typeof ResourceManager.instance.writeResourceFile>();

        const icloud = iCloudFactory();
        icloud.auth.iCloudAuthSecrets = Config.iCloudAuthSecrets;

        const trustedEvent = spyOnEvent(icloud, ICLOUD.EVENTS.TRUSTED);

        icloud.axios.get = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
            status: 200,
            headers: {
                [ICLOUD.AUTH_RESPONSE_HEADER.SESSION_TOKEN.toLowerCase()]: Config.iCloudAuthSecrets.sessionSecret,
                [ICLOUD.AUTH_RESPONSE_HEADER.TRUST_TOKEN.toLowerCase()]: Config.trustTokenModified,
            },
        }));

        await icloud.getTokens();

        expect(icloud.axios.get).toBeCalledWith(...expectedTokenGetCall);
        expect(ResourceManager.instance.writeResourceFile).toHaveBeenCalledTimes(1);
        expect(ResourceManager.instance.trustToken).toEqual(Config.trustTokenModified);
        expect(trustedEvent).toHaveBeenCalled();
    });

    test(`Invalid trust token response`, async () => {
        const icloud = iCloudFactory();
        icloud.auth.iCloudAuthSecrets = Config.iCloudAuthSecrets;

        icloud.axios.get = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
            status: 500,
            headers: {},
        }));

        await icloud.getTokens();

        expect(icloud.axios.get).toBeCalledWith(...expectedTokenGetCall);
        await expect(icloud.ready).rejects.toThrow(/^Unable to acquire account tokens$/);

        const writtenFile = fs.readFileSync(path.join(appDataDir, ICLOUD.TRUST_TOKEN_FILE_NAME)).toString();
        expect(writtenFile).toEqual(Config.trustToken);
    });

    test(`Acquire trust token - Network Failure`, async () => {
        const icloud = iCloudFactory();
        icloud.auth.iCloudAuthSecrets = Config.iCloudAuthSecrets;

        const requestError = new Error(`Network Failure`);

        icloud.axios.get = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.reject(requestError));

        await icloud.getTokens();

        expect(icloud.axios.get).toBeCalledWith(...expectedTokenGetCall);
        await expect(icloud.ready).rejects.toThrow(/^Unable to acquire account tokens$/);

        const writtenFile = fs.readFileSync(path.join(appDataDir, ICLOUD.TRUST_TOKEN_FILE_NAME)).toString();
        expect(writtenFile).toEqual(Config.trustToken);
    });
});

describe(`Setup iCloud`, () => {
    test(`Acquire iCloud Cookies & Photos Account Data`, async () => {
        const icloud = iCloudFactory();
        icloud.auth.iCloudAuthSecrets.sessionSecret = Config.iCloudAuthSecrets.sessionSecret;

        icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
            status: 200,
            data: { // Actual response contains significant more -potential useful- data, only the following is really necessary
                webservices: {
                    ckdatabasews: {
                        url: `https://p00-ckdatabasews.icloud.com:443`,
                    },
                },
            },
            headers: getICloudCookieHeader(),
        }));

        const readyEvent = spyOnEvent(icloud, ICLOUD.EVENTS.ACCOUNT_READY);

        await icloud.setupAccount();

        expect(icloud.axios.post).toHaveBeenCalledWith(
            `https://setup.icloud.com/setup/ws/1/accountLogin`,
            {
                dsWebAuthToken: Config.iCloudAuthSecrets.sessionSecret,
                trustToken: Config.trustToken,
            },
            {
                headers: expectedICloudSetupHeaders,
            },
        );
        expect(readyEvent).toHaveBeenCalled();
        expect(icloud.auth.iCloudCookies.length).toEqual(16);
        expect(icloud.photos).toBeDefined();
    });

    test(`Receive empty set-cookies during setup`, async () => {
        const icloud = iCloudFactory();
        icloud.auth.iCloudAuthSecrets.sessionSecret = Config.iCloudAuthSecrets.sessionSecret;

        icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
            status: 200,
            data: { // Actual response contains significant more -potential useful- data, only the following is really necessary
                webservices: {
                    ckdatabasews: {
                        url: `https://p00-ckdatabasews.icloud.com:443`,
                    },
                },
            },
            headers: {
                'set-cookie': [],
            },
        }));

        await icloud.setupAccount();

        expect(icloud.axios.post).toHaveBeenCalledWith(
            `https://setup.icloud.com/setup/ws/1/accountLogin`,
            {
                dsWebAuthToken: Config.iCloudAuthSecrets.sessionSecret,
                trustToken: Config.trustToken,
            },
            {
                headers: expectedICloudSetupHeaders,
            },
        );
        await expect(icloud.ready).rejects.toThrow(/^Unable to setup iCloud Account$/);
    });

    test(`Receive expired iCloud Cookies during setup`, async () => {
        const icloud = iCloudFactory();
        icloud.auth.iCloudAuthSecrets.sessionSecret = Config.iCloudAuthSecrets.sessionSecret;

        icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
            status: 200,
            data: { // Actual response contains significant more -potential useful- data, only the following is really necessary
                webservices: {
                    ckdatabasews: {
                        url: `https://p00-ckdatabasews.icloud.com:443`,
                    },
                },
            },
            headers: getICloudCookieHeader(true),
        }));

        await icloud.setupAccount();

        expect(icloud.axios.post).toHaveBeenCalledWith(
            `https://setup.icloud.com/setup/ws/1/accountLogin`,
            {
                dsWebAuthToken: Config.iCloudAuthSecrets.sessionSecret,
                trustToken: Config.trustToken,
            },
            {
                headers: expectedICloudSetupHeaders,
            },
        );
        await expect(icloud.ready).rejects.toThrow(/^Unable to setup iCloud Account$/);
    });

    test(`Receive invalid status code during setup`, async () => {
        const icloud = iCloudFactory();
        icloud.auth.iCloudAuthSecrets.sessionSecret = Config.iCloudAuthSecrets.sessionSecret;

        icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
            status: 500,
        }));

        await icloud.setupAccount();

        expect(icloud.axios.post).toHaveBeenCalledWith(
            `https://setup.icloud.com/setup/ws/1/accountLogin`,
            {
                dsWebAuthToken: Config.iCloudAuthSecrets.sessionSecret,
                trustToken: Config.trustToken,
            },
            {
                headers: expectedICloudSetupHeaders,
            },
        );
        await expect(icloud.ready).rejects.toThrow(/^Unable to setup iCloud Account$/);
    });

    test(`Receive invalid response during setup`, async () => {
        const icloud = iCloudFactory();
        icloud.auth.iCloudAuthSecrets.sessionSecret = Config.iCloudAuthSecrets.sessionSecret;

        icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
            status: 200,
            data: {},
            headers: getICloudCookieHeader(true),
        }));

        await icloud.setupAccount();

        expect(icloud.axios.post).toHaveBeenCalledWith(
            `https://setup.icloud.com/setup/ws/1/accountLogin`,
            {
                dsWebAuthToken: Config.iCloudAuthSecrets.sessionSecret,
                trustToken: Config.trustToken,
            },
            {
                headers: expectedICloudSetupHeaders,
            },
        );
        await expect(icloud.ready).rejects.toThrow(/^Unable to setup iCloud Account$/);
    });

    test(`Network failure`, async () => {
        const icloud = iCloudFactory();
        icloud.auth.iCloudAuthSecrets.sessionSecret = Config.iCloudAuthSecrets.sessionSecret;

        icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.reject(new Error(`Network down!`)));

        await icloud.setupAccount();

        expect(icloud.axios.post).toHaveBeenCalledWith(
            `https://setup.icloud.com/setup/ws/1/accountLogin`,
            {
                dsWebAuthToken: Config.iCloudAuthSecrets.sessionSecret,
                trustToken: Config.trustToken,
            },
            {
                headers: expectedICloudSetupHeaders,
            },
        );
        await expect(icloud.ready).rejects.toThrow(/^Unable to setup iCloud Account$/);
    });

    describe(`Get iCloud Photos Ready`, () => {
        test(`Get iCloud Photos Ready`, async () => {
            const icloud = iCloudFactory();
            icloud.auth.iCloudCookies = getICloudCookies();
            icloud.photos = new iCloudPhotos(icloud.auth);
            icloud.photos.setup = jest.fn(() => Promise.resolve());

            await icloud.getPhotosReady();

            expect(icloud.photos.listenerCount(HANDLER_EVENT)).toBe(1);
            await expect(icloud.ready).resolves.not.toThrow();

            expect(icloud.photos.listenerCount(ICLOUD_PHOTOS.EVENTS.READY)).toBe(1);
            expect(icloud.photos.setup).toHaveBeenCalled();
        });

        test(`Cookies invalid`, async () => {
            const icloud = iCloudFactory();
            icloud.auth.iCloudCookies = getICloudCookies(true);
            icloud.photos = new iCloudPhotos(icloud.auth);
            icloud.photos.setup = jest.fn(() => Promise.resolve());

            await icloud.getPhotosReady();

            await expect(icloud.ready).rejects.toThrow(/^Unable to get iCloud Photos service ready$/);
            expect(icloud.photos.setup).not.toHaveBeenCalled();
        });

        test(`Photos Object invalid`, async () => {
            const icloud = iCloudFactory();
            icloud.auth.iCloudCookies = getICloudCookies();

            await icloud.getPhotosReady();

            await expect(icloud.ready).rejects.toThrow(/^Unable to get iCloud Photos service ready$/);
        });
    });
});