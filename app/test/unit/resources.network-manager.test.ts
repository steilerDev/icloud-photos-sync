
import {afterEach, beforeEach, describe, expect, jest, test} from '@jest/globals';
import fs from 'fs';
import http from 'http';
import {AddressInfo} from 'net';
import mockfs from '../_helpers/mock-fs.helper';
import PQueue from 'p-queue';
import path from 'path';
import {Cookie} from 'tough-cookie';
import {Resources} from '../../src/lib/resources/main';
import {Header, HeaderJar, HttpClient, NetworkCapture, NO_VALIDATION} from '../../src/lib/resources/http-client';
import {NetworkManager} from "../../src/lib/resources/network-manager";
import {PhotosSetupResponseZone, SetupResponse, SigninResponse, TrustResponse} from '../../src/lib/resources/network-types';
import * as Config from '../_helpers/_config';
import {defaultConfig} from '../_helpers/_config';
import {prepareResources} from '../_helpers/_general';

describe(`NetworkManager`, () => {
    describe(`Constructor`, () => {
        test.each([
            {
                desc: `default config`,
                config: {},
                origin: `https://www.icloud.com`,
                networkCapture: false,
                downloadTimeout: 1000 * 60 * 10,
            }, {
                desc: `network capture enabled`,
                config: {enableNetworkCapture: true},
                origin: `https://www.icloud.com`,
                networkCapture: true,
                downloadTimeout: 1000 * 60 * 10,
            }, {
                desc: `china region`,
                config: {region: Resources.Types.Region.CHINA},
                origin: `https://www.icloud.com.cn`,
                networkCapture: false,
                downloadTimeout: 1000 * 60 * 10,
            }, {
                desc: `download timeout disabled`,
                config: {downloadTimeout: Infinity},
                origin: `https://www.icloud.com`,
                networkCapture: false,
                downloadTimeout: undefined,
            }, {
                desc: `download timeout set to 1`,
                config: {downloadTimeout: 1},
                origin: `https://www.icloud.com`,
                networkCapture: false,
                downloadTimeout: 1000 * 60 * 1,
            },
        ])(`Creates a new instance with $desc`, ({config, origin, networkCapture, downloadTimeout}) => {
            const networkManager = new NetworkManager({...defaultConfig, ...config});
            expect(networkManager).toBeInstanceOf(NetworkManager);

            expect(networkManager._http).toBeInstanceOf(HttpClient);
            expect(networkManager._http.defaultHeaders).toEqual({Origin: origin});
            expect(networkManager._http.baseURL).toBeUndefined();

            expect(networkManager._headerJar).toBeInstanceOf(HeaderJar);
            expect(networkManager._http.headerJar).toBe(networkManager._headerJar);

            if (networkCapture) {
                expect(networkManager._networkCapture).toBeInstanceOf(NetworkCapture);
                expect(networkManager._http.networkCapture).toBe(networkManager._networkCapture);
            } else {
                expect(networkManager._networkCapture).toBeUndefined();
                expect(networkManager._http.networkCapture).toBeUndefined();
            }

            expect(networkManager._restoreProxy).toBeUndefined();

            expect(networkManager._rateLimiter).toBeInstanceOf(PQueue);
            expect(networkManager._streamingCCYLimiter).toBeInstanceOf(PQueue);
            expect(networkManager._streamingCCYLimiter.concurrency).toEqual(defaultConfig.downloadThreads);
            expect(networkManager._downloadTimeout).toEqual(downloadTimeout);
        });

        describe(`System proxy`, () => {
            const proxyEnvKeys = [`HTTP_PROXY`, `http_proxy`, `HTTPS_PROXY`, `https_proxy`, `NO_PROXY`, `no_proxy`];
            let originalEnv: Record<string, string | undefined>;
            let proxy: http.Server;
            let proxiedURLs: string[];
            let networkManager: NetworkManager | undefined;

            beforeEach(async () => {
                prepareResources(); // Only setting up for access to logger
                originalEnv = Object.fromEntries(proxyEnvKeys.map(key => [key, process.env[key]]));
                proxyEnvKeys.forEach(key => delete process.env[key]);

                proxiedURLs = [];
                proxy = http.createServer((req, res) => {
                    // A forward proxy receives the absolute target URL as request target
                    proxiedURLs.push(req.url!);
                    res.writeHead(200, {'Content-Type': `application/json`});
                    res.end(`{"proxied":true}`);
                });
                await new Promise<void>(resolve => proxy.listen(0, `127.0.0.1`, resolve));
            });

            afterEach(async () => {
                networkManager?._restoreProxy?.();
                networkManager = undefined;
                proxyEnvKeys.forEach(key => {
                    if (originalEnv[key] === undefined) {
                        delete process.env[key];
                    } else {
                        process.env[key] = originalEnv[key];
                    }
                });
                proxy.closeAllConnections();
                await new Promise(resolve => proxy.close(resolve));
            });

            test(`Routes requests through the configured proxy`, async () => {
                process.env.HTTP_PROXY = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;

                networkManager = new NetworkManager({...defaultConfig, useSystemProxy: true});
                expect(networkManager._restoreProxy).toBeDefined();

                const response = await networkManager._http.get(`http://icloud-photos-sync-proxy-test.invalid/path`, NO_VALIDATION);

                expect(response.data).toEqual({proxied: true});
                expect(proxiedURLs).toEqual([`http://icloud-photos-sync-proxy-test.invalid/path`]);
            });

            test(`Accepts missing proxy configuration`, () => {
                networkManager = new NetworkManager({...defaultConfig, useSystemProxy: true});
                expect(networkManager._restoreProxy).toBeDefined();
            });

            test(`Throws on invalid proxy configuration`, () => {
                process.env.HTTPS_PROXY = `not a url`;

                expect(() => new NetworkManager({...defaultConfig, useSystemProxy: true})).toThrow(/^Unable to apply the proxy configured through HTTP_PROXY \/ HTTPS_PROXY$/);
            });
        });
    });

    describe(`Functions`, () => {
        let networkManager: NetworkManager;

        beforeEach(() => {
            networkManager = prepareResources(true, {...Config.defaultConfig, enableNetworkCapture: true})!.network;
        });

        test(`Reset network - Network capture disabled`, async () => {
            networkManager._headerJar.headers.set(`scnt`, new Header(`icloud.com`, `scnt`, `value`));
            networkManager._headerJar.headers.set(`X-Apple-ID-Session-Id`, new Header(`icloud.com`, `X-Apple-ID-Session-Id`, `value`));
            networkManager.settleRateLimiter = jest.fn<typeof networkManager.settleRateLimiter>();
            networkManager.settleCCYLimiter = jest.fn<typeof networkManager.settleCCYLimiter>();
            networkManager.writeHarFile = jest.fn<typeof networkManager.writeHarFile>();
            networkManager._networkCapture!.reset = jest.fn<() => void>();
            networkManager._http.baseURL = `https://www.icloud.com`;

            Resources.manager()._resources.enableNetworkCapture = false;
            await networkManager.resetSession();

            expect(networkManager._headerJar.headers.has(`scnt`)).toBeFalsy();
            expect(networkManager._headerJar.headers.has(`X-Apple-ID-Session-Id`)).toBeFalsy();
            // A new authentication flow uses a new frame id
            expect(networkManager._headerJar.headers.get(`X-Apple-Frame-Id`)!.value).not.toEqual(Config.frameId);
            expect(networkManager.settleRateLimiter).toHaveBeenCalled();
            expect(networkManager.settleCCYLimiter).toHaveBeenCalled();
            expect(networkManager.writeHarFile).not.toHaveBeenCalled();
            expect(networkManager._networkCapture!.reset).not.toHaveBeenCalled();

            expect(networkManager._http.baseURL).toBeUndefined();
        });

        test(`Reset network - Network capture enabled`, async () => {
            networkManager._headerJar.headers.set(`scnt`, new Header(`icloud.com`, `scnt`, `value`));
            networkManager._headerJar.headers.set(`X-Apple-ID-Session-Id`, new Header(`icloud.com`, `X-Apple-ID-Session-Id`, `value`));
            networkManager.settleRateLimiter = jest.fn<typeof networkManager.settleRateLimiter>();
            networkManager.settleCCYLimiter = jest.fn<typeof networkManager.settleCCYLimiter>();
            networkManager.writeHarFile = jest.fn<typeof networkManager.writeHarFile>();
            networkManager._networkCapture!.reset = jest.fn<() => void>();
            networkManager._http.baseURL = `https://www.icloud.com`;

            Resources.manager()._resources.enableNetworkCapture = true;
            await networkManager.resetSession();

            expect(networkManager._headerJar.headers.has(`scnt`)).toBeFalsy();
            expect(networkManager._headerJar.headers.has(`X-Apple-ID-Session-Id`)).toBeFalsy();
            expect(networkManager.settleRateLimiter).toHaveBeenCalled();
            expect(networkManager.settleCCYLimiter).toHaveBeenCalled();
            expect(networkManager.writeHarFile).toHaveBeenCalled();
            expect(networkManager._networkCapture!.reset).toHaveBeenCalled();

            expect(networkManager._http.baseURL).toBeUndefined();
        });

        test(`Settle rate limiter`, async () => {
            networkManager.settleQueue = jest.fn<typeof networkManager.settleQueue>();

            await networkManager.settleRateLimiter();

            expect(networkManager.settleQueue).toHaveBeenCalledWith(networkManager._rateLimiter);
        });

        test(`Settle CCY limiter`, async () => {
            networkManager.settleQueue = jest.fn<typeof networkManager.settleQueue>();

            await networkManager.settleCCYLimiter();

            expect(networkManager.settleQueue).toHaveBeenCalledWith(networkManager._streamingCCYLimiter);
        });

        describe(`Settle queue`, () => {
            // beforeAll(() => {
            //     jest.useFakeTimers();
            // });

            // afterAll(() => {
            //     jest.useRealTimers();
            // });

            test.each([
                {
                    queue: new PQueue(),
                    msg: `Empty queue`,
                },
                {
                    queue: (() => {
                        const queue = new PQueue({concurrency: 2, autoStart: false});
                        for (let i = 0; i < 10; i++) {
                            queue.add(() => new Promise(resolve => setTimeout(resolve, 100)));
                        }

                        return queue;
                    })(),
                    msg: `Non-Empty queue`,
                },
                {
                    queue: (() => {
                        const queue = new PQueue({concurrency: 2, autoStart: true});
                        for (let i = 0; i < 10; i++) {
                            queue.add(() => new Promise(resolve => setTimeout(resolve, 100)));
                        }

                        return queue;
                    })(),
                    msg: `Started queue`,
                },
            ])(`Settle queue - $msg`, async ({queue}) => {
                await networkManager.settleQueue(queue);

                expect(queue.size).toEqual(0);
                expect(queue.pending).toEqual(0);
            });
        });

        describe(`Write HAR file`, () => {
            beforeEach(() => {
                mockfs({
                    [Config.defaultConfig.dataDir]: {},
                });
            });

            afterEach(() => {
                mockfs.restore();
            });

            test(`Network capture disabled`, async () => {
                Resources.manager()._resources.enableNetworkCapture = false;
                const fileWritten = await networkManager.writeHarFile();
                expect(fileWritten).toBeFalsy();
                expect(fs.existsSync(path.join(Config.defaultConfig.dataDir, `.icloud-photos-sync.har`))).toBeFalsy();
            });

            test(`Network capture enabled - error thrown`, async () => {
                Resources.manager()._resources.enableNetworkCapture = true;
                Object.defineProperty(networkManager._networkCapture!, `log`, {
                    get: () => {
                        throw new Error(`some error`);
                    },
                });

                const fileWritten = await networkManager.writeHarFile();

                expect(fileWritten).toBeFalsy();
                expect(fs.existsSync(path.join(Config.defaultConfig.dataDir, `.icloud-photos-sync.har`))).toBeFalsy();
            });

            test(`Network capture enabled - no entries`, async () => {
                Resources.manager()._resources.enableNetworkCapture = true;
                networkManager._networkCapture!.log.log.entries = [];

                const fileWritten = await networkManager.writeHarFile();

                expect(fileWritten).toBeFalsy();
                expect(fs.existsSync(path.join(Config.defaultConfig.dataDir, `.icloud-photos-sync.har`))).toBeFalsy();
            });

            test(`Network capture enabled - valid entries`, async () => {
                Resources.manager()._resources.enableNetworkCapture = true;
                networkManager._networkCapture!.log.log.entries = [{someEntry: `someEntry`} as any];
                const expectedFileContents = JSON.stringify({
                    log: {
                        version: `1.2`,
                        creator: {
                            name: `icloud-photos-sync`,
                            version: `0.0.0-development`,
                        },
                        pages: [],
                        entries: [{
                            someEntry: `someEntry`,
                        }],
                    },
                });

                const fileWritten = await networkManager.writeHarFile();
                expect(fileWritten).toBeTruthy();

                expect(fs.existsSync(path.join(Config.defaultConfig.dataDir, `.icloud-photos-sync.har`))).toBeTruthy();

                const fileContents = fs.readFileSync(path.join(Config.defaultConfig.dataDir, `.icloud-photos-sync.har`), `utf8`);
                expect(fileContents).toContain(expectedFileContents);
            });
        });

        describe(`Setter methods`, () => {
            test(`set sessionID`, () => {
                networkManager.sessionId = `someSessionId`;
                expect(Resources.manager()._resources.sessionSecret).toBeUndefined();
                expect(networkManager._headerJar.headers.get(`X-Apple-ID-Session-Id`)!.value).toEqual(`someSessionId`);
            });

            test(`set session token`, () => {
                networkManager.sessionToken = `someSessionId`;
                expect(Resources.manager()._resources.sessionSecret).toEqual(`someSessionId`);
                expect(networkManager._headerJar.headers.has(`X-Apple-ID-Session-Id`)).toBeFalsy();
            });

            test(`set photos url`, () => {
                networkManager.photosUrl = `www.someUrl.com`;
                expect(networkManager._http.baseURL).toEqual(`www.someUrl.com/database/1/com.apple.photos.cloud/production`);
            });
        });

        describe(`Apply methods`, () => {
            test(`Apply SigninResponse`, () => {
                const signinResponse = {
                    data: {
                        authType: `hsa2`,
                    },
                    headers: {
                        scnt: `someScnt`,
                        'x-apple-session-token': `someSessionToken`,
                        'set-cookie': [],
                    },
                } as SigninResponse;

                networkManager.applySigninResponse(signinResponse);

                expect(Resources.manager()._resources.sessionSecret).toEqual(`someSessionToken`);
                // Falling back to session token, if no dedicated session id is provided
                expect(networkManager._headerJar.headers.get(`X-Apple-ID-Session-Id`)!.value).toEqual(`someSessionToken`);
                expect(networkManager.accountCountry).toBeUndefined();
            });

            test(`Apply SigninResponse - with session id and account country`, () => {
                const signinResponse = {
                    data: {
                        authType: `hsa2`,
                    },
                    headers: {
                        scnt: `someScnt`,
                        'x-apple-session-token': `someSessionToken`,
                        'x-apple-id-session-id': `someSessionId`,
                        'x-apple-id-account-country': `DEU`,
                        'set-cookie': [],
                    },
                } as SigninResponse;

                networkManager.applySigninResponse(signinResponse);

                expect(Resources.manager()._resources.sessionSecret).toEqual(`someSessionToken`);
                expect(networkManager._headerJar.headers.get(`X-Apple-ID-Session-Id`)!.value).toEqual(`someSessionId`);
                expect(networkManager.accountCountry).toEqual(`DEU`);
            });

            test.each([
                {
                    desc: `with session token`,
                    headers: {'x-apple-session-token': `newSessionToken`},
                    expected: `newSessionToken`,
                }, {
                    desc: `without session token`,
                    headers: {},
                    expected: `oldSessionToken`,
                }, {
                    desc: `with empty session token`,
                    headers: {'x-apple-session-token': ``},
                    expected: `oldSessionToken`,
                },
            ])(`Apply MFA response $desc`, ({headers, expected}) => {
                Resources.manager()._resources.sessionSecret = `oldSessionToken`;

                networkManager.applySessionTokenUpdate({headers} as any);

                expect(Resources.manager()._resources.sessionSecret).toEqual(expected);
            });

            test(`Apply TrustResponse`, () => {
                const trustResponse = {
                    headers: {
                        'x-apple-twosv-trust-token': `someTrustToken`,
                        'x-apple-session-token': `someSessionToken`,
                    },
                } as TrustResponse;

                networkManager.applyTrustResponse(trustResponse);

                expect(Resources.manager()._resources.trustToken).toEqual(`someTrustToken`);
                expect(Resources.manager()._resources.sessionSecret).toEqual(`someSessionToken`);
                expect(networkManager._headerJar.headers.has(`X-Apple-ID-Session-Id`)).toBeFalsy();
            });

            test.each([{
                desc: `PCS not required`,
                pcsRequired: false,
                expectedPhotosUrl: `somePhotosUrl/database/1/com.apple.photos.cloud/production`,
                expectedReturnVal: true,
            }, {
                desc: `PCS required and cookies available`,
                cookies: {
                    'X-APPLE-WEBAUTH-PCS-Photos': {
                        key: `X-APPLE-WEBAUTH-PCS-Photos`,
                    },
                    'X-APPLE-WEBAUTH-PCS-Sharing': {
                        key: `X-APPLE-WEBAUTH-PCS-Sharing`,
                    },
                },
                pcsRequired: true,
                expectedPhotosUrl: `somePhotosUrl/database/1/com.apple.photos.cloud/production`,
                expectedReturnVal: true,
            }, {
                desc: `PCS required and cookies not available`,
                pcsRequired: true,
                expectedPhotosUrl: `somePhotosUrl/database/1/com.apple.photos.cloud/production`,
                expectedReturnVal: false,
            }])(`Apply SetupResponse - $desc`, ({cookies, pcsRequired, expectedReturnVal, expectedPhotosUrl}) => {
                if (cookies) {
                    networkManager._headerJar.cookies = new Map(Object.entries(cookies)) as any as Map<string, Cookie>;
                }

                const setupResponse = {
                    headers: {
                        'set-cookie': [],
                    },
                    data: {
                        dsInfo: {
                            isWebAccessAllowed: true,
                        },
                        webservices: {
                            ckdatabasews: {
                                url: `somePhotosUrl`,
                                pcsRequired,
                                status: `active`,
                            },
                        },
                    },
                } as SetupResponse;
                expect(networkManager.applySetupResponse(setupResponse)).toBe(expectedReturnVal);

                expect(networkManager._http.baseURL).toEqual(expectedPhotosUrl);
            });


            test.each([
                {
                    desc: `Valid Primary Zone`,
                    privateZones: [{
                        zoneID: {
                            zoneName: `PrimarySync`,
                            ownerRecordName: `someOwnerRecordName`,
                            zoneType: `REGULAR_CUSTOM_ZONE`,
                        },
                    }],
                    sharedZones: [],
                    expectedPrimaryZone: {
                        zoneName: `PrimarySync`,
                        ownerRecordName: `someOwnerRecordName`,
                        zoneType: `REGULAR_CUSTOM_ZONE`,
                        area: `PRIVATE`
                    },
                }, {
                    desc: `Non-deleted Primary Zone`,
                    privateZones: [{
                        zoneID: {
                            zoneName: `PrimarySync`,
                            ownerRecordName: `someOwnerRecordName`,
                            zoneType: `REGULAR_CUSTOM_ZONE`,
                        },
                        deleted: false,
                    }],
                    sharedZones: [],
                    expectedPrimaryZone: {
                        zoneName: `PrimarySync`,
                        ownerRecordName: `someOwnerRecordName`,
                        zoneType: `REGULAR_CUSTOM_ZONE`,
                        area: `PRIVATE`
                    },
                }, {
                    desc: `Valid Primary and Shared Zone`,
                    privateZones: [{
                        zoneID: {
                            zoneName: `PrimarySync`,
                            ownerRecordName: `someOwnerRecordName`,
                            zoneType: `REGULAR_CUSTOM_ZONE`,
                        },
                    }, {
                        zoneID: {
                            zoneName: `SharedSync-1234`,
                            ownerRecordName: `someOtherOwnerRecordName`,
                            zoneType: `REGULAR_CUSTOM_ZONE`,
                        },
                    }],
                    sharedZones: [],
                    expectedPrimaryZone: {
                        zoneName: `PrimarySync`,
                        ownerRecordName: `someOwnerRecordName`,
                        zoneType: `REGULAR_CUSTOM_ZONE`,
                        area: `PRIVATE`
                    },
                    expectedSharedZone: {
                        zoneName: `SharedSync-1234`,
                        ownerRecordName: `someOtherOwnerRecordName`,
                        zoneType: `REGULAR_CUSTOM_ZONE`,
                        area: `PRIVATE`
                    },
                }, {
                    desc: `Valid Primary & Non-deleted Shared Zone`,
                    privateZones: [{
                        zoneID: {
                            zoneName: `PrimarySync`,
                            ownerRecordName: `someOwnerRecordName`,
                            zoneType: `REGULAR_CUSTOM_ZONE`,
                        },
                    }, {
                        zoneID: {
                            zoneName: `SharedSync-1234`,
                            ownerRecordName: `someOtherOwnerRecordName`,
                            zoneType: `REGULAR_CUSTOM_ZONE`,
                        },
                        deleted: false,
                    }],
                    sharedZones: [],
                    expectedPrimaryZone: {
                        zoneName: `PrimarySync`,
                        ownerRecordName: `someOwnerRecordName`,
                        zoneType: `REGULAR_CUSTOM_ZONE`,
                        area: `PRIVATE`
                    },
                    expectedSharedZone: {
                        zoneName: `SharedSync-1234`,
                        ownerRecordName: `someOtherOwnerRecordName`,
                        zoneType: `REGULAR_CUSTOM_ZONE`,
                        area: `PRIVATE`
                    },
                }, {
                    desc: `Valid Primary & Deleted Shared Zone`,
                    privateZones: [{
                        zoneID: {
                            zoneName: `PrimarySync`,
                            ownerRecordName: `someOwnerRecordName`,
                            zoneType: `REGULAR_CUSTOM_ZONE`,
                        },
                    }, {
                        zoneID: {
                            zoneName: `SharedSync-1234`,
                            ownerRecordName: `someOtherOwnerRecordName`,
                            zoneType: `REGULAR_CUSTOM_ZONE`,
                        },
                        deleted: true,
                    }],
                    sharedZones: [],
                    expectedPrimaryZone: {
                        zoneName: `PrimarySync`,
                        ownerRecordName: `someOwnerRecordName`,
                        zoneType: `REGULAR_CUSTOM_ZONE`,
                        area: `PRIVATE`
                    }
                }, {
                    desc: `Valid Primary & Non-owned, deleted Shared Zone`,
                    privateZones: [{
                        zoneID: {
                            zoneName: `PrimarySync`,
                            ownerRecordName: `someOwnerRecordName`,
                            zoneType: `REGULAR_CUSTOM_ZONE`,
                        },
                    }],
                    sharedZones: [{
                        zoneID: {
                            zoneName: `SharedSync-1234`,
                            ownerRecordName: `someOtherOwnerRecordName`,
                            zoneType: `REGULAR_CUSTOM_ZONE`,
                        },
                        deleted: true
                    }],
                    expectedPrimaryZone: {
                        zoneName: `PrimarySync`,
                        ownerRecordName: `someOwnerRecordName`,
                        zoneType: `REGULAR_CUSTOM_ZONE`,
                        area: `PRIVATE`
                    }
                }, {
                    desc: `Valid Primary & Non-owned, invalid Shared Zone`,
                    privateZones: [{
                        zoneID: {
                            zoneName: `PrimarySync`,
                            ownerRecordName: `someOwnerRecordName`,
                            zoneType: `REGULAR_CUSTOM_ZONE`,
                        },
                    }],
                    sharedZones: [{
                        zoneID: {
                            zoneName: `SomeSync`,
                            ownerRecordName: `someOtherOwnerRecordName`,
                            zoneType: `REGULAR_CUSTOM_ZONE`,
                        }
                    }],
                    expectedPrimaryZone: {
                        zoneName: `PrimarySync`,
                        ownerRecordName: `someOwnerRecordName`,
                        zoneType: `REGULAR_CUSTOM_ZONE`,
                        area: `PRIVATE`
                    }
                }
            ])(`Apply Zones - $desc`, ({privateZones, sharedZones, expectedPrimaryZone, expectedSharedZone}) => {
                networkManager.applyZones(privateZones as PhotosSetupResponseZone[], sharedZones as PhotosSetupResponseZone[]);

                expect(Resources.manager()._resources.primaryZone).toEqual(expectedPrimaryZone);
                expect(Resources.manager()._resources.sharedZone).toEqual(expectedSharedZone);

            });

            test.each([
                {
                    desc: `Invalid Primary Zone`,
                    privateZones: [{
                        zoneID: {
                            zoneName: `Sync`,
                            ownerRecordName: `someOwnerRecordName`,
                            zoneType: `REGULAR_CUSTOM_ZONE`,
                        },
                    }],
                }, {
                    desc: `Deleted Primary Zone`,
                    privateZones: [{
                        zoneID: {
                            zoneName: `PrimarySync`,
                            ownerRecordName: `someOwnerRecordName`,
                            zoneType: `REGULAR_CUSTOM_ZONE`,
                        },
                        deleted: true,
                    }],
                },
            ])(`Apply Zones throws exception - $desc`, ({privateZones}) => {
                expect(() => networkManager.applyZones(privateZones as PhotosSetupResponseZone[], [])).toThrow(/^No primary photos zone present$/);
            });
        });

        describe(`Network methods`, () => {
            const validator = (response: any) => response.data;

            test(`metadata get request`, async () => {
                networkManager._http.get = jest.fn<typeof networkManager._http.get>() as any;
                networkManager._rateLimiter.add = jest.fn<typeof networkManager._rateLimiter.add>() as any;

                networkManager.get(`someUrl`, validator, {params: {some: `params`}});

                // Making sure request is added to the rate limiter queue
                expect(networkManager._rateLimiter.add).toHaveBeenCalledTimes(1);

                expect(networkManager._http.get).toHaveBeenCalledTimes(0);
                // "firing" from the rate limiter queue
                await (networkManager._rateLimiter.add as any).mock.calls[0][0]();

                expect(networkManager._http.get).toHaveBeenCalledWith(`someUrl`, validator, {params: {some: `params`}});
            });

            test(`metadata post request`, async () => {
                networkManager._http.post = jest.fn<typeof networkManager._http.post>() as any;
                networkManager._rateLimiter.add = jest.fn<typeof networkManager._rateLimiter.add>() as any;

                networkManager.post(`someUrl`, {some: `data`}, validator, {params: {some: `params`}});

                // Making sure request is added to the rate limiter queue
                expect(networkManager._rateLimiter.add).toHaveBeenCalledTimes(1);

                expect(networkManager._http.post).toHaveBeenCalledTimes(0);
                // "firing" from the rate limiter queue
                await (networkManager._rateLimiter.add as any).mock.calls[0][0]();

                expect(networkManager._http.post).toHaveBeenCalledWith(`someUrl`, {some: `data`}, validator, {params: {some: `params`}});
            });

            test(`metadata put request`, async () => {
                networkManager._http.put = jest.fn<typeof networkManager._http.put>() as any;
                networkManager._rateLimiter.add = jest.fn<typeof networkManager._rateLimiter.add>() as any;

                networkManager.put(`someUrl`, {some: `data`}, validator, {params: {some: `params`}});

                // Making sure request is added to the rate limiter queue
                expect(networkManager._rateLimiter.add).toHaveBeenCalledTimes(1);

                expect(networkManager._http.put).toHaveBeenCalledTimes(0);
                // "firing" from the rate limiter queue
                await (networkManager._rateLimiter.add as any).mock.calls[0][0]();

                expect(networkManager._http.put).toHaveBeenCalledWith(`someUrl`, {some: `data`}, validator, {params: {some: `params`}});
            });

            test(`metadata request returns validated response`, async () => {
                networkManager._http._send = jest.fn<typeof networkManager._http._send>()
                    .mockResolvedValue({status: 200, statusText: ``, headers: new Headers(), body: `{"some":"data"}`});

                await expect(networkManager.get(`https://icloud.com`, validator)).resolves.toEqual({some: `data`});
            });

            describe(`Download data`, () => {
                afterEach(() => {
                    mockfs.restore();
                });

                test(`Download data - empty directory`, async () => {
                    mockfs({
                        [Config.defaultConfig.dataDir]: {},
                    });

                    const downloadPath = path.join(Config.defaultConfig.dataDir, `some.file`);
                    const url = `someUrl`;

                    networkManager._streamingCCYLimiter.add = jest.fn<typeof networkManager._streamingCCYLimiter.add>() as any;
                    networkManager._http.download = jest.fn<typeof networkManager._http.download>()
                        .mockResolvedValue();

                    networkManager.downloadData(url, downloadPath);

                    // Making sure request is added to CCY limiter queue
                    expect(networkManager._streamingCCYLimiter.add).toHaveBeenCalledTimes(1);
                    expect(networkManager._http.download).not.toHaveBeenCalled();

                    // 'firing' from the CCY limiter queue
                    await (networkManager._streamingCCYLimiter.add as any).mock.calls[0][0]();

                    expect(networkManager._http.download).toHaveBeenCalledWith(url, downloadPath, 1000 * 60 * 10);
                });

                test(`Download data - writes file`, async () => {
                    mockfs({
                        [Config.defaultConfig.dataDir]: {},
                    });

                    const downloadPath = path.join(Config.defaultConfig.dataDir, `some.file`);
                    networkManager._http._fetch = jest.fn<typeof networkManager._http._fetch>()
                        .mockResolvedValue(new Response(`someData`));

                    await networkManager.downloadData(`https://cvws.icloud-content.com/someAsset`, downloadPath);

                    expect(networkManager._http._fetch).toHaveBeenCalledWith(`https://cvws.icloud-content.com/someAsset`, {signal: expect.any(AbortSignal)});
                    expect(fs.readFileSync(downloadPath, `utf8`)).toEqual(`someData`);
                });

                test(`Download data - no timeout`, async () => {
                    mockfs({
                        [Config.defaultConfig.dataDir]: {},
                    });

                    const downloadPath = path.join(Config.defaultConfig.dataDir, `some.file`);
                    networkManager._downloadTimeout = undefined;
                    networkManager._http._fetch = jest.fn<typeof networkManager._http._fetch>()
                        .mockResolvedValue(new Response(`someData`));

                    await networkManager.downloadData(`https://cvws.icloud-content.com/someAsset`, downloadPath);

                    expect(networkManager._http._fetch).toHaveBeenCalledWith(`https://cvws.icloud-content.com/someAsset`, {signal: undefined});
                });

                test(`Download data - file exists`, async () => {
                    const downloadPath = path.join(Config.defaultConfig.dataDir, `some.file`);
                    const data = `someData`;
                    const url = `someUrl`;

                    mockfs({
                        [Config.defaultConfig.dataDir]: {
                            'some.file': data,
                        },
                    });

                    networkManager._streamingCCYLimiter.add = jest.fn<typeof networkManager._streamingCCYLimiter.add>() as any;
                    networkManager._http.download = jest.fn<typeof networkManager._http.download>() as any;

                    networkManager.downloadData(url, downloadPath);

                    // Making sure request is added to CCY limiter queue
                    expect(networkManager._streamingCCYLimiter.add).toHaveBeenCalledTimes(1);

                    // 'firing' from the CCY limiter queue
                    await (networkManager._streamingCCYLimiter.add as any).mock.calls[0][0]();

                    expect(networkManager._http.download).not.toHaveBeenCalled();

                    expect(fs.existsSync(downloadPath)).toBeTruthy();
                    expect(fs.readFileSync(downloadPath, `utf8`)).toEqual(data);
                });

                test(`Download data - path exists`, async () => {
                    const downloadPath = path.join(Config.defaultConfig.dataDir, `some.file`);
                    const url = `someUrl`;

                    mockfs({
                        [Config.defaultConfig.dataDir]: {
                            'some.file': {},
                        },
                    });

                    networkManager._streamingCCYLimiter.add = jest.fn<typeof networkManager._streamingCCYLimiter.add>() as any;
                    networkManager._http.download = jest.fn<typeof networkManager._http.download>() as any;

                    networkManager.downloadData(url, downloadPath);

                    // Making sure request is added to CCY limiter queue
                    expect(networkManager._streamingCCYLimiter.add).toHaveBeenCalledTimes(1);

                    // 'firing' from the CCY limiter queue
                    await (networkManager._streamingCCYLimiter.add as any).mock.calls[0][0]();

                    expect(networkManager._http.download).not.toHaveBeenCalled();
                });
            });
        });
    });
});
