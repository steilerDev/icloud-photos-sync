
import {afterEach, beforeEach, describe, expect, jest, test} from '@jest/globals';
import http from 'http';
import {iCPSError} from '../../src/app/error/error';
import {AUTH_ERR, MFA_ERR, WEB_SERVER_ERR} from '../../src/app/error/error-codes';
import {StateView} from '../../src/app/web-ui/view/state-view';
import {WEB_SERVER_API_ENDPOINTS, WebServer} from '../../src/app/web-ui/web-server';
import {MFAMethod} from '../../src/lib/icloud/mfa/mfa-method';
import {iCPSEventCloud, iCPSEventMFA, iCPSEventRuntimeError, iCPSEventRuntimeWarning, iCPSEventSyncEngine, iCPSEventWebServer} from '../../src/lib/resources/events-types';
import {MockedEventManager, prepareResources} from '../_helpers/_general';

let server: WebServer;
let mockedEventManager: MockedEventManager;

const webserverURL = `http://localhost:80`;

function getHtml(path: string): Promise<Response> {
    return fetch(`${webserverURL}${path}`, {
        method: `GET`,
        headers: {
            'Content-Type': `text/html`,
        },
        redirect: `manual`,
    });
}

function getJson(path: string) {
    return fetch(`${webserverURL}${path}`, {
        method: `GET`,
        headers: {
            'Content-Type': `application/json`,
        },
    });
}

async function postJsonWithoutRetry(path: string, body?: any) {
    return fetch(`${webserverURL}${path}`, {
        method: `POST`,
        headers: {
            'Content-Type': `application/json`,
        },
        body: JSON.stringify(body)
    });
}

async function postJson(path: string, body?: any) {
    try{
        return await postJsonWithoutRetry(path, body);
    } catch (_error) {
        return await postJsonWithoutRetry(path, body);
    }
}

beforeEach(async () => {
    mockedEventManager = prepareResources()!.event;
    server = await WebServer.spawn();
});

afterEach(async () => {
    await server.close();
});

describe(`MFA Code`, () => {
    beforeEach(() => {
        mockedEventManager.emit(iCPSEventCloud.MFA_REQUIRED);
    });

    test(`Valid Code format`, async () => {
        const code = `123456`;
        const mfaMethod = new MFAMethod(`device`);
        const mfaReceivedEvent = mockedEventManager.spyOnEvent(iCPSEventMFA.MFA_RECEIVED);

        const response = await postJson(WEB_SERVER_API_ENDPOINTS.CODE_INPUT + `?code=${code}`);

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

        const response = await postJson(WEB_SERVER_API_ENDPOINTS.CODE_INPUT + `?code=${code}`);

        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body).toEqual({
            message: `Unexpected MFA code format! Expecting 6 digits`,
        });
        expect(warnEvent).toHaveBeenCalledWith(new Error(`Received unexpected MFA code format, expecting 6 digits`));
    });

    test(`Missing code`, async () => {
        const warnEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.WEB_SERVER_ERROR);

        const response = await postJson(WEB_SERVER_API_ENDPOINTS.CODE_INPUT);

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

        const response = await postJson(WEB_SERVER_API_ENDPOINTS.RESEND_CODE + `?method=${method}`);

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

            const response = await postJson(WEB_SERVER_API_ENDPOINTS.RESEND_CODE + `?method=${method}`);

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

            const response = await postJson(WEB_SERVER_API_ENDPOINTS.RESEND_CODE + `?method=${method}&phoneNumberId=${phoneNumberId}`);
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

            const response = await postJson(WEB_SERVER_API_ENDPOINTS.RESEND_CODE + `?method=${method}&phoneNumberId=${phoneNumberId}`);
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

        const response = await postJson(WEB_SERVER_API_ENDPOINTS.RESEND_CODE + `?method=${method}`);

        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body).toEqual({
            message: `Resend method does not match expected format`,
        });
        expect(warnEvent).toHaveBeenCalledWith(new Error(`Resend method does not match expected format`));
    });

    test(`Missing resend method`, async () => {
        const warnEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.WEB_SERVER_ERROR);

        const response = await postJson(WEB_SERVER_API_ENDPOINTS.RESEND_CODE);

        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body).toEqual({
            message: `Resend method does not match expected format`,
        });
        expect(warnEvent).toHaveBeenCalledWith(new Error(`Resend method does not match expected format`));
    });
});

describe(`Reauthenticate`, () => {
    const reauthFactory = jest.fn<() => Promise<unknown>>()

    beforeEach(() => {
        reauthFactory.mockReturnValue(new Promise(() => {}));
        server[`triggerReauth`] = reauthFactory;
    });

    test(`Valid Reauthenticate`, async () => {
        const response = await postJson(WEB_SERVER_API_ENDPOINTS.TRIGGER_REAUTH);

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toEqual({
            message: `Reauthentication requested`
        });
    });
});

describe(`Sync`, () => {
    test(`Valid Sync`, async () => {
        const syncEvent = mockedEventManager.spyOnEvent(iCPSEventWebServer.SYNC_REQUESTED);

        const response = await postJson(WEB_SERVER_API_ENDPOINTS.TRIGGER_SYNC);

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toEqual({
            message: `Sync requested`
        });
        expect(syncEvent).toHaveBeenCalled();
    });
});

describe(`State`, () => {
    test(`State is initially unknown`, async () => {
        const response = await getJson(WEB_SERVER_API_ENDPOINTS.STATE);

        expect(response.status).toBe(200);
        const body = await response.json() as Record<string, unknown>;
        expect(body.state).toBe(`unknown`);
    });

    test(`is 'syncing' when sync was started`, async () => {
        mockedEventManager.emit(iCPSEventSyncEngine.START);

        const response = await getJson(WEB_SERVER_API_ENDPOINTS.STATE);

        expect(response.status).toBe(200);
        const body = await response.json() as Record<string, unknown>;
        expect(body.state).toBe(`syncing`);
    });

    test(`State is 'ok' when sync was finished`, async () => {
        mockedEventManager.emit(iCPSEventSyncEngine.DONE);

        const response = await getJson(WEB_SERVER_API_ENDPOINTS.STATE);

        expect(response.status).toBe(200);
        const body = await response.json() as Record<string, unknown>;
        expect(body.state).toBe(`ok`);
        const diff = Math.abs(Date.now() - new Date(body.stateTimestamp as string).getTime());
        expect(diff).toBeLessThan(1000);
    });

    test(`State is 'error' with corresponding error message when sync failed due to wrong credentials`, async () => {
        const error = new iCPSError(AUTH_ERR.UNAUTHORIZED);
        mockedEventManager.emit(iCPSEventRuntimeError.SCHEDULED_ERROR, error);

        const response = await getJson(WEB_SERVER_API_ENDPOINTS.STATE);

        expect(response.status).toBe(200);
        const body = await response.json() as Record<string, unknown>;
        expect(body.state).toBe(`error`);
        expect(body.errorMessage).toBe(`Your credentials seem to be invalid. Please check your iCloud credentials and try again.`);
        const diff = Math.abs(Date.now() - new Date(body.stateTimestamp as string).getTime());
        expect(diff).toBeLessThan(1000);
    });

    test(`State is 'error' with corresponding error message when sync failed due to MFA`, async () => {
        const error = new iCPSError(MFA_ERR.FAIL_ON_MFA);
        mockedEventManager.emit(iCPSEventRuntimeError.SCHEDULED_ERROR, error);

        const response = await getJson(WEB_SERVER_API_ENDPOINTS.STATE);

        expect(response.status).toBe(200);
        const body = await response.json() as Record<string, unknown>;
        expect(body.state).toBe(`error`);
        expect(body.errorMessage).toBe(`Multifactor authentication code required. Use the 'Renew Authentication' button to request and enter a new code.`);
        const diff = Math.abs(Date.now() - new Date(body.stateTimestamp as string).getTime());
        expect(diff).toBeLessThan(1000);
    });

    test(`State is 'error' with corresponding error message when sync failed due to other error`, async () => {
        const error = new iCPSError(WEB_SERVER_ERR.UNKNOWN_ERR);
        mockedEventManager.emit(iCPSEventRuntimeError.SCHEDULED_ERROR, error);

        const response = await getJson(WEB_SERVER_API_ENDPOINTS.STATE);

        expect(response.status).toBe(200);
        const body = await response.json() as Record<string, unknown>;
        expect(body.state).toBe(`error`);
        expect(body.errorMessage).toBe(`Unknown error`);
        const diff = Math.abs(Date.now() - new Date(body.stateTimestamp as string).getTime());
        expect(diff).toBeLessThan(1000);
    });

    test(`State is 'error' with error message from root cause when sync failed due to a nested error`, async () => {
        const error = new iCPSError(WEB_SERVER_ERR.UNKNOWN_ERR).addCause(new iCPSError(AUTH_ERR.UNAUTHORIZED));
        mockedEventManager.emit(iCPSEventRuntimeError.SCHEDULED_ERROR, error);

        const response = await getJson(WEB_SERVER_API_ENDPOINTS.STATE);

        expect(response.status).toBe(200);
        const body = await response.json() as Record<string, unknown>;
        expect(body.state).toBe(`error`);
        expect(body.errorMessage).toBe(`Your credentials seem to be invalid. Please check your iCloud credentials and try again.`);
        const diff = Math.abs(Date.now() - new Date(body.stateTimestamp as string).getTime());
        expect(diff).toBeLessThan(1000);
    });

    test(`'waitingForMfa' is set when MFA is required`, async () => {
        mockedEventManager.emit(iCPSEventCloud.MFA_REQUIRED);

        const response = await getJson(WEB_SERVER_API_ENDPOINTS.STATE);

        expect(response.status).toBe(200);
        const body = await response.json() as Record<string, unknown>;
        expect(body.waitingForMfa).toBe(true);
    });

    test(`'waitingForMfa' is not set when MFA was received`, async () => {
        mockedEventManager.emit(iCPSEventCloud.MFA_REQUIRED);
        mockedEventManager.emit(iCPSEventMFA.MFA_RECEIVED);

        const response = await getJson(WEB_SERVER_API_ENDPOINTS.STATE);

        expect(response.status).toBe(200);
        const body = await response.json() as Record<string, unknown>;
        expect(body.waitingForMfa).toBe(false);
    });

    test(`State is 'authenticating' when authentication was started`, async () => {
        mockedEventManager.emit(iCPSEventCloud.AUTHENTICATION_STARTED);

        const response = await getJson(WEB_SERVER_API_ENDPOINTS.STATE);

        expect(response.status).toBe(200);
        const body = await response.json() as Record<string, unknown>;
        expect(body.state).toBe(`authenticating`);
    });

    test(`State is 'reauthSuccess' when completed successfully`, async () => {
        server[`triggerReauth`] = jest.fn(() => Promise.resolve(true));

        await postJson(WEB_SERVER_API_ENDPOINTS.TRIGGER_REAUTH);
        const response = await getJson(WEB_SERVER_API_ENDPOINTS.STATE);

        expect(response.status).toBe(200);
        const body = await response.json() as Record<string, unknown>;
        expect(body.state).toBe(`reauthSuccess`);
        const diff = Math.abs(Date.now() - new Date(body.stateTimestamp as string).getTime());
        expect(diff).toBeLessThan(1000);
    });

    test(`State is 'reauthError' with corresponding error message if mfa timed out`, async () => {
        server[`triggerReauth`] = jest.fn(() => Promise.resolve(false));
    
        await postJson(WEB_SERVER_API_ENDPOINTS.TRIGGER_REAUTH);
        const response = await getJson(WEB_SERVER_API_ENDPOINTS.STATE);

        expect(response.status).toBe(200);
        const body = await response.json() as Record<string, unknown>;
        expect(body.state).toBe(`reauthError`);
        expect(body.errorMessage).toBe(`Multifactor authentication code not provided within timeout period. Use the 'Renew Authentication' button to request and enter a new code.`);
        const diff = Math.abs(Date.now() - new Date(body.stateTimestamp as string).getTime());
        expect(diff).toBeLessThan(1000);
    });

    test(`State is 'reauthError' with corresponding error message if reauth failed`, async () => {
        const error = new iCPSError(AUTH_ERR.UNAUTHORIZED);
        server[`triggerReauth`] = jest.fn(() => Promise.reject(error));
    
        await postJson(WEB_SERVER_API_ENDPOINTS.TRIGGER_REAUTH);
        const response = await getJson(WEB_SERVER_API_ENDPOINTS.STATE);

        expect(response.status).toBe(200);
        const body = await response.json() as Record<string, unknown>;
        expect(body.state).toBe(`reauthError`);
        expect(body.errorMessage).toBe(`Your credentials seem to be invalid. Please check your iCloud credentials and try again.`);
        const diff = Math.abs(Date.now() - new Date(body.stateTimestamp as string).getTime());
        expect(diff).toBeLessThan(1000);
    });
});

describe(`UI`, () => {
    test(`State view`, async () => {
        // i have no clue why, but the postJson request in the reauth tests above somehow make the requests in the following tests fail with econnreset
        while(true) {
            try{
                await getHtml(`/`);
                break;
            } catch(_error) { 
                // do nothing
            }
        }
        const response = await getHtml(`/`);

        expect(response.status).toBe(200);
        const body = await response.text();
        expect(body).toBe(new StateView().asHtml());
    });

    test(`Resend MFA view`, async () => {
        mockedEventManager.emit(iCPSEventCloud.MFA_REQUIRED);
        const response = await getHtml(`/request-mfa`);

        expect(response.status).toBe(200);
        const body = await response.text();
        expect(body).toContain(`Choose MFA Method`);
    });

    test(`Submit MFA view`, async () => {
        mockedEventManager.emit(iCPSEventCloud.MFA_REQUIRED);
        const response = await getHtml(`/submit-mfa`);

        expect(response.status).toBe(200);
        const body = await response.text();
        expect(body).toContain(`Enter MFA Code`);
    });

    test(`redirects /submit-mfa to state view when no MFA is required`, async () => {
        mockedEventManager.emit(iCPSEventMFA.MFA_RECEIVED);

        const response = await getHtml(`/request-mfa?asdf`);

        expect(response.status).toBe(302);
        expect(response.headers.get(`location`)).toBe(`/`);
    });

    test(`redirects /request-mfa to state view when no MFA is required`, async () => {
        mockedEventManager.emit(iCPSEventMFA.MFA_RECEIVED);

        const response = await getHtml(`/submit-mfa`);

        expect(response.status).toBe(302);
        expect(response.headers.get(`location`)).toBe(`/`);
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
            message: `Route not found, available endpoints: ["/mfa","/reauthenticate","/resend_mfa","/state","/sync"]`,
        });
        expect(warnEvent).toHaveBeenCalledWith(new Error(`Received request to unknown endpoint`));
    });
});

describe(`Server lifecycle`, () => {
    test(`Startup Error`, () => {
        const spy = jest.spyOn(http, `createServer`).mockReturnValue({
            on: jest.fn(),
            listen: () => { throw new Error(`some server error`) },
            unref: jest.fn(),
        } as any);
        const errorEvent = mockedEventManager.spyOnEvent(iCPSEventWebServer.ERROR);

        try{
            const expectedError = new iCPSError(WEB_SERVER_ERR.STARTUP_FAILED).addCause(new Error(`some server error`))
            expect(() => WebServer.spawn()).rejects.toThrow(expectedError);

            expect(errorEvent).toHaveBeenCalledWith(expectedError);
        } finally {
            spy.mockRestore();
        }
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