
import {afterEach, beforeAll, beforeEach, describe, expect, jest, test} from '@jest/globals';
import axios from "axios";
import MockAdapter from 'axios-mock-adapter';
import fs from 'fs';
import mockfs from '../_helpers/mock-fs.helper';
import PQueue from 'p-queue';
import path from 'path';
import {Stream} from 'stream';
import {Cookie} from 'tough-cookie';
import {Resources} from '../../src/lib/resources/main';
import {Header, HeaderJar, NetworkCapture, NetworkManager} from "../../src/lib/resources/network-manager";
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

        expect(headerJar.headers.size).toBe(19);
        expect((axiosInstance.interceptors.request as any).handlers.length).toBe(1);
    });

    test(`Should generate a frame id, used as OAuth state`, () => {
        const headerJar = new HeaderJar(axios.create());
        const frameId = headerJar.headers.get(`X-Apple-Frame-Id`)!.value;

        expect(frameId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        expect(headerJar.headers.get(`X-Apple-OAuth-State`)!.value).toEqual(frameId);
        expect(headerJar.headers.get(`X-Apple-Frame-Id`)!.domain).toEqual(`idmsa.apple.com`);

        headerJar.resetFrameId();
        expect(headerJar.headers.get(`X-Apple-Frame-Id`)!.value).not.toEqual(frameId);
        expect(headerJar.headers.get(`X-Apple-OAuth-State`)!.value).toEqual(headerJar.headers.get(`X-Apple-Frame-Id`)!.value);

        headerJar.resetFrameId(`someFrameId`);
        expect(headerJar.headers.get(`X-Apple-Frame-Id`)!.value).toEqual(`someFrameId`);
        expect(headerJar.headers.get(`X-Apple-OAuth-State`)!.value).toEqual(`someFrameId`);
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

describe(`NetworkCapture`, () => {
    let axiosInstance: ReturnType<typeof axios.create>;
    let mock: MockAdapter;
    let networkCapture: NetworkCapture;

    beforeEach(() => {
        prepareResources(); // Only setting up for access to logger
        axiosInstance = axios.create();
        networkCapture = new NetworkCapture(axiosInstance);
        mock = new MockAdapter(axiosInstance, {onNoMatch: `throwException`});
    });

    test(`Should initialize`, () => {
        expect((axiosInstance.interceptors.request as any).handlers).toHaveLength(1);
        expect((axiosInstance.interceptors.response as any).handlers).toHaveLength(1);
        expect(networkCapture.log).toEqual({
            log: {
                version: `1.2`,
                creator: {
                    name: `icloud-photos-sync`,
                    version: `0.0.0-development`,
                },
                pages: [],
                entries: [],
            },
        });
    });

    test(`Should capture a successful request`, async () => {
        axiosInstance.defaults.baseURL = `https://example.com/base`;
        mock.onPost(`https://example.com/base/path`).reply(200, {some: `response`}, {
            'content-type': `application/json`,
            'set-cookie': [`a=b=c; Path=/`, `noValue`],
        });

        await axiosInstance.post(`/path`, {some: `request`}, {
            params: {query: `value`},
            headers: {Cookie: `x=y=; z`, 'X-Unset': false as any},
        });

        expect(networkCapture.log.log.entries).toHaveLength(1);
        const entry = networkCapture.log.log.entries[0];
        expect(entry.startedDateTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(entry.time).toBeGreaterThanOrEqual(0);
        expect(entry.timings.wait).toEqual(entry.time);
        expect(entry._error).toBeUndefined();

        expect(entry.request.method).toEqual(`POST`);
        expect(entry.request.url).toEqual(`https://example.com/base/path?query=value`);
        expect(entry.request.headers).toContainEqual({name: `Cookie`, value: `x=y=; z`});
        expect(entry.request.headers.find(header => header.name === `X-Unset`)).toBeUndefined();
        expect(entry.request.postData).toEqual({
            mimeType: `application/json`,
            text: `{"some":"request"}`,
        });
        expect(entry.request.bodySize).toEqual(18);

        expect(entry.response.status).toEqual(200);
        expect(entry.response.headers).toEqual([
            {name: `content-type`, value: `application/json`},
            {name: `set-cookie`, value: `a=b=c; Path=/`},
            {name: `set-cookie`, value: `noValue`},
        ]);
        expect(entry.response.content).toEqual({
            size: 19,
            mimeType: `application/json`,
            text: `{"some":"response"}`,
        });
    });

    test(`Should capture a request without body`, async () => {
        mock.onGet(`https://example.com/path`).reply(204);

        await axiosInstance.get(`https://example.com/path`);

        const entry = networkCapture.log.log.entries[0];
        expect(entry.request.method).toEqual(`GET`);
        expect(entry.request.postData).toBeUndefined();
        expect(entry.request.bodySize).toEqual(0);
        expect(entry.response.status).toEqual(204);
        expect(entry.response.headers).toEqual([]);
        expect(entry.response.content).toEqual({size: 0, mimeType: ``, text: undefined});
    });

    test(`Should capture a text response`, async () => {
        mock.onGet(`https://example.com/path`).reply(200, `<html></html>`, {'Content-Type': `text/html`});

        await axiosInstance.get(`https://example.com/path`);

        expect(networkCapture.log.log.entries[0].response.content).toEqual({
            size: 13,
            mimeType: `text/html`,
            text: `<html></html>`,
        });
    });

    test(`Should capture an error response and rethrow`, async () => {
        mock.onPost(`https://example.com/path`).reply(409, {error: `conflict`}, {scnt: `someScnt`});

        await expect(axiosInstance.post(`https://example.com/path`, `plain text`)).rejects.toThrow(`Request failed with status code 409`);

        expect(networkCapture.log.log.entries).toHaveLength(1);
        const entry = networkCapture.log.log.entries[0];
        // axios-mock-adapter does not set an error code for error responses, axios itself uses ERR_BAD_REQUEST
        expect(entry._error).toMatch(/^\w+: Request failed with status code 409$/);
        expect(entry.request.postData!.text).toEqual(`plain text`);
        expect(entry.response.status).toEqual(409);
        expect(entry.response.headers).toEqual([{name: `scnt`, value: `someScnt`}]);
        expect(entry.response.content.text).toEqual(`{"error":"conflict"}`);
    });

    test.each([
        {
            desc: `network error`,
            setup: (m: MockAdapter) => m.onGet(`https://example.com/path`).networkError(),
            expectedError: /^\w+: Network Error$/, // axios-mock-adapter does not set an error code for network errors, axios itself uses ERR_NETWORK
        }, {
            desc: `timeout`,
            setup: (m: MockAdapter) => m.onGet(`https://example.com/path`).timeout(),
            expectedError: /^ECONNABORTED: timeout of 0ms exceeded$/,
        },
    ])(`Should capture a request without response - $desc`, async ({setup, expectedError}) => {
        setup(mock);

        await expect(axiosInstance.get(`https://example.com/path`)).rejects.toMatchObject({isAxiosError: true});

        expect(networkCapture.log.log.entries).toHaveLength(1);
        const entry = networkCapture.log.log.entries[0];
        expect(entry._error).toMatch(expectedError);
        expect(entry.request.url).toEqual(`https://example.com/path`);
        expect(entry.response.status).toEqual(0);
        expect(entry.response.headers).toEqual([]);
    });

    test(`Should rethrow non-axios errors without capturing`, () => {
        const error = new Error(`some error`);

        expect(() => networkCapture._captureError(error)).toThrow(error);
        expect(networkCapture.log.log.entries).toHaveLength(0);
    });

    test(`Should capture concurrent requests independently`, async () => {
        mock.onPost(`https://example.com/slow`).reply(async () => {
            await new Promise(resolve => setTimeout(resolve, 50));
            return [200, `slow`];
        });
        mock.onPost(`https://example.com/fast`).reply(200, `fast`);

        await Promise.all([
            axiosInstance.post(`https://example.com/slow`, `slowRequest`),
            axiosInstance.post(`https://example.com/fast`, `fastRequest`),
        ]);

        const entries = networkCapture.log.log.entries;
        expect(entries.map(entry => [entry.request.url, entry.request.postData!.text, entry.response.content.text])).toEqual([
            [`https://example.com/fast`, `fastRequest`, `fast`],
            [`https://example.com/slow`, `slowRequest`, `slow`],
        ]);
        expect(entries[1].time).toBeGreaterThanOrEqual(40);
    });

    test(`Should not fail the request if capturing fails`, async () => {
        mock.onGet(`https://example.com/path`).reply(200, `ok`);
        axiosInstance.getUri = jest.fn<typeof axiosInstance.getUri>(() => {
            throw new Error(`some error`);
        });

        await expect(axiosInstance.get(`https://example.com/path`)).resolves.toMatchObject({data: `ok`});
        expect(networkCapture.log.log.entries).toHaveLength(0);
    });

    test(`Should reset captured entries`, async () => {
        mock.onGet(`https://example.com/path`).reply(200);
        await axiosInstance.get(`https://example.com/path`);
        expect(networkCapture.log.log.entries).toHaveLength(1);

        networkCapture.reset();

        expect(networkCapture.log.log.entries).toHaveLength(0);
    });

    test(`Should capture plain header objects`, () => {
        expect(networkCapture._toNameValue({a: `b`, c: [`d`, `e`], f: undefined, g: null, h: 1})).toEqual([
            {name: `a`, value: `b`},
            {name: `c`, value: `d`},
            {name: `c`, value: `e`},
            {name: `h`, value: `1`},
        ]);
    });

    test(`Should capture headers and cookies applied by the header jar`, async () => {
        const networkManager = new NetworkManager({...defaultConfig, enableNetworkCapture: true});
        const networkManagerMock = new MockAdapter(networkManager._axios, {onNoMatch: `throwException`});
        networkManager._headerJar.setCookie(`aasp=someCookie=; Domain=idmsa.apple.com; Path=/`);
        networkManagerMock.onGet(`https://idmsa.apple.com/appleauth/auth`).reply(200);

        await networkManager._axios.get(`https://idmsa.apple.com/appleauth/auth`);

        const headers = networkManager._networkCapture!.log.log.entries[0].request.headers;
        expect(headers).toContainEqual({name: `Cookie`, value: `aasp=someCookie=`});
        expect(headers).toContainEqual({name: `X-Apple-Domain-Id`, value: `3`});
        expect(headers).toContainEqual({name: `Origin`, value: `https://idmsa.apple.com`});
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
            expect(networkManager._networkCapture).toBeUndefined();

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
            expect(networkManager._networkCapture).toBeInstanceOf(NetworkCapture);

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
            expect(networkManager._networkCapture).toBeUndefined();

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
            expect(networkManager._networkCapture).toBeUndefined();

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
            expect(networkManager._networkCapture).toBeUndefined();

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
            networkManager._networkCapture!.reset = jest.fn<() => void>();
            networkManager._axios.defaults.baseURL = `https://www.icloud.com`;

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

            expect(networkManager._axios.defaults.baseURL).toBeUndefined();
        });

        test(`Reset network - Network capture enabled`, async () => {
            networkManager._headerJar.headers.set(`scnt`, new Header(`icloud.com`, `scnt`, `value`));
            networkManager._headerJar.headers.set(`X-Apple-ID-Session-Id`, new Header(`icloud.com`, `X-Apple-ID-Session-Id`, `value`));
            networkManager.settleRateLimiter = jest.fn<typeof networkManager.settleRateLimiter>();
            networkManager.settleCCYLimiter = jest.fn<typeof networkManager.settleCCYLimiter>();
            networkManager.writeHarFile = jest.fn<typeof networkManager.writeHarFile>();
            networkManager._networkCapture!.reset = jest.fn<() => void>();
            networkManager._axios.defaults.baseURL = `https://www.icloud.com`;

            Resources.manager()._resources.enableNetworkCapture = true;
            await networkManager.resetSession();

            expect(networkManager._headerJar.headers.has(`scnt`)).toBeFalsy();
            expect(networkManager._headerJar.headers.has(`X-Apple-ID-Session-Id`)).toBeFalsy();
            expect(networkManager.settleRateLimiter).toHaveBeenCalled();
            expect(networkManager.settleCCYLimiter).toHaveBeenCalled();
            expect(networkManager.writeHarFile).toHaveBeenCalled();
            expect(networkManager._networkCapture!.reset).toHaveBeenCalled();

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
                networkManager._rateLimiter.add = jest.fn<typeof networkManager._rateLimiter.add>() as any;

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
                networkManager._rateLimiter.add = jest.fn<typeof networkManager._rateLimiter.add>() as any;

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
                networkManager._rateLimiter.add = jest.fn<typeof networkManager._rateLimiter.add>() as any;

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

                    networkManager._streamingCCYLimiter.add = jest.fn<typeof networkManager._streamingCCYLimiter.add>() as any;
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

                    networkManager._streamingCCYLimiter.add = jest.fn<typeof networkManager._streamingCCYLimiter.add>() as any;
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

                    networkManager._streamingCCYLimiter.add = jest.fn<typeof networkManager._streamingCCYLimiter.add>() as any;
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