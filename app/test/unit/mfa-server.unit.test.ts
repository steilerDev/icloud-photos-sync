
import {expect, describe, test, jest, beforeEach, afterEach} from '@jest/globals';
import {MFAServer} from '../../src/lib/icloud/mfa/mfa-server';
import {EVENTS, ENDPOINT} from '../../src/lib/icloud/mfa/constants';
import {MFAMethod} from '../../src/lib/icloud/mfa/mfa-method';
import supertest from 'supertest';

beforeEach(() => {
    //Before asynchronous call
    jest.useFakeTimers()
})

afterEach(() => {
    //After asynchronous call
    jest.runAllTimers()
})

describe(`Unit Tests - MFA Server`, () => {
    describe(`MFA Code`, () => {
        test(`Valid Code format`, async () => {
            const code = `123456`;
            const mfaMethod = new MFAMethod(`device`);

            const server = new MFAServer();

            const codeEvent = jest.fn();
            server.on(EVENTS.MFA_RECEIVED, codeEvent);
            const response = await supertest(server.server)
                .post(`${ENDPOINT.CODE_INPUT}?code=${code}`);

            expect(response.status).toEqual(200);
            expect(response.headers[`Content-Type`.toLowerCase()]).toMatch(/json/);
            expect(response.body.message).toEqual(`Read MFA code: ${code}`);
            expect(codeEvent).toBeCalledWith(mfaMethod, code);
        });

        test(`Invalid code format`, async () => {
            const server = new MFAServer();
            const code = `123 456`;

            const response = await supertest(server.server)
                .post(`${ENDPOINT.CODE_INPUT}?code=${code}`);

            expect(response.status).toEqual(400);
            expect(response.headers[`Content-Type`.toLowerCase()]).toMatch(/json/);
            expect(response.body.message).toEqual(`Unexpected MFA code format! Expecting 6 digits`);
        });
    });

    describe(`MFA Resend`, () => {
        test(`In app resend`, async () => {
            const method = `device`;
            const mfaMethod = new MFAMethod(method);

            const server = new MFAServer();

            const resendEvent = jest.fn();
            server.on(EVENTS.MFA_RESEND, resendEvent);

            const response = await supertest(server.server)
                .post(`${ENDPOINT.RESEND_CODE}?method=${method}`);
            expect(response.status).toEqual(200);
            expect(response.headers[`Content-Type`.toLowerCase()]).toMatch(/json/);
            expect(response.body.message).toEqual(`Requesting MFA resend with method ${mfaMethod}`);
            expect(resendEvent).toBeCalledWith(mfaMethod);
        });

        describe.each([`sms`, `voice`])(`Phone number resend`, method => {
            test(`Default id`, async () => {
                const mfaMethod = new MFAMethod(method as `sms` | `voice`);

                const server = new MFAServer();

                const resendEvent = jest.fn();
                server.on(EVENTS.MFA_RESEND, resendEvent);

                const response = await supertest(server.server)
                    .post(`${ENDPOINT.RESEND_CODE}?method=${method}`);
                expect(response.status).toEqual(200);
                expect(response.headers[`Content-Type`.toLowerCase()]).toMatch(/json/);
                expect(response.body.message).toEqual(`Requesting MFA resend with method ${mfaMethod}`);
                expect(resendEvent).toBeCalledWith(mfaMethod);
            });

            test(`Custom id`, async () => {
                const phoneNumberId = 3;
                const mfaMethod = new MFAMethod(method as `sms` | `voice`, phoneNumberId);

                const server = new MFAServer();

                const resendEvent = jest.fn();
                server.on(EVENTS.MFA_RESEND, resendEvent);

                const response = await supertest(server.server)
                    .post(`${ENDPOINT.RESEND_CODE}?method=${method}&phoneNumberId=${phoneNumberId}`);
                expect(response.status).toEqual(200);
                expect(response.headers[`Content-Type`.toLowerCase()]).toMatch(/json/);
                expect(response.body.message).toEqual(`Requesting MFA resend with method ${mfaMethod}`);
                expect(resendEvent).toBeCalledWith(mfaMethod);
            });

            test(`Invalid id`, async () => {
                const phoneNumberId = 0xA;
                const mfaMethod = new MFAMethod(method as `sms` | `voice`);

                const server = new MFAServer();

                const resendEvent = jest.fn();
                server.on(EVENTS.MFA_RESEND, resendEvent);

                const response = await supertest(server.server)
                    .post(`${ENDPOINT.RESEND_CODE}?method=${method}&phoneNumberId=${phoneNumberId.toString(16)}`);
                expect(response.status).toEqual(200);
                expect(response.headers[`Content-Type`.toLowerCase()]).toMatch(/json/);
                expect(response.body.message).toEqual(`Requesting MFA resend with method ${mfaMethod}`);
                expect(resendEvent).toBeCalledWith(mfaMethod);
            });
        });

        test(`Invalid resend method`, async () => {
            const method = `invalid`;

            const server = new MFAServer();

            const response = await supertest(server.server)
                .post(`${ENDPOINT.RESEND_CODE}?method=${method}`);
            expect(response.status).toEqual(400);
            expect(response.headers[`Content-Type`.toLowerCase()]).toMatch(/json/);
            expect(response.body.message).toEqual(`Method does not match expected format`);
        });
    });
});