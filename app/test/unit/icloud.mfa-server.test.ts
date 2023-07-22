
import {expect, describe, test, jest, beforeEach, afterEach} from '@jest/globals';
import {HANDLER_EVENT} from '../../src/app/event/error-handler';
import {EVENTS, ENDPOINT} from '../../src/lib/icloud/mfa/constants';
import {MFAMethod} from '../../src/lib/icloud/mfa/mfa-method';
import * as PACKAGE from '../../src/lib/package';
import {mfaServerFactory, requestFactory, responseFactory} from '../_helpers/mfa-server.helper';
import {prepareResourceManager, spyOnEvent} from '../_helpers/_general';
import {MFA_TIMEOUT_VALUE} from '../../src/lib/icloud/mfa/mfa-server';

beforeEach(() => {
    prepareResourceManager();
});

describe(`MFA Code`, () => {
    test(`Valid Code format`, () => {
        const code = `123456`;
        const mfaMethod = new MFAMethod(`device`);

        const server = mfaServerFactory();
        server.sendResponse = jest.fn();
        const mfaReceivedEvent = spyOnEvent(server, EVENTS.MFA_RECEIVED);

        const req = requestFactory(`${ENDPOINT.CODE_INPUT}?code=${code}`);
        const res = responseFactory();

        server.handleMFACode(req, res);

        expect(server.sendResponse).toHaveBeenCalledWith(res, 200, `Read MFA code: ${code}`);
        expect(mfaReceivedEvent).toBeCalledWith(mfaMethod, code);
    });

    test(`Invalid code format`, () => {
        const code = `123 456`;

        const server = mfaServerFactory();
        server.sendResponse = jest.fn();
        const handlerEvent = spyOnEvent(server, HANDLER_EVENT);

        const req = requestFactory(`${ENDPOINT.CODE_INPUT}?code=${code}`);
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

        const server = mfaServerFactory();
        server.sendResponse = jest.fn();
        const mfaResendEvent = spyOnEvent(server, EVENTS.MFA_RESEND);

        const req = requestFactory(`${ENDPOINT.RESEND_CODE}?method=${method}`);
        const res = responseFactory();

        server.handleMFAResend(req, res);

        expect(server.sendResponse).toHaveBeenCalledWith(res, 200, `Requesting MFA resend with method ${mfaMethod}`);
        expect(mfaResendEvent).toBeCalledWith(mfaMethod);
    });

    describe.each([`sms`, `voice`])(`Phone number resend`, method => {
        test(`Default id`, () => {
            const mfaMethod = new MFAMethod(method as `sms` | `voice`);

            const server = mfaServerFactory();
            server.sendResponse = jest.fn();
            const mfaResendEvent = spyOnEvent(server, EVENTS.MFA_RESEND);

            const req = requestFactory(`${ENDPOINT.RESEND_CODE}?method=${method}`);
            const res = responseFactory();

            server.handleMFAResend(req, res);

            expect(server.sendResponse).toHaveBeenCalledWith(res, 200, `Requesting MFA resend with method ${mfaMethod}`);
            expect(mfaResendEvent).toBeCalledWith(mfaMethod);
        });

        test(`Custom id`, () => {
            const phoneNumberId = 3;
            const mfaMethod = new MFAMethod(method as `sms` | `voice`, phoneNumberId);

            const server = mfaServerFactory();
            server.sendResponse = jest.fn();
            const mfaResendEvent = spyOnEvent(server, EVENTS.MFA_RESEND);

            const req = requestFactory(`${ENDPOINT.RESEND_CODE}?method=${method}&phoneNumberId=${phoneNumberId}`);
            const res = responseFactory();

            server.handleMFAResend(req, res);

            expect(server.sendResponse).toHaveBeenCalledWith(res, 200, `Requesting MFA resend with method ${mfaMethod}`);
            expect(mfaResendEvent).toBeCalledWith(mfaMethod);
        });

        test(`Invalid id`, () => {
            const phoneNumberId = `invalid`;
            const mfaMethod = new MFAMethod(method as `sms` | `voice`);

            const server = mfaServerFactory();
            server.sendResponse = jest.fn();
            const mfaResendEvent = spyOnEvent(server, EVENTS.MFA_RESEND);

            const req = requestFactory(`${ENDPOINT.RESEND_CODE}?method=${method}&phoneNumberId=${phoneNumberId}`);
            const res = responseFactory();

            server.handleMFAResend(req, res);

            expect(server.sendResponse).toHaveBeenCalledWith(res, 200, `Requesting MFA resend with method ${mfaMethod}`);
            expect(mfaResendEvent).toBeCalledWith(mfaMethod);
        });
    });

    test(`Invalid resend method`, () => {
        const method = `invalid`;

        const server = mfaServerFactory();
        server.sendResponse = jest.fn();
        const handlerEvent = spyOnEvent(server, HANDLER_EVENT);

        const req = requestFactory(`${ENDPOINT.RESEND_CODE}?method=${method}`);
        const res = responseFactory();

        server.handleMFAResend(req, res);

        expect(server.sendResponse).toHaveBeenCalledWith(res, 400, `Resend method does not match expected format`);
        expect(handlerEvent).toHaveBeenCalledWith(new Error(`Resend method does not match expected format`));
    });

    describe(`Process resend errors`, () => {
        describe.each([`sms`, `voice`, `device`])(`Common errors`, method => {
            test(`Unknown error`, () => {
                const mfaMethod = new MFAMethod(method as `sms` | `voice` | `device`);
                expect(mfaMethod.processResendError(new Error())).toEqual(new Error(`No response received`));
            });

            test(`Timeout`, () => {
                const mfaMethod = new MFAMethod(method as `sms` | `voice` | `device`);
                const error = {
                    name: `AxiosError`,
                    response: {
                        status: 403,
                    },
                };
                expect(mfaMethod.processResendError(error)).toEqual(new Error(`iCloud timeout`));
            });

            test(`No response data`, () => {
                const mfaMethod = new MFAMethod(method as `sms` | `voice` | `device`);
                const error = {
                    name: `AxiosError`,
                    response: {
                        status: 412,
                    },
                };
                expect(mfaMethod.processResendError(error)).toEqual(new Error(`Precondition Failed (412) with no response`));
            });

            test(`Unexpected status code`, () => {
                const mfaMethod = new MFAMethod(method as `sms` | `voice` | `device`);
                const error = {
                    name: `AxiosError`,
                    response: {
                        status: 500,
                    },
                };
                expect(mfaMethod.processResendError(error)).toEqual(new Error(`Unknown error, while trying to resend MFA code`));
            });
        });

        describe.each([`sms`, `voice`])(`Phone errors`, method => {
            test(`No trusted phone numbers`, () => {
                const mfaMethod = new MFAMethod(method as `sms` | `voice` | `device`);
                const error = {
                    name: `AxiosError`,
                    response: {
                        status: 412,
                        data: {},
                    },
                };
                expect(mfaMethod.processResendError(error)).toEqual(new Error(`No trusted phone numbers registered`));
            });

            test(`Phone number ID does not exist`, () => {
                const mfaMethod = new MFAMethod(method as `sms` | `voice` | `device`);
                const error = {
                    name: `AxiosError`,
                    response: {
                        status: 412,
                        data: {
                            trustedPhoneNumbers: [
                                {
                                    id: 2,
                                    numberWithDialCode: `+49-123-456`,
                                },
                                {
                                    id: 3,
                                    numberWithDialCode: `+49-789-123`,
                                },
                            ],
                        },
                    },
                };
                expect(mfaMethod.processResendError(error)).toEqual(new Error(`Selected Phone Number ID does not exist.`));
            });
        });
    });
});

describe(`Request routing`, () => {
    test(`GET /`, () => {
        const req = requestFactory(`/`, `GET`);
        const res = responseFactory();

        const server = mfaServerFactory();
        server.sendResponse = jest.fn();
        server.handleMFAResend = jest.fn();
        server.handleMFACode = jest.fn();

        server.handleRequest(req, res);

        expect(server.sendResponse).toHaveBeenCalledWith(res, 200, `MFA Server up & running - ${PACKAGE.NAME}@v${PACKAGE.VERSION}`);
        expect(server.handleMFACode).not.toHaveBeenCalled();
        expect(server.handleMFAResend).not.toHaveBeenCalled();
    });

    test(`POST /ENDPOINT.CODE_INPUT`, () => {
        const req = requestFactory(`${ENDPOINT.CODE_INPUT}?testparam=abc`, `POST`);
        const res = responseFactory();

        const server = mfaServerFactory();
        server.sendResponse = jest.fn();
        server.handleMFAResend = jest.fn();
        server.handleMFACode = jest.fn();

        server.handleRequest(req, res);

        expect(server.handleMFACode).toHaveBeenCalledWith(req, res);
        expect(server.sendResponse).not.toHaveBeenCalled();
        expect(server.handleMFAResend).not.toHaveBeenCalled();
    });

    test(`POST /ENDPOINT.RESEND_CODE`, () => {
        const req = requestFactory(`${ENDPOINT.RESEND_CODE}?testparam=abc`, `POST`);
        const res = responseFactory();

        const server = mfaServerFactory();
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

        const server = mfaServerFactory();
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

        const server = mfaServerFactory();
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
        const server = mfaServerFactory();
        server.server.listen = jest.fn() as any;

        server.startServer();
        expect((server.server.listen as any).mock.lastCall[0]).toEqual(80);
        expect(server.mfaTimeout).toBeDefined();
        clearTimeout(server.mfaTimeout);
    });

    test(`Shutdown`, () => {
        const server = mfaServerFactory();
        const closeFn = jest.fn() as any;
        server.server.close = closeFn;

        server.stopServer();
        expect(closeFn).toHaveBeenCalled();
        expect(server.server).toBeUndefined();
    });

    test(`Send response`, () => {
        const res = responseFactory();
        const server = mfaServerFactory();
        server.sendResponse(res, 200, `test`);
        expect(res.writeHead).toHaveBeenCalledWith(200, {"Content-Type": `application/json`});
        expect(res.end).toHaveBeenCalledWith(`{"message":"test"}`);
    });

    test(`Handle unknown server error`, () => {
        const server = mfaServerFactory();
        const handlerEvent = spyOnEvent(server, HANDLER_EVENT);
        server.server.emit(`error`, new Error(`some server error`));

        expect(handlerEvent).toHaveBeenCalledWith(new Error(`HTTP Server Error`));
    });

    test(`Handle address in use error`, () => {
        const server = mfaServerFactory();
        const handlerEvent = spyOnEvent(server, HANDLER_EVENT);
        const error = new Error(`Address in use`);
        (error as any).code = `EADDRINUSE`;
        server.server.emit(`error`, new Error(`Address in use`));

        expect(handlerEvent).toHaveBeenCalledWith(new Error(`HTTP Server Error`));
    });

    test(`Handle MFA timeout`, () => {
        const server = mfaServerFactory();
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
    // Test(`Timeout`)
});