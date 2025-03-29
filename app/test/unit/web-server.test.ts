
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { iCPSError } from '../../src/app/error/error';
import { MFA_ERR } from '../../src/app/error/error-codes';
import { WEB_SERVER_API_ENDPOINTS, WebServer } from '../../src/app/web-ui/web-server';
import { MFAMethod } from '../../src/lib/icloud/mfa/mfa-method';
import { iCPSEventMFA, iCPSEventRuntimeWarning, iCPSEventWebServer } from '../../src/lib/resources/events-types';
import { MockedEventManager, prepareResources } from '../_helpers/_general';
import { requestFactory, responseFactory } from '../_helpers/mfa-server.helper';

let server: WebServer;
let mockedEventManager: MockedEventManager;

beforeEach(() => {
    mockedEventManager = prepareResources()!.event;
    server = new WebServer();
});

describe(`MFA Code`, () => {
    test(`Valid Code format`, () => {
        const code = `123456`;
        const mfaMethod = new MFAMethod(`device`);

        server.sendResponse = jest.fn<typeof server.sendResponse>();
        const mfaReceivedEvent = mockedEventManager.spyOnEvent(iCPSEventMFA.MFA_RECEIVED);

        const req = requestFactory(`${WEB_SERVER_API_ENDPOINTS.CODE_INPUT}?code=${code}`);
        const res = responseFactory();

        server.handleMFACode(req, res);

        expect(server.sendResponse).toHaveBeenCalledWith(res, 200, `Read MFA code: ${code}`);
        expect(mfaReceivedEvent).toBeCalledWith(mfaMethod, code);
    });

    test(`Invalid code format`, () => {
        const code = `123 456`;

        server.sendResponse = jest.fn<typeof server.sendResponse>();
        const warnEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.MFA_ERROR);

        const req = requestFactory(`${WEB_SERVER_API_ENDPOINTS.CODE_INPUT}?code=${code}`);
        const res = responseFactory();

        server.handleMFACode(req, res);

        expect(server.sendResponse).toHaveBeenCalledWith(res, 400, `Unexpected MFA code format! Expecting 6 digits`);
        expect(warnEvent).toHaveBeenCalledWith(new Error(`Received unexpected MFA code format, expecting 6 digits`));
    });
});

describe(`MFA Resend`, () => {
    beforeEach(() => {
        server.sendResponse = jest.fn<typeof server.sendResponse>();
    });

    test(`In app resend`, () => {
        const method = `device`;
        const mfaMethod = new MFAMethod(method);

        const mfaResendEvent = mockedEventManager.spyOnEvent(iCPSEventMFA.MFA_RESEND);

        const req = requestFactory(`${WEB_SERVER_API_ENDPOINTS.RESEND_CODE}?method=${method}`);
        const res = responseFactory();

        server.handleMFAResend(req, res);

        expect(server.sendResponse).toHaveBeenCalledWith(res, 200, `Requesting MFA resend with method ${mfaMethod}`);
        expect(mfaResendEvent).toBeCalledWith(mfaMethod);
    });

    describe.each([`sms`, `voice`])(`Phone number resend`, method => {
        test(`Default id`, () => {
            const mfaMethod = new MFAMethod(method as `sms` | `voice`);

            const mfaResendEvent = mockedEventManager.spyOnEvent(iCPSEventMFA.MFA_RESEND);

            const req = requestFactory(`${WEB_SERVER_API_ENDPOINTS.RESEND_CODE}?method=${method}`);
            const res = responseFactory();

            server.handleMFAResend(req, res);

            expect(server.sendResponse).toHaveBeenCalledWith(res, 200, `Requesting MFA resend with method ${mfaMethod}`);
            expect(mfaResendEvent).toBeCalledWith(mfaMethod);
        });

        test(`Custom id`, () => {
            const phoneNumberId = 3;
            const mfaMethod = new MFAMethod(method as `sms` | `voice`, phoneNumberId);

            server.sendResponse = jest.fn<typeof server.sendResponse>();
            const mfaResendEvent = mockedEventManager.spyOnEvent(iCPSEventMFA.MFA_RESEND);

            const req = requestFactory(`${WEB_SERVER_API_ENDPOINTS.RESEND_CODE}?method=${method}&phoneNumberId=${phoneNumberId}`);
            const res = responseFactory();

            server.handleMFAResend(req, res);

            expect(server.sendResponse).toHaveBeenCalledWith(res, 200, `Requesting MFA resend with method ${mfaMethod}`);
            expect(mfaResendEvent).toBeCalledWith(mfaMethod);
        });

        test(`Invalid id`, () => {
            const phoneNumberId = `invalid`;
            const mfaMethod = new MFAMethod(method as `sms` | `voice`);

            const mfaResendEvent = mockedEventManager.spyOnEvent(iCPSEventMFA.MFA_RESEND);

            const req = requestFactory(`${WEB_SERVER_API_ENDPOINTS.RESEND_CODE}?method=${method}&phoneNumberId=${phoneNumberId}`);
            const res = responseFactory();

            server.handleMFAResend(req, res);

            expect(server.sendResponse).toHaveBeenCalledWith(res, 200, `Requesting MFA resend with method ${mfaMethod}`);
            expect(mfaResendEvent).toBeCalledWith(mfaMethod);
        });
    });

    test(`Invalid resend method`, () => {
        const method = `invalid`;

        const warnEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.MFA_ERROR);

        const req = requestFactory(`${WEB_SERVER_API_ENDPOINTS.RESEND_CODE}?method=${method}`);
        const res = responseFactory();

        server.handleMFAResend(req, res);

        expect(server.sendResponse).toHaveBeenCalledWith(res, 400, `Resend method does not match expected format`);
        expect(warnEvent).toHaveBeenCalledWith(new Error(`Resend method does not match expected format`));
    });
});

