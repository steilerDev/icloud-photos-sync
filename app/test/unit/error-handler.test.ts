import {afterEach, beforeEach, describe, expect, jest, test} from '@jest/globals';
import {BacktraceClientBuilder} from '@backtrace/node';
import fs from 'fs';
import zlib from 'zlib';
import {ErrorHandler, PersistedGuidAttributeProvider, ShellFreeBacktraceClientBuilder} from '../../src/app/event/error-handler';
import {type MockedResourceManager, prepareResources} from '../_helpers/_general';
import {iCPSError} from '../../src/app/error/error';
import {APP_ERR, AUTH_ERR} from '../../src/app/error/error-codes';

type AttributeProvider = Parameters<BacktraceClientBuilder[`addAttributeProvider`]>[0]

/**
 * Exposes the attribute providers registered with a builder
 * @param builder - The builder to inspect
 * @returns The registered attribute providers
 */
function attributeProviders(builder: BacktraceClientBuilder): AttributeProvider[] {
    return (builder as unknown as {clientSetup: {attributeProviders: AttributeProvider[]}}).clientSetup.attributeProviders;
}

describe(`PersistedGuidAttributeProvider`, () => {
    let mockedResourceManager: MockedResourceManager;

    beforeEach(() => {
        mockedResourceManager = prepareResources()!.manager;
        mockedResourceManager._writeResourceFile.mockClear();
    });

    test(`Is a scoped provider`, () => {
        expect(new PersistedGuidAttributeProvider().type).toEqual(`scoped`);
    });

    test(`Provides the persisted guid`, () => {
        mockedResourceManager._resources.crashReportingGuid = `0b6a3b0e-4d57-4c1f-9b49-1e0f8a1f2c3d`;

        expect(new PersistedGuidAttributeProvider().get()).toEqual({guid: `0b6a3b0e-4d57-4c1f-9b49-1e0f8a1f2c3d`});
        expect(mockedResourceManager._writeResourceFile).not.toHaveBeenCalled();
    });

    test(`Generates and persists a guid if none is present`, () => {
        mockedResourceManager._resources.crashReportingGuid = undefined;

        const {guid} = new PersistedGuidAttributeProvider().get();

        expect(guid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
        expect(mockedResourceManager._resources.crashReportingGuid).toEqual(guid);
        expect(mockedResourceManager._writeResourceFile).toHaveBeenCalledTimes(1);
        expect(new PersistedGuidAttributeProvider().get()).toEqual({guid});
    });
});

describe(`ShellFreeBacktraceClientBuilder`, () => {
    test(`Replaces Backtrace's machine identifier provider`, () => {
        const providers = attributeProviders(new ShellFreeBacktraceClientBuilder({url: `https://localhost`}));

        expect(providers.length).toEqual(attributeProviders(new BacktraceClientBuilder({options: {url: `https://localhost`}})).length);
        expect(providers.filter(provider => `generateGuid` in provider)).toHaveLength(0);
        expect(providers.filter(provider => provider instanceof PersistedGuidAttributeProvider)).toHaveLength(1);
    });

    test(`Reports the persisted guid`, () => {
        const mockedResourceManager = prepareResources()!.manager;
        mockedResourceManager._resources.crashReportingGuid = `0b6a3b0e-4d57-4c1f-9b49-1e0f8a1f2c3d`;

        const btClient = new ShellFreeBacktraceClientBuilder({url: `https://localhost`, metrics: {enable: false}}).build();

        expect(btClient.attributes[`guid`]).toEqual(`0b6a3b0e-4d57-4c1f-9b49-1e0f8a1f2c3d`);
        btClient.dispose();
    });
});

describe(`Handle error`, () => {
    let errorHandler: ErrorHandler;
    let signalListeners: Record<string, unknown[]>;

    beforeEach(() => {
        prepareResources();
        signalListeners = {SIGTERM: process.listeners(`SIGTERM`), SIGINT: process.listeners(`SIGINT`)};
        errorHandler = new ErrorHandler();
        errorHandler.reportError = jest.fn<typeof errorHandler.reportError>()
            .mockResolvedValue(`some-uuid`);
    });

    afterEach(() => {
        // Removing the signal handlers registered by the error handler
        for (const signal of [`SIGTERM`, `SIGINT`] as const) {
            process.listeners(signal)
                .filter(listener => !signalListeners[signal].includes(listener))
                .forEach(listener => process.removeListener(signal, listener as () => void));
        }
    });

    test.each([
        {
            desc: `Account locked`,
            rootError: AUTH_ERR.ACCOUNT_LOCKED,
        }, {
            desc: `Account setup incomplete`,
            rootError: AUTH_ERR.ACCOUNT_SETUP_INCOMPLETE,
        },
    ])(`Does not report errors that need to be resolved by the user - $desc`, async ({rootError}) => {
        const err = new iCPSError(APP_ERR.DAEMON)
            .addCause(new iCPSError(AUTH_ERR.FAILED)
                .addCause(new iCPSError(rootError)));

        await errorHandler.handleError(err);

        expect(errorHandler.reportError).not.toHaveBeenCalled();
        expect(err.btUUID).toBeUndefined();
    });

    test(`Reports other errors`, async () => {
        const err = new iCPSError(APP_ERR.DAEMON)
            .addCause(new iCPSError(AUTH_ERR.FAILED)
                .addCause(new iCPSError(AUTH_ERR.UNEXPECTED_RESPONSE)));

        await errorHandler.handleError(err);

        expect(errorHandler.reportError).toHaveBeenCalledWith(err);
        expect(err.btUUID).toEqual(`some-uuid`);
    });
});

describe(`Masking confidential data`, () => {
    let mockedResourceManager: MockedResourceManager;

    beforeEach(() => {
        mockedResourceManager = prepareResources()!.manager;
    });

    describe(`Mask confidential data`, () => {
        test(`Masks credentials, trust token and session secret`, () => {
            mockedResourceManager._resources.trustToken = `someTrustToken`;
            mockedResourceManager._resources.sessionSecret = `someSessionSecret`;

            expect(ErrorHandler.maskConfidentialData(`test@icloud.com testPass someTrustToken {"dsWebAuthToken":"someSessionSecret"}`))
                .toEqual(`<APPLE ID USERNAME> <APPLE ID PASSWORD> <TRUST TOKEN> {"dsWebAuthToken":"<SESSION SECRET>"}`);
        });

        test(`Without trust token and session secret`, () => {
            mockedResourceManager._resources.trustToken = undefined;
            mockedResourceManager._resources.sessionSecret = undefined;

            expect(ErrorHandler.maskConfidentialData(`test@icloud.com some data`))
                .toEqual(`<APPLE ID USERNAME> some data`);
        });

        test(`Ignores empty values`, () => {
            mockedResourceManager._resources.trustToken = ``;
            mockedResourceManager._resources.sessionSecret = ``;

            expect(ErrorHandler.maskConfidentialData(`some data`))
                .toEqual(`some data`);
        });

        test.each([
            {
                desc: `as configured`,
                healthCheckUrl: `https://hc-ping.com/some-uuid`,
                input: `HEALTH_CHECK_URL=https://hc-ping.com/some-uuid`,
                expected: `HEALTH_CHECK_URL=https://hc-ping.com/<HEALTH CHECK PATH>`,
            }, {
                desc: `with appended path`,
                healthCheckUrl: `https://hc-ping.com/some-uuid/`,
                input: `POST https://hc-ping.com/some-uuid/start`,
                expected: `POST https://hc-ping.com/<HEALTH CHECK PATH>/start`,
            }, {
                desc: `normalized`,
                healthCheckUrl: `HTTPS://HC-PING.COM/some-uuid`,
                input: `{"baseURL":"https://hc-ping.com/some-uuid"}`,
                expected: `{"baseURL":"https://hc-ping.com/<HEALTH CHECK PATH>"}`,
            }, {
                desc: `with query`,
                healthCheckUrl: `https://example.com/ping?key=secret`,
                input: `https://example.com/ping?key=secret`,
                expected: `https://example.com/<HEALTH CHECK PATH>`,
            }, {
                desc: `without path`,
                healthCheckUrl: `https://example.com`,
                input: `https://example.com/start`,
                expected: `https://example.com/start`,
            },
        ])(`Masks health check URL $desc`, ({healthCheckUrl, input, expected}) => {
            mockedResourceManager._resources.healthCheckUrl = healthCheckUrl;

            expect(ErrorHandler.maskConfidentialData(input)).toEqual(expected);
        });

        test(`Masks push subscription endpoints`, () => {
            mockedResourceManager._resources.notificationSubscriptions = {
                someEndpoint: {endpoint: `https://web.push.apple.com/someToken`, keys: {p256dh: `p256dh`, auth: `auth`}},
            };

            expect(ErrorHandler.maskConfidentialData(`Sending notification to https://web.push.apple.com/someToken`))
                .toEqual(`Sending notification to https://web.push.apple.com/<PUSH SUBSCRIPTION PATH>`);
        });

        test.each([
            {
                desc: `user and password`,
                input: `HTTPS_PROXY=http://user:pa55word@proxy.local:3128`,
                expected: `HTTPS_PROXY=http://<MASKED>@proxy.local:3128`,
            }, {
                desc: `user only`,
                input: `"HTTP_PROXY":"http://user@proxy.local:3128"`,
                expected: `"HTTP_PROXY":"http://<MASKED>@proxy.local:3128"`,
            }, {
                desc: `other scheme`,
                input: `socks5://user:pass@proxy.local`,
                expected: `socks5://<MASKED>@proxy.local`,
            }, {
                desc: `no credentials`,
                input: `http://proxy.local:3128/path@something`,
                expected: `http://proxy.local:3128/path@something`,
            }, {
                desc: `mail address`,
                input: `mailto:someone@example.com`,
                expected: `mailto:someone@example.com`,
            },
        ])(`Masks credentials in URLs: $desc`, ({input, expected}) => {
            expect(ErrorHandler.maskConfidentialData(input)).toEqual(expected);
        });
    });

    describe(`Mask header value`, () => {
        test.each([
            {
                desc: `Cookie`,
                name: `Cookie`,
                value: `X-APPLE-WEBAUTH-TOKEN="v=2:t=Eg==BST_abc~~"; X-APPLE-WEBAUTH-PCS-Photos="S2V5QXBwbDo=="; aasp=1234`,
                expected: `X-APPLE-WEBAUTH-TOKEN=<MASKED>; X-APPLE-WEBAUTH-PCS-Photos=<MASKED>; aasp=<MASKED>`,
            }, {
                desc: `set-cookie`,
                name: `set-cookie`,
                value: [
                    `X-APPLE-WEBAUTH-TOKEN="v=2:t=Eg==BST_abc~~";Expires=Fri, 6-Nov-2026 11:48:58 GMT;Path=/;Domain=.icloud.com;Secure;HttpOnly`,
                    `aasp=1234; Domain=idmsa.apple.com`,
                ],
                expected: [
                    `X-APPLE-WEBAUTH-TOKEN=<MASKED>;Expires=Fri, 6-Nov-2026 11:48:58 GMT;Path=/;Domain=.icloud.com;Secure;HttpOnly`,
                    `aasp=<MASKED>; Domain=idmsa.apple.com`,
                ],
            }, {
                desc: `scnt`,
                name: `scnt`,
                value: `someScnt`,
                expected: `<MASKED>`,
            }, {
                desc: `Session token (case-insensitive)`,
                name: `X-Apple-Session-Token`,
                value: `someSessionToken`,
                expected: `<MASKED>`,
            }, {
                desc: `Session id`,
                name: `x-apple-id-session-id`,
                value: `someSessionId`,
                expected: `<MASKED>`,
            }, {
                desc: `Trust token`,
                name: `X-Apple-TwoSV-Trust-Token`,
                value: `someTrustToken`,
                expected: `<MASKED>`,
            }, {
                desc: `Auth attributes`,
                name: `X-Apple-Auth-Attributes`,
                value: `someAttributes`,
                expected: `<MASKED>`,
            }, {
                desc: `Non-string value`,
                name: `scnt`,
                value: 42,
                expected: `<MASKED>`,
            }, {
                desc: `Non-confidential header`,
                name: `retry-after`,
                value: `9`,
                expected: `9`,
            },
        ])(`$desc`, ({name, value, expected}) => {
            expect(ErrorHandler.maskHeaderValue(name, value)).toEqual(expected);
        });
    });

    describe(`Mask confidential headers`, () => {
        test(`Masks headers of requests and responses within errors`, () => {
            const request = {
                method: `POST`,
                url: `/records/query`,
                headers: {
                    'Content-Type': `application/json`,
                    Cookie: `X-APPLE-WEBAUTH-TOKEN="secret"; X-APPLE-DS-WEB-SESSION-TOKEN="secret"`,
                },
            };
            const maskedRequest = {
                ...request,
                headers: {
                    'Content-Type': `application/json`,
                    Cookie: `X-APPLE-WEBAUTH-TOKEN=<MASKED>; X-APPLE-DS-WEB-SESSION-TOKEN=<MASKED>`,
                },
            };
            const data = {
                annotations: {
                    error: {
                        message: `CloudKit request failed`,
                        cause: {
                            request,
                            response: {
                                status: 503,
                                headers: {
                                    'retry-after': `9`,
                                    'set-cookie': [`X-APPLE-WEBAUTH-TOKEN="secret";Path=/`],
                                    scnt: `secret`,
                                },
                                data: {serverErrorCode: `THROTTLED`},
                                config: request,
                            },
                        },
                    },
                },
                attributes: {
                    'application.version': `1.0.0`,
                },
            };

            const masked = ErrorHandler.maskConfidentialHeaders(data);

            expect(JSON.stringify(masked)).not.toContain(`secret`);
            expect(masked).toEqual({
                annotations: {
                    error: {
                        message: `CloudKit request failed`,
                        cause: {
                            request: maskedRequest,
                            response: {
                                status: 503,
                                headers: {
                                    'retry-after': `9`,
                                    'set-cookie': [`X-APPLE-WEBAUTH-TOKEN=<MASKED>;Path=/`],
                                    scnt: `<MASKED>`,
                                },
                                data: {serverErrorCode: `THROTTLED`},
                                config: maskedRequest,
                            },
                        },
                    },
                },
                attributes: {
                    'application.version': `1.0.0`,
                },
            });
            // The input is not modified
            expect(request.headers.Cookie).toEqual(`X-APPLE-WEBAUTH-TOKEN="secret"; X-APPLE-DS-WEB-SESSION-TOKEN="secret"`);
        });

        test(`Masks headers of HAR entries`, () => {
            const har = {
                log: {
                    entries: [{
                        request: {
                            headers: [
                                {name: `Cookie`, value: `X-APPLE-WEBAUTH-TOKEN="secret"`},
                                {name: `scnt`, value: `secret`},
                                {name: `Accept`, value: `application/json`},
                            ],
                        },
                        response: {
                            headers: [
                                {name: `set-cookie`, value: `aasp=secret; Domain=idmsa.apple.com`},
                                {name: `x-apple-session-token`, value: `secret`},
                                {name: `content-type`, value: `application/json`},
                            ],
                        },
                    }],
                },
            };

            expect(ErrorHandler.maskConfidentialHeaders(har)).toEqual({
                log: {
                    entries: [{
                        request: {
                            headers: [
                                {name: `Cookie`, value: `X-APPLE-WEBAUTH-TOKEN=<MASKED>`},
                                {name: `scnt`, value: `<MASKED>`},
                                {name: `Accept`, value: `application/json`},
                            ],
                        },
                        response: {
                            headers: [
                                {name: `set-cookie`, value: `aasp=<MASKED>; Domain=idmsa.apple.com`},
                                {name: `x-apple-session-token`, value: `<MASKED>`},
                                {name: `content-type`, value: `application/json`},
                            ],
                        },
                    }],
                },
            });
        });

        test.each([
            {
                desc: `Primitive`,
                data: `some string`,
            }, {
                desc: `Null`,
                data: null,
            }, {
                desc: `Non-object headers`,
                data: {headers: `Cookie: secret`},
            }, {
                desc: `Header list without names`,
                data: {headers: [{value: `value`}, `value`]},
            },
        ])(`Keeps unexpected data - $desc`, ({data}) => {
            expect(ErrorHandler.maskConfidentialHeaders(data)).toEqual(data);
        });
    });

    describe(`Prepare HAR file`, () => {
        let errorHandler: ErrorHandler;

        beforeEach(() => {
            // Avoiding the constructor, since it registers process signal handlers
            errorHandler = Object.create(ErrorHandler.prototype);
            mockedResourceManager._resources.enableNetworkCapture = true;
            fs.mkdirSync(mockedResourceManager.dataDir, {recursive: true});
        });

        afterEach(() => {
            fs.rmSync(mockedResourceManager.harFilePath, {force: true});
        });

        test(`Masks confidential headers and data`, async () => {
            fs.writeFileSync(mockedResourceManager.harFilePath, JSON.stringify({
                log: {
                    entries: [{
                        request: {
                            headers: [{name: `Cookie`, value: `X-APPLE-WEBAUTH-TOKEN="secret"`}],
                            postData: {text: `{"accountName":"test@icloud.com"}`},
                        },
                    }],
                },
            }));

            const harFile = await errorHandler.prepareHarFile();

            expect(JSON.parse(zlib.brotliDecompressSync(harFile!).toString())).toEqual({
                log: {
                    entries: [{
                        request: {
                            headers: [{name: `Cookie`, value: `X-APPLE-WEBAUTH-TOKEN=<MASKED>`}],
                            postData: {text: `{"accountName":"<APPLE ID USERNAME>"}`},
                        },
                    }],
                },
            });
        });

        test(`Does not attach an unparsable HAR file`, async () => {
            fs.writeFileSync(mockedResourceManager.harFilePath, `{"log": {"entries": [{"request": {"headers": [{"name": "Cookie", "value": "secret"`);

            await expect(errorHandler.prepareHarFile()).resolves.toBeUndefined();
        });

        test(`Network capture disabled`, async () => {
            mockedResourceManager._resources.enableNetworkCapture = false;

            await expect(errorHandler.prepareHarFile()).resolves.toBeUndefined();
        });
    });
});
