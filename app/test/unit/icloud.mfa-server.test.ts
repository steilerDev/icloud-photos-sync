
import {expect, describe, test, jest, beforeEach, afterEach} from '@jest/globals';
import {HANDLER_EVENT} from '../../src/app/event/error-handler';
import {EVENTS} from '../../src/lib/icloud/mfa/constants';
import {MFAMethod} from '../../src/lib/icloud/mfa/mfa-method';
import * as PACKAGE from '../../src/lib/package';
import {mfaServerFactory, requestFactory, responseFactory} from '../_helpers/mfa-server.helper';
import {prepareResourceManager, spyOnEvent} from '../_helpers/_general';
import {MFAServer, MFA_SERVER_ENDPOINTS, MFA_TIMEOUT_VALUE} from '../../src/lib/icloud/mfa/mfa-server';

let server: MFAServer;

beforeEach(() => {
    prepareResourceManager();
    server = new MFAServer();
});

describe(`MFA Code`, () => {
    test(`Valid Code format`, () => {
        const code = `123456`;
        const mfaMethod = new MFAMethod(`device`);

        server.sendResponse = jest.fn();
        const mfaReceivedEvent = spyOnEvent(server, EVENTS.MFA_RECEIVED);

        const req = requestFactory(`${MFA_SERVER_ENDPOINTS.CODE_INPUT}?code=${code}`);
        const res = responseFactory();

        server.handleMFACode(req, res);

        expect(server.sendResponse).toHaveBeenCalledWith(res, 200, `Read MFA code: ${code}`);
        expect(mfaReceivedEvent).toBeCalledWith(mfaMethod, code);
    });

    test(`Invalid code format`, () => {
        const code = `123 456`;

        server.sendResponse = jest.fn();
        const handlerEvent = spyOnEvent(server, HANDLER_EVENT);

        const req = requestFactory(`${MFA_SERVER_ENDPOINTS.CODE_INPUT}?code=${code}`);
        const res = responseFactory();

        server.handleMFACode(req, res);

        expect(server.sendResponse).toHaveBeenCalledWith(res, 400, `Unexpected MFA code format! Expecting 6 digits`);
        expect(handlerEvent).toHaveBeenCalledWith(new Error(`Received unexpected MFA code format, expecting 6 digits`));
    });
});

describe(`MFA Resend`, () => {
    test(`In app resend`, () => {
        const method = `device`;
        const mfaMethod = new MFAMethod(method);

        server.sendResponse = jest.fn();
        const mfaResendEvent = spyOnEvent(server, EVENTS.MFA_RESEND);

        const req = requestFactory(`${MFA_SERVER_ENDPOINTS.RESEND_CODE}?method=${method}`);
        const res = responseFactory();

        server.handleMFAResend(req, res);

        expect(server.sendResponse).toHaveBeenCalledWith(res, 200, `Requesting MFA resend with method ${mfaMethod}`);
        expect(mfaResendEvent).toBeCalledWith(mfaMethod);
    });

    describe.each([`sms`, `voice`])(`Phone number resend`, method => {
        test(`Default id`, () => {
            const mfaMethod = new MFAMethod(method as `sms` | `voice`);

            server.sendResponse = jest.fn();
            const mfaResendEvent = spyOnEvent(server, EVENTS.MFA_RESEND);

            const req = requestFactory(`${MFA_SERVER_ENDPOINTS.RESEND_CODE}?method=${method}`);
            const res = responseFactory();

            server.handleMFAResend(req, res);

            expect(server.sendResponse).toHaveBeenCalledWith(res, 200, `Requesting MFA resend with method ${mfaMethod}`);
            expect(mfaResendEvent).toBeCalledWith(mfaMethod);
        });

        test(`Custom id`, () => {
            const phoneNumberId = 3;
            const mfaMethod = new MFAMethod(method as `sms` | `voice`, phoneNumberId);

            server.sendResponse = jest.fn();
            const mfaResendEvent = spyOnEvent(server, EVENTS.MFA_RESEND);

            const req = requestFactory(`${MFA_SERVER_ENDPOINTS.RESEND_CODE}?method=${method}&phoneNumberId=${phoneNumberId}`);
            const res = responseFactory();

            server.handleMFAResend(req, res);

            expect(server.sendResponse).toHaveBeenCalledWith(res, 200, `Requesting MFA resend with method ${mfaMethod}`);
            expect(mfaResendEvent).toBeCalledWith(mfaMethod);
        });

        test(`Invalid id`, () => {
            const phoneNumberId = `invalid`;
            const mfaMethod = new MFAMethod(method as `sms` | `voice`);

            server.sendResponse = jest.fn();
            const mfaResendEvent = spyOnEvent(server, EVENTS.MFA_RESEND);

            const req = requestFactory(`${MFA_SERVER_ENDPOINTS.RESEND_CODE}?method=${method}&phoneNumberId=${phoneNumberId}`);
            const res = responseFactory();

            server.handleMFAResend(req, res);

            expect(server.sendResponse).toHaveBeenCalledWith(res, 200, `Requesting MFA resend with method ${mfaMethod}`);
            expect(mfaResendEvent).toBeCalledWith(mfaMethod);
        });
    });

    test(`Invalid resend method`, () => {
        const method = `invalid`;

        server.sendResponse = jest.fn();
        const handlerEvent = spyOnEvent(server, HANDLER_EVENT);

        const req = requestFactory(`${MFA_SERVER_ENDPOINTS.RESEND_CODE}?method=${method}`);
        const res = responseFactory();

        server.handleMFAResend(req, res);

        expect(server.sendResponse).toHaveBeenCalledWith(res, 400, `Resend method does not match expected format`);
        expect(handlerEvent).toHaveBeenCalledWith(new Error(`Resend method does not match expected format`));
    });
});

describe(`Request routing`, () => {
    test(`GET /`, () => {
        const req = requestFactory(`/`, `GET`);
        const res = responseFactory();

        server.sendResponse = jest.fn();
        server.handleMFAResend = jest.fn();
        server.handleMFACode = jest.fn();

        server.handleRequest(req, res);

        expect(server.sendResponse).toHaveBeenCalledWith(res, 200, `MFA Server up & running - ${PACKAGE.NAME}@v${PACKAGE.VERSION}`);
        expect(server.handleMFACode).not.toHaveBeenCalled();
        expect(server.handleMFAResend).not.toHaveBeenCalled();
    });

    test(`POST /ENDPOINT.CODE_INPUT`, () => {
        const req = requestFactory(`${MFA_SERVER_ENDPOINTS.CODE_INPUT}?testparam=abc`, `POST`);
        const res = responseFactory();

        server.sendResponse = jest.fn();
        server.handleMFAResend = jest.fn();
        server.handleMFACode = jest.fn();

        server.handleRequest(req, res);

        expect(server.handleMFACode).toHaveBeenCalledWith(req, res);
        expect(server.sendResponse).not.toHaveBeenCalled();
        expect(server.handleMFAResend).not.toHaveBeenCalled();
    });

    test(`POST /ENDPOINT.RESEND_CODE`, () => {
        const req = requestFactory(`${MFA_SERVER_ENDPOINTS.RESEND_CODE}?testparam=abc`, `POST`);
        const res = responseFactory();

        server.sendResponse = jest.fn();
        server.handleMFAResend = jest.fn();
        server.handleMFACode = jest.fn();

        server.handleRequest(req, res);

        expect(server.handleMFAResend).toHaveBeenCalledWith(req, res);
        expect(server.sendResponse).not.toHaveBeenCalled();
        expect(server.handleMFACode).not.toHaveBeenCalled();
    });

    test(`GET /invalid`, () => {
        const method = `GET`;
        const req = requestFactory(`/invalid`, method);
        const res = responseFactory();

        server.sendResponse = jest.fn();
        server.handleMFAResend = jest.fn();
        server.handleMFACode = jest.fn();
        const handlerEvent = spyOnEvent(server, HANDLER_EVENT);

        server.handleRequest(req, res);

        expect(server.sendResponse).toHaveBeenCalledWith(res, 400, `Method not supported: ${method}`);
        expect(handlerEvent).toHaveBeenCalledWith(new Error(`Received request with unsupported method`));
        expect(server.handleMFAResend).not.toHaveBeenCalled();
        expect(server.handleMFACode).not.toHaveBeenCalled();
    });

    test(`POST /invalid`, () => {
        const method = `/invalid`;
        const req = requestFactory(method, `POST`);
        const res = responseFactory();

        server.sendResponse = jest.fn();
        server.handleMFAResend = jest.fn();
        server.handleMFACode = jest.fn();
        const handlerEvent = spyOnEvent(server, HANDLER_EVENT);

        server.handleRequest(req, res);

        expect(server.sendResponse).toHaveBeenCalledWith(res, 404, `Route not found, available endpoints: ["/mfa","/resend_mfa"]`);
        expect(handlerEvent).toHaveBeenCalledWith(new Error(`Received request to unknown endpoint`));
        expect(server.handleMFAResend).not.toHaveBeenCalled();
        expect(server.handleMFACode).not.toHaveBeenCalled();
    });
});

describe(`Server lifecycle`, () => {
    jest.useFakeTimers();

    test(`Startup`, () => {
        server.server.listen = jest.fn() as any;

        server.startServer();
        expect((server.server.listen as any).mock.lastCall[0]).toEqual(80);
        expect(server.mfaTimeout).toBeDefined();
        clearTimeout(server.mfaTimeout);
    });

    test(`Shutdown`, () => {
        const closeFn = jest.fn() as any;
        server.server.close = closeFn;

        server.stopServer();
        expect(closeFn).toHaveBeenCalled();
        expect(server.server).toBeUndefined();
    });

    test(`Send response`, () => {
        const res = responseFactory();
        server.sendResponse(res, 200, `test`);
        expect(res.writeHead).toHaveBeenCalledWith(200, {"Content-Type": `application/json`});
        expect(res.end).toHaveBeenCalledWith(`{"message":"test"}`);
    });

    test(`Handle unknown server error`, () => {
        const handlerEvent = spyOnEvent(server, HANDLER_EVENT);
        server.server.emit(`error`, new Error(`some server error`));

        expect(handlerEvent).toHaveBeenCalledWith(new Error(`HTTP Server Error`));
    });

    test(`Handle address in use error`, () => {
        const handlerEvent = spyOnEvent(server, HANDLER_EVENT);
        const error = new Error(`Address in use`);
        (error as any).code = `EADDRINUSE`;
        server.server.emit(`error`, new Error(`Address in use`));

        expect(handlerEvent).toHaveBeenCalledWith(new Error(`HTTP Server Error`));
    });

    test(`Handle MFA timeout`, () => {
        server.server.listen = jest.fn() as any;
        server.stopServer = jest.fn();
        server.removeAllListeners(); // On listener event process.exit would be called

        const timeoutEvent = spyOnEvent(server, EVENTS.MFA_NOT_PROVIDED);

        server.startServer();

        // Not called on start server
        expect(timeoutEvent).not.toHaveBeenCalled();
        expect(server.stopServer).not.toHaveBeenCalled();

        // Advancing time slightly before timeout occurs
        jest.advanceTimersByTime(MFA_TIMEOUT_VALUE - 1);
        expect(timeoutEvent).not.toHaveBeenCalled();
        expect(server.stopServer).not.toHaveBeenCalled();

        // Timers should have been called now
        jest.advanceTimersByTime(2);
        expect(timeoutEvent).toHaveBeenCalledWith(new Error(`MFA server timeout (code needs to be provided within 10 minutes)`));
        expect(server.stopServer).toHaveBeenCalled();
    });
});