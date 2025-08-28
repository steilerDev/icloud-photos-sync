
import {afterEach, beforeEach, describe, expect, jest, test} from '@jest/globals';
import {iCPSError} from '../../src/app/error/error';
import {AUTH_ERR, MFA_ERR, WEB_SERVER_ERR} from '../../src/app/error/error-codes';
import {manifest} from '../../src/app/web-ui/manifest';
import {StateView} from '../../src/app/web-ui/view/state-view';
import type {WebServer as WebServerType} from '../../src/app/web-ui/web-server';
import {MFAMethod} from '../../src/lib/icloud/mfa/mfa-method';
import {iCPSEventCloud, iCPSEventMFA, iCPSEventRuntimeError, iCPSEventRuntimeWarning, iCPSEventSyncEngine, iCPSEventWebServer} from '../../src/lib/resources/events-types';
import {MockedEventManager, MockedResourceManager, prepareResources} from '../_helpers/_general';
import {MockedHttpServer, mockHttpServer} from '../_helpers/MockedHttpServer';
import type { PushSubscription } from 'web-push';

const {mockedHttpServer, createServerMock, WebServer, WEB_SERVER_API_ENDPOINTS} = await mockHttpServer();

jest.mock(`web-push`, () => ({
    setVapidDetails: jest.fn(),
    sendNotification: jest.fn(),
    WebPushError: jest.requireActual<any>(`web-push`).WebPushError
} as Partial<typeof webpush> as typeof webpush
));

const webpush = (await import(`web-push`)).default;

export let server: WebServerType;
let mockedEventManager: MockedEventManager;
let mockedResourceManager: MockedResourceManager;

beforeEach(async () => {
    const mockedResources = prepareResources()!
    mockedEventManager = mockedResources.event;
    mockedResourceManager = mockedResources.manager
    server = await WebServer.spawn();

    jest.clearAllMocks();
});

afterEach(async () => {
    await server.close();
});

describe(`MFA Code`, () => {
    beforeEach(() => {
        mockedEventManager.emit(iCPSEventSyncEngine.START);
        mockedEventManager.emit(iCPSEventCloud.MFA_REQUIRED);
    });

    test(`Valid Code format`, async () => {
        const code = `123456`;
        const mfaMethod = new MFAMethod(`device`);
        const mfaReceivedEvent = mockedEventManager.spyOnEvent(iCPSEventMFA.MFA_RECEIVED);

        const response = await mockedHttpServer().postJson(WEB_SERVER_API_ENDPOINTS.CODE_INPUT + `?code=${code}`);

        expect(response.statusCode).toBe(200);
        const body = await response._getJSONData();
        expect(body).toEqual({
            message: `Read MFA code: ${code}`,
        });

        expect(mfaReceivedEvent).toBeCalledWith(mfaMethod, code);
    });

    test(`Invalid code format`, async () => {
        const code = `123 456`;
        const warnEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.WEB_SERVER_ERROR);

        const response = await mockedHttpServer().postJson(WEB_SERVER_API_ENDPOINTS.CODE_INPUT + `?code=${code}`);

        expect(response.statusCode).toBe(400);
        const body = await response._getJSONData();
        expect(body).toEqual({
            message: `Unexpected MFA code format! Expecting 6 digits`,
        });
        expect(warnEvent).toHaveBeenCalledWith(new Error(`Received unexpected MFA code format, expecting 6 digits`));
    });

    test(`Missing code`, async () => {
        const warnEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.WEB_SERVER_ERROR);

        const response = await mockedHttpServer().postJson(WEB_SERVER_API_ENDPOINTS.CODE_INPUT);

        expect(response.statusCode).toBe(400);
        const body = await response._getJSONData();
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

        const response = await mockedHttpServer().postJson(WEB_SERVER_API_ENDPOINTS.RESEND_CODE + `?method=${method}`);

        expect(response.statusCode).toBe(200);
        const body = await response._getJSONData();
        expect(body).toEqual({
            message: `Requesting MFA resend with method ${mfaMethod}`,
        });
        expect(mfaResendEvent).toBeCalledWith(mfaMethod);
    });

    describe.each([`sms`, `voice`])(`Phone number resend`, method => {
        test(`Default id`, async () => {
            const mfaMethod = new MFAMethod(method as `sms` | `voice`);
            const mfaResendEvent = mockedEventManager.spyOnEvent(iCPSEventMFA.MFA_RESEND);

            const response = await mockedHttpServer().postJson(WEB_SERVER_API_ENDPOINTS.RESEND_CODE + `?method=${method}`);

            expect(response.statusCode).toBe(200);
            const body = await response._getJSONData();
            expect(body).toEqual({
                message: `Requesting MFA resend with method ${mfaMethod}`,
            });
            expect(mfaResendEvent).toBeCalledWith(mfaMethod);
        });

        test(`Custom id`, async () => {
            const phoneNumberId = 3;
            const mfaMethod = new MFAMethod(method as `sms` | `voice`, phoneNumberId);
            const mfaResendEvent = mockedEventManager.spyOnEvent(iCPSEventMFA.MFA_RESEND);

            const response = await mockedHttpServer().postJson(WEB_SERVER_API_ENDPOINTS.RESEND_CODE + `?method=${method}&phoneNumberId=${phoneNumberId}`);
            expect(response.statusCode).toBe(200);
            const body = await response._getJSONData();
            expect(body).toEqual({
                message: `Requesting MFA resend with method ${mfaMethod}`,
            });
            expect(mfaResendEvent).toBeCalledWith(mfaMethod);
        });

        test(`Invalid id`, async () => {
            const phoneNumberId = `invalid`;
            const mfaMethod = new MFAMethod(method as `sms` | `voice`);
            const mfaResendEvent = mockedEventManager.spyOnEvent(iCPSEventMFA.MFA_RESEND);

            const response = await mockedHttpServer().postJson(WEB_SERVER_API_ENDPOINTS.RESEND_CODE + `?method=${method}&phoneNumberId=${phoneNumberId}`);
            expect(response.statusCode).toBe(200);
            const body = await response._getJSONData();
            expect(body).toEqual({
                message: `Requesting MFA resend with method ${mfaMethod}`,
            });
            expect(mfaResendEvent).toBeCalledWith(mfaMethod);
        });
    });

    test(`Invalid resend method`, async () => {
        const method = `invalid`;
        const warnEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.WEB_SERVER_ERROR);

        const response = await mockedHttpServer().postJson(WEB_SERVER_API_ENDPOINTS.RESEND_CODE + `?method=${method}`);

        expect(response.statusCode).toBe(400);
        const body = await response._getJSONData();
        expect(body).toEqual({
            message: `Resend method does not match expected format`,
        });
        expect(warnEvent).toHaveBeenCalledWith(new Error(`Resend method does not match expected format`));
    });

    test(`Missing resend method`, async () => {
        const warnEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.WEB_SERVER_ERROR);

        const response = await mockedHttpServer().postJson(WEB_SERVER_API_ENDPOINTS.RESEND_CODE);

        expect(response.statusCode).toBe(400);
        const body = await response._getJSONData();
        expect(body).toEqual({
            message: `Resend method does not match expected format`,
        });
        expect(warnEvent).toHaveBeenCalledWith(new Error(`Resend method does not match expected format`));
    });
});

describe(`Reauthenticate`, () => {
    const reauthFactory = jest.fn<() => Promise<unknown>>()

    beforeEach(() => {
        reauthFactory.mockReturnValue(new Promise(() => { }));
        server[`triggerReauth`] = reauthFactory;
    });

    test(`Valid Reauthenticate`, async () => {
        const response = await mockedHttpServer().postJson(WEB_SERVER_API_ENDPOINTS.TRIGGER_REAUTH);

        expect(response.statusCode).toBe(200);
        const body = await response._getJSONData();
        expect(body).toEqual({
            message: `Reauthentication requested`
        });
    });
});

describe(`Sync`, () => {
    test(`Valid Sync`, async () => {
        const syncEvent = mockedEventManager.spyOnEvent(iCPSEventWebServer.SYNC_REQUESTED);

        const response = await mockedHttpServer().postJson(WEB_SERVER_API_ENDPOINTS.TRIGGER_SYNC);

        expect(response.statusCode).toBe(200);
        const body = await response._getJSONData();
        expect(body).toEqual({
            message: `Sync requested`
        });
        expect(syncEvent).toHaveBeenCalled();
    });
});

describe(`State`, () => {
    test(`State is initially unknown`, async () => {
        const response = await mockedHttpServer().getJson(WEB_SERVER_API_ENDPOINTS.STATE);

        expect(response.statusCode).toBe(200);
        const body = await response._getJSONData() as Record<string, unknown>;
        expect(body.state).toBe(`unknown`);
    });

    test(`is 'syncing' when sync was started`, async () => {
        mockedEventManager.emit(iCPSEventSyncEngine.START);

        const response = await mockedHttpServer().getJson(WEB_SERVER_API_ENDPOINTS.STATE);

        expect(response.statusCode).toBe(200);
        const body = await response._getJSONData() as Record<string, unknown>;
        expect(body.state).toBe(`syncing`);
    });

    test(`State is 'ok' when sync was finished`, async () => {
        mockedEventManager.emit(iCPSEventSyncEngine.DONE);

        const response = await mockedHttpServer().getJson(WEB_SERVER_API_ENDPOINTS.STATE);

        expect(response.statusCode).toBe(200);
        const body = await response._getJSONData() as Record<string, unknown>;
        expect(body.state).toBe(`ok`);
        const diff = Math.abs(Date.now() - new Date(body.stateTimestamp as string).getTime());
        expect(diff).toBeLessThan(1000);
    });

    test(`State is 'error' with corresponding error message when sync failed due to wrong credentials`, async () => {
        const error = new iCPSError(AUTH_ERR.UNAUTHORIZED);
        mockedEventManager.emit(iCPSEventRuntimeError.SCHEDULED_ERROR, error);

        const response = await mockedHttpServer().getJson(WEB_SERVER_API_ENDPOINTS.STATE);

        expect(response.statusCode).toBe(200);
        const body = await response._getJSONData() as Record<string, unknown>;
        expect(body.state).toBe(`error`);
        expect(body.errorMessage).toBe(`Your credentials seem to be invalid. Please check your iCloud credentials and try again.`);
        const diff = Math.abs(Date.now() - new Date(body.stateTimestamp as string).getTime());
        expect(diff).toBeLessThan(1000);
    });

    test(`State is 'error' with corresponding error message when sync failed due to MFA`, async () => {
        const error = new iCPSError(MFA_ERR.FAIL_ON_MFA);
        mockedEventManager.emit(iCPSEventRuntimeError.SCHEDULED_ERROR, error);

        const response = await mockedHttpServer().getJson(WEB_SERVER_API_ENDPOINTS.STATE);

        expect(response.statusCode).toBe(200);
        const body = await response._getJSONData() as Record<string, unknown>;
        expect(body.state).toBe(`error`);
        expect(body.errorMessage).toBe(`Multifactor authentication code required. Use the 'Renew Authentication' button to request and enter a new code.`);
        const diff = Math.abs(Date.now() - new Date(body.stateTimestamp as string).getTime());
        expect(diff).toBeLessThan(1000);
    });

    test(`State is 'error' with corresponding error message when sync failed due to other error`, async () => {
        const error = new iCPSError(WEB_SERVER_ERR.UNKNOWN_ERR);
        mockedEventManager.emit(iCPSEventRuntimeError.SCHEDULED_ERROR, error);

        const response = await mockedHttpServer().getJson(WEB_SERVER_API_ENDPOINTS.STATE);

        expect(response.statusCode).toBe(200);
        const body = await response._getJSONData() as Record<string, unknown>;
        expect(body.state).toBe(`error`);
        expect(body.errorMessage).toBe(`Unknown error`);
        const diff = Math.abs(Date.now() - new Date(body.stateTimestamp as string).getTime());
        expect(diff).toBeLessThan(1000);
    });

    test(`State is 'error' with error message from root cause when sync failed due to a nested error`, async () => {
        const error = new iCPSError(WEB_SERVER_ERR.UNKNOWN_ERR).addCause(new iCPSError(AUTH_ERR.UNAUTHORIZED));
        mockedEventManager.emit(iCPSEventRuntimeError.SCHEDULED_ERROR, error);

        const response = await mockedHttpServer().getJson(WEB_SERVER_API_ENDPOINTS.STATE);

        expect(response.statusCode).toBe(200);
        const body = await response._getJSONData() as Record<string, unknown>;
        expect(body.state).toBe(`error`);
        expect(body.errorMessage).toBe(`Your credentials seem to be invalid. Please check your iCloud credentials and try again.`);
        const diff = Math.abs(Date.now() - new Date(body.stateTimestamp as string).getTime());
        expect(diff).toBeLessThan(1000);
    });

    test(`'waitingForMfa' is set when MFA is required`, async () => {
        mockedEventManager.emit(iCPSEventSyncEngine.START);
        mockedEventManager.emit(iCPSEventCloud.MFA_REQUIRED);

        const response = await mockedHttpServer().getJson(WEB_SERVER_API_ENDPOINTS.STATE);

        expect(response.statusCode).toBe(200);
        const body = await response._getJSONData() as Record<string, unknown>;
        expect(body.waitingForMfa).toBe(true);
    });

    test(`'waitingForMfa' is not set when MFA was received`, async () => {
        mockedEventManager.emit(iCPSEventCloud.MFA_REQUIRED);
        mockedEventManager.emit(iCPSEventMFA.MFA_RECEIVED);

        const response = await mockedHttpServer().getJson(WEB_SERVER_API_ENDPOINTS.STATE);

        expect(response.statusCode).toBe(200);
        const body = await response._getJSONData() as Record<string, unknown>;
        expect(body.waitingForMfa).toBe(false);
    });

    test(`State is 'authenticating' when authentication was started`, async () => {
        mockedEventManager.emit(iCPSEventCloud.AUTHENTICATION_STARTED);

        const response = await mockedHttpServer().getJson(WEB_SERVER_API_ENDPOINTS.STATE);

        expect(response.statusCode).toBe(200);
        const body = await response._getJSONData() as Record<string, unknown>;
        expect(body.state).toBe(`authenticating`);
    });

    test(`State is 'reauthSuccess' when completed successfully`, async () => {
        server[`triggerReauth`] = jest.fn(() => Promise.resolve(true));

        await mockedHttpServer().postJson(WEB_SERVER_API_ENDPOINTS.TRIGGER_REAUTH);
        const response = await mockedHttpServer().getJson(WEB_SERVER_API_ENDPOINTS.STATE);

        expect(response.statusCode).toBe(200);
        const body = await response._getJSONData() as Record<string, unknown>;
        expect(body.state).toBe(`reauthSuccess`);
        const diff = Math.abs(Date.now() - new Date(body.stateTimestamp as string).getTime());
        expect(diff).toBeLessThan(1000);
    });

    test(`State is 'reauthError' with corresponding error message if mfa timed out`, async () => {
        server[`triggerReauth`] = jest.fn(() => Promise.resolve(false));

        await mockedHttpServer().postJson(WEB_SERVER_API_ENDPOINTS.TRIGGER_REAUTH);
        const response = await mockedHttpServer().getJson(WEB_SERVER_API_ENDPOINTS.STATE);

        expect(response.statusCode).toBe(200);
        const body = await response._getJSONData() as Record<string, unknown>;
        expect(body.state).toBe(`reauthError`);
        expect(body.errorMessage).toBe(`Multifactor authentication code not provided within timeout period. Use the 'Renew Authentication' button to request and enter a new code.`);
        const diff = Math.abs(Date.now() - new Date(body.stateTimestamp as string).getTime());
        expect(diff).toBeLessThan(1000);
    });

    test(`State is 'reauthError' with corresponding error message if reauth failed`, async () => {
        const error = new iCPSError(AUTH_ERR.UNAUTHORIZED);
        server[`triggerReauth`] = jest.fn(() => Promise.reject(error));

        await mockedHttpServer().postJson(WEB_SERVER_API_ENDPOINTS.TRIGGER_REAUTH);

        await Promise.resolve(); // wait one tick so the error state can be propagated
        const response = await mockedHttpServer().getJson(WEB_SERVER_API_ENDPOINTS.STATE);
        expect(response.statusCode).toBe(200);
        const body = await response._getJSONData() as Record<string, unknown>;
        expect(body.state).toBe(`reauthError`);
        expect(body.errorMessage).toBe(`Your credentials seem to be invalid. Please check your iCloud credentials and try again.`);
        const diff = Math.abs(Date.now() - new Date(body.stateTimestamp as string).getTime());
        expect(diff).toBeLessThan(1000);
    });
});

describe(`UI`, () => {
    test(`Redirects root to state view`, async () => {
        const response = await mockedHttpServer().getHtml(`/`);
        expect(response.statusCode).toBe(302);
        expect(response.getHeader(`location`)).toBe(`./state`);
    });

    test(`Redirects path with trailing slash to no trailing slash path`, async () => {
        const response = await mockedHttpServer().getHtml(`/state/`);
        expect(response.statusCode).toBe(301);
        expect(response.getHeader(`location`)).toBe(`/state`);
    });

    test(`State view`, async () => {
        const response = await mockedHttpServer().getHtml(`/state`);

        expect(response.statusCode).toBe(200);
        const body = await response._getData();
        expect(body).toBe(new StateView().asHtml());
    });

    test(`Resend MFA view`, async () => {
        mockedEventManager.emit(iCPSEventSyncEngine.START);
        mockedEventManager.emit(iCPSEventCloud.MFA_REQUIRED);
        const response = await mockedHttpServer().getHtml(`/request-mfa`);

        expect(response.statusCode).toBe(200);
        const body = await response._getData();
        expect(body).toContain(`Choose MFA Method`);
    });

    test(`Submit MFA view`, async () => {
        mockedEventManager.emit(iCPSEventSyncEngine.START);
        mockedEventManager.emit(iCPSEventCloud.MFA_REQUIRED);
        const response = await mockedHttpServer().getHtml(`/submit-mfa`);

        expect(response.statusCode).toBe(200);
        const body = await response._getData();
        expect(body).toContain(`Enter MFA Code`);
    });

    test(`redirects /request-mfa to state view when no MFA is required`, async () => {
        mockedEventManager.emit(iCPSEventMFA.MFA_RECEIVED);

        const response = await mockedHttpServer().getHtml(`/request-mfa?asdf`);

        expect(response.statusCode).toBe(302);
        expect(response.getHeader(`location`)).toBe(`./state`);
    });

    test(`redirects /request-mfa/ to state view when no MFA is required`, async () => {
        mockedEventManager.emit(iCPSEventMFA.MFA_RECEIVED);

        const response = await mockedHttpServer().getHtml(`/request-mfa?asdf`);

        expect(response.statusCode).toBe(302);
        expect(response.getHeader(`location`)).toBe(`./state`);
    });

    test(`redirects /submit-mfa to state view when no MFA is required`, async () => {
        mockedEventManager.emit(iCPSEventMFA.MFA_RECEIVED);

        const response = await mockedHttpServer().getHtml(`/submit-mfa`);

        expect(response.statusCode).toBe(302);
        expect(response.getHeader(`location`)).toBe(`./state`);
    });

    test(`redirects /submit-mfa to state view when no MFA is required`, async () => {
        mockedEventManager.emit(iCPSEventMFA.MFA_RECEIVED);

        const response = await mockedHttpServer().getHtml(`/submit-mfa`);

        expect(response.statusCode).toBe(302);
        expect(response.getHeader(`location`)).toBe(`./state`);
    });

    describe(`PWA Resources`, () => {
        test(`Serves manifest`, async () => {
            const response = await mockedHttpServer().getHtml(`/manifest.json`);
            expect(response.statusCode).toBe(200);
            const body = await response._getData();
            expect(body).toBe(JSON.stringify(manifest));
        });

        test(`Serves Icon`, async () => {
            const response = await mockedHttpServer().getHtml(`/icon.png`);
            expect(response.statusCode).toBe(200);
            const body = response._getBuffer();
            expect(body.length).toBeGreaterThan(0);
        });
    });

    describe(`Push Notifications`, () => {
        test(`adds device to subscribers`, async () => {
            const notificationCredentials = {
                endpoint: `exampl.com/push`,
                keys: {
                    p256dh: `the p256dh key`,
                    auth: `the auth key`
                }
            };
            await mockedHttpServer().postJson(WEB_SERVER_API_ENDPOINTS.SUBSCRIBE, notificationCredentials);

            expect(mockedResourceManager.notificationSubscriptions).toContainEqual(notificationCredentials)
        });

        test(`pushes notifications if state changes to error`, async () => {
            const fakeSubscription: PushSubscription = {
                endpoint: `https://example.com/push`,
                keys: {
                    p256dh: `fakeP256dh`,
                    auth: `fakeAuth`
                }
            };
            jest.spyOn(mockedResourceManager, `notificationSubscriptions`, `get`) .mockReturnValue([fakeSubscription]);

            mockedEventManager.emit(iCPSEventRuntimeError.SCHEDULED_ERROR, iCPSError.toiCPSError(AUTH_ERR.UNAUTHORIZED));

            expect(jest.mocked(webpush.sendNotification).mock.calls.length).toBe(1);
            const [subscription, payload] = jest.mocked(webpush.sendNotification).mock.calls[0];
            expect(subscription).toEqual(fakeSubscription);
            const parsedPayload = JSON.parse(payload as string);
            expect(parsedPayload).toEqual({
                state: `error`,
                waitingForMfa: false,
                stateTimestamp: expect.closeTo(Date.now(), -5),
                errorMessage: `Unknown error occurred`
            });
        });

        test(`pushes notifications if state changes to successful`, () => {
            const fakeSubscription: PushSubscription = {
                endpoint: `https://example.com/push`,
                keys: {
                    p256dh: `fakeP256dh`,
                    auth: `fakeAuth`
                }
            };
            jest.spyOn(mockedResourceManager, `notificationSubscriptions`, `get`).mockReturnValue([fakeSubscription]);

            mockedEventManager.emit(iCPSEventRuntimeError.SCHEDULED_ERROR, iCPSError.toiCPSError(AUTH_ERR.UNAUTHORIZED));
            mockedEventManager.emit(iCPSEventSyncEngine.DONE);

            expect(jest.mocked(webpush.sendNotification).mock.calls.length).toBe(2);
            const [subscription, payload] = jest.mocked(webpush.sendNotification).mock.calls[1];
            expect(subscription).toEqual(fakeSubscription);
            const parsedPayload = JSON.parse(payload as string);
            expect(parsedPayload).toEqual({
                state: `ok`,
                waitingForMfa: false,
                stateTimestamp: expect.closeTo(Date.now(), -5),
            });
        });

        test(`removes subscription if pushing fails with code 410`, async () => {
            const fakeSubscription: PushSubscription = {
                endpoint: `https://example.com/push`,
                keys: {
                    p256dh: `fakeP256dh`,
                    auth: `fakeAuth`
                }
            };
            jest.spyOn(mockedResourceManager, `notificationSubscriptions`, `get`).mockReturnValue([fakeSubscription]);
            jest.spyOn(mockedResourceManager, `removeNotificationSubscription`).mockImplementation(jest.fn());

            jest.mocked(webpush.sendNotification).mockRejectedValue(new webpush.WebPushError(`Gone`, 410, {}, `Gone`, fakeSubscription.endpoint));

            mockedEventManager.emit(iCPSEventRuntimeError.SCHEDULED_ERROR, iCPSError.toiCPSError(AUTH_ERR.UNAUTHORIZED));

            await new Promise(res => setTimeout(res));

            expect(jest.mocked(mockedResourceManager.removeNotificationSubscription)).toHaveBeenCalledWith(fakeSubscription);
        });
    });
});

describe(`Invalid requests`, () => {
    test(`PUT /invalid-route`, async () => {
        const method = `PUT`;
        const warnEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.WEB_SERVER_ERROR);

        const response = await mockedHttpServer().handle({
            url: `/invalid-route`,
            method
        })

        expect(response.statusCode).toBe(405);
        const body = await response._getJSONData();
        expect(body).toEqual({
            message: `Method not supported: ${method}`,
        });
        expect(warnEvent).toHaveBeenCalledWith(new Error(`Received request with unsupported method`));
    });

    test(`POST /invalid`, async () => {
        const endpoint = `/invalid`;
        const warnEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.WEB_SERVER_ERROR);

        const response = await mockedHttpServer().handle({
            url: endpoint,
            method: `POST`
        });

        expect(response.statusCode).toBe(404);
        const body = await response._getJSONData();
        expect(body).toEqual({
            message: `Route not found, available endpoints: ["/api/mfa","/api/reauthenticate","/api/resend_mfa","/api/state","/api/sync","/api/subscribe"]`,
        });
        expect(warnEvent).toHaveBeenCalledWith(new Error(`Received request to unknown endpoint`));
    });
});

describe(`Server lifecycle`, () => {
    test(`Startup Error`, async () => {
        createServerMock.mockImplementationOnce(() => {
            const server = new MockedHttpServer(() => { });
            server.listen = jest.fn(() => {
                throw new Error(`some server error`);
            });
            return server;
        })
        const errorEvent = mockedEventManager.spyOnEvent(iCPSEventWebServer.ERROR);

        const expectedError = new iCPSError(WEB_SERVER_ERR.STARTUP_FAILED).addCause(new Error(`some server error`))
        expect(() => WebServer.spawn()).rejects.toThrow(expectedError);

        expect(errorEvent).toHaveBeenCalledWith(expectedError);
    });

    test(`Handle unknown server error`, () => {
        const errorEvent = mockedEventManager.spyOnEvent(iCPSEventWebServer.ERROR);

        mockedHttpServer().emit(`error`, new Error(`some server error`));

        expect(errorEvent).toHaveBeenCalledWith(new iCPSError(WEB_SERVER_ERR.SERVER_ERR));
    });

    test(`Handle address in use error`, () => {
        const errorEvent = mockedEventManager.spyOnEvent(iCPSEventWebServer.ERROR);
        const error = new Error(`Address in use`);
        (error as any).code = `EADDRINUSE`;

        mockedHttpServer().emit(`error`, error);

        expect(errorEvent).toHaveBeenCalledWith(new iCPSError(WEB_SERVER_ERR.ADDR_IN_USE_ERR));
    });

    test(`Handle EACCES error`, () => {
        const errorEvent = mockedEventManager.spyOnEvent(iCPSEventWebServer.ERROR);
        const error = new Error(`No privileges`);
        (error as any).code = `EACCES`;

        mockedHttpServer().emit(`error`, error);

        expect(errorEvent).toHaveBeenCalledWith(new iCPSError(WEB_SERVER_ERR.INSUFFICIENT_PRIVILEGES));
    });
});