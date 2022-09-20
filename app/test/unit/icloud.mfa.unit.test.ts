
import {expect, describe, test, jest} from '@jest/globals';
import {AxiosError, AxiosRequestConfig} from 'axios';
import {MFAMethod} from '../../src/lib/icloud/mfa/mfa-method';
import {expectedAxiosPost, expectedAxiosPut, iCloudFactory} from '../_helpers/icloud-mfa';
import {spyOnEvent} from '../_helpers/_general';
import * as ICLOUD from '../../src/lib/icloud/constants';

describe(`Unit Tests - iCloud - MFA Flow`, () => {
    describe(`Resend MFA`, () => {
        describe.each([new MFAMethod(`device`)])(`Device`, method => {
            test(`Resend MFA with ${method} - Success`, async () => {
                const icloud = iCloudFactory();

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

                icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.reject(new Error(`Unknown error`)));

                const errorEvent = spyOnEvent(icloud, ICLOUD.EVENTS.ERROR);

                await icloud.submitMFA(method, `123456`);

                expect(icloud.axios.post).toHaveBeenCalledWith(...expectedAxiosPost(method));
                expect(errorEvent).toHaveBeenCalledWith(`Received error during MFA validation: {"message":"Unknown error"}`);
            });

            test(`Enter MFA with ${method} - Send unsuccessful`, async () => {
                const icloud = iCloudFactory();

                icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
                    "status": 404,
                }));

                const errorEvent = spyOnEvent(icloud, ICLOUD.EVENTS.ERROR);

                await icloud.submitMFA(method, `123456`);

                expect(icloud.axios.post).toHaveBeenCalledWith(...expectedAxiosPost(method));
                expect(errorEvent).toHaveBeenCalledWith(`Received unexpected response code during MFA validation: 404 (undefined)`);
            });
        });

        describe.each([new MFAMethod(`voice`), new MFAMethod(`sms`)])(`Phone Number`, method => {
            test(`Enter MFA with ${method} - Success`, async () => {
                const icloud = iCloudFactory();

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

                icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.reject(new Error(`Unknown error`)));

                const errorEvent = spyOnEvent(icloud, ICLOUD.EVENTS.ERROR);

                await icloud.submitMFA(method, `123456`);

                expect(icloud.axios.post).toHaveBeenCalledWith(...expectedAxiosPost(method));
                expect(errorEvent).toHaveBeenCalledWith(`Received error during MFA validation: {"message":"Unknown error"}`);
            });

            test(`Enter MFA with ${method} - Send unsuccessful`, async () => {
                const icloud = iCloudFactory();

                icloud.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve({
                    "status": 404,
                }));

                const errorEvent = spyOnEvent(icloud, ICLOUD.EVENTS.ERROR);

                await icloud.submitMFA(method, `123456`);

                expect(icloud.axios.post).toHaveBeenCalledWith(...expectedAxiosPost(method));
                expect(errorEvent).toHaveBeenCalledWith(`Received unexpected response code during MFA validation: 404 (undefined)`);
            });
        });
    });
});