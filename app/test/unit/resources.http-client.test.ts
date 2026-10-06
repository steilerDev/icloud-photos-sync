import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, jest, test} from '@jest/globals';
import fs from 'fs';
import http from 'http';
import {AddressInfo} from 'net';
import path from 'path';
import {gzipSync} from 'zlib';
import {Cookie} from 'tough-cookie';
import {iCPSError} from '../../src/app/error/error';
import {VALIDATOR_ERR} from '../../src/app/error/error-codes';
import {Header, HeaderJar, HttpClient, HttpError, HttpRequest, isHttpError, NetworkCapture, NO_VALIDATION} from '../../src/lib/resources/http-client';
import {NetworkManager} from '../../src/lib/resources/network-manager';
import * as Config from '../_helpers/_config';
import {defaultConfig} from '../_helpers/_config';
import {addHoursToCurrentDate, getDateInThePast, prepareResources} from '../_helpers/_general';
import {HttpMock} from '../_helpers/http-mock.helper';
import mockfs from '../_helpers/mock-fs.helper';

describe(`HeaderJar`, () => {
    beforeAll(() => {
        prepareResources(); // Only setting up for access to logger
    });

    test(`Should initialize`, () => {
        const headerJar = new HeaderJar();

        expect(headerJar.headers.size).toBe(19);
    });

    test(`Should generate a frame id, used as OAuth state`, () => {
        const headerJar = new HeaderJar();
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
                const headerJar = new HeaderJar();
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
            const headerJar = new HeaderJar();

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
            const headerJar = new HeaderJar();
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
            const headerJar = new HeaderJar();
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
    let client: HttpClient;
    let mock: HttpMock;
    let networkCapture: NetworkCapture;

    beforeEach(() => {
        prepareResources(); // Only setting up for access to logger
        networkCapture = new NetworkCapture();
        client = new HttpClient({networkCapture});
        mock = new HttpMock(client, {onNoMatch: `throwException`});
    });

    test(`Should initialize`, () => {
        expect(client.networkCapture).toBe(networkCapture);
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
        client.baseURL = `https://example.com/base`;
        mock.onPost(`https://example.com/base/path`).reply(200, {some: `response`}, {
            'content-type': `application/json`,
            'set-cookie': [`a=b=c; Path=/`, `noValue`],
        });

        await client.post(`/path`, {some: `request`}, NO_VALIDATION, {
            params: {query: `value`},
            headers: {Cookie: `x=y=; z`},
        });

        expect(networkCapture.log.log.entries).toHaveLength(1);
        const entry = networkCapture.log.log.entries[0];
        expect(entry.startedDateTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(entry.time).toBeGreaterThanOrEqual(0);
        expect(entry.timings.wait).toEqual(entry.time);
        expect(entry._error).toBeUndefined();

        expect(entry.request.method).toEqual(`POST`);
        expect(entry.request.url).toEqual(`https://example.com/base/path?query=value`);
        expect(entry.request.queryString).toEqual([{name: `query`, value: `value`}]);
        expect(entry.request.headers).toContainEqual({name: `Cookie`, value: `x=y=; z`});
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

        await client.get(`https://example.com/path`, NO_VALIDATION);

        const entry = networkCapture.log.log.entries[0];
        expect(entry.request.method).toEqual(`GET`);
        expect(entry.request.postData).toBeUndefined();
        expect(entry.request.bodySize).toEqual(0);
        expect(entry.request.queryString).toEqual([]);
        expect(entry.response.status).toEqual(204);
        expect(entry.response.headers).toEqual([]);
        expect(entry.response.content).toEqual({size: 0, mimeType: ``, text: undefined});
    });

    test(`Should capture a text response`, async () => {
        mock.onGet(`https://example.com/path`).reply(200, `<html></html>`, {'Content-Type': `text/html`});

        await client.get(`https://example.com/path`, NO_VALIDATION);

        expect(networkCapture.log.log.entries[0].response.content).toEqual({
            size: 13,
            mimeType: `text/html`,
            text: `<html></html>`,
        });
    });

    test(`Should capture an error response and rethrow`, async () => {
        mock.onPost(`https://example.com/path`).reply(409, {error: `conflict`}, {scnt: `someScnt`});

        await expect(client.post(`https://example.com/path`, `plain text`, NO_VALIDATION)).rejects.toThrow(`Request failed with status code 409`);

        expect(networkCapture.log.log.entries).toHaveLength(1);
        const entry = networkCapture.log.log.entries[0];
        expect(entry._error).toEqual(`ERR_BAD_REQUEST: Request failed with status code 409`);
        expect(entry.request.postData).toEqual({mimeType: ``, text: `plain text`});
        expect(entry.response.status).toEqual(409);
        expect(entry.response.headers).toEqual([{name: `scnt`, value: `someScnt`}]);
        expect(entry.response.content.text).toEqual(`{"error":"conflict"}`);
    });

    test.each([
        {
            desc: `network error`,
            setup: (m: HttpMock) => m.onGet(`https://example.com/path`).networkError(),
            expectedError: `ERR_NETWORK: Network Error`,
        }, {
            desc: `timeout`,
            setup: (m: HttpMock) => m.onGet(`https://example.com/path`).timeout(),
            expectedError: `ECONNABORTED: The operation was aborted due to timeout`,
        },
    ])(`Should capture a request without response - $desc`, async ({setup, expectedError}) => {
        setup(mock);

        await expect(client.get(`https://example.com/path`, NO_VALIDATION)).rejects.toBeInstanceOf(HttpError);

        expect(networkCapture.log.log.entries).toHaveLength(1);
        const entry = networkCapture.log.log.entries[0];
        expect(entry._error).toEqual(expectedError);
        expect(entry.request.url).toEqual(`https://example.com/path`);
        expect(entry.response.status).toEqual(0);
        expect(entry.response.headers).toEqual([]);
    });

    test(`Should capture a response failing validation without error`, async () => {
        mock.onGet(`https://example.com/path`).reply(200, `ok`);
        const validationError = new iCPSError(VALIDATOR_ERR.SIGNIN_RESPONSE);

        await expect(client.get(`https://example.com/path`, () => {
            throw validationError;
        })).rejects.toBe(validationError);

        expect(networkCapture.log.log.entries).toHaveLength(1);
        expect(networkCapture.log.log.entries[0]._error).toBeUndefined();
        expect(networkCapture.log.log.entries[0].response.status).toEqual(200);
    });

    test(`Should capture concurrent requests independently`, async () => {
        mock.onPost(`https://example.com/slow`).reply(async () => {
            await new Promise(resolve => setTimeout(resolve, 50));
            return [200, `slow`];
        });
        mock.onPost(`https://example.com/fast`).reply(200, `fast`);

        await Promise.all([
            client.post(`https://example.com/slow`, `slowRequest`, NO_VALIDATION),
            client.post(`https://example.com/fast`, `fastRequest`, NO_VALIDATION),
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
        networkCapture._toNameValue = jest.fn<typeof networkCapture._toNameValue>(() => {
            throw new Error(`some error`);
        });

        await expect(client.get(`https://example.com/path`, NO_VALIDATION)).resolves.toMatchObject({data: `ok`});
        expect(networkCapture.log.log.entries).toHaveLength(0);
    });

    test(`Should reset captured entries`, async () => {
        mock.onGet(`https://example.com/path`).reply(200);
        await client.get(`https://example.com/path`, NO_VALIDATION);
        expect(networkCapture.log.log.entries).toHaveLength(1);

        networkCapture.reset();

        expect(networkCapture.log.log.entries).toHaveLength(0);
    });

    test(`Should capture plain header objects`, () => {
        expect(networkCapture._toNameValue({a: `b`, c: [`d`, `e`], f: undefined, g: null, h: 1, i: false})).toEqual([
            {name: `a`, value: `b`},
            {name: `c`, value: `d`},
            {name: `c`, value: `e`},
            {name: `h`, value: `1`},
        ]);
    });

    test(`Should capture headers and cookies applied by the header jar`, async () => {
        const networkManager = new NetworkManager({...defaultConfig, enableNetworkCapture: true});
        const networkManagerMock = new HttpMock(networkManager._http, {onNoMatch: `throwException`});
        networkManager._headerJar.setCookie(`aasp=someCookie=; Domain=idmsa.apple.com; Path=/`);
        networkManagerMock.onGet(`https://idmsa.apple.com/appleauth/auth`).reply(200);

        await networkManager._http.get(`https://idmsa.apple.com/appleauth/auth`, NO_VALIDATION);

        const headers = networkManager._networkCapture!.log.log.entries[0].request.headers;
        expect(headers).toContainEqual({name: `Cookie`, value: `aasp=someCookie=`});
        expect(headers).toContainEqual({name: `X-Apple-Domain-Id`, value: `3`});
        expect(headers).toContainEqual({name: `Origin`, value: `https://idmsa.apple.com`});
    });
});

describe(`HttpClient`, () => {
    let client: HttpClient;
    let mock: HttpMock;

    beforeEach(() => {
        prepareResources(); // Only setting up for access to logger
        client = new HttpClient();
        mock = new HttpMock(client, {onNoMatch: `throwException`});
    });

    test(`Should initialize`, () => {
        const headerJar = new HeaderJar();
        const networkCapture = new NetworkCapture();
        const configuredClient = new HttpClient({
            baseURL: `https://example.com`,
            headers: {some: `header`},
            headerJar,
            networkCapture,
        });

        expect(configuredClient.baseURL).toEqual(`https://example.com`);
        expect(configuredClient.defaultHeaders).toEqual({some: `header`});
        expect(configuredClient.headerJar).toBe(headerJar);
        expect(configuredClient.networkCapture).toBe(networkCapture);

        expect(client.baseURL).toBeUndefined();
        expect(client.defaultHeaders).toEqual({});
        expect(client.headerJar).toBeUndefined();
        expect(client.networkCapture).toBeUndefined();
    });

    describe(`Request building`, () => {
        test.each([
            {
                desc: `Absolute URL without base URL`,
                baseURL: undefined,
                url: `https://example.com/path`,
                params: undefined,
                expected: `https://example.com/path`,
            }, {
                desc: `Relative URL without base URL`,
                baseURL: undefined,
                url: `/path`,
                params: undefined,
                expected: `/path`,
            }, {
                desc: `Relative URL with base URL`,
                baseURL: `https://example.com/base`,
                url: `/path`,
                params: undefined,
                expected: `https://example.com/base/path`,
            }, {
                desc: `Relative URL with trailing slash in base URL`,
                baseURL: `https://example.com/base/`,
                url: `path`,
                params: undefined,
                expected: `https://example.com/base/path`,
            }, {
                desc: `Empty URL with base URL`,
                baseURL: `https://example.com/base`,
                url: ``,
                params: undefined,
                expected: `https://example.com/base`,
            }, {
                desc: `Absolute URL with base URL`,
                baseURL: `https://example.com/base`,
                url: `https://other.com/path`,
                params: undefined,
                expected: `https://other.com/path`,
            }, {
                desc: `Query parameters`,
                baseURL: undefined,
                url: `https://example.com/path`,
                params: {remapEnums: `True`, some: `value with space`},
                expected: `https://example.com/path?remapEnums=True&some=value+with+space`,
            }, {
                desc: `Query parameters appended to existing query`,
                baseURL: undefined,
                url: `https://example.com/path?existing=1`,
                params: {isRememberMeEnabled: `true`},
                expected: `https://example.com/path?existing=1&isRememberMeEnabled=true`,
            }, {
                desc: `Empty query parameters`,
                baseURL: undefined,
                url: `https://example.com/path`,
                params: {},
                expected: `https://example.com/path`,
            },
        ])(`Resolve URL - $desc`, ({baseURL, url, params, expected}) => {
            client.baseURL = baseURL;
            expect(client._resolveURL(url, params)).toEqual(expected);
        });

        test.each([
            {
                desc: `Object body`,
                data: {some: `data`},
                headers: undefined,
                expectedData: `{"some":"data"}`,
                expectedHeaders: {'Content-Type': `application/json`},
            }, {
                desc: `Object body with content type`,
                data: {some: `data`},
                headers: {'content-type': `text/plain`},
                expectedData: `{"some":"data"}`,
                expectedHeaders: {'content-type': `text/plain`},
            }, {
                desc: `String body`,
                data: `some data`,
                headers: undefined,
                expectedData: `some data`,
                expectedHeaders: {},
            }, {
                desc: `No body`,
                data: undefined,
                headers: undefined,
                expectedData: undefined,
                expectedHeaders: {},
            }, {
                desc: `Null body`,
                data: null,
                headers: undefined,
                expectedData: undefined,
                expectedHeaders: {},
            },
        ])(`Serialize body - $desc`, ({data, headers, expectedData, expectedHeaders}) => {
            const request = client._buildRequest(`POST`, `https://example.com`, data, {headers});

            expect(request.data).toEqual(expectedData);
            expect(request.headers).toEqual(expectedHeaders);
        });

        test(`Header precedence: default headers < request headers < header jar`, () => {
            const headerJar = new HeaderJar();
            headerJar.headers.clear();
            headerJar.setHeader(new Header(``, `Jar`, `jar`));
            client = new HttpClient({
                headers: {Default: `default`, Request: `default`, Jar: `default`},
                headerJar,
            });

            const request = client._buildRequest(`GET`, `https://example.com`, undefined, {headers: {Request: `request`, Jar: `request`}});

            expect(request.headers).toEqual({Default: `default`, Request: `request`, Jar: `jar`});
        });

        test(`Request properties`, () => {
            client.baseURL = `https://example.com`;
            const request = client._buildRequest(`PUT`, `/path`, undefined, {params: {a: `b`}});

            expect(request).toEqual({
                method: `PUT`,
                url: `/path`,
                baseURL: `https://example.com`,
                fullURL: `https://example.com/path?a=b`,
                params: {a: `b`},
                headers: {},
                startedAt: expect.any(Number),
            });
        });

        test(`Request is handed to the transport synchronously`, async () => {
            mock.onPost(`https://example.com`).reply(200);

            const pending = client.post(`https://example.com`, `data`, NO_VALIDATION);
            expect(mock.history.post).toHaveLength(1);

            await pending;
        });

        test(`Failure while building the request rejects`, async () => {
            await expect(client.post(`https://example.com`, {big: BigInt(1)}, NO_VALIDATION)).rejects.toThrow(TypeError);
            expect(mock.history.post).toHaveLength(0);
        });

        test.each([
            {method: `GET`, call: (c: HttpClient) => c.get(`https://example.com`, NO_VALIDATION, {params: {a: `b`}})},
            {method: `POST`, call: (c: HttpClient) => c.post(`https://example.com`, {a: `b`}, NO_VALIDATION, {params: {a: `b`}})},
            {method: `PUT`, call: (c: HttpClient) => c.put(`https://example.com`, {a: `b`}, NO_VALIDATION, {params: {a: `b`}})},
        ])(`$method request`, async ({method, call}) => {
            mock.onAny(`https://example.com`).reply(200);

            await call(client);

            const request = mock.history[method.toLowerCase() as `get` | `post` | `put`][0];
            expect(request.method).toEqual(method);
            expect(request.fullURL).toEqual(`https://example.com?a=b`);
        });
    });

    describe(`Response handling`, () => {
        test.each([
            {desc: `JSON body`, body: `{"some":"data"}`, expected: {some: `data`}},
            {desc: `Text body`, body: `<html></html>`, expected: `<html></html>`},
            {desc: `Empty body`, body: ``, expected: ``},
            {desc: `JSON primitive`, body: `123`, expected: 123},
        ])(`Parse body - $desc`, ({body, expected}) => {
            expect(client._parseBody(body)).toEqual(expected);
        });

        test(`Normalizes headers`, async () => {
            mock.onGet(`https://example.com`).reply(200, `ok`, {
                'X-Some-Header': `value`,
                'Set-Cookie': [`a=b`, `c=d`],
            });

            const response = await client.get(`https://example.com`, NO_VALIDATION);

            expect(response.headers).toEqual({
                'x-some-header': `value`,
                'set-cookie': [`a=b`, `c=d`],
            });
        });

        test(`Omits set-cookie header if not present`, async () => {
            mock.onGet(`https://example.com`).reply(200, `ok`, {'X-Some-Header': `value`});

            const response = await client.get(`https://example.com`, NO_VALIDATION);

            expect(response.headers).toEqual({'x-some-header': `value`});
            expect(response.config).toBe(mock.history.get[0]);
        });

        test.each([
            {status: 200, validateStatus: undefined, accepted: true},
            {status: 204, validateStatus: undefined, accepted: true},
            {status: 302, validateStatus: undefined, accepted: false, code: `ERR_BAD_RESPONSE`},
            {status: 409, validateStatus: undefined, accepted: false, code: `ERR_BAD_REQUEST`},
            {status: 500, validateStatus: undefined, accepted: false, code: `ERR_BAD_RESPONSE`},
            {status: 409, validateStatus: (status: number) => status === 409, accepted: true},
            {status: 200, validateStatus: (status: number) => status === 409, accepted: false, code: `ERR_BAD_RESPONSE`},
        ])(`Status $status (custom validation: $validateStatus)`, async ({status, validateStatus, accepted, code}) => {
            mock.onGet(`https://example.com`).reply(status, {some: `data`});

            const request = client.get(`https://example.com`, NO_VALIDATION, {validateStatus});

            if (accepted) {
                await expect(request).resolves.toMatchObject({status, data: {some: `data`}});
                return;
            }

            await expect(request).rejects.toMatchObject({
                name: `HttpError`,
                code,
                message: `Request failed with status code ${status}`,
                response: {status, data: {some: `data`}},
                request: {fullURL: `https://example.com`},
            });
        });

        test(`Returns validated value`, async () => {
            mock.onGet(`https://example.com`).reply(200, {some: `data`});
            const validator = jest.fn((response: any) => response.data.some as string);

            await expect(client.get(`https://example.com`, validator)).resolves.toEqual(`data`);
            expect(validator).toHaveBeenCalledWith(expect.objectContaining({status: 200, data: {some: `data`}}));
        });

        test(`Propagates validation error`, async () => {
            mock.onGet(`https://example.com`).reply(200, {some: `data`});
            const validationError = new iCPSError(VALIDATOR_ERR.SIGNIN_RESPONSE);

            await expect(client.get(`https://example.com`, () => {
                throw validationError;
            })).rejects.toBe(validationError);
        });

        test(`Does not validate rejected status`, async () => {
            mock.onGet(`https://example.com`).reply(500);
            const validator = jest.fn(NO_VALIDATION);

            await expect(client.get(`https://example.com`, validator)).rejects.toBeInstanceOf(HttpError);
            expect(validator).not.toHaveBeenCalled();
        });

        test.each([
            {desc: `accepted response`, status: 200, extracted: true},
            {desc: `rejected response`, status: 409, extracted: false},
        ])(`Extracts headers into the header jar only from $desc`, async ({status, extracted}) => {
            const headerJar = new HeaderJar();
            client = new HttpClient({headerJar});
            mock = new HttpMock(client);
            mock.onPost(`https://idmsa.apple.com/appleauth/auth`).reply(status, ``, {scnt: `someScnt`, 'set-cookie': [`aasp=someValue; Domain=idmsa.apple.com`]});

            await client.post(`https://idmsa.apple.com/appleauth/auth`, {}, NO_VALIDATION).catch(() => undefined);

            expect(headerJar.headers.get(`scnt`)?.value).toEqual(extracted ? `someScnt` : undefined);
            expect(headerJar.cookies.has(`aasp`)).toBe(extracted);
        });

        test(`Unmatched mock request is reported as network error`, async () => {
            await expect(client.get(`https://example.com/unknown`, NO_VALIDATION)).rejects.toMatchObject({
                code: `ERR_NETWORK`,
                message: `Could not find mock for GET https://example.com/unknown`,
            });
        });
    });

    describe(`HttpError`, () => {
        const request: HttpRequest = {method: `GET`, url: `https://example.com`, fullURL: `https://example.com`, headers: {}, startedAt: 0};

        test.each([
            {
                desc: `Connection refused`,
                err: new TypeError(`fetch failed`, {cause: Object.assign(new Error(`connect ECONNREFUSED 127.0.0.1:1`), {code: `ECONNREFUSED`})}),
                code: `ECONNREFUSED`,
                message: `connect ECONNREFUSED 127.0.0.1:1`,
            }, {
                desc: `DNS failure`,
                err: new TypeError(`fetch failed`, {cause: Object.assign(new Error(`getaddrinfo ENOTFOUND example.invalid`), {code: `ENOTFOUND`})}),
                code: `ENOTFOUND`,
                message: `getaddrinfo ENOTFOUND example.invalid`,
            }, {
                desc: `Cause without code`,
                err: new TypeError(`fetch failed`, {cause: new Error(`some cause`)}),
                code: `ERR_NETWORK`,
                message: `some cause`,
            }, {
                desc: `Error without cause`,
                err: new TypeError(`terminated`),
                code: `ERR_NETWORK`,
                message: `terminated`,
            }, {
                desc: `Timeout`,
                err: new DOMException(`The operation was aborted due to timeout`, `TimeoutError`),
                code: `ECONNABORTED`,
                message: `The operation was aborted due to timeout`,
            }, {
                desc: `Abort`,
                err: new DOMException(`This operation was aborted`, `AbortError`),
                code: `ECONNABORTED`,
                message: `This operation was aborted`,
            }, {
                desc: `Non-error value`,
                err: `some string`,
                code: `ERR_NETWORK`,
                message: `some string`,
            },
        ])(`From network error - $desc`, ({err, code, message}) => {
            const httpError = HttpError.fromNetworkError(err, request);

            expect(httpError).toBeInstanceOf(HttpError);
            expect(httpError.code).toEqual(code);
            expect(httpError.message).toEqual(message);
            expect(httpError.cause).toBe(err);
            expect(httpError.request).toBe(request);
            expect(httpError.response).toBeUndefined();
            // The code needs to be an own property, in order to be picked up for the error code stack
            expect(Object.hasOwn(httpError, `code`)).toBeTruthy();
        });

        test(`From network error - HttpError is passed through`, () => {
            const httpError = new HttpError(`some error`, `SOME_CODE`, request);
            expect(HttpError.fromNetworkError(httpError, request)).toBe(httpError);
        });

        test(`Type guard`, () => {
            expect(isHttpError(new HttpError(`some error`, `SOME_CODE`, request))).toBeTruthy();
            expect(isHttpError(new Error(`some error`))).toBeFalsy();
            expect(isHttpError(undefined)).toBeFalsy();
        });

        test(`Error code stack`, () => {
            const httpError = new HttpError(`Request failed with status code 404`, `ERR_BAD_REQUEST`, request);
            const err = new iCPSError(VALIDATOR_ERR.SIGNIN_RESPONSE).addCause(httpError);

            expect(err.getErrorCodeStack()).toEqual([VALIDATOR_ERR.SIGNIN_RESPONSE.code, `EXT#ERR_BAD_REQUEST`]);
        });
    });
});

describe(`HttpClient with fetch`, () => {
    let server: http.Server;
    let baseURL: string;
    let receivedRequests: {method?: string, url?: string, headers: http.IncomingHttpHeaders, body: string}[];

    beforeAll(async () => {
        server = http.createServer((req, res) => {
            let body = ``;
            req.on(`data`, chunk => {
                body += chunk;
            });
            req.on(`end`, () => {
                receivedRequests.push({method: req.method, url: req.url, headers: req.headers, body});
                switch (req.url?.split(`?`)[0]) {
                case `/json`:
                    res.writeHead(200, {
                        'Content-Type': `application/json`,
                        'Content-Encoding': `gzip`,
                        'Set-Cookie': [`a=b; Path=/`, `c=d; Path=/`],
                        scnt: `someScnt`,
                    });
                    res.end(gzipSync(JSON.stringify({some: `data`})));
                    return;
                case `/redirect`:
                    res.writeHead(302, {Location: `/json`});
                    res.end();
                    return;
                case `/empty`:
                    res.writeHead(204);
                    res.end();
                    return;
                case `/download`:
                    res.writeHead(200, {'Content-Type': `application/octet-stream`});
                    res.end(`someData`);
                    return;
                case `/download-error`:
                    res.writeHead(500);
                    res.end(`error`);
                    return;
                case `/download-interrupted`:
                    res.writeHead(200, {'Content-Length': `100`});
                    res.write(`partial`, () => setTimeout(() => res.socket?.destroy(), 20));
                    return;
                case `/download-stalled`:
                    res.writeHead(200, {'Content-Length': `100`});
                    res.write(`partial`);
                    return;
                case `/stalled`:
                    return;
                default:
                    res.writeHead(404);
                    res.end();
                }
            });
        });
        await new Promise<void>(resolve => server.listen(0, `127.0.0.1`, resolve));
        baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    afterAll(async () => {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    });

    beforeEach(() => {
        prepareResources(); // Only setting up for access to logger
        receivedRequests = [];
    });

    test(`Sends request with header jar headers and parses compressed response`, async () => {
        const headerJar = new HeaderJar();
        headerJar.setCookie(`someCookie=someValue; Domain=127.0.0.1`);
        const client = new HttpClient({baseURL, headers: {Origin: `https://www.icloud.com`}, headerJar});

        const response = await client.post(`/json`, {some: `request`}, NO_VALIDATION, {params: {remapEnums: `True`}});

        expect(response.status).toEqual(200);
        expect(response.data).toEqual({some: `data`});
        expect(response.headers[`set-cookie`]).toEqual([`a=b; Path=/`, `c=d; Path=/`]);
        expect(response.headers.scnt).toEqual(`someScnt`);
        // Cookies are extracted into the jar
        expect(headerJar.cookies.has(`a`)).toBeTruthy();
        expect(headerJar.cookies.has(`c`)).toBeTruthy();

        expect(receivedRequests).toHaveLength(1);
        expect(receivedRequests[0].method).toEqual(`POST`);
        expect(receivedRequests[0].url).toEqual(`/json?remapEnums=True`);
        expect(receivedRequests[0].body).toEqual(`{"some":"request"}`);
        expect(receivedRequests[0].headers).toMatchObject({
            accept: `application/json`,
            'content-type': `application/json`,
            'accept-encoding': `gzip, deflate, br`,
            'user-agent': expect.stringMatching(/Chrome/),
            origin: `https://www.icloud.com`,
            cookie: `someCookie=someValue`,
        });
    });

    test(`Follows redirects`, async () => {
        const client = new HttpClient({baseURL});

        const response = await client.get(`/redirect`, NO_VALIDATION);

        expect(response.status).toEqual(200);
        expect(response.data).toEqual({some: `data`});
        expect(receivedRequests.map(request => request.url)).toEqual([`/redirect`, `/json`]);
    });

    test(`Handles empty responses`, async () => {
        const client = new HttpClient({baseURL});

        const response = await client.put(`/empty`, undefined, NO_VALIDATION);

        expect(response.status).toEqual(204);
        expect(response.data).toEqual(``);
        expect(receivedRequests[0].body).toEqual(``);
    });

    test(`Rejects with the network error code`, async () => {
        const closedServer = http.createServer();
        await new Promise<void>(resolve => closedServer.listen(0, `127.0.0.1`, resolve));
        const closedURL = `http://127.0.0.1:${(closedServer.address() as AddressInfo).port}`;
        await new Promise(resolve => closedServer.close(resolve));

        const client = new HttpClient({baseURL: closedURL});

        await expect(client.get(`/json`, NO_VALIDATION)).rejects.toMatchObject({
            name: `HttpError`,
            code: `ECONNREFUSED`,
        });
    });

    describe(`Download`, () => {
        const downloadPath = path.join(Config.defaultConfig.dataDir, `some.file`);
        let client: HttpClient;

        beforeEach(() => {
            mockfs({
                [Config.defaultConfig.dataDir]: {},
            });
            client = new HttpClient({headerJar: new HeaderJar()});
        });

        afterEach(() => {
            mockfs.restore();
        });

        test(`Writes the body to disk without applying the header jar`, async () => {
            await client.download(`${baseURL}/download`, downloadPath);

            expect(fs.readFileSync(downloadPath, `utf8`)).toEqual(`someData`);
            expect(receivedRequests[0].headers[`x-apple-domain-id`]).toBeUndefined();
            expect(receivedRequests[0].headers[`user-agent`]).not.toMatch(/Chrome/);
        });

        test(`Overwrites existing file`, async () => {
            fs.writeFileSync(downloadPath, `someOtherDataThatIsLonger`);

            await client.download(`${baseURL}/download`, downloadPath, 1000);

            expect(fs.readFileSync(downloadPath, `utf8`)).toEqual(`someData`);
        });

        test(`Rejects rejected status without creating the file`, async () => {
            await expect(client.download(`${baseURL}/download-error`, downloadPath)).rejects.toMatchObject({
                name: `HttpError`,
                code: `ERR_BAD_RESPONSE`,
                response: {status: 500},
            });

            expect(fs.existsSync(downloadPath)).toBeFalsy();
        });

        test(`Removes partial file if the connection is interrupted`, async () => {
            await expect(client.download(`${baseURL}/download-interrupted`, downloadPath)).rejects.toBeInstanceOf(HttpError);

            expect(fs.existsSync(downloadPath)).toBeFalsy();
        });

        test(`Aborts stalled download after timeout and removes partial file`, async () => {
            await expect(client.download(`${baseURL}/download-stalled`, downloadPath, 200)).rejects.toMatchObject({
                name: `HttpError`,
                code: `ECONNABORTED`,
            });

            expect(fs.existsSync(downloadPath)).toBeFalsy();
        });

        test(`Aborts download without response after timeout`, async () => {
            await expect(client.download(`${baseURL}/stalled`, downloadPath, 200)).rejects.toMatchObject({
                name: `HttpError`,
                code: `ECONNABORTED`,
            });

            expect(fs.existsSync(downloadPath)).toBeFalsy();
        });

        test(`Rejects with network error code`, async () => {
            const closedServer = http.createServer();
            await new Promise<void>(resolve => closedServer.listen(0, `127.0.0.1`, resolve));
            const closedURL = `http://127.0.0.1:${(closedServer.address() as AddressInfo).port}`;
            await new Promise(resolve => closedServer.close(resolve));

            await expect(client.download(`${closedURL}/download`, downloadPath)).rejects.toMatchObject({
                name: `HttpError`,
                code: `ECONNREFUSED`,
            });
        });

        test(`Passes file system errors on`, async () => {
            const invalidPath = path.join(Config.defaultConfig.dataDir, `nonExistingDir`, `some.file`);

            await expect(client.download(`${baseURL}/download`, invalidPath)).rejects.toMatchObject({
                code: `ENOENT`,
            });
        });
    });
});
