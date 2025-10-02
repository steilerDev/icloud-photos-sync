
import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, jest, test} from '@jest/globals';
import axios from "axios";
import {AxiosHarTracker} from 'axios-har-tracker';
import fs from 'fs';
import mockfs from 'mock-fs';
import PQueue from 'p-queue';
import path from 'path';
import {Stream} from 'stream';
import {Cookie} from 'tough-cookie';
import {Resources} from '../../src/lib/resources/main';
import {Header, HeaderJar, NetworkManager} from "../../src/lib/resources/network-manager";
import {PhotosSetupResponseZone, SetupResponse, SigninResponse, TrustResponse} from '../../src/lib/resources/network-types';
import * as Config from '../_helpers/_config';
import {defaultConfig} from '../_helpers/_config';
import {addHoursToCurrentDate, getDateInThePast, prepareResources} from '../_helpers/_general';

describe(`HeaderJar`, () => {
    beforeAll(() => {
        prepareResources(); // Only setting up for access to logger
    });

    test(`Should initialize`, () => {
        const axiosInstance = axios.create();
        const headerJar = new HeaderJar(axiosInstance);

        expect(headerJar.headers.size).toBe(13);
        expect((axiosInstance.interceptors.request as any).handlers.length).toBe(1);
    });

    describe.each([
        {
            desc: `Only URL`,
            requestConfig: {
                url: `https://icloud.com`,
            },
        }, {
            desc: `URL and baseUrl`,
            requestConfig: {
                url: `/somePath`,
                baseURL: `https://icloud.com`,
            },
        }, {
            desc: `Fully qualified URL and baseURL`,
            requestConfig: {
                url: `https://icloud.com/somePath`,
                baseURL: `https://weirdBase.com`,
            },
        }, {
            desc: `Subdomain base URL`,
            requestConfig: {
                url: `/somePath`,
                baseURL: `https://subdomain.icloud.com`,
            },
        }, {
            desc: `Fully qualified subdomain URL and baseURL`,
            requestConfig: {
                url: `https://subdomain.icloud.com/somePath`,
                baseURL: `https://weirdBase.com`,
            },
        },
    ])(`Inject headers ($desc)`, ({requestConfig}) => {
        describe.each([
            {
                desc: `No Headers`,
                headers: [],
                injectedHeaders: {},
            },
            {
                desc: `Single Header - Exact URL match`,
                headers: [
                    new Header(`icloud.com`, `someKey`, `someValue`),
                ],
                injectedHeaders: {
                    someKey: `someValue`,
                },
            },
            {
                desc: `Single Header - Wildcard URL match`,
                headers: [
                    new Header(``, `someKey`, `someValue`),
                ],
                injectedHeaders: {
                    someKey: `someValue`,
                },
            },
            {
                desc: `Multiple Headers - Exact URL match`,
                headers: [
                    new Header(`icloud.com`, `someKey`, `someValue`),
                    new Header(`icloud.com`, `someOtherKey`, `someValue`),
                ],
                injectedHeaders: {
                    someKey: `someValue`,
                    someOtherKey: `someValue`,
                },
            },
        ])(`$desc`, ({headers, injectedHeaders}) => {
            test.each([
                {
                    desc: `No Cookies`,
                    cookies: [],
                    injectedCookieHeader: {},
                },
                {
                    desc: `Cookie - Exact URL match (Cookie string)`,
                    cookies: [
                        `someKey=someValue; Domain=icloud.com`,
                    ],
                    injectedCookieHeader: {
                        Cookie: `someKey=someValue`,
                    },
                },
                {
                    desc: `Cookie - Exact URL match`,
                    cookies: [
                        new Cookie({value: `someValue`, key: `someKey`, domain: `icloud.com`, expires: addHoursToCurrentDate(36)}),
                    ],
                    injectedCookieHeader: {
                        Cookie: `someKey=someValue`,
                    },
                },
                {
                    desc: `Cookie - Exact URL match - Multiple cookies`,
                    cookies: [
                        new Cookie({value: `someValue`, key: `someKey`, domain: `icloud.com`, expires: addHoursToCurrentDate(36)}),
                        new Cookie({value: `someValue`, key: `someOtherKey`, domain: `icloud.com`, expires: addHoursToCurrentDate(36)}),
                    ],
                    injectedCookieHeader: {
                        Cookie: `someKey=someValue; someOtherKey=someValue`,
                    },
                },
                {
                    desc: `Cookie - Expired cookie`,
                    cookies: [
                        new Cookie({value: `someValue`, key: `someKey`, domain: `icloud.com`, expires: getDateInThePast()}),
                    ],
                    injectedCookieHeader: {},
                },
                {
                    desc: `Cookie - No URL match`,
                    cookies: [
                        new Cookie({value: `someValue`, key: `someKey`, domain: `weirdURL.com`, expires: addHoursToCurrentDate(36)}),
                    ],
                    injectedCookieHeader: {},
                },
                {
                    desc: `Cookie - No Expires`,
                    cookies: [
                        new Cookie({value: `someValue`, key: `someKey`, domain: `icloud.com`, expires: `Infinity`}),
                    ],
                    injectedCookieHeader: {
                        Cookie: `someKey=someValue`,
                    },
                },
                {
                    desc: `Cookie - Magic Expires`,
                    cookies: [
                        new Cookie({value: `someValue`, key: `someKey`, domain: `icloud.com`, expires: new Date(1000)}),
                    ],
                    injectedCookieHeader: {
                        Cookie: `someKey=someValue`,
                    },
                },
            ])(`$desc`, ({cookies, injectedCookieHeader}) => {
                const axiosInstance = axios.create();
                const headerJar = new HeaderJar(axiosInstance);
                headerJar.headers.clear();
                headerJar.cookies.clear();

                headerJar.setCookie(...cookies);
                headerJar.setHeader(...headers);

                const injectedRequestConfig = headerJar._injectHeaders({
                    ...requestConfig,
                    headers: {},
                } as any);

                expect(injectedRequestConfig.headers).toEqual({
                    ...injectedHeaders,
                    ...injectedCookieHeader,
                });
            });
        });
    });

    describe(`Extract headers`, () => {
        test.each([
            {
                desc: `No headers`,
                url: `icloud.com`,
                headers: [],
                extractedCookies: [],
                extractedHeaders: [],
            }, {
                desc: `Single cookie`,
                url: `icloud.com`,
                headers: {
                    'set-cookie': [
                        `someKey=someValue; Domain=icloud.com`,
                    ],
                },
                extractedCookies: [
                    {value: `someValue`, key: `someKey`, domain: `icloud.com`},
                ],
                extractedHeaders: [],
            }, {
                desc: `Multiple cookies`,
                url: `icloud.com`,
                headers: {
                    'set-cookie': [
                        `someKey=someValue; Domain=icloud.com`,
                        `someOtherKey=someOtherValue; Domain=icloud.com`,
                    ],
                },
                extractedCookies: [
                    {value: `someValue`, key: `someKey`, domain: `icloud.com`},
                    {value: `someOtherValue`, key: `someOtherKey`, domain: `icloud.com`},
                ],
                extractedHeaders: [],
            }, {
                desc: `Empty cookie`,
                url: `icloud.com`,
                headers: {
                    'set-cookie': [
                        `someKey=; Domain=icloud.com`,
                    ],
                },
                extractedCookies: [],
                extractedHeaders: [],
            }, {
                desc: `scnt header from idmsa.apple.com`,
                url: `idmsa.apple.com`,
                headers: {
                    scnt: `someValue`,
                },
                extractedCookies: [],
                extractedHeaders: [
                    {key: `scnt`, value: `someValue`, domain: `idmsa.apple.com`},
                ],
            }, {
                desc: `scnt header from non idmsa.apple.com`,
                url: `icloud.com`,
                headers: {
                    scnt: `someValue`,
                },
                extractedCookies: [],
                extractedHeaders: [],
            }, {
                desc: `ignoring random header`,
                url: `icloud.com`,
                headers: {
                    random: `someValue`,
                },
                extractedCookies: [],
                extractedHeaders: [],
            }, {
                desc: `scnt header & cookies`,
                url: `idmsa.apple.com`,
                headers: {
                    scnt: `someValue`,
                    'set-cookie': [
                        `someKey=someValue; Domain=icloud.com`,
                        `someOtherKey=someOtherValue; Domain=icloud.com`,
                    ],
                },
                extractedCookies: [
                    {value: `someValue`, key: `someKey`, domain: `icloud.com`},
                    {value: `someOtherValue`, key: `someOtherKey`, domain: `icloud.com`},
                ],
                extractedHeaders: [
                    {key: `scnt`, value: `someValue`, domain: `idmsa.apple.com`},
                ],
            },
        ])(`$desc`, ({headers, extractedCookies, extractedHeaders, url}) => {
            const axiosInstance = axios.create();
            const headerJar = new HeaderJar(axiosInstance);

            headerJar.headers.clear();
            headerJar.cookies.clear();

            headerJar._extractHeaders({
                config: {
                    baseURL: url,
                },
                headers,
            } as any);

            expect(Array.from(headerJar.cookies.values())).toMatchObject(extractedCookies);
            expect(Array.from(headerJar.headers.values())).toMatchObject(extractedHeaders);
        });
    });

    describe(`Clear header`, () => {
        test(`Don't inject cleared header`, () => {
            const axiosInstance = axios.create();
            const headerJar = new HeaderJar(axiosInstance);
            headerJar.headers.clear();

            headerJar.setHeader(new Header(`icloud.com`, `someKey`, `someValue`));
            headerJar.clearHeader(`someKey`);

            const injectedRequestConfig = headerJar._injectHeaders({
                url: `https://icloud.com/`,
                headers: {},
            } as any);

            expect(injectedRequestConfig.headers).toEqual({});
        });

        test(`Don't clear unrelated header`, () => {
            const axiosInstance = axios.create();
            const headerJar = new HeaderJar(axiosInstance);
            headerJar.headers.clear();

            headerJar.setHeader(new Header(`icloud.com`, `someKey`, `someValue`));
            headerJar.setHeader(new Header(`icloud.com`, `someOtherKey`, `someOtherValue`));
            headerJar.clearHeader(`someKey`);

            const injectedRequestConfig = headerJar._injectHeaders({
                url: `https://icloud.com/`,
                headers: {},
            } as any);

            expect(injectedRequestConfig.headers).toEqual({
                someOtherKey: `someOtherValue`,
            });
        });
    });
});

describe(`NetworkManager`, () => {
    describe(`Constructor`, () => {
        test(`Creates a new instance with default config`, () => {
            const networkManager = new NetworkManager(defaultConfig);
            expect(networkManager).toBeInstanceOf(NetworkManager);

            expect(networkManager._axios).toBeDefined();
            expect(networkManager._axios.defaults.headers.Origin).toEqual(`https://www.icloud.com`);

            expect(networkManager._streamingAxios).toBeDefined();
            expect(networkManager._streamingAxios.defaults.responseType).toEqual(`stream`);

            expect(networkManager._headerJar).toBeInstanceOf(HeaderJar);
            expect(networkManager._harTracker).toBeUndefined();

            // HeaderJar
            expect((networkManager._axios.interceptors.request as any).handlers).toHaveLength(1);
            expect((networkManager._axios.interceptors.response as any).handlers).toHaveLength(1);

            expect(networkManager._rateLimiter).toBeInstanceOf(PQueue);
            expect(networkManager._streamingCCYLimiter).toBeInstanceOf(PQueue);
            expect(networkManager._streamingCCYLimiter.timeout).toEqual(1000 * 60 * 10);
        });

        test(`Creates a new instance with network capture enabled`, () => {
            const networkManager = new NetworkManager({
                ...defaultConfig,
                enableNetworkCapture: true,
            });
            expect(networkManager).toBeInstanceOf(NetworkManager);

            expect(networkManager._axios).toBeDefined();
            expect(networkManager._axios.defaults.headers.Origin).toEqual(`https://www.icloud.com`);

            expect(networkManager._streamingAxios).toBeDefined();
            expect(networkManager._streamingAxios.defaults.responseType).toEqual(`stream`);

            expect(networkManager._headerJar).toBeInstanceOf(HeaderJar);
            expect(networkManager._harTracker).toBeInstanceOf(AxiosHarTracker);

            // HeaderJar + NetworkCapture
            expect((networkManager._axios.interceptors.request as any).handlers).toHaveLength(2);
            expect((networkManager._axios.interceptors.response as any).handlers).toHaveLength(2);

            expect(networkManager._rateLimiter).toBeInstanceOf(PQueue);
            expect(networkManager._streamingCCYLimiter).toBeInstanceOf(PQueue);
            expect(networkManager._streamingCCYLimiter.timeout).toEqual(1000 * 60 * 10);
        });

        test(`Creates a new instance with china region`, () => {
            const networkManager = new NetworkManager({
                ...defaultConfig,
                region: Resources.Types.Region.CHINA,
            });
            expect(networkManager).toBeInstanceOf(NetworkManager);

            expect(networkManager._axios).toBeDefined();
            expect(networkManager._axios.defaults.headers.Origin).toEqual(`https://www.icloud.com.cn`);

            expect(networkManager._streamingAxios).toBeDefined();
            expect(networkManager._streamingAxios.defaults.responseType).toEqual(`stream`);

            expect(networkManager._headerJar).toBeInstanceOf(HeaderJar);
            expect(networkManager._harTracker).toBeUndefined();

            // HeaderJar
            expect((networkManager._axios.interceptors.request as any).handlers).toHaveLength(1);
            expect((networkManager._axios.interceptors.response as any).handlers).toHaveLength(1);

            expect(networkManager._rateLimiter).toBeInstanceOf(PQueue);
            expect(networkManager._streamingCCYLimiter).toBeInstanceOf(PQueue);
            expect(networkManager._streamingCCYLimiter.timeout).toEqual(1000 * 60 * 10);
        });

        test(`Creates a new instance with download timeout disabled`, () => {
            const networkManager = new NetworkManager({
                ...defaultConfig,
                downloadTimeout: Infinity,
            });
            expect(networkManager).toBeInstanceOf(NetworkManager);

            expect(networkManager._axios).toBeDefined();
            expect(networkManager._axios.defaults.headers.Origin).toEqual(`https://www.icloud.com`);

            expect(networkManager._streamingAxios).toBeDefined();
            expect(networkManager._streamingAxios.defaults.responseType).toEqual(`stream`);

            expect(networkManager._headerJar).toBeInstanceOf(HeaderJar);
            expect(networkManager._harTracker).toBeUndefined();

            // HeaderJar
            expect((networkManager._axios.interceptors.request as any).handlers).toHaveLength(1);
            expect((networkManager._axios.interceptors.response as any).handlers).toHaveLength(1);

            expect(networkManager._rateLimiter).toBeInstanceOf(PQueue);
            expect(networkManager._streamingCCYLimiter).toBeInstanceOf(PQueue);
            expect(networkManager._streamingCCYLimiter.timeout).toBeUndefined();
        });

        test(`Creates a new instance with download timeout set to 1`, () => {
            const networkManager = new NetworkManager({
                ...defaultConfig,
                downloadTimeout: 1,
            });
            expect(networkManager).toBeInstanceOf(NetworkManager);

            expect(networkManager._axios).toBeDefined();
            expect(networkManager._axios.defaults.headers.Origin).toEqual(`https://www.icloud.com`);

            expect(networkManager._streamingAxios).toBeDefined();
            expect(networkManager._streamingAxios.defaults.responseType).toEqual(`stream`);

            expect(networkManager._headerJar).toBeInstanceOf(HeaderJar);
            expect(networkManager._harTracker).toBeUndefined();

            // HeaderJar
            expect((networkManager._axios.interceptors.request as any).handlers).toHaveLength(1);
            expect((networkManager._axios.interceptors.response as any).handlers).toHaveLength(1);

            expect(networkManager._rateLimiter).toBeInstanceOf(PQueue);
            expect(networkManager._streamingCCYLimiter).toBeInstanceOf(PQueue);
            expect(networkManager._streamingCCYLimiter.timeout).toEqual(1000 * 60 * 1);
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
            networkManager._harTracker!.resetHar = jest.fn<() => void>();
            networkManager._axios.defaults.baseURL = `https://www.icloud.com`;

            Resources.manager()._resources.enableNetworkCapture = false;
            await networkManager.resetSession();

            expect(networkManager._headerJar.headers.has(`scnt`)).toBeFalsy();
            expect(networkManager._headerJar.headers.has(`X-Apple-ID-Session-Id`)).toBeFalsy();
            expect(networkManager.settleRateLimiter).toHaveBeenCalled();
            expect(networkManager.settleCCYLimiter).toHaveBeenCalled();
            expect(networkManager.writeHarFile).not.toHaveBeenCalled();
            expect(networkManager._harTracker!.resetHar).not.toHaveBeenCalled();

            expect(networkManager._axios.defaults.baseURL).toBeUndefined();
        });

        test(`Reset network - Network capture enabled`, async () => {
            networkManager._headerJar.headers.set(`scnt`, new Header(`icloud.com`, `scnt`, `value`));
            networkManager._headerJar.headers.set(`X-Apple-ID-Session-Id`, new Header(`icloud.com`, `X-Apple-ID-Session-Id`, `value`));
            networkManager.settleRateLimiter = jest.fn<typeof networkManager.settleRateLimiter>();
            networkManager.settleCCYLimiter = jest.fn<typeof networkManager.settleCCYLimiter>();
            networkManager.writeHarFile = jest.fn<typeof networkManager.writeHarFile>();
            networkManager._harTracker!.resetHar = jest.fn<() => void>();
            networkManager._axios.defaults.baseURL = `https://www.icloud.com`;

            Resources.manager()._resources.enableNetworkCapture = true;
            await networkManager.resetSession();

            expect(networkManager._headerJar.headers.has(`scnt`)).toBeFalsy();
            expect(networkManager._headerJar.headers.has(`X-Apple-ID-Session-Id`)).toBeFalsy();
            expect(networkManager.settleRateLimiter).toHaveBeenCalled();
            expect(networkManager.settleCCYLimiter).toHaveBeenCalled();
            expect(networkManager.writeHarFile).toHaveBeenCalled();
            expect(networkManager._harTracker!.resetHar).toHaveBeenCalled();

            expect(networkManager._axios.defaults.baseURL).toBeUndefined();
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
            beforeAll(() => {
                jest.useFakeTimers();
            });

            afterAll(() => {
                jest.useRealTimers();
            });

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
                (networkManager._harTracker! as any).generatedHar.log.entries = [];

                networkManager._harTracker!.getGeneratedHar = jest.fn(() => {
                    throw new Error(`some error`);
                });

                const fileWritten = await networkManager.writeHarFile();

                expect(fileWritten).toBeFalsy();
                expect(fs.existsSync(path.join(Config.defaultConfig.dataDir, `.icloud-photos-sync.har`))).toBeFalsy();
            });

            test(`Network capture enabled - no entries`, async () => {
                Resources.manager()._resources.enableNetworkCapture = true;
                (networkManager._harTracker! as any).generatedHar.log.entries = [];

                const fileWritten = await networkManager.writeHarFile();

                expect(fileWritten).toBeFalsy();
                expect(fs.existsSync(path.join(Config.defaultConfig.dataDir, `.icloud-photos-sync.har`))).toBeFalsy();
            });

            test(`Network capture enabled - valid entries`, async () => {
                Resources.manager()._resources.enableNetworkCapture = true;
                (networkManager._harTracker! as any).generatedHar.log.entries = [{someEntry: `someEntry`}];
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
                expect(Resources.manager()._resources.sessionSecret).toEqual(`someSessionId`);
                expect(networkManager._headerJar.headers.get(`X-Apple-ID-Session-Id`)!.value).toEqual(`someSessionId`);
            });

            test(`set session token`, () => {
                networkManager.sessionToken = `someSessionId`;
                expect(Resources.manager()._resources.sessionSecret).toEqual(`someSessionId`);
                expect(networkManager._headerJar.headers.has(`X-Apple-ID-Session-Id`)).toBeFalsy();
            });

            test(`set photos url`, () => {
                networkManager.photosUrl = `www.someUrl.com`;
                expect(networkManager._axios.defaults.baseURL).toEqual(`www.someUrl.com/database/1/com.apple.photos.cloud/production`);
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
                expect(networkManager._headerJar.headers.get(`X-Apple-ID-Session-Id`)!.value).toEqual(`someSessionToken`);
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

                expect(networkManager._axios.defaults.baseURL).toEqual(expectedPhotosUrl);
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
            test(`metadata get request`, async () => {
                networkManager._axios.get = jest.fn<typeof networkManager._axios.get>() as any;
                networkManager._rateLimiter.add = jest.fn<typeof networkManager._rateLimiter.add>();

                networkManager.get(`someUrl`, {some: `params`} as any);

                // Making sure request is added to the rate limiter queue
                expect(networkManager._rateLimiter.add).toHaveBeenCalledTimes(1);

                expect(networkManager._axios.get).toHaveBeenCalledTimes(0);
                // "firing" from the rate limiter queue
                await (networkManager._rateLimiter.add as any).mock.calls[0][0]();

                expect(networkManager._axios.get).toHaveBeenCalledWith(`someUrl`, {some: `params`} as any);
            });

            test(`metadata post request`, async () => {
                networkManager._axios.post = jest.fn<typeof networkManager._axios.post>() as any;
                networkManager._rateLimiter.add = jest.fn<typeof networkManager._rateLimiter.add>();

                networkManager.post(`someUrl`, {some: `data`}, {some: `params`} as any);

                // Making sure request is added to the rate limiter queue
                expect(networkManager._rateLimiter.add).toHaveBeenCalledTimes(1);

                expect(networkManager._axios.post).toHaveBeenCalledTimes(0);
                // "firing" from the rate limiter queue
                await (networkManager._rateLimiter.add as any).mock.calls[0][0]();

                expect(networkManager._axios.post).toHaveBeenCalledWith(`someUrl`, {some: `data`}, {some: `params`} as any);
            });

            test(`metadata put request`, async () => {
                networkManager._axios.put = jest.fn<typeof networkManager._axios.put>() as any;
                networkManager._rateLimiter.add = jest.fn<typeof networkManager._rateLimiter.add>();

                networkManager.put(`someUrl`, {some: `data`}, {some: `params`} as any);

                // Making sure request is added to the rate limiter queue
                expect(networkManager._rateLimiter.add).toHaveBeenCalledTimes(1);

                expect(networkManager._axios.put).toHaveBeenCalledTimes(0);
                // "firing" from the rate limiter queue
                await (networkManager._rateLimiter.add as any).mock.calls[0][0]();

                expect(networkManager._axios.put).toHaveBeenCalledWith(`someUrl`, {some: `data`}, {some: `params`} as any);
            });

            describe(`Download data`, () => {
                beforeEach(() => {

                });

                afterEach(() => {
                    mockfs.restore();
                });

                test(`Download data - empty directory`, async () => {
                    mockfs({
                        [Config.defaultConfig.dataDir]: {},
                    });

                    const downloadPath = path.join(Config.defaultConfig.dataDir, `some.file`);
                    const data = `someData`;
                    const url = `someUrl`;

                    networkManager._streamingCCYLimiter.add = jest.fn<typeof networkManager._streamingCCYLimiter.add>();
                    networkManager._streamingAxios.get = jest.fn<typeof networkManager._streamingAxios.get>()
                        .mockImplementation((() => {
                            const readableStream = new Stream.Readable();
                            readableStream._read = () => { };
                            readableStream.push(data);
                            readableStream.push(null);
                            return {
                                data: readableStream,
                            };
                        }) as any) as any;

                    networkManager.downloadData(url, downloadPath);

                    // Making sure request is added to CCY limiter queue
                    expect(networkManager._streamingCCYLimiter.add).toHaveBeenCalledTimes(1);

                    // 'firing' from the CCY limiter queue
                    await (networkManager._streamingCCYLimiter.add as any).mock.calls[0][0]();

                    expect(networkManager._streamingAxios.get).toHaveBeenCalledWith(url);
                    expect(fs.existsSync(downloadPath)).toBeTruthy();
                    expect(fs.readFileSync(downloadPath, `utf8`)).toEqual(data);
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

                    networkManager._streamingCCYLimiter.add = jest.fn<typeof networkManager._streamingCCYLimiter.add>();
                    networkManager._streamingAxios.get = jest.fn<typeof networkManager._streamingAxios.get>() as any;

                    networkManager.downloadData(url, downloadPath);

                    // Making sure request is added to CCY limiter queue
                    expect(networkManager._streamingCCYLimiter.add).toHaveBeenCalledTimes(1);

                    // 'firing' from the CCY limiter queue
                    await (networkManager._streamingCCYLimiter.add as any).mock.calls[0][0]();

                    expect(networkManager._streamingAxios.get).not.toHaveBeenCalled();

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

                    networkManager._streamingCCYLimiter.add = jest.fn<typeof networkManager._streamingCCYLimiter.add>();
                    networkManager._streamingAxios.get = jest.fn<typeof networkManager._streamingAxios.get>() as any;

                    networkManager.downloadData(url, downloadPath);

                    // Making sure request is added to CCY limiter queue
                    expect(networkManager._streamingCCYLimiter.add).toHaveBeenCalledTimes(1);

                    // 'firing' from the CCY limiter queue
                    await (networkManager._streamingCCYLimiter.add as any).mock.calls[0][0]();

                    expect(networkManager._streamingAxios.get).not.toHaveBeenCalled();
                });
            });
        });
    });
});