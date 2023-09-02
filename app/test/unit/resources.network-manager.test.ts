
import {jest, test, expect, describe, beforeAll} from '@jest/globals';
import {Header, HeaderJar, NetworkManager} from "../../src/lib/resources/network-manager";
import axios from 'axios';
import {Cookie} from 'tough-cookie';
import {addHoursToCurrentDate, getDateInThePast, prepareResources} from '../_helpers/_general';
import { afterEach, beforeEach } from 'node:test';
import { defaultConfig } from '../_helpers/_config';
import * as PQueueModule from 'p-queue';
import { AxiosHarTracker } from 'axios-har-tracker';

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
     })
});

// describe(`NetworkManager`, () => {
//     describe(`Constructor`, () => {

//         test(`Creates a new instance with default config`, () => {
//             const pqueueConstructor = jest.spyOn(PQueueModule, `PQueue`);
//             const networkManager = new NetworkManager(defaultConfig);
//             expect(networkManager).toBeInstanceOf(NetworkManager);

//             expect(pqueueConstructor).toHaveBeenCalledTimes(2);
//             expect(pqueueConstructor).toHaveBeenNthCalledWith(1, {intervalCap: defaultConfig.metadataRate[0], interval: defaultConfig.metadataRate[1]});
//             expect(pqueueConstructor).toHaveBeenNthCalledWith(2, {concurrency: defaultConfig.downloadThreads, timeout: defaultConfig.downloadTimeout});

//             // expect(axios.create).toHaveBeenCalledTimes(2);
//             // expect(axios.create).toHaveBeenNthCalledWith(1);
//             // expect(axios.create).toHaveBeenNthCalledWith(2, {responseType: `stream`});

//             // expect(AxiosHarTracker.prototype.constructor).not.toHaveBeenCalled();
//             // expect(networkManager.resetHarTracker).not.toHaveBeenCalled();

//             // expect(HeaderJar.prototype.constructor).toHaveBeenCalledTimes(1);
//         })


//         // test(`Creates a new instance with network capture enabled`, () => {
//         //     const networkManager = new NetworkManager({
//         //         ...defaultConfig,
//         //         enableNetworkCapture: true,
//         //     });
//         //     expect(networkManager).toBeInstanceOf(NetworkManager);

//         //     expect(PQueue.prototype.constructor).toHaveBeenCalledTimes(2);
//         //     expect(PQueue.prototype.constructor).toHaveBeenNthCalledWith(1, {intervalCap: defaultConfig.metadataRate[0], interval: defaultConfig.metadataRate[1]});
//         //     expect(PQueue.prototype.constructor).toHaveBeenNthCalledWith(2, {concurrency: defaultConfig.downloadThreads, timeout: defaultConfig.downloadTimeout});

//         //     expect(axios.create).toHaveBeenCalledTimes(2);
//         //     expect(axios.create).toHaveBeenNthCalledWith(1);
//         //     expect(axios.create).toHaveBeenNthCalledWith(2, {responseType: `stream`});

//         //     expect(AxiosHarTracker.prototype.constructor).toHaveBeenCalled();
//         //     expect(networkManager.resetHarTracker).toHaveBeenCalled();

//         //     expect(HeaderJar.prototype.constructor).toHaveBeenCalledTimes(1);
//         // })

//         // test(`Creates a new instance with download timeout disabled`, () => {
//         //     const networkManager = new NetworkManager({
//         //         ...defaultConfig,
//         //         downloadTimeout: Infinity
//         //     });
//         //     expect(networkManager).toBeInstanceOf(NetworkManager);

//         //     expect(PQueue.prototype.constructor).toHaveBeenCalledTimes(2);
//         //     expect(PQueue.prototype.constructor).toHaveBeenNthCalledWith(1, {intervalCap: defaultConfig.metadataRate[0], interval: defaultConfig.metadataRate[1]});
//         //     expect(PQueue.prototype.constructor).toHaveBeenNthCalledWith(2, {concurrency: defaultConfig.downloadThreads, timeout: undefined});

//         //     expect(axios.create).toHaveBeenCalledTimes(2);
//         //     expect(axios.create).toHaveBeenNthCalledWith(1);
//         //     expect(axios.create).toHaveBeenNthCalledWith(2, {responseType: `stream`});

//         //     expect(AxiosHarTracker.prototype.constructor).toHaveBeenCalled();
//         //     expect(networkManager.resetHarTracker).toHaveBeenCalled();

//         //     expect(HeaderJar.prototype.constructor).toHaveBeenCalledTimes(1);
//         // })
//     });
// });

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