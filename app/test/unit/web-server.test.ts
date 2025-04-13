
import {beforeEach, describe, expect, jest, test} from '@jest/globals';
import http from 'http';
import {iCPSError} from '../../src/app/error/error';
import {WEB_SERVER_ERR} from '../../src/app/error/error-codes';
import {WEB_SERVER_API_ENDPOINTS, WebServer} from '../../src/app/web-ui/web-server';
import {MFAMethod} from '../../src/lib/icloud/mfa/mfa-method';
import {iCPSEventCloud, iCPSEventMFA, iCPSEventRuntimeWarning, iCPSEventWebServer} from '../../src/lib/resources/events-types';
import {MockedEventManager, prepareResources} from '../_helpers/_general';

let server: WebServer;
let mockedEventManager: MockedEventManager;

const webserverURL = `http://localhost:80`;

function post(path: string, body?: any) {
    return fetch(`${webserverURL}${path}`, {
        method: `POST`,
        headers: {
            'Content-Type': `application/json`,
        },
        body: JSON.stringify(body),
    });
}

beforeEach(() => {
    mockedEventManager = prepareResources()!.event;
    server = WebServer.spawn();
});

describe(`MFA Code`, () => {
    beforeEach(() => {
        mockedEventManager.emit(iCPSEventCloud.MFA_REQUIRED);
    });

    test(`Valid Code format`, async () => {
        const code = `123456`;
        const mfaMethod = new MFAMethod(`device`);
        const mfaReceivedEvent = mockedEventManager.spyOnEvent(iCPSEventMFA.MFA_RECEIVED);

        const response = await post(WEB_SERVER_API_ENDPOINTS.CODE_INPUT + `?code=${code}`);

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toEqual({
            message: `Read MFA code: ${code}`,
        });

        expect(mfaReceivedEvent).toBeCalledWith(mfaMethod, code);
    });

    test(`Invalid code format`, async () => {
        const code = `123 456`;
        const warnEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.WEB_SERVER_ERROR);

        const response = await post(WEB_SERVER_API_ENDPOINTS.CODE_INPUT + `?code=${code}`);

        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body).toEqual({
            message: `Unexpected MFA code format! Expecting 6 digits`,
        });
        expect(warnEvent).toHaveBeenCalledWith(new Error(`Received unexpected MFA code format, expecting 6 digits`));
    });

    test(`Missing code`, async () => {
        const warnEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.WEB_SERVER_ERROR);

        const response = await post(WEB_SERVER_API_ENDPOINTS.CODE_INPUT);

        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body).toEqual({
            message: `Unexpected MFA code format! Expecting 6 digits`,
        });
        expect(warnEvent).toHaveBeenCalledWith(new Error(`Received unexpected MFA code format, expecting 6 digits`));
    });
});

describe(`MFA Resend`, () => {
    beforeEach(() => {
        mockedEventManager.emit(iCPSEventCloud.MFA_REQUIRED);
    });

    test(`In app resend`, async () => {
        const method = `device`;
        const mfaMethod = new MFAMethod(method);
        const mfaResendEvent = mockedEventManager.spyOnEvent(iCPSEventMFA.MFA_RESEND);

        const response = await post(WEB_SERVER_API_ENDPOINTS.RESEND_CODE + `?method=${method}`);

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toEqual({
            message: `Requesting MFA resend with method ${mfaMethod}`,
        });
        expect(mfaResendEvent).toBeCalledWith(mfaMethod);
    });

    describe.each([`sms`, `voice`])(`Phone number resend`, method => {
        test(`Default id`, async () => {
            const mfaMethod = new MFAMethod(method as `sms` | `voice`);
            const mfaResendEvent = mockedEventManager.spyOnEvent(iCPSEventMFA.MFA_RESEND);

            const response = await post(WEB_SERVER_API_ENDPOINTS.RESEND_CODE + `?method=${method}`);

            expect(response.status).toBe(200);
            const body = await response.json();
            expect(body).toEqual({
                message: `Requesting MFA resend with method ${mfaMethod}`,
            });
            expect(mfaResendEvent).toBeCalledWith(mfaMethod);
        });

        test(`Custom id`, async () => {
            const phoneNumberId = 3;
            const mfaMethod = new MFAMethod(method as `sms` | `voice`, phoneNumberId);
            const mfaResendEvent = mockedEventManager.spyOnEvent(iCPSEventMFA.MFA_RESEND);

            const response = await post(WEB_SERVER_API_ENDPOINTS.RESEND_CODE + `?method=${method}&phoneNumberId=${phoneNumberId}`);
            expect(response.status).toBe(200);
            const body = await response.json();
            expect(body).toEqual({
                message: `Requesting MFA resend with method ${mfaMethod}`,
            });
            expect(mfaResendEvent).toBeCalledWith(mfaMethod);
        });

        test(`Invalid id`, async () => {
            const phoneNumberId = `invalid`;
            const mfaMethod = new MFAMethod(method as `sms` | `voice`);
            const mfaResendEvent = mockedEventManager.spyOnEvent(iCPSEventMFA.MFA_RESEND);

            const response = await post(WEB_SERVER_API_ENDPOINTS.RESEND_CODE + `?method=${method}&phoneNumberId=${phoneNumberId}`);
            expect(response.status).toBe(200);
            const body = await response.json();
            expect(body).toEqual({
                message: `Requesting MFA resend with method ${mfaMethod}`,
            });
            expect(mfaResendEvent).toBeCalledWith(mfaMethod);
        });
    });

    test(`Invalid resend method`, async () => {
        const method = `invalid`;
        const warnEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.WEB_SERVER_ERROR);

        const response = await post(WEB_SERVER_API_ENDPOINTS.RESEND_CODE + `?method=${method}`);

        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body).toEqual({
            message: `Resend method does not match expected format`,
        });
        expect(warnEvent).toHaveBeenCalledWith(new Error(`Resend method does not match expected format`));
    });

    test(`Missing resend method`, async () => {
        const warnEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.WEB_SERVER_ERROR);

        const response = await post(WEB_SERVER_API_ENDPOINTS.RESEND_CODE);

        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body).toEqual({
            message: `Resend method does not match expected format`,
        });
        expect(warnEvent).toHaveBeenCalledWith(new Error(`Resend method does not match expected format`));
    });
});

describe(`Invalid requests`, () => {
    test(`PUT /invalid-route`, async () => {
        const method = `PUT`;
        const warnEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.WEB_SERVER_ERROR);

        const response = await fetch(`${webserverURL}/invalid-route`, {
            method
        })

        expect(response.status).toBe(405);
        const body = await response.json();
        expect(body).toEqual({
            message: `Method not supported: ${method}`,
        });
        expect(warnEvent).toHaveBeenCalledWith(new Error(`Received request with unsupported method`));
    });

    test(`POST /invalid`, async () => {
        const method = `/invalid`;
        const warnEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.WEB_SERVER_ERROR);

        const response = await fetch(`${webserverURL}${method}`, {
            method: `POST`
        })

        expect(response.status).toBe(404);
        const body = await response.json();
        expect(body).toEqual({
            message: `Route not found, available endpoints: ["/mfa","/resend_mfa","/reauthenticate","/sync"]`,
        });
        expect(warnEvent).toHaveBeenCalledWith(new Error(`Received request to unknown endpoint`));
    });
});

describe(`Server lifecycle`, () => {
    jest.useFakeTimers();
    test(`Startup Error`, () => {
        const spy = jest.spyOn(http, `createServer`).mockReturnValue({
            on: jest.fn(),
            listen: () => { throw new Error(`some server error`) },
            unref: jest.fn(),
        } as any);
        const errorEvent = mockedEventManager.spyOnEvent(iCPSEventWebServer.ERROR);

        const expectedError = new iCPSError(WEB_SERVER_ERR.STARTUP_FAILED).addCause(new Error(`some server error`))
        expect(() => WebServer.spawn()).toThrowError(expectedError);

        expect(errorEvent).toHaveBeenCalledWith(expectedError);
        spy.mockRestore();
    });

    test(`Handle unknown server error`, () => {
        const errorEvent = mockedEventManager.spyOnEvent(iCPSEventWebServer.ERROR);
        server.server.emit(`error`, new Error(`some server error`));

        expect(errorEvent).toHaveBeenCalledWith(new iCPSError(WEB_SERVER_ERR.SERVER_ERR));
    });

    test(`Handle address in use error`, () => {
        const errorEvent = mockedEventManager.spyOnEvent(iCPSEventWebServer.ERROR);
        const error = new Error(`Address in use`);
        (error as any).code = `EADDRINUSE`;
        server.server.emit(`error`, error);

        expect(errorEvent).toHaveBeenCalledWith(new iCPSError(WEB_SERVER_ERR.ADDR_IN_USE_ERR));
    });

    test(`Handle EACCES error`, () => {
        const errorEvent = mockedEventManager.spyOnEvent(iCPSEventWebServer.ERROR);
        const error = new Error(`No privileges`);
        (error as any).code = `EACCES`;
        server.server.emit(`error`, error);

        expect(errorEvent).toHaveBeenCalledWith(new iCPSError(WEB_SERVER_ERR.INSUFFICIENT_PRIVILEGES));
    });
});