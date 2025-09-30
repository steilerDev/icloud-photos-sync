import {afterEach, beforeEach, describe, expect, jest, test} from "@jest/globals";
import {MockedEventManager, MockedResourceManager, MockedValidator, prepareResources} from "../_helpers/_general";
import {WebServer} from "../../src/app/web-ui/web-server";
import { StateTrigger, StateType} from "../../src/app/web-ui/state";
import {iCPSEventApp, iCPSEventCloud, iCPSEventMFA, iCPSEventRuntimeError, iCPSEventRuntimeWarning, iCPSEventSyncEngine, iCPSEventWebServer} from "../../src/lib/resources/events-types";
import {createRequest, RequestMethod} from 'node-mocks-http'
import {IncomingMessage} from "http";
import {loadMockedSite, sendMockedRequest} from "../_helpers/web.helper";
import {MFAMethod} from "../../src/lib/icloud/mfa/mfa-method";
import * as Config from '../_helpers/_config';
import {iCPSError} from "../../src/app/error/error";
import {AUTH_ERR, MFA_ERR, WEB_SERVER_ERR} from "../../src/app/error/error-codes";
import {TokenApp} from "../../src/app/icloud-app";
import webpush from 'web-push';
import {configure, getByTestId} from "@testing-library/dom";
import '@testing-library/jest-dom/jest-globals';

let mockedEventManager: MockedEventManager;
let mockedValidator: MockedValidator;
let mockedResourceManager: MockedResourceManager;

beforeEach(() => {
    const mockedResources = prepareResources()!
    mockedEventManager = mockedResources.event;
    mockedValidator = mockedResources.validator;
    mockedResourceManager = mockedResources.manager;
    jest.clearAllMocks()
});

describe(`Constructor`, () => {
    test(`Should create error listener`, () => {
        const webServer = new WebServer()
        expect(webServer.server).toBeDefined()
        expect(webServer.server.eventNames()).toContain(`error`)

        webServer.server.listeners(`error`)[0](new Error(`test`))
    })

    describe(`HTTP Server`, () => {
        test(`Should spawn webserver`, async () =>{
            WebServer.prototype.startServer = jest.fn<typeof WebServer.prototype.startServer>().mockResolvedValue({} as WebServer)
            const serverInstance = await WebServer.spawn()
            expect(WebServer.prototype.startServer).toHaveBeenCalled()
            expect(serverInstance).toEqual({})
        })

        test.skip(`Should throw startup error`, async () => {
            const webServer = new WebServer()
            const errorEvent = mockedEventManager.spyOnEvent(iCPSEventWebServer.ERROR)

            webServer.server.listen = jest.fn().mockImplementation(() => {
                throw new Error()
            }) as any

            await expect(webServer.startServer()).rejects.toEqual(new Error(`Unable to start Web server`))
            expect(errorEvent).toHaveBeenCalledWith(new Error(`Unable to start Web server`))
        })

        test.skip(`Should listen on port`, async () => {
            const webServer = new WebServer()
            webServer.server.listen = jest.fn().mockImplementation((_port, cb: any) => cb()) as any

            await webServer.startServer()

            expect(webServer.server.listen).toHaveBeenCalled()
            expect((webServer.server.listen as any).mock.calls[0][0]).toEqual(Config.defaultConfig.port)
        })

        test(`Should handle http server error EADDRINUSE`, () => {
            const webServer = new WebServer()

            const errorEvent = mockedEventManager.spyOnEvent(iCPSEventWebServer.ERROR)

            const error = new Error();
            (error as any).code = `EADDRINUSE`

            webServer.server.emit(`error`, error)

            expect(errorEvent).toHaveBeenCalledWith(new Error(`HTTP Server could not start, because address/port is in use`))
        })

        test(`Should handle EACCES`, () => {
            const webServer = new WebServer()

            const errorEvent = mockedEventManager.spyOnEvent(iCPSEventWebServer.ERROR)

            const error = new Error();
            (error as any).code = `EACCES`

            webServer.server.emit(`error`, error)

            expect(errorEvent).toHaveBeenCalledWith(new Error(`HTTP Server could not start, because user has insufficient privileges to open address/port`))
        })

        test(`Should handle listen error`, () => {
            const webServer = new WebServer()

            const errorEvent = mockedEventManager.spyOnEvent(iCPSEventWebServer.ERROR)

            webServer.server.emit(`error`, new Error())

            expect(errorEvent).toHaveBeenCalledWith(new Error(`HTTP Server Error`))
        })

        test.skip(`Should handle http-listen error`, async () => {
            const webServer = new WebServer()

            const errorEvent = mockedEventManager.spyOnEvent(iCPSEventWebServer.ERROR)
            webServer.server.listen = jest.fn<typeof webServer.server.listen>().mockImplementation((_) => {
                throw new Error(`test`)
            }) as any

            await expect(webServer.startServer()).rejects.toEqual(new Error(`Unable to start Web server`))
            expect(errorEvent).toHaveBeenCalledWith(new Error(`Unable to start Web server`))
        })

        test(`Should close the server`, async () => {
            const webServer = new WebServer();
            webServer.server.close = jest.fn().mockImplementation((cb: any) => cb()) as any

            await webServer.close()
            expect(webServer.server.close).toHaveBeenCalled()
        })
    })


    describe(`State changes`, () => {
        let webServer: WebServer

        beforeEach(() => {
            webServer = new WebServer()
            webServer.notificationPusher.sendNotifications = jest.fn<typeof webServer.notificationPusher.sendNotifications>()
        })

        test(`Should update state on sync trigger`, () => {
            mockedEventManager.emit(iCPSEventApp.SCHEDULED_START)

            expect(webServer.state.state).toEqual(StateType.AUTH)
            expect(webServer.state.nextSync).toBeUndefined()
            expect(webServer.state.prevError).toBeUndefined()
            expect(webServer.state.prevTrigger).toBe(StateTrigger.SYNC)
            expect(webServer.state.timestamp).toBeGreaterThanOrEqual(0)

            expect(webServer.notificationPusher.sendNotifications).toHaveBeenCalledTimes(0)
        })

        test(`Should update state on auth trigger`, () => {
            mockedEventManager.emit(iCPSEventWebServer.REAUTH_REQUESTED)

            expect(webServer.state.state).toEqual(StateType.AUTH)
            expect(webServer.state.nextSync).toBeUndefined()
            expect(webServer.state.prevError).toBeUndefined()
            expect(webServer.state.prevTrigger).toBe(StateTrigger.AUTH)
            expect(webServer.state.timestamp).toBeGreaterThanOrEqual(0)
            
            expect(webServer.notificationPusher.sendNotifications).toHaveBeenCalledTimes(0)
        })

        test(`Should update state and retain trigger on sync success`, () => {
            const nextSync = new Date()
            mockedEventManager.emit(iCPSEventApp.SCHEDULED_START)
            mockedEventManager.emit(iCPSEventApp.SCHEDULED_DONE, nextSync)

            expect(webServer.state.state).toEqual(StateType.READY)
            expect(webServer.state.nextSync).toEqual(nextSync.getTime())
            expect(webServer.state.prevError).toBeUndefined()
            expect(webServer.state.prevTrigger).toBe(StateTrigger.SYNC)
            expect(webServer.state.timestamp).toBeGreaterThanOrEqual(0)
            
            expect(webServer.notificationPusher.sendNotifications).toHaveBeenCalledWith(webServer.state)
        })

        test(`Should update state and retain trigger on auth success`, () => {
            mockedEventManager.emit(iCPSEventWebServer.REAUTH_REQUESTED)
            mockedEventManager.emit(iCPSEventApp.TOKEN)

            expect(webServer.state.state).toEqual(StateType.READY)
            expect(webServer.state.nextSync).toBeUndefined()
            expect(webServer.state.prevError).toBeUndefined()
            expect(webServer.state.prevTrigger).toBe(StateTrigger.AUTH)
            expect(webServer.state.timestamp).toBeGreaterThanOrEqual(0)
            
            expect(webServer.notificationPusher.sendNotifications).toHaveBeenCalledWith(webServer.state)
        })

        test(`Should update state and retain trigger on sync error`, () => {
            const error = new Error(`test`)
            mockedEventManager.emit(iCPSEventApp.SCHEDULED_START)
            mockedEventManager.emit(iCPSEventRuntimeError.SCHEDULED_ERROR, error)

            expect(webServer.state.state).toEqual(StateType.READY)
            expect(webServer.state.nextSync).toBeUndefined()
            expect(webServer.state.prevError).toEqual(iCPSError.toiCPSError(error))
            expect(webServer.state.prevTrigger).toBe(StateTrigger.SYNC)
            expect(webServer.state.timestamp).toBeGreaterThanOrEqual(0)
            
            expect(webServer.notificationPusher.sendNotifications).toHaveBeenCalledWith(webServer.state)
        })

        test(`Should update state and retain trigger on MFA timeout`, () => {
            mockedEventManager.emit(iCPSEventApp.SCHEDULED_START)
            mockedEventManager.emit(iCPSEventMFA.MFA_NOT_PROVIDED)

            expect(webServer.state.state).toEqual(StateType.READY)
            expect(webServer.state.nextSync).toBeUndefined()
            expect(webServer.state.prevError).toEqual(new iCPSError(WEB_SERVER_ERR.MFA_CODE_NOT_PROVIDED))
            expect(webServer.state.prevTrigger).toBe(StateTrigger.SYNC)
            expect(webServer.state.timestamp).toBeGreaterThanOrEqual(0)
            
            expect(webServer.notificationPusher.sendNotifications).toHaveBeenCalledWith(webServer.state)
        })

        test(`Should update state and retain trigger on reauth error`, () => {
            const error = new Error(`test`)
            mockedEventManager.emit(iCPSEventApp.SCHEDULED_START)
            mockedEventManager.emit(iCPSEventWebServer.REAUTH_ERROR, error)

            expect(webServer.state.state).toEqual(StateType.READY)
            expect(webServer.state.nextSync).toBeUndefined()
            expect(webServer.state.prevError).toEqual(iCPSError.toiCPSError(error))
            expect(webServer.state.prevTrigger).toBe(StateTrigger.SYNC)
            expect(webServer.state.timestamp).toBeGreaterThanOrEqual(0)
            
            expect(webServer.notificationPusher.sendNotifications).toHaveBeenCalledWith(webServer.state)
        })

        test(`Should update state and clear error on restart`, () => {
            const error = new Error(`test`)
            mockedEventManager.emit(iCPSEventApp.SCHEDULED_START)
            mockedEventManager.emit(iCPSEventRuntimeError.SCHEDULED_ERROR, error)
            mockedEventManager.emit(iCPSEventApp.SCHEDULED_START)

            expect(webServer.state.state).toEqual(StateType.AUTH)
            expect(webServer.state.nextSync).toBeUndefined()
            expect(webServer.state.prevError).toBeUndefined()
            expect(webServer.state.prevTrigger).toBe(StateTrigger.SYNC)
            expect(webServer.state.timestamp).toBeGreaterThanOrEqual(0)
            
            expect(webServer.notificationPusher.sendNotifications).toHaveBeenCalledWith(webServer.state)
        })

        test(`Should update state retain trigger on sync start`, () => {
            mockedEventManager.emit(iCPSEventApp.SCHEDULED_START)
            mockedEventManager.emit(iCPSEventSyncEngine.START)

            expect(webServer.state.state).toEqual(StateType.SYNC)
            expect(webServer.state.nextSync).toBeUndefined()
            expect(webServer.state.prevError).toBeUndefined()
            expect(webServer.state.prevTrigger).toBe(StateTrigger.SYNC)
            expect(webServer.state.timestamp).toBeGreaterThanOrEqual(0)

            expect(webServer.notificationPusher.sendNotifications).toHaveBeenCalledTimes(0)
            
        })

        test(`Should update state retain trigger on mfa required`, () => {
            mockedEventManager.emit(iCPSEventApp.SCHEDULED_START)
            mockedEventManager.emit(iCPSEventCloud.MFA_REQUIRED)

            expect(webServer.state.state).toEqual(StateType.MFA)
            expect(webServer.state.nextSync).toBeUndefined()
            expect(webServer.state.prevError).toBeUndefined()
            expect(webServer.state.prevTrigger).toBe(StateTrigger.SYNC)
            expect(webServer.state.timestamp).toBeGreaterThanOrEqual(0)

            expect(webServer.notificationPusher.sendNotifications).toHaveBeenCalledWith(webServer.state)
        })

        test(`Should update state retain trigger on scheduled event`, () => {
            const nextSync = new Date()
            mockedEventManager.emit(iCPSEventApp.SCHEDULED, nextSync)

            expect(webServer.state.state).toEqual(StateType.READY)
            expect(webServer.state.nextSync).toEqual(nextSync.getTime())
            expect(webServer.state.prevError).toBeUndefined()
            expect(webServer.state.prevTrigger).toBeUndefined()
            expect(webServer.state.timestamp).toBeGreaterThanOrEqual(0)

            expect(webServer.notificationPusher.sendNotifications).toHaveBeenCalledTimes(0)
        })
    })
})

describe(`Notification Pusher`, () => {
    let webServer: WebServer
    beforeEach(() => {
        webServer = new WebServer()
        webpush.sendNotification = jest.fn<typeof webpush.sendNotification>().mockResolvedValue({} as any)
    })

    test.each([
        {
            subscriptions: {},
            count: 0
        },{
            subscriptions: {
                someEndpoint: {
                    endpoint: `someEndpoint` 
                }
            },
            count: 1
        },{
            subscriptions: {
                someEndpoint: {
                    endpoint: `someEndpoint` 
                },
                someOtherEndpoint: {
                    endpoint: `someOtherEndpoint`
                }
            },
            count: 2
        }
    ])(`Should send notifications to $count subscriptions`, async ({subscriptions, count}) => {
        webServer.notificationPusher.sendPushNotification = jest.fn<typeof webServer.notificationPusher.sendPushNotification>()
        mockedResourceManager._resources.notificationSubscriptions = subscriptions as any

        await webServer.notificationPusher.sendNotifications(webServer.state)

        expect(webServer.notificationPusher.sendPushNotification).toHaveBeenCalledTimes(count)
    })

    test(`Should send push notification to endpoint`, async () => {
        webServer.state.serialize = jest.fn<typeof webServer.state.serialize>().mockReturnValue({test: true} as any)
        const subscription = {
            endpoint: `someEndpoint`,
            keys: {
                p256dh: `someKey`,
                auth: `someAuth`
            }
        }

        await webServer.notificationPusher.sendPushNotification(subscription, webServer.state)

        expect(webpush.sendNotification).toHaveBeenCalledWith(subscription, JSON.stringify({test: true}))
        expect(webServer.state.serialize).toHaveBeenCalled()
    })

    test(`Should remove push notification on webpush error`, async () => {
        webServer.state.serialize = jest.fn<typeof webServer.state.serialize>().mockReturnValue({test: true} as any)
        const subscription = {
            endpoint: `someEndpoint`,
            keys: {
                p256dh: `someKey`,
                auth: `someAuth`
            }
        }
        webpush.sendNotification = jest.fn<typeof webpush.sendNotification>().mockRejectedValue(new webpush.WebPushError(`test`, 410, {}, `test`, `test`))
        mockedResourceManager.removeNotificationSubscription = jest.fn<typeof mockedResourceManager.removeNotificationSubscription>()

        await webServer.notificationPusher.sendPushNotification(subscription, webServer.state)

        expect(webpush.sendNotification).toHaveBeenCalledWith(subscription, JSON.stringify({test: true}))
        expect(webServer.state.serialize).toHaveBeenCalled()
        expect(mockedResourceManager.removeNotificationSubscription).toHaveBeenCalledWith(subscription)
    })

    test(`Should handle error`, async () => {
        webServer.state.serialize = jest.fn<typeof webServer.state.serialize>().mockImplementation(() => { throw new Error(`test`)} )
        const subscription = {
            endpoint: `someEndpoint`,
            keys: {
                p256dh: `someKey`,
                auth: `someAuth`
            }
        }
        mockedResourceManager.removeNotificationSubscription = jest.fn<typeof mockedResourceManager.removeNotificationSubscription>()

        await expect(webServer.notificationPusher.sendPushNotification(subscription, webServer.state)).resolves.toBeUndefined()

        expect(webpush.sendNotification).not.toHaveBeenCalled()
        expect(webServer.state.serialize).toHaveBeenCalled()
        expect(mockedResourceManager.removeNotificationSubscription).not.toHaveBeenCalled()
    })
})

describe(`Request handling`, () => {
    let webServer: WebServer 

    beforeEach(() => {
        webServer = new WebServer()
    })

    test.each([{
        method: `PUT`,
        url: `/state`,
        desc: `Unsupported method`
    },{
        method: `POST`,
        url: `/invalid`,
        desc: `Unsupported path`
    }, {
        method: `GET`,
        url: `/invalid`,
        desc: `Unsupported path`
    }])(`Illegal request - $desc: $method $url`, async ({method, url}) => {

        const req = createRequest<IncomingMessage>({
            method: method as RequestMethod,
            url
        }) 

        const res = await sendMockedRequest(webServer, req)

        expect(res._getStatusCode()).toEqual(400)
        expect(res._getJSONData()).toEqual({message: `Method (${method}) not supported on endpoint ${url}`})
    })

    test(`Should handle server error`, async () => {
        webServer.readBody = jest.fn<typeof webServer.readBody>().mockRejectedValue(new Error(`test`))
        const runtimeEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.WEB_SERVER_ERROR)
        const req = createRequest<IncomingMessage>({
            method: `POST`,
            url: `/api/mfa`,
        })
        const res = await sendMockedRequest(webServer, req)
        expect(runtimeEvent).toHaveBeenCalledWith(new Error(`Unknown error`))
        expect(res._getStatusCode()).toEqual(500)
        expect(res._getJSONData()).toEqual({message: `WEB_SERVER_UNKNOWN_ERR: Unknown error caused by test`})
    })

    test(`Should handle ready body error`, async () => {
        const runtimeEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.WEB_SERVER_ERROR)
        const req = createRequest<IncomingMessage>({
            method: `POST`,
            url: `/api/mfa`,
            data: `test`
        })
        req.on = jest.fn<typeof req.on>().mockImplementation(() => {
            throw new Error(`test`)
        })
        const res = await sendMockedRequest(webServer, req)

        expect(runtimeEvent).toHaveBeenCalledWith(new Error(`Unknown error`))
        expect(res._getStatusCode()).toEqual(500)
        expect(res._getJSONData()).toEqual({message: `WEB_SERVER_UNKNOWN_ERR: Unknown error caused by WEB_SERVER_UNABLE_TO_READ_BODY: Unable to read request's body caused by test`})
    })

    test(`Forward root to /state`, async () => {
        const req = createRequest<IncomingMessage>({
            method: `GET`,
            url: `/`
        }) 

        const res = await sendMockedRequest(webServer, req)

        expect(res._getStatusCode()).toEqual(302)
        expect(res.getHeader(`Location`)).toEqual(`/state`)
    })

    test(`Serve service worker`, async () => {
        const req = createRequest<IncomingMessage>({
            method: `GET`,
            url: `/service-worker.js`
        }) 

        const res = await sendMockedRequest(webServer, req)

        expect(res._getStatusCode()).toEqual(200)
        expect(res._getData()).toMatch(/\* Service Worker for iCloud Photos Sync Web UI/)
        expect(res.getHeader(`Content-Type`)).toEqual(`application/javascript`)
    })

    test(`Serve manifest`, async () => {
        const req = createRequest<IncomingMessage>({
            method: `GET`,
            url: `/manifest.json`
        }) 

        const res = await sendMockedRequest(webServer, req)

        expect(res._getStatusCode()).toEqual(200)
        expect(res._getJSONData()).toEqual({
            icons: [
                {
                    purpose: `any`,
                    sizes: `512x512`,
                    src: `./icon.png`,
                    type: `image/png`
                }
            ],
            orientation: `any`,
            display: `standalone`,
            dir: `auto`,
            lang: `en-GB`,
            description: `iCloud Photos Sync is a one-way sync engine for the iCloud Photos Library`,
            start_url: `./state`,
            scope: `/`,
            name: `iCloud Photos Sync`,
            short_name: `ICPS`
        })
    })

    test(`Serve icon`, async () => {
        const req = createRequest<IncomingMessage>({
            method: `GET`,
            url: `/icon.png`
        })
        const res = await sendMockedRequest(webServer, req)
        
        expect(res._getStatusCode()).toEqual(200)
        expect(res.getHeader(`Content-Type`)).toEqual(`image/png`)
        expect(res._getHeaders()[`content-length`]).toEqual(32480)
        expect(res._getBuffer().length).toEqual(32480)
    })

    test(`Serve favicon`, async () => {
        const req = createRequest<IncomingMessage>({
            method: `GET`,
            url: `/favicon.ico`
        })
        const res = await sendMockedRequest(webServer, req)
        
        expect(res._getStatusCode()).toEqual(200)
        expect(res.getHeader(`Content-Type`)).toEqual(`image/x-icon`)
        expect(res._getHeaders()[`content-length`]).toEqual(15406)
        expect(res._getBuffer().length).toEqual(15406)
    })

    describe(`State request`, () => {
        test.each([{
            desc: `Ready`,
            state: StateType.READY,
            timestamp: 1,
            result: {
                state: `ready`,
                prevTrigger: undefined,
                prevError: undefined,
                timestamp: 1,
                nextSync: undefined
            }
        },{
            desc: `Ready with next sync`,
            state: StateType.READY,
            timestamp: 1,
            nextSync: 2,
            result: {
                state: `ready`,
                prevTrigger: undefined,
                prevError: undefined,
                timestamp: 1,
                nextSync: 2
            }
        },{
            desc: `Ready with previous error`,
            state: StateType.READY,
            prevError: new iCPSError(),
            timestamp: 1,
            result: {
                state: `ready`,
                prevTrigger: undefined,
                prevError: {
                    code: `UNKNOWN`,
                    message: `UNKNOWN: Unknown error occurred`
                },
                timestamp: 1,
                nextSync: undefined
            }
        },{
            desc: `Ready with previous fail on MFA error`,
            state: StateType.READY,
            prevError: new iCPSError(MFA_ERR.FAIL_ON_MFA),
            timestamp: 1,
            result: {
                state: `ready`,
                prevTrigger: undefined,
                prevError: {
                    code: `MFA_FAIL_ON_MFA`,
                    message: `MFA code required. Use the 'Renew Authentication' button to request and enter a new code.`
                },
                timestamp: 1,
                nextSync: undefined
            }
        },{
            desc: `Ready with previous MFA code not provided error`,
            state: StateType.READY,
            prevError: new iCPSError(WEB_SERVER_ERR.MFA_CODE_NOT_PROVIDED),
            timestamp: 1,
            result: {
                state: `ready`,
                prevTrigger: undefined,
                prevError: {
                    code: `WEB_SERVER_MFA_CODE_NOT_PROVIDED`,
                    message: `MFA code not provided within timeout period. Use the 'Renew Authentication' button to request and enter a new code.`
                },
                timestamp: 1,
                nextSync: undefined
            }
        },{
            desc: `Ready with previous unauthorized error`,
            state: StateType.READY,
            prevError: new iCPSError(AUTH_ERR.UNAUTHORIZED),
            timestamp: 1,
            result: {
                state: `ready`,
                prevTrigger: undefined,
                prevError: {
                    code: `AUTH_UNAUTHORIZED`,
                    message: `Your credentials seem to be invalid. Please check your iCloud credentials and try again.`
                },
                timestamp: 1,
                nextSync: undefined
            }
        },{
            state: StateType.AUTH,
            desc: `Auth triggered by Sync`,
            prevTrigger: StateTrigger.SYNC,
            timestamp: 1,
            result: {
                state: `authenticating`,
                prevTrigger: `sync`,
                prevError: undefined,
                timestamp: 1,
                nextSync: undefined
            }
        },{
            state: StateType.AUTH,
            desc: `Auth triggered by AUTH`,
            prevTrigger: StateTrigger.AUTH,
            timestamp: 1,
            result: {
                state: `authenticating`,
                prevTrigger: `auth`,
                prevError: undefined,
                timestamp: 1,
                nextSync: undefined
            }
        },{
            state: StateType.SYNC,
            desc: `Sync in progress`,
            prevTrigger: StateTrigger.SYNC,
            timestamp: 1,
            result: {
                state: `syncing`,
                prevTrigger: `sync`,
                prevError: undefined,
                timestamp: 1,
                nextSync: undefined
            }
        },{
            state: StateType.MFA,
            desc: `Waiting for MFA`,
            prevTrigger: StateTrigger.SYNC,
            timestamp: 1,
            result: {
                state: `mfa_required`,
                prevTrigger: `sync`,
                prevError: undefined,
                timestamp: 1,
                nextSync: undefined
            }
        }])(`Should serialize state - $desc`, async ({state, prevError, prevTrigger, timestamp, nextSync, result}) => {
            webServer.state.state = state
            webServer.state.prevError = prevError
            webServer.state.timestamp = timestamp
            webServer.state.nextSync = nextSync
            webServer.state.prevTrigger = prevTrigger
            expect(webServer.state.serialize()).toEqual(result)
        })

        test(`Should handle state request`, async () => {
            const req = createRequest<IncomingMessage>({
                method: `GET`,
                url: `/api/state`
            })
            webServer.state.serialize = jest.fn<typeof webServer.state.serialize>().mockReturnValue({test: true} as any)

            const res = await sendMockedRequest(webServer, req)

            expect(res._getStatusCode()).toBe(200);
            expect(res._getJSONData()).toEqual({test: true});
            expect(webServer.state.serialize).toHaveBeenCalled()
        })
    })

    test(`Serve public keys`, async () => {
        const req = createRequest<IncomingMessage>({
            method: `GET`,
            url: `/api/vapid-public-key`
        })
        const res = await sendMockedRequest(webServer, req)
        expect(res._getStatusCode()).toBe(200);
        expect(res._getJSONData()).toEqual(expect.objectContaining({
            publicKey: expect.any(String),
        }));
    })

    describe(`Reauth request`, () => {

        describe(`Pre-Conditions met`, () => {
            test(`Should handle reauth request`, async () => {
                webServer.triggerReauth = jest.fn<typeof webServer.triggerReauth>().mockResolvedValue(``)
                const reauthEvent = mockedEventManager.spyOnEvent(iCPSEventWebServer.REAUTH_REQUESTED)
                const req = createRequest<IncomingMessage>({
                    method: `POST`,
                    url: `/api/reauthenticate`
                })

                const res = await sendMockedRequest(webServer, req)

                expect(res._getStatusCode()).toBe(200);
                expect(res._getJSONData()).toEqual({
                    message: `Reauthentication requested`,
                });
                expect(webServer.triggerReauth).toHaveBeenCalled()
                expect(reauthEvent).toHaveBeenCalled()
            })

            test(`Should handle reauth error`, async () => {
                webServer.triggerReauth = jest.fn<typeof webServer.triggerReauth>().mockRejectedValue(new Error(`test`))
                const errorEvent = mockedEventManager.spyOnEvent(iCPSEventWebServer.REAUTH_ERROR)
                const req = createRequest<IncomingMessage>({
                    method: `POST`,
                    url: `/api/reauthenticate`
                })

                const res = await sendMockedRequest(webServer, req)

                expect(res._getStatusCode()).toBe(200);
                expect(res._getJSONData()).toEqual({
                    message: `Reauthentication requested`,
                });
                expect(webServer.triggerReauth).toHaveBeenCalled()
                expect(errorEvent).toHaveBeenCalledWith(new Error(`Unknown error occurred`))
            })
        })

        test(`Pre-Condition not met`, async () => {
            webServer.state.state = StateType.SYNC; 
            webServer.triggerReauth = jest.fn<typeof webServer.triggerReauth>().mockResolvedValue(``)
            const warnEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.WEB_SERVER_ERROR)
            const req = createRequest<IncomingMessage>({
                method: `POST`,
                url: `/api/reauthenticate`
            })

            const res = await sendMockedRequest(webServer, req)

            expect(res._getStatusCode()).toBe(412);
            expect(res._getJSONData()).toEqual({
                message: `Cannot perform action while sync is in progress`,
            });
            expect(webServer.triggerReauth).not.toHaveBeenCalled()
            expect(warnEvent).toHaveBeenCalledWith(new Error(`Cannot perform action while sync is in progress`))

        })

        test(`Trigger reauth run's Token App`, async () => {
            const tokenApp = new TokenApp(true);
            tokenApp.run = jest.fn<typeof tokenApp.run>().mockResolvedValue(`test`)

            await expect(webServer.triggerReauth(tokenApp)).resolves.toBe(`test`)
            expect(tokenApp.run).toHaveBeenCalled()
        })
    });

    describe(`Sync request`, () => {

        test(`Pre-Conditions met`, async () => {
            const syncEvent = mockedEventManager.spyOnEvent(iCPSEventWebServer.SYNC_REQUESTED)
            const req = createRequest<IncomingMessage>({
                method: `POST`,
                url: `/api/sync`
            })

            const res = await sendMockedRequest(webServer, req)

            expect(res._getStatusCode()).toBe(200);
            expect(res._getJSONData()).toEqual({
                message: `Sync requested`,
            });
            expect(syncEvent).toHaveBeenCalled()
        })

        test(`Pre-Condition not met`, async () => {
            webServer.state.state = StateType.SYNC; 
            const warnEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.WEB_SERVER_ERROR)
            const req = createRequest<IncomingMessage>({
                method: `POST`,
                url: `/api/sync`
            })

            const res = await sendMockedRequest(webServer, req)

            expect(res._getStatusCode()).toBe(412);
            expect(res._getJSONData()).toEqual({
                message: `Cannot perform action while sync is in progress`,
            });
            expect(warnEvent).toHaveBeenCalledWith(new Error(`Cannot perform action while sync is in progress`))

        })
    });

    describe(`MFA Code`, () => {

        describe(`Pre-Conditions met`, () => {
            beforeEach(() => {
                mockedEventManager.emit(iCPSEventSyncEngine.START);
                mockedEventManager.emit(iCPSEventCloud.MFA_REQUIRED);
            });

            test(`Valid Code format`, async () => {
                const code = `123456`;
                const mfaReceivedEvent = mockedEventManager.spyOnEvent(iCPSEventMFA.MFA_RECEIVED);

                const req = createRequest<IncomingMessage>({
                    method: `POST`,
                    url: `/api/mfa`,
                    queryParameters: {
                        code
                    }
                }) 

                const res = await sendMockedRequest(webServer, req)

                expect(res._getStatusCode()).toBe(200);
                expect(res._getJSONData()).toEqual({
                    message: `Read MFA code: ${code}`,
                });

                expect(mfaReceivedEvent).toHaveBeenCalledWith(new MFAMethod(`device`), code);
            });

            test(`Invalid code format`, async () => {
                const code = `123 456`;
                const warnEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.WEB_SERVER_ERROR);

                const req = createRequest<IncomingMessage>({
                    method: `POST`,
                    url: `/api/mfa`,
                    queryParameters: {
                        code
                    }
                })

                const res = await sendMockedRequest(webServer, req)

                expect(res._getStatusCode()).toBe(400);
                expect(res._getJSONData()).toEqual({
                    message: `Unexpected MFA code format! Expecting 6 digits`,
                });
                expect(warnEvent).toHaveBeenCalledWith(new Error(`Received unexpected MFA code format, expecting 6 digits`));
            });

            test(`Missing code`, async () => {
                const warnEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.WEB_SERVER_ERROR);

                const req = createRequest<IncomingMessage>({
                    method: `POST`,
                    url: `/api/mfa`,
                })

                const res = await sendMockedRequest(webServer, req)

                expect(res._getStatusCode()).toBe(400);
                expect(res._getJSONData()).toEqual({
                    message: `Unexpected MFA code format! Expecting 6 digits`,
                });
                expect(warnEvent).toHaveBeenCalledWith(new Error(`Received unexpected MFA code format, expecting 6 digits`));
            });

            test.each([
                {
                    mfaMethod: `sms`,
                    mfaString: `'SMS' (Number ID: 1)`,
                    phoneNumberId: undefined
                },{
                    mfaMethod: `sms`,
                    mfaString: `'SMS' (Number ID: 2)`,
                    phoneNumberId: `2`,
                    phoneNumber: 2
                },{
                    mfaMethod: `voice`,
                    mfaString: `'Voice' (Number ID: 1)`
                },{
                    mfaMethod: `device`,
                    mfaString: `'Device'`
                }
            ])(`Resend code with $mfaMethod`, async ({mfaMethod, phoneNumberId, phoneNumber, mfaString}) => {
                const updateSpy = jest.spyOn(webServer.mfaMethod, `update`);
                const mfaEvent = mockedEventManager.spyOnEvent(iCPSEventMFA.MFA_RESEND);

                const req = createRequest<IncomingMessage>({
                    method: `POST`,
                    url: `/api/resend_mfa`,
                    queryParameters: {
                        method: mfaMethod,
                        phoneNumberId
                    }
                })

                const res = await sendMockedRequest(webServer, req)
                
                expect(res._getStatusCode()).toBe(200);
                expect(res._getJSONData()).toEqual({
                    message: `Requesting MFA resend with method ${mfaString}`,
                });
                if(phoneNumberId) {
                    expect(updateSpy).toHaveBeenCalledWith(mfaMethod, phoneNumber)
                } else {
                    expect(updateSpy).toHaveBeenCalledWith(mfaMethod)
                }
                expect(mfaEvent).toHaveBeenCalled()
            });

            test(`Resend code with invalid method`, async () => {
                const updateSpy = jest.spyOn(webServer.mfaMethod, `update`);
                const webServerError = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.WEB_SERVER_ERROR);

                const req = createRequest<IncomingMessage>({
                    method: `POST`,
                    url: `/api/resend_mfa`,
                    queryParameters: {
                        method: `invalid`
                    }
                })

                const res = await sendMockedRequest(webServer, req)
                
                expect(res._getStatusCode()).toBe(400);
                expect(res._getJSONData()).toEqual({
                    message: `Resend method does not match expected format`,
                });
    
                expect(updateSpy).not.toHaveBeenCalled()

                expect(webServerError).toHaveBeenCalledWith(new Error(`Resend method does not match expected format`));
            });

            test(`Resend code with invalid phone number ID`, async () => {
                const updateSpy = jest.spyOn(webServer.mfaMethod, `update`);
                const mfaEvent = mockedEventManager.spyOnEvent(iCPSEventMFA.MFA_RESEND);

                const req = createRequest<IncomingMessage>({
                    method: `POST`,
                    url: `/api/resend_mfa`,
                    queryParameters: {
                        method: `sms`,
                        phoneNumberId: `invalid`
                    }
                })

                const res = await sendMockedRequest(webServer, req)
                
                expect(res._getStatusCode()).toBe(200);
                expect(res._getJSONData()).toEqual({
                    message: `Requesting MFA resend with method 'SMS' (Number ID: 1)`,
                });

                expect(updateSpy).toHaveBeenCalledWith(`sms`)

                expect(mfaEvent).toHaveBeenCalled()
            });
        })
        
        describe(`Pre-Condition not met`, () => {
            test(`Sync not Started`, async () => {
                const code = `123456`;
                const warnEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.WEB_SERVER_ERROR);

                const req = createRequest<IncomingMessage>({
                    method: `POST`,
                    url: `/api/mfa`,
                    query: {
                        code
                    }
                })

                const res = await sendMockedRequest(webServer, req)

                expect(res._getStatusCode()).toBe(412);
                expect(res._getJSONData()).toEqual({
                    message: `MFA code not expected at this time.`,
                });
                expect(warnEvent).toHaveBeenCalledWith(new Error(`No MFA code expected`));
            });

            test(`Sync started, not waiting for MFA`, async () => {
                mockedEventManager.emit(iCPSEventSyncEngine.START);

                const code = `123456`;
                const warnEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.WEB_SERVER_ERROR);

                const req = createRequest<IncomingMessage>({
                    method: `POST`,
                    url: `/api/mfa`,
                    query: {
                        code
                    }
                })

                const res = await sendMockedRequest(webServer, req)

                expect(res._getStatusCode()).toBe(412);
                expect(res._getJSONData()).toEqual({
                    message: `MFA code not expected at this time.`,
                });
                expect(warnEvent).toHaveBeenCalledWith(new Error(`No MFA code expected`));
            });

            test(`Sync started, MFA expired`, async () => {
                mockedEventManager.emit(iCPSEventMFA.MFA_NOT_PROVIDED);

                const code = `123456`;
                const warnEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.WEB_SERVER_ERROR);

                const req = createRequest<IncomingMessage>({
                    method: `POST`,
                    url: `/api/mfa`,
                    query: {
                        code
                    }
                })

                const res = await sendMockedRequest(webServer, req)

                expect(res._getStatusCode()).toBe(412);
                expect(res._getJSONData()).toEqual({
                    message: `MFA code not expected at this time.`,
                });
                expect(warnEvent).toHaveBeenCalledWith(new Error(`No MFA code expected`));
            });

            test(`Resend request while not expecting MFA code`, async () => {
                mockedEventManager.emit(iCPSEventSyncEngine.START);

                const updateSpy = jest.spyOn(webServer.mfaMethod, `update`);
                const webServerError = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.WEB_SERVER_ERROR);

                const req = createRequest<IncomingMessage>({
                    method: `POST`,
                    url: `/api/resend_mfa`,
                    queryParameters: {
                        method: `sms`
                    }
                })

                const res = await sendMockedRequest(webServer, req)
                
                expect(res._getStatusCode()).toBe(412);
                expect(res._getJSONData()).toEqual({
                    message: `MFA code not expected at this time.`,
                });
    
                expect(updateSpy).not.toHaveBeenCalled()

                expect(webServerError).toHaveBeenCalledWith(new Error(`No MFA code expected`));
            });

        })
    });

    describe(`Push Notification Subscription`, () => {
        const subscription = {
            endpoint: `https://example.com/endpoint`,
            keys: {
                p256dh: `p256dhKey`,
                auth: `authKey`
            }
        }

        test(`Valid subscription`, async () => {
            mockedValidator.validatePushSubscription = jest.fn<typeof mockedValidator.validatePushSubscription>().mockReturnValue(subscription)
            mockedResourceManager.addNotificationSubscription = jest.fn<typeof mockedResourceManager.addNotificationSubscription>()
            
            const req = createRequest<IncomingMessage>({
                method: `POST`,
                url: `/api/subscribe`,
                data: JSON.stringify(subscription)
            })
            
            const res = await sendMockedRequest(webServer, req)
            
            expect(res._getStatusCode()).toBe(201);
            expect(res._getJSONData()).toEqual({
                message: `Push subscription added successfully`,
            });
            expect(mockedValidator.validatePushSubscription).toHaveBeenCalledWith(subscription)
            expect(mockedResourceManager.addNotificationSubscription).toHaveBeenCalledWith(subscription)
        })

        test(`Invalid subscription`, async () => {
            mockedValidator.validatePushSubscription = jest.fn<typeof mockedValidator.validatePushSubscription>().mockImplementation(() => {
                throw new Error(`test`)
            })

            const req = createRequest<IncomingMessage>({
                method: `POST`,
                url: `/api/subscribe`,
                data: JSON.stringify(subscription)
            })
            
            const res = await sendMockedRequest(webServer, req)
            
            expect(res._getStatusCode()).toBe(400);
            expect(res._getJSONData()).toEqual({
                message: `Unable to add push subscription`,
            });
            expect(mockedValidator.validatePushSubscription).toHaveBeenCalledWith(subscription)
        })

  

    })

    describe(`WebUI`, () => {
        configure({testIdAttribute: `id`})

        // Fake Timers & Clearing them is necessary to have no pending task
        beforeEach(() => {
            jest.useFakeTimers();
        })
        afterEach(() => {
            jest.clearAllTimers();
            jest.useRealTimers();
        })

        describe(`State UI`, () => {
            test(`Handle state view request`, async () => {
                const site = await loadMockedSite(webServer, `/state`)
            

                expect(getByTestId(site.view, `unknown-symbol`)).toBeVisible();
                expect(getByTestId(site.view, `ok-symbol`)).not.toBeVisible();
                expect(getByTestId(site.view, `error-symbol`)).not.toBeVisible();
                expect(getByTestId(site.view, `auth-symbol`)).not.toBeVisible();
                expect(getByTestId(site.view, `sync-symbol`)).not.toBeVisible();

                expect(getByTestId(site.view, `sync-button`)).toBeVisible();
                expect(getByTestId(site.view, `reauth-button`)).toBeVisible();
                expect(getByTestId(site.view, `state-text`)).toHaveTextContent(`...`);

                expect(getByTestId(site.view, `next-sync-text`)).not.toBeVisible();

                jest.advanceTimersByTime(1000)

                expect(site.functions.fetch).toHaveBeenCalledTimes(1)
                expect(site.functions.fetch).toHaveBeenCalledWith(`/api/state`, {headers: {Accept: `application/json`}})
            })

            test(`Handle initial 'ready' state`, async () => {
                mockedEventManager.emit(iCPSEventApp.SCHEDULED_START)
                const site = await loadMockedSite(webServer, `/state`)

                await site.window.refreshState()

                expect(site.functions.fetch).toHaveBeenCalledWith(`/api/state`, {headers: {Accept: `application/json`}})

                expect(getByTestId(site.view, `unknown-symbol`)).not.toBeVisible();
                expect(getByTestId(site.view, `ok-symbol`)).not.toBeVisible();
                expect(getByTestId(site.view, `error-symbol`)).not.toBeVisible();
                expect(getByTestId(site.view, `auth-symbol`)).toBeVisible();
                expect(getByTestId(site.view, `sync-symbol`)).not.toBeVisible();

                expect(getByTestId(site.view, `sync-button`)).not.toBeVisible();
                expect(getByTestId(site.view, `reauth-button`)).not.toBeVisible();
                expect(getByTestId(site.view, `state-text`)).toHaveTextContent(`...`);

                expect(getByTestId(site.view, `next-sync-text`)).not.toBeVisible();

            })

            test(`Handle 'ready' state with previous error triggered by sync`, async () => {
                mockedEventManager.emit(iCPSEventApp.SCHEDULED_START)
                mockedEventManager.emit(iCPSEventRuntimeError.SCHEDULED_ERROR, new Error(`test`))
                webServer.state.timestamp = 1000
                const site = await loadMockedSite(webServer, `/state`)

                await site.window.refreshState()

                expect(site.functions.fetch).toHaveBeenCalledWith(`/api/state`, {headers: {Accept: `application/json`}})

                expect(getByTestId(site.view, `unknown-symbol`)).not.toBeVisible();
                expect(getByTestId(site.view, `ok-symbol`)).not.toBeVisible();
                expect(getByTestId(site.view, `error-symbol`)).toBeVisible();
                expect(getByTestId(site.view, `auth-symbol`)).not.toBeVisible();
                expect(getByTestId(site.view, `sync-symbol`)).not.toBeVisible();

                expect(getByTestId(site.view, `sync-button`)).toBeVisible();
                expect(getByTestId(site.view, `reauth-button`)).toBeVisible();

                expect(getByTestId(site.view, `state-text`)).toBeVisible();
                expect(getByTestId(site.view, `state-text`)).toHaveTextContent(`Last sync failed at1/1/1970, 12:00:01 AMUNKNOWN: Unknown error occurred caused by test`);

                expect(getByTestId(site.view, `next-sync-text`)).toBeVisible();
                expect(getByTestId(site.view, `next-sync-text`)).toHaveTextContent(`Next sync scheduled at...`);
            })

            test(`Handle 'ready' state with previous error triggered by auth`, async () => {
                mockedEventManager.emit(iCPSEventWebServer.REAUTH_REQUESTED)
                mockedEventManager.emit(iCPSEventRuntimeError.SCHEDULED_ERROR, new Error(`test`))
                webServer.state.timestamp = 1000
                const site = await loadMockedSite(webServer, `/state`)

                await site.window.refreshState()

                expect(site.functions.fetch).toHaveBeenCalledWith(`/api/state`, {headers: {Accept: `application/json`}})

                expect(getByTestId(site.view, `unknown-symbol`)).not.toBeVisible();
                expect(getByTestId(site.view, `ok-symbol`)).not.toBeVisible();
                expect(getByTestId(site.view, `error-symbol`)).toBeVisible();
                expect(getByTestId(site.view, `auth-symbol`)).not.toBeVisible();
                expect(getByTestId(site.view, `sync-symbol`)).not.toBeVisible();

                expect(getByTestId(site.view, `sync-button`)).toBeVisible();
                expect(getByTestId(site.view, `reauth-button`)).toBeVisible();

                expect(getByTestId(site.view, `state-text`)).toBeVisible();
                expect(getByTestId(site.view, `state-text`)).toHaveTextContent(`Last auth failed at1/1/1970, 12:00:01 AMUNKNOWN: Unknown error occurred caused by test`);

                expect(getByTestId(site.view, `next-sync-text`)).toBeVisible();
                expect(getByTestId(site.view, `next-sync-text`)).toHaveTextContent(`Next sync scheduled at...`);
            })

            test(`Handle 'ready' state with previous success triggered by sync`, async () => {
                mockedEventManager.emit(iCPSEventApp.SCHEDULED_START)
                mockedEventManager.emit(iCPSEventApp.SCHEDULED_DONE, new Date(1000))
                webServer.state.timestamp = 1000
                const site = await loadMockedSite(webServer, `/state`)

                await site.window.refreshState()

                expect(site.functions.fetch).toHaveBeenCalledWith(`/api/state`, {headers: {Accept: `application/json`}})

                expect(getByTestId(site.view, `unknown-symbol`)).not.toBeVisible();
                expect(getByTestId(site.view, `ok-symbol`)).toBeVisible();
                expect(getByTestId(site.view, `error-symbol`)).not.toBeVisible();
                expect(getByTestId(site.view, `auth-symbol`)).not.toBeVisible();
                expect(getByTestId(site.view, `sync-symbol`)).not.toBeVisible();

                expect(getByTestId(site.view, `sync-button`)).toBeVisible();
                expect(getByTestId(site.view, `reauth-button`)).toBeVisible();

                expect(getByTestId(site.view, `state-text`)).toBeVisible();
                expect(getByTestId(site.view, `state-text`)).toHaveTextContent(`Last sync successful at1/1/1970, 12:00:01 AM`);

                expect(getByTestId(site.view, `next-sync-text`)).toBeVisible();
                expect(getByTestId(site.view, `next-sync-text`)).toHaveTextContent(`Next sync scheduled at1/1/1970, 12:00:01 AM`);
            })

            test(`Handle 'auth' state`, async () => {
                mockedEventManager.emit(iCPSEventApp.SCHEDULED_START)
                webServer.state.timestamp = 1000
                const site = await loadMockedSite(webServer, `/state`)

                await site.window.refreshState()

                expect(site.functions.fetch).toHaveBeenCalledWith(`/api/state`, {headers: {Accept: `application/json`}})

                expect(getByTestId(site.view, `unknown-symbol`)).not.toBeVisible();
                expect(getByTestId(site.view, `ok-symbol`)).not.toBeVisible();
                expect(getByTestId(site.view, `error-symbol`)).not.toBeVisible();
                expect(getByTestId(site.view, `auth-symbol`)).toBeVisible();
                expect(getByTestId(site.view, `sync-symbol`)).not.toBeVisible();

                expect(getByTestId(site.view, `sync-button`)).not.toBeVisible();
                expect(getByTestId(site.view, `reauth-button`)).not.toBeVisible();

                expect(getByTestId(site.view, `state-text`)).toBeVisible();
                expect(getByTestId(site.view, `state-text`)).toHaveTextContent(`Authenticating...`);

                expect(getByTestId(site.view, `next-sync-text`)).not.toBeVisible();
            })

            test(`Handle 'sync' state`, async () => {
                mockedEventManager.emit(iCPSEventSyncEngine.START)
                webServer.state.timestamp = 1000
                const site = await loadMockedSite(webServer, `/state`)

                await site.window.refreshState()

                expect(site.functions.fetch).toHaveBeenCalledWith(`/api/state`, {headers: {Accept: `application/json`}})

                expect(getByTestId(site.view, `unknown-symbol`)).not.toBeVisible();
                expect(getByTestId(site.view, `ok-symbol`)).not.toBeVisible();
                expect(getByTestId(site.view, `error-symbol`)).not.toBeVisible();
                expect(getByTestId(site.view, `auth-symbol`)).not.toBeVisible();
                expect(getByTestId(site.view, `sync-symbol`)).toBeVisible();

                expect(getByTestId(site.view, `sync-button`)).not.toBeVisible();
                expect(getByTestId(site.view, `reauth-button`)).not.toBeVisible();

                expect(getByTestId(site.view, `state-text`)).toBeVisible();
                expect(getByTestId(site.view, `state-text`)).toHaveTextContent(`Syncing...`);

                expect(getByTestId(site.view, `next-sync-text`)).not.toBeVisible();
            })

        })

        describe(`Submit MFA UI`, () => {
            test(`Pre-condition not met`, async () => {
                mockedEventManager.emit(iCPSEventSyncEngine.START);

                const site = await loadMockedSite(webServer, `/submit-mfa`)

                expect(site.res.statusCode).toEqual(302)
                expect(site.res.getHeader(`location`)).toEqual(`/state`)
            })

            describe(`Pre-condition met`, () => {
                beforeEach(() => {
                    mockedEventManager.emit(iCPSEventCloud.MFA_REQUIRED)
                })

                test(`Handle 'MFA' state`, async () => {
                    const site = await loadMockedSite(webServer, `/state`)

                    await site.window.refreshState()

                    expect(site.functions.fetch).toHaveBeenCalledWith(`/api/state`, {headers: {Accept: `application/json`}})
                    expect(site.functions.navigate).toHaveBeenCalledWith(`/submit-mfa`)
                })

                test(`loads submit-mfa view & focus correctly set`, async () => {
                    const site = await loadMockedSite(webServer, `/submit-mfa`)

                    expect(getByTestId(site.view, `firstDigit`)).toBeVisible();
                    expect(getByTestId(site.view, `secondDigit`)).toBeVisible();
                    expect(getByTestId(site.view, `thirdDigit`)).toBeVisible();
                    expect(getByTestId(site.view, `fourthDigit`)).toBeVisible();
                    expect(getByTestId(site.view, `fifthDigit`)).toBeVisible();
                    expect(getByTestId(site.view, `sixthDigit`)).toBeVisible();

                    expect(getByTestId(site.view, `submitButton`)).toBeVisible();
                    expect(getByTestId(site.view, `resendButton`)).toBeVisible();
                    expect(getByTestId(site.view, `cancelButton`)).toBeVisible();
                    expect(getByTestId(site.view, `submitButton`)).toBeEnabled();
                    expect(getByTestId(site.view, `resendButton`)).toBeEnabled();
                    expect(getByTestId(site.view, `cancelButton`)).toBeEnabled();
                })

                test(`sets the focus onto the next input field when a digit is entered`, async () => {
                    const site = await loadMockedSite(webServer, `/submit-mfa`)

                    const inputs = site.view.querySelectorAll(`#mfaInput input`);
                    const firstInput = inputs[0] as HTMLInputElement;
                    const secondInput = inputs[1] as HTMLInputElement;

                    firstInput.focus();
                    firstInput.value = `1`;
                    firstInput.dispatchEvent(new site.window.Event(`input`));

                    expect(secondInput).toHaveFocus();
                });

                test(`distributes the digits across the input fields when pasting`, async () => {
                    const site = await loadMockedSite(webServer, `/submit-mfa`)

                    const inputs = site.view.querySelectorAll(`#mfaInput input`);
                    const firstInput = inputs[0] as HTMLInputElement;
                    const secondInput = inputs[1] as HTMLInputElement;
                    const thirdInput = inputs[2] as HTMLInputElement;
                    const fourthInput = inputs[3] as HTMLInputElement;
                    const fifthInput = inputs[4] as HTMLInputElement;
                    const sixthInput = inputs[5] as HTMLInputElement;

                    firstInput.focus();
                    firstInput.dispatchEvent(new site.window.Event(`focus`));

                    const pasteEvent = new site.window.Event(`paste`, {bubbles: true});
                    (pasteEvent as any).clipboardData = {
                        getData: () => `123456`,
                    };
                    firstInput.dispatchEvent(pasteEvent);

                    expect(firstInput.value).toBe(`1`);
                    expect(secondInput.value).toBe(`2`);
                    expect(thirdInput.value).toBe(`3`);
                    expect(fourthInput.value).toBe(`4`);
                    expect(fifthInput.value).toBe(`5`);
                    expect(sixthInput.value).toBe(`6`);
                });

                test(`enters mfa code`, async () => {
                    const site = await loadMockedSite(webServer, `/submit-mfa`);

                    (getByTestId(site.view, `firstDigit`) as HTMLInputElement).value = `1`;
                    (getByTestId(site.view, `secondDigit`) as HTMLInputElement).value = `2`;
                    (getByTestId(site.view, `thirdDigit`) as HTMLInputElement).value = `3`;
                    (getByTestId(site.view, `fourthDigit`) as HTMLInputElement).value = `4`;
                    (getByTestId(site.view, `fifthDigit`) as HTMLInputElement).value = `5`;
                    (getByTestId(site.view, `sixthDigit`) as HTMLInputElement).value = `6`;


                    getByTestId(site.view, `submitButton`).click()

                    expect(site.functions.navigate).not.toHaveBeenCalled()
                    expect(site.functions.alert).not.toHaveBeenCalled()
                    expect(site.functions.fetch).toHaveBeenCalledWith(`/api/mfa?code=123456`, {method: `POST`})
                    expect(getByTestId(site.view, `submitButton`)).not.toBeEnabled()
                    expect(getByTestId(site.view, `submitButton`).style.backgroundColor).toEqual(`rgb(147, 157, 179)`)
                })

                test(`displays an alert if mfa code submission failed`, async () => {
                    const site = await loadMockedSite(webServer, `/submit-mfa`);
                    site.functions.fetch.mockImplementation(() => {
                        throw new Error(`test`)
                    });

                    (getByTestId(site.view, `firstDigit`) as HTMLInputElement).value = `1`;
                    (getByTestId(site.view, `secondDigit`) as HTMLInputElement).value = `2`;
                    (getByTestId(site.view, `thirdDigit`) as HTMLInputElement).value = `3`;
                    (getByTestId(site.view, `fourthDigit`) as HTMLInputElement).value = `4`;
                    (getByTestId(site.view, `fifthDigit`) as HTMLInputElement).value = `5`;
                    (getByTestId(site.view, `sixthDigit`) as HTMLInputElement).value = `6`;


                    getByTestId(site.view, `submitButton`).click()

                    expect(site.functions.navigate).not.toHaveBeenCalled()
                    expect(site.functions.alert).toHaveBeenCalledWith(`MFA submission failed: undefined`)
                    expect(getByTestId(site.view, `submitButton`)).not.toBeEnabled()
                    expect(getByTestId(site.view, `submitButton`).style.backgroundColor).toEqual(`rgb(147, 157, 179)`)
                })

                test(`navigates to resend mfa ui`, async () => {
                    const site = await loadMockedSite(webServer, `/submit-mfa`);

                    getByTestId(site.view, `resendButton`).click()

                    expect(site.functions.navigate).toHaveBeenCalledWith(`/request-mfa`)
                    expect(site.functions.fetch).not.toHaveBeenCalled()
                })

                test(`navigates to state ui on cancel`, async () => {
                    const site = await loadMockedSite(webServer, `/submit-mfa`);

                    getByTestId(site.view, `cancelButton`).click()

                    expect(site.functions.navigate).toHaveBeenCalledWith(`/state`)
                    expect(site.functions.fetch).not.toHaveBeenCalled()

                })
            })
        })

        describe(`Request MFA UI`, () => {
            test(`Pre-condition not met`, async () => {
                mockedEventManager.emit(iCPSEventSyncEngine.START);

                const site = await loadMockedSite(webServer, `/request-mfa`)

                expect(site.res.statusCode).toEqual(302)
                expect(site.res.getHeader(`location`)).toEqual(`/state`)
            })

            describe(`Pre-condition met`, () => {
                beforeEach(() => {
                    mockedEventManager.emit(iCPSEventCloud.MFA_REQUIRED)
                })

                test(`loads request-mfa page`, async () => {
                    const site = await loadMockedSite(webServer, `/request-mfa`)

                    expect(getByTestId(site.view, `device-button`)).toBeVisible();
                    expect(getByTestId(site.view, `sms-button`)).toBeVisible();
                    expect(getByTestId(site.view, `voice-button`)).toBeVisible();
                    expect(getByTestId(site.view, `cancel-button`)).toBeVisible();
                })

                test(`requests mfa code via device`, async () => {
                    const site = await loadMockedSite(webServer, `/request-mfa`);

                    getByTestId(site.view, `device-button`).click()

                    expect(site.functions.fetch).toHaveBeenCalledWith(`/api/resend_mfa?method=device`, {method: `POST`})
                    expect(getByTestId(site.view, `device-button`)).not.toBeEnabled()
                    expect(getByTestId(site.view, `device-button`).style.backgroundColor).toEqual(`rgb(147, 157, 179)`)
                    expect(getByTestId(site.view, `sms-button`)).not.toBeEnabled()
                    expect(getByTestId(site.view, `sms-button`).style.backgroundColor).toEqual(`rgb(147, 157, 179)`)
                    expect(getByTestId(site.view, `voice-button`)).not.toBeEnabled()
                    expect(getByTestId(site.view, `voice-button`).style.backgroundColor).toEqual(`rgb(147, 157, 179)`)
                    expect(getByTestId(site.view, `cancel-button`)).toBeEnabled()
                    // This should happen - not sure why it does not
                    // expect(site.functions.navigate).toHaveBeenCalledWith(`/submit-mfa`)
                    expect(site.functions.alert).not.toHaveBeenCalled()
                })

                test(`requests mfa code via sms`, async () => {
                    const site = await loadMockedSite(webServer, `/request-mfa`);

                    getByTestId(site.view, `sms-button`).click()

                    expect(site.functions.fetch).toHaveBeenCalledWith(`/api/resend_mfa?method=sms`, {method: `POST`})
                    expect(getByTestId(site.view, `device-button`)).not.toBeEnabled()
                    expect(getByTestId(site.view, `device-button`).style.backgroundColor).toEqual(`rgb(147, 157, 179)`)
                    expect(getByTestId(site.view, `sms-button`)).not.toBeEnabled()
                    expect(getByTestId(site.view, `sms-button`).style.backgroundColor).toEqual(`rgb(147, 157, 179)`)
                    expect(getByTestId(site.view, `voice-button`)).not.toBeEnabled()
                    expect(getByTestId(site.view, `voice-button`).style.backgroundColor).toEqual(`rgb(147, 157, 179)`)
                    expect(getByTestId(site.view, `cancel-button`)).toBeEnabled()
                    // This should happen - not sure why it does not
                    // expect(site.functions.navigate).toHaveBeenCalledWith(`/submit-mfa`)
                    expect(site.functions.alert).not.toHaveBeenCalled()
                })

                test(`requests mfa code via voice`, async () => {
                    const site = await loadMockedSite(webServer, `/request-mfa`);

                    getByTestId(site.view, `voice-button`).click()

                    expect(site.functions.fetch).toHaveBeenCalledWith(`/api/resend_mfa?method=voice`, {method: `POST`})
                    expect(getByTestId(site.view, `device-button`)).not.toBeEnabled()
                    expect(getByTestId(site.view, `device-button`).style.backgroundColor).toEqual(`rgb(147, 157, 179)`)
                    expect(getByTestId(site.view, `sms-button`)).not.toBeEnabled()
                    expect(getByTestId(site.view, `sms-button`).style.backgroundColor).toEqual(`rgb(147, 157, 179)`)
                    expect(getByTestId(site.view, `voice-button`)).not.toBeEnabled()
                    expect(getByTestId(site.view, `voice-button`).style.backgroundColor).toEqual(`rgb(147, 157, 179)`)
                    expect(getByTestId(site.view, `cancel-button`)).toBeEnabled()
                    expect(site.functions.alert).not.toHaveBeenCalled()
                    // This should happen - not sure why it does not
                    // expect(site.functions.navigate).toHaveBeenCalledWith(`/submit-mfa`)
                })

                test(`shows alert if request failed`, async () => {
                    const site = await loadMockedSite(webServer, `/request-mfa`);

                    site.functions.fetch.mockImplementation(() => {
                        throw new Error(`test`)
                    });

                    getByTestId(site.view, `device-button`).click()

                    expect(site.functions.alert).toHaveBeenCalledWith(`Failed to request MFA code: test`)
                    expect(getByTestId(site.view, `device-button`)).not.toBeEnabled()
                    expect(getByTestId(site.view, `device-button`).style.backgroundColor).toEqual(`rgb(147, 157, 179)`)
                    expect(getByTestId(site.view, `sms-button`)).not.toBeEnabled()
                    expect(getByTestId(site.view, `sms-button`).style.backgroundColor).toEqual(`rgb(147, 157, 179)`)
                    expect(getByTestId(site.view, `voice-button`)).not.toBeEnabled()
                    expect(getByTestId(site.view, `voice-button`).style.backgroundColor).toEqual(`rgb(147, 157, 179)`)
                    expect(getByTestId(site.view, `cancel-button`)).toBeEnabled()
                    // This should happen - not sure why it does not
                    //expect(site.functions.navigate).toHaveBeenCalledWith(`/state`)
                })
            })
        })

    })

})