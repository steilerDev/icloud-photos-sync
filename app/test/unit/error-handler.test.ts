import {afterEach, beforeEach, describe, expect, jest, test} from '@jest/globals';
import {BacktraceClientBuilder} from '@backtrace/node';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import {ErrorHandler, MachineIdAttributeProvider, ShellFreeBacktraceClientBuilder} from '../../src/app/event/error-handler';
import {MockedResourceManager, prepareResources} from '../_helpers/_general';

type AttributeProvider = ConstructorParameters<typeof MachineIdAttributeProvider>[0] & {}

/**
 * Exposes the attribute providers registered with a builder
 * @param builder - The builder to inspect
 * @returns The registered attribute providers
 */
function attributeProviders(builder: BacktraceClientBuilder): AttributeProvider[] {
    return (builder as unknown as {clientSetup: {attributeProviders: AttributeProvider[]}}).clientSetup.attributeProviders;
}

/**
 * Simulates running on the provided platform
 * @param platform - The platform to report through `process.platform`
 */
function mockPlatform(platform: NodeJS.Platform) {
    Object.defineProperty(process, `platform`, {...originalPlatform, value: platform});
}

const originalPlatform = Object.getOwnPropertyDescriptor(process, `platform`)!;

describe(`MachineIdAttributeProvider`, () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `icps-machine-id-`));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, {recursive: true, force: true});
        Object.defineProperty(process, `platform`, originalPlatform);
        Reflect.deleteProperty(process, `permission`);
    });

    /**
     * Writes a machine id file to the temporary directory
     * @param name - The file name
     * @param content - The file content
     * @returns The path to the file
     */
    function machineIdFile(name: string, content: string): string {
        const filePath = path.join(tmpDir, name);
        fs.writeFileSync(filePath, content);
        return filePath;
    }

    describe(`Linux`, () => {
        beforeEach(() => {
            mockPlatform(`linux`);
        });

        test(`Reads first line of first machine id file`, () => {
            const dbusMachineId = machineIdFile(`dbus-machine-id`, `ABCDEF0123456789\nsecond line\n`);
            const etcMachineId = machineIdFile(`etc-machine-id`, `fedcba9876543210\n`);

            expect(new MachineIdAttributeProvider(undefined, [dbusMachineId, etcMachineId]).get()).toEqual({guid: `abcdef0123456789`});
        });

        test(`Falls back to next machine id file`, () => {
            const etcMachineId = machineIdFile(`etc-machine-id`, `fedcba9876543210\n`);

            expect(new MachineIdAttributeProvider(undefined, [path.join(tmpDir, `missing`), etcMachineId]).get()).toEqual({guid: `fedcba9876543210`});
        });

        test(`Falls back to next machine id file if first is empty`, () => {
            const dbusMachineId = machineIdFile(`dbus-machine-id`, ``);
            const etcMachineId = machineIdFile(`etc-machine-id`, `fedcba9876543210\n`);

            expect(new MachineIdAttributeProvider(undefined, [dbusMachineId, etcMachineId]).get()).toEqual({guid: `fedcba9876543210`});
        });

        test(`Falls back to hostname if existing machine id file is empty`, () => {
            const etcMachineId = machineIdFile(`etc-machine-id`, ``);

            expect(new MachineIdAttributeProvider(undefined, [path.join(tmpDir, `missing`), etcMachineId]).generateGuid()).toEqual(os.hostname().replace(/\s+/g, ``).toLowerCase());
        });

        test(`Falls back to hostname`, () => {
            expect(new MachineIdAttributeProvider(undefined, [path.join(tmpDir, `missing`)]).generateGuid()).toEqual(os.hostname().replace(/\s+/g, ``).toLowerCase());
        });

        test(`Does not use shell provider`, () => {
            const shellProvider = {type: `scoped` as const, get: jest.fn(() => ({guid: `shell`}))};
            const etcMachineId = machineIdFile(`etc-machine-id`, `fedcba9876543210\n`);

            expect(new MachineIdAttributeProvider(shellProvider, [etcMachineId]).get()).toEqual({guid: `fedcba9876543210`});
            expect(shellProvider.get).not.toHaveBeenCalled();
        });
    });

    describe(`Other platforms`, () => {
        beforeEach(() => {
            mockPlatform(`darwin`);
        });

        test(`Uses shell provider`, () => {
            const shellProvider = {type: `scoped` as const, get: jest.fn(() => ({guid: `shell-guid`}))};

            expect(new MachineIdAttributeProvider(shellProvider).get()).toEqual({guid: `shell-guid`});
        });

        test(`Uses random guid if child processes are denied`, () => {
            Object.defineProperty(process, `permission`, {value: {has: () => false}, configurable: true});
            const shellProvider = {type: `scoped` as const, get: jest.fn(() => ({guid: `shell-guid`}))};

            const {guid} = new MachineIdAttributeProvider(shellProvider).get();

            expect(guid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
            expect(shellProvider.get).not.toHaveBeenCalled();
        });

        test(`Uses random guid without shell provider`, () => {
            expect(new MachineIdAttributeProvider().get().guid).toMatch(/^[0-9a-f-]{36}$/);
        });
    });
});

describe(`ShellFreeBacktraceClientBuilder`, () => {
    test(`Replaces Backtrace's machine identifier provider`, () => {
        const providers = attributeProviders(new ShellFreeBacktraceClientBuilder({url: `https://localhost`}));
        const guidProviders = providers.filter(provider => `generateGuid` in provider);

        expect(providers.length).toEqual(attributeProviders(new BacktraceClientBuilder({options: {url: `https://localhost`}})).length);
        expect(guidProviders).toHaveLength(1);
        expect(guidProviders[0]).toBeInstanceOf(MachineIdAttributeProvider);
    });

    (process.platform === `linux` ? test : test.skip)(`Produces the same guid as Backtrace's machine identifier provider`, () => {
        const shellProvider = attributeProviders(new BacktraceClientBuilder({options: {url: `https://localhost`}}))
            .find(provider => `generateGuid` in provider)!;

        expect(new MachineIdAttributeProvider().get()).toEqual(shellProvider.get());
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