describe(`Request routing`, () => {
    beforeEach(() => {
        server.sendResponse = jest.fn<typeof server.sendResponse>();
        server.handleMFAResend = jest.fn<typeof server.handleMFAResend>();
        server.handleMFACode = jest.fn<typeof server.handleMFACode>();
    });

    test(`POST /ENDPOINT.CODE_INPUT`, () => {
        const req = requestFactory(`${WEB_SERVER_API_ENDPOINTS.CODE_INPUT}?testparam=abc`, `POST`);
        const res = responseFactory();

        server.handleRequest(req, res);

        expect(server.handleMFACode).toHaveBeenCalledWith(req, res);
        expect(server.sendResponse).not.toHaveBeenCalled();
        expect(server.handleMFAResend).not.toHaveBeenCalled();
    });

    test(`POST /ENDPOINT.RESEND_CODE`, () => {
        const req = requestFactory(`${WEB_SERVER_API_ENDPOINTS.RESEND_CODE}?testparam=abc`, `POST`);
        const res = responseFactory();

        server.handleRequest(req, res);

        expect(server.handleMFAResend).toHaveBeenCalledWith(req, res);
        expect(server.sendResponse).not.toHaveBeenCalled();
        expect(server.handleMFACode).not.toHaveBeenCalled();
    });

    test(`PUT /invalid`, () => {
        const method = `PUT`;
        const req = requestFactory(`/invalid`, method);
        const res = responseFactory();

        const warnEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.MFA_ERROR);

        server.handleRequest(req, res);

        expect(server.sendResponse).toHaveBeenCalledWith(res, 400, `Method not supported: ${method}`);
        expect(warnEvent).toHaveBeenCalledWith(new Error(`Received request with unsupported method`));
        expect(server.handleMFAResend).not.toHaveBeenCalled();
        expect(server.handleMFACode).not.toHaveBeenCalled();
    });

    test(`POST /invalid`, () => {
        const method = `/invalid`;
        const req = requestFactory(method, `POST`);
        const res = responseFactory();

        const warnEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.MFA_ERROR);

        server.handleRequest(req, res);

        expect(server.sendResponse).toHaveBeenCalledWith(res, 404, `Route not found, available endpoints: ["/mfa","/resend_mfa"]`);
        expect(warnEvent).toHaveBeenCalledWith(new Error(`Received request to unknown endpoint`));
        expect(server.handleMFAResend).not.toHaveBeenCalled();
        expect(server.handleMFACode).not.toHaveBeenCalled();
    });
});

describe(`Server lifecycle`, () => {
    jest.useFakeTimers();

    test(`Startup`, () => {
        server.server.listen = jest.fn<typeof server.server.listen>() as any;

        server.startServer();
        expect((server.server.listen as any).mock.lastCall[0]).toEqual(80);
    });

    test(`Startup Error`, () => {
        server.server.listen = jest.fn<typeof server.server.listen>(() => {
            throw new Error(`some server error`);
        }) as any;

        const errorEvent = mockedEventManager.spyOnEvent(iCPSEventWebServer.ERROR);

        server.startServer();

        expect(errorEvent).toHaveBeenCalledWith(new iCPSError(MFA_ERR.STARTUP_FAILED));
    });

    test(`Send response`, () => {
        const res = responseFactory();
        server.sendResponse(res, 200, `test`);
        expect(res.writeHead).toHaveBeenCalledWith(200, {"Content-Type": `application/json`});
        expect(res.end).toHaveBeenCalledWith(`{"message":"test"}`);
    });

    test(`Handle unknown server error`, () => {
        const errorEvent = mockedEventManager.spyOnEvent(iCPSEventWebServer.ERROR);
        server.server.emit(`error`, new Error(`some server error`));

        expect(errorEvent).toHaveBeenCalledWith(new iCPSError(MFA_ERR.SERVER_ERR));
    });

    test(`Handle address in use error`, () => {
        const errorEvent = mockedEventManager.spyOnEvent(iCPSEventWebServer.ERROR);
        const error = new Error(`Address in use`);
        (error as any).code = `EADDRINUSE`;
        server.server.emit(`error`, error);

        expect(errorEvent).toHaveBeenCalledWith(new iCPSError(MFA_ERR.ADDR_IN_USE_ERR));
    });

    test(`Handle EACCES error`, () => {
        const errorEvent = mockedEventManager.spyOnEvent(iCPSEventWebServer.ERROR);
        const error = new Error(`No privileges`);
        (error as any).code = `EACCES`;
        server.server.emit(`error`, error);

        expect(errorEvent).toHaveBeenCalledWith(new iCPSError(MFA_ERR.INSUFFICIENT_PRIVILEGES));
    });
});