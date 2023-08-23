
import {test, expect, describe, beforeAll} from '@jest/globals';
import {Header, HeaderJar} from "../../src/lib/resources/network-manager";
import axios from 'axios';
import {Cookie} from 'tough-cookie';
import {addHoursToCurrentDate, getDateInThePast, prepareResources} from '../_helpers/_general';

describe(`HeaderJar`, () => {
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
            beforeAll(() => {
                prepareResources(); // Only setting up for access to logger
            });

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
});

// @todo: Implement in network manager tests
//     test.each([
//         {
//             queue: undefined,
//             msg: `Undefined queue`,
//         },
//         {
//             queue: new PQueue(),
//             msg: `Empty queue`,
//         },
//         {
//             queue: (() => {
//                 const queue = new PQueue({concurrency: 2, autoStart: true});
//                 for (let i = 0; i < 10; i++) {
//                     queue.add(() => new Promise(resolve => setTimeout(resolve, 40)));
//                 }

//                 return queue;
//             })(),
//             msg: `Non-Empty queue`,
//         },
//         {
//             queue: (() => {
//                 const queue = new PQueue({concurrency: 2, autoStart: true});
//                 for (let i = 0; i < 10; i++) {
//                     queue.add(() => new Promise(resolve => setTimeout(resolve, 40)));
//                 }

//                 return queue;
//             })(),
//             msg: `Started queue`,
//         },
//     ])(`Prepare Retry - $msg`, async ({queue}) => {
//         syncEngine.downloadQueue = queue as unknown as PQueue;
//         syncEngine.icloud.setupAccount = jest.fn<typeof syncEngine.icloud.setupAccount>()
//             .mockResolvedValue();
//         syncEngine.icloud.getReady = jest.fn<typeof syncEngine.icloud.getReady>()
//             .mockResolvedValue();

//         await syncEngine.prepareRetry();

//         expect.assertions(queue ? 2 : 0);
//         // Expect(syncEngine.icloud.setupAccount).toHaveBeenCalledTimes(1);
//         if (syncEngine.downloadQueue) {
//             expect(syncEngine.downloadQueue.size).toEqual(0);
//             expect(syncEngine.downloadQueue.pending).toEqual(0);
//         }
//     });