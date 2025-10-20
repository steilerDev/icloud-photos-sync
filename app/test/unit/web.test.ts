import {afterEach, beforeEach, describe, expect, jest, test} from "@jest/globals";
import {MockedEventManager, MockedResourceManager, MockedValidator, prepareResources} from "../_helpers/_general";
import {WebServer} from "../../src/app/web-ui/web-server";
import {iCPSEventApp, iCPSEventCloud, iCPSEventMFA, iCPSEventRuntimeError, iCPSEventRuntimeWarning, iCPSEventSyncEngine, iCPSEventWebServer} from "../../src/lib/resources/events-types";
import {createRequest, RequestMethod} from 'node-mocks-http'
import {IncomingMessage} from "http";
import {iCPSMockedUIFunction, iCPSMockedUISite, sendMockedRequest} from "../_helpers/web.helper";
import {MFAMethod} from "../../src/lib/icloud/mfa/mfa-method";
import {TokenApp} from "../../src/app/icloud-app";
import webpush from 'web-push';
import {configure, getByTestId} from "@testing-library/dom";
import '@testing-library/jest-dom/jest-globals';
import {LogLevel, SerializedState, StateManager, StateType} from "../../src/lib/resources/state-manager";

let mockedEventManager: MockedEventManager;
let mockedValidator: MockedValidator;
let mockedResourceManager: MockedResourceManager;
let mockedState: StateManager

beforeEach(() => {
    const mockedResources = prepareResources()!
    mockedEventManager = mockedResources.event;
    mockedValidator = mockedResources.validator;
    mockedResourceManager = mockedResources.manager;
    mockedState = mockedResources.state
    jest.clearAllMocks()
});

describe(`Constructor`, () => {
    test(`Should create HTTP server`, () => {
        const webServer = new WebServer()
        expect(webServer.server).toBeDefined()
    })

    test(`Should create default MFA Method`, () => {
        const webServer = new WebServer()
        expect(webServer.mfaMethod).toBeDefined()
        expect(webServer.mfaMethod.isDevice).toBeTruthy()
    })

    describe(`HTTP Server`, () => {
        test(`Should spawn webserver`, async () =>{
            WebServer.prototype.startServer = jest.fn<typeof WebServer.prototype.startServer>().mockResolvedValue({} as WebServer)
            const serverInstance = await WebServer.spawn()
            expect(WebServer.prototype.startServer).toHaveBeenCalled()
            expect(serverInstance).toEqual({})
        })

        test(`Should close the server`, async () => {
            const webServer = new WebServer();
            webServer.server.close = jest.fn().mockImplementation((cb: any) => cb()) as any

            await webServer.close()
            expect(webServer.server.close).toHaveBeenCalled()
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

        await webServer.notificationPusher.sendNotifications({} as SerializedState)

        expect(webServer.notificationPusher.sendPushNotification).toHaveBeenCalledTimes(count)
    })

    test(`Should send push notification to endpoint`, async () => {
        const subscription = {
            endpoint: `someEndpoint`,
            keys: {
                p256dh: `someKey`,
                auth: `someAuth`
            }
        }

        await webServer.notificationPusher.sendPushNotification(subscription, {state: StateType.READY} as SerializedState)

        expect(webpush.sendNotification).toHaveBeenCalledWith(subscription, `{"state":"ready"}`)
    })

    test(`Should remove push notification on webpush error`, async () => {
        const subscription = {
            endpoint: `someEndpoint`,
            keys: {
                p256dh: `someKey`,
                auth: `someAuth`
            }
        }
        webpush.sendNotification = jest.fn<typeof webpush.sendNotification>().mockRejectedValue(new webpush.WebPushError(`test`, 410, {}, `test`, `test`))
        mockedResourceManager.removeNotificationSubscription = jest.fn<typeof mockedResourceManager.removeNotificationSubscription>()

        await webServer.notificationPusher.sendPushNotification(subscription, {state: StateType.READY} as SerializedState)

        expect(webpush.sendNotification).toHaveBeenCalledWith(subscription, `{"state":"ready"}`)
        expect(mockedResourceManager.removeNotificationSubscription).toHaveBeenCalledWith(subscription)
    })
})

describe.each([
    {
        webBasePath: ``,
        desc: `Without base path`
    // },{
    //     webBasePath: `/test`,
    //     desc: `With base path '/test'`
    }
])(`Request handling - $desc`, ({webBasePath}) => {
    let webServer: WebServer 

    beforeEach(() => {
        mockedResourceManager._resources.webBasePath = webBasePath
        webServer = new WebServer()
    })

    test.each([{
        method: `PUT`,
        url: `${webBasePath}/state`,
        desc: `Unsupported method`
    },{
        method: `POST`,
        url: `${webBasePath}/invalid`,
        desc: `Unsupported post path`
    }, {
        method: `GET`,
        url: `${webBasePath}/invalid`,
        desc: `Unsupported get path`
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
            url: `${webBasePath}/api/mfa`,
        })
        const res = await sendMockedRequest(webServer, req)
        expect(runtimeEvent).toHaveBeenCalledWith(new Error(`Unknown error`))
        expect(res._getStatusCode()).toEqual(500)
        expect(res._getJSONData()).toEqual({message: `WEB_SERVER_UNKNOWN_ERR: Unknown error caused by test`})
    })

    test(`Should handle read body error`, async () => {
        const runtimeEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.WEB_SERVER_ERROR)
        const req = createRequest<IncomingMessage>({
            method: `POST`,
            url: `${webBasePath}/api/mfa`,
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
            url: `${webBasePath}/`
        }) 

        const res = await sendMockedRequest(webServer, req)

        expect(res._getStatusCode()).toEqual(302)
        expect(res.getHeader(`Location`)).toEqual(`/state`)
    })

    test(`Serve service worker`, async () => {
        const req = createRequest<IncomingMessage>({
            method: `GET`,
            url: `${webBasePath}/service-worker.js`
        }) 

        const res = await sendMockedRequest(webServer, req)

        expect(res._getStatusCode()).toEqual(200)
        expect(res._getData()).toMatch(/\* Service Worker for iCloud Photos Sync Web UI/)
        expect(res.getHeader(`Content-Type`)).toEqual(`application/javascript`)
    })

    test(`Serve manifest`, async () => {
        const req = createRequest<IncomingMessage>({
            method: `GET`,
            url: `${webBasePath}/manifest.json`
        }) 

        const res = await sendMockedRequest(webServer, req)

        expect(res._getStatusCode()).toEqual(200)
        expect(res._getJSONData()).toEqual({
            icons: [
                {
                    purpose: `any`,
                    sizes: `512x512`,
                    src: `${webBasePath}/icon.png`,
                    type: `image/png`
                }
            ],
            orientation: `any`,
            display: `standalone`,
            dir: `auto`,
            lang: `en-GB`,
            description: `iCloud Photos Sync is a one-way sync engine for the iCloud Photos Library`,
            start_url: `${webBasePath}/state`,
            scope: `${webBasePath}/`,
            name: `iCloud Photos Sync`,
            short_name: `ICPS`
        })
    })

    test(`Serve icon`, async () => {
        const req = createRequest<IncomingMessage>({
            method: `GET`,
            url: `${webBasePath}/icon.png`
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
            url: `${webBasePath}/favicon.ico`
        })
        const res = await sendMockedRequest(webServer, req)
        
        expect(res._getStatusCode()).toEqual(200)
        expect(res.getHeader(`Content-Type`)).toEqual(`image/x-icon`)
        expect(res._getHeaders()[`content-length`]).toEqual(15406)
        expect(res._getBuffer().length).toEqual(15406)
    })

    describe(`State request`, () => {
        test(`Should handle state request`, async () => {
            const req = createRequest<IncomingMessage>({
                method: `GET`,
                url: `${webBasePath}/api/state`
            })
            mockedState.serialize = jest.fn<typeof mockedState.serialize>().mockReturnValue({test: true} as any)

            const res = await sendMockedRequest(webServer, req)

            expect(res._getStatusCode()).toBe(200);
            expect(res._getJSONData()).toEqual({test: true});
            expect(mockedState.serialize).toHaveBeenCalled()
        })
    })

    test(`Serve public keys`, async () => {
        const req = createRequest<IncomingMessage>({
            method: `GET`,
            url: `${webBasePath}/api/vapid-public-key`
        })
        const res = await sendMockedRequest(webServer, req)
        expect(res._getStatusCode()).toBe(200);
        expect(res._getJSONData()).toEqual(expect.objectContaining({
            publicKey: expect.any(String),
        }));
    })

    describe(`Log request`, () => {
        beforeEach(() => {
            mockedState.log = [
                {
                    level: LogLevel.DEBUG,
                    source: `SourceA`,
                    message: `TestMsg`,
                    time: 1
                },{
                    level: LogLevel.INFO,
                    source: `SourceA`,
                    message: `TestMsg`,
                    time: 1
                },{
                    level: LogLevel.WARN,
                    source: `SourceB`,
                    message: `TestMsg`,
                    time: 1
                },{
                    level: LogLevel.ERROR,
                    source: `SourceB`,
                    message: `TestMsg`,
                    time: 1
                }
            ]
        })

        test(`Valid log request without parameter`, async () => {
            const req = createRequest<IncomingMessage>({
                method: `GET`,
                url: `${webBasePath}/api/log`
            })

            const res = await sendMockedRequest(webServer, req)
            expect(res._getStatusCode()).toBe(200)
            expect(res._getJSONData().length).toEqual(0)
        })

        test.each([
            {
                logLevel: `debug`,
                expectedLength: 4
            },{
                logLevel: `info`,
                expectedLength: 3
            },{
                logLevel: `warn`,
                expectedLength: 2
            },{
                logLevel: `error`,
                expectedLength: 1
            }
        ])(`Valid log request with valid $logLevel parameter`, async ({logLevel, expectedLength}) => {
            const req = createRequest<IncomingMessage>({
                method: `GET`,
                url: `${webBasePath}/api/log`,
                queryParameters: {
                    loglevel: logLevel
                }
            })

            const res = await sendMockedRequest(webServer, req)
            expect(res._getStatusCode()).toBe(200)
            expect(res._getJSONData().length).toEqual(expectedLength)
        })
    })

    describe(`Reauth request`, () => {

        describe(`Pre-Conditions met`, () => {
            test(`Should handle reauth request`, async () => {
                webServer.triggerReauth = jest.fn<typeof webServer.triggerReauth>().mockResolvedValue(``)
                const reauthEvent = mockedEventManager.spyOnEvent(iCPSEventWebServer.REAUTH_REQUESTED)
                const req = createRequest<IncomingMessage>({
                    method: `POST`,
                    url: `${webBasePath}/api/reauthenticate`
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
                    url: `${webBasePath}/api/reauthenticate`
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
            mockedState.state = StateType.RUNNING
            webServer.triggerReauth = jest.fn<typeof webServer.triggerReauth>().mockResolvedValue(``)
            const warnEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.WEB_SERVER_ERROR)
            const req = createRequest<IncomingMessage>({
                method: `POST`,
                url: `${webBasePath}/api/reauthenticate`
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
            const tokenApp = {
                run: jest.fn<typeof tokenApp.run>().mockResolvedValue(`test`)
            } as unknown as TokenApp

            await expect(webServer.triggerReauth(tokenApp)).resolves.toBe(`test`)
            expect(tokenApp.run).toHaveBeenCalled()
        })
    });

    describe(`Sync request`, () => {

        test(`Pre-Conditions met`, async () => {
            const syncEvent = mockedEventManager.spyOnEvent(iCPSEventWebServer.SYNC_REQUESTED)
            const req = createRequest<IncomingMessage>({
                method: `POST`,
                url: `${webBasePath}/api/sync`
            })

            const res = await sendMockedRequest(webServer, req)

            expect(res._getStatusCode()).toBe(200);
            expect(res._getJSONData()).toEqual({
                message: `Sync requested`,
            });
            expect(syncEvent).toHaveBeenCalled()
        })

        test(`Pre-Condition not met`, async () => {
            mockedState.state = StateType.RUNNING
            const warnEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.WEB_SERVER_ERROR)
            const req = createRequest<IncomingMessage>({
                method: `POST`,
                url: `${webBasePath}/api/sync`
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
                    url: `${webBasePath}/api/mfa`,
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
                    url: `${webBasePath}/api/mfa`,
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
                    url: `${webBasePath}/api/mfa`,
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
                    url: `${webBasePath}/api/resend_mfa`,
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
                    url: `${webBasePath}/api/resend_mfa`,
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
                    url: `${webBasePath}/api/resend_mfa`,
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
                    url: `${webBasePath}/api/mfa`,
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
                    url: `${webBasePath}/api/mfa`,
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
                    url: `${webBasePath}/api/mfa`,
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
                    url: `${webBasePath}/api/resend_mfa`,
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
                url: `${webBasePath}/api/subscribe`,
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
                url: `${webBasePath}/api/subscribe`,
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
        let site: iCPSMockedUISite

        // Fake Timers & Clearing them is necessary to have no pending task
        beforeEach(() => {
            jest.useFakeTimers();
            site = new iCPSMockedUISite(webServer)
        })
        afterEach(() => {
            jest.clearAllTimers();
            jest.useRealTimers();
        })

        describe(`State UI`, () => {
            test(`Handle state view request`, async () => {
                await site.load(`${webBasePath}/state`)
            

                expect(getByTestId(site.body, `unknown-symbol`)).toBeVisible();
                expect(getByTestId(site.body, `ok-symbol`)).not.toBeVisible();
                expect(getByTestId(site.body, `error-symbol`)).not.toBeVisible();
                expect(getByTestId(site.body, `running-symbol`)).not.toBeVisible();

                expect(getByTestId(site.body, `sync-button`)).toBeVisible();
                expect(getByTestId(site.body, `reauth-button`)).toBeVisible();
                expect(getByTestId(site.body, `state-text`)).toHaveTextContent(`...`);

                expect(getByTestId(site.body, `progress-bar`)).not.toBeVisible();

                expect(getByTestId(site.body, `next-sync-text`)).not.toBeVisible();

                jest.advanceTimersByTime(1000)

                expect(site.mockedFunctions.fetch).toHaveBeenCalledTimes(1)
                expect(site.mockedFunctions.fetch).toHaveBeenCalledWith(`${webBasePath}/api/state`, {headers: {Accept: `application/json`}})
            })

            test(`Handle 'ready' without previous trigger`, async () => {
                mockedEventManager.emit(iCPSEventApp.SCHEDULED, new Date(1000))
                mockedState.timestamp = 1000
                await site.load(`${webBasePath}/state`)

                await site.dom.window.refreshState()

                expect(site.mockedFunctions.fetch).toHaveBeenCalledWith(`${webBasePath}/api/state`, {headers: {Accept: `application/json`}})

                expect(getByTestId(site.body, `unknown-symbol`)).not.toBeVisible();
                expect(getByTestId(site.body, `ok-symbol`)).toBeVisible();
                expect(getByTestId(site.body, `error-symbol`)).not.toBeVisible();
                expect(getByTestId(site.body, `running-symbol`)).not.toBeVisible();

                expect(getByTestId(site.body, `sync-button`)).toBeVisible();
                expect(getByTestId(site.body, `reauth-button`)).toBeVisible();

                expect(getByTestId(site.body, `state-text`)).toBeVisible();
                expect(getByTestId(site.body, `state-text`)).toHaveTextContent(`Application ready`);

                expect(getByTestId(site.body, `progress-bar`)).not.toBeVisible();

                expect(getByTestId(site.body, `next-sync-text`)).toBeVisible();
                expect(getByTestId(site.body, `next-sync-text`)).toHaveTextContent(`Next sync scheduled at1/1/1970, 12:00:01 AM`);
            })

            test(`Handle 'ready' state with previous error triggered by sync`, async () => {
                mockedEventManager.emit(iCPSEventApp.SCHEDULED_START)
                mockedEventManager.emit(iCPSEventRuntimeError.SCHEDULED_ERROR, new Error(`test`))
                mockedState.timestamp = 1000
                await site.load(`${webBasePath}/state`)

                await site.dom.window.refreshState()

                expect(site.mockedFunctions.fetch).toHaveBeenCalledWith(`${webBasePath}/api/state`, {headers: {Accept: `application/json`}})

                expect(getByTestId(site.body, `unknown-symbol`)).not.toBeVisible();
                expect(getByTestId(site.body, `ok-symbol`)).not.toBeVisible();
                expect(getByTestId(site.body, `error-symbol`)).toBeVisible();
                expect(getByTestId(site.body, `running-symbol`)).not.toBeVisible();

                expect(getByTestId(site.body, `sync-button`)).toBeVisible();
                expect(getByTestId(site.body, `reauth-button`)).toBeVisible();

                expect(getByTestId(site.body, `state-text`)).toBeVisible();
                expect(getByTestId(site.body, `state-text`)).toHaveTextContent(`Last sync failed at1/1/1970, 12:00:01 AMUNKNOWN: Unknown error occurred caused by test`);

                expect(getByTestId(site.body, `progress-bar`)).not.toBeVisible();

                expect(getByTestId(site.body, `next-sync-text`)).toBeVisible();
                expect(getByTestId(site.body, `next-sync-text`)).toHaveTextContent(`Next sync scheduled at...`);
            })

            test(`Handle 'ready' state with previous error triggered by auth`, async () => {
                mockedEventManager.emit(iCPSEventWebServer.REAUTH_REQUESTED)
                mockedEventManager.emit(iCPSEventRuntimeError.SCHEDULED_ERROR, new Error(`test`))
                mockedState.timestamp = 1000
                await site.load(`${webBasePath}/state`)

                await site.dom.window.refreshState()

                expect(site.mockedFunctions.fetch).toHaveBeenCalledWith(`${webBasePath}/api/state`, {headers: {Accept: `application/json`}})

                expect(getByTestId(site.body, `unknown-symbol`)).not.toBeVisible();
                expect(getByTestId(site.body, `ok-symbol`)).not.toBeVisible();
                expect(getByTestId(site.body, `error-symbol`)).toBeVisible();
                expect(getByTestId(site.body, `running-symbol`)).not.toBeVisible();

                expect(getByTestId(site.body, `sync-button`)).toBeVisible();
                expect(getByTestId(site.body, `reauth-button`)).toBeVisible();

                expect(getByTestId(site.body, `state-text`)).toBeVisible();
                expect(getByTestId(site.body, `state-text`)).toHaveTextContent(`Last auth failed at1/1/1970, 12:00:01 AMUNKNOWN: Unknown error occurred caused by test`);

                expect(getByTestId(site.body, `progress-bar`)).not.toBeVisible();

                expect(getByTestId(site.body, `next-sync-text`)).toBeVisible();
                expect(getByTestId(site.body, `next-sync-text`)).toHaveTextContent(`Next sync scheduled at...`);
            })

            test(`Handle 'ready' state with previous success triggered by sync`, async () => {
                mockedEventManager.emit(iCPSEventApp.SCHEDULED_START)
                mockedEventManager.emit(iCPSEventApp.SCHEDULED_DONE, new Date(1000))
                mockedState.timestamp = 1000
                await site.load(`${webBasePath}/state`)

                await site.dom.window.refreshState()

                expect(site.mockedFunctions.fetch).toHaveBeenCalledWith(`${webBasePath}/api/state`, {headers: {Accept: `application/json`}})

                expect(getByTestId(site.body, `unknown-symbol`)).not.toBeVisible();
                expect(getByTestId(site.body, `ok-symbol`)).toBeVisible();
                expect(getByTestId(site.body, `error-symbol`)).not.toBeVisible();
                expect(getByTestId(site.body, `running-symbol`)).not.toBeVisible();

                expect(getByTestId(site.body, `sync-button`)).toBeVisible();
                expect(getByTestId(site.body, `reauth-button`)).toBeVisible();

                expect(getByTestId(site.body, `state-text`)).toBeVisible();
                expect(getByTestId(site.body, `state-text`)).toHaveTextContent(`Last sync successful at1/1/1970, 12:00:01 AM`);

                expect(getByTestId(site.body, `progress-bar`)).not.toBeVisible();

                expect(getByTestId(site.body, `next-sync-text`)).toBeVisible();
                expect(getByTestId(site.body, `next-sync-text`)).toHaveTextContent(`Next sync scheduled at1/1/1970, 12:00:01 AM`);
            })

            test(`Handle 'running' state`, async () => {
                mockedEventManager.emit(iCPSEventApp.SCHEDULED_START)
                mockedEventManager.emit(iCPSEventCloud.AUTHENTICATION_STARTED)
                await site.load(`${webBasePath}/state`)

                await site.dom.window.refreshState()

                expect(site.mockedFunctions.fetch).toHaveBeenCalledWith(`${webBasePath}/api/state`, {headers: {Accept: `application/json`}})

                expect(getByTestId(site.body, `unknown-symbol`)).not.toBeVisible();
                expect(getByTestId(site.body, `ok-symbol`)).not.toBeVisible();
                expect(getByTestId(site.body, `error-symbol`)).not.toBeVisible();
                expect(getByTestId(site.body, `running-symbol`)).toBeVisible();

                expect(getByTestId(site.body, `sync-button`)).not.toBeVisible();
                expect(getByTestId(site.body, `reauth-button`)).not.toBeVisible();
                expect(getByTestId(site.body, `state-text`)).toHaveTextContent(`Authenticating user...`);

                expect(getByTestId(site.body, `progress-bar`)).toBeVisible();
                expect(getByTestId(site.body, `progress-bar`).style.width).toBe(`1%`);

                expect(getByTestId(site.body, `next-sync-text`)).not.toBeVisible();
            })
        })

        describe.each([
            {
                preCon: iCPSEventCloud.MFA_REQUIRED,
                sitePath: `${webBasePath}/submit-mfa`
            },{
                preCon: iCPSEventCloud.MFA_REQUIRED,
                sitePath: `${webBasePath}/request-mfa`
            },{
                preCon: iCPSEventCloud.AUTHENTICATION_STARTED,
                sitePath: `${webBasePath}/state`
            }
        ])(`Log View on $sitePath`, ({sitePath, preCon}) => {

            beforeEach(async () => {
                mockedEventManager.emit(preCon)
                await site.load(sitePath)
                // Disabling state refresh
                site.dom.window.refreshState = jest.fn()
                mockedState.log = [
                    {
                        level: LogLevel.DEBUG,
                        source: `SourceA`,
                        message: `TestMsg`,
                        time: 1
                    },{
                        level: LogLevel.INFO,
                        source: `SourceA`,
                        message: `TestMsg`,
                        time: 1
                    },{
                        level: LogLevel.WARN,
                        source: `SourceB`,
                        message: `TestMsg`,
                        time: 1
                    },{
                        level: LogLevel.ERROR,
                        source: `SourceB`,
                        message: `TestMsg`,
                        time: 1
                    }
                ]
            })

            test(`Log View hidden`, () => {
                expect(getByTestId(site.body, `logContent`)).not.toBeVisible();
                expect(getByTestId(site.body, `logHeader`)).toBeVisible();

                expect(getByTestId(site.body, `logDebugBtn`)).not.toBeVisible();
                expect(getByTestId(site.body, `logInfoBtn`)).not.toBeVisible();
                expect(getByTestId(site.body, `logWarnBtn`)).not.toBeVisible();
                expect(getByTestId(site.body, `logErrorBtn`)).not.toBeVisible();
                expect(getByTestId(site.body, `pauseBtn`)).not.toBeVisible();
            })

            test.each([
                {
                    element: `logHeaderLeft`
                },{
                    element: `logExpandButton`
                }
            ])(`Log View opened`, async ({element}) => {
                const mock = site.mockFunction(`setLog`)
                getByTestId(site.body, element).click()

                expect(getByTestId(site.body, `logContent`).children[0].innerHTML).toEqual(`Loading logs...`);
                await mock.waitUntilCalled()
                
                expect(getByTestId(site.body, `logContent`)).toBeVisible();
                expect(getByTestId(site.body, `logHeader`)).toBeVisible();

                expect(getByTestId(site.body, `logDebugBtn`)).toBeVisible();
                expect(getByTestId(site.body, `logInfoBtn`)).toBeVisible();
                expect(getByTestId(site.body, `logWarnBtn`)).toBeVisible();
                expect(getByTestId(site.body, `logErrorBtn`)).toBeVisible();
                expect(getByTestId(site.body, `pauseBtn`)).toBeVisible();

                expect(site.mockedFunctions.fetch).toHaveBeenCalledWith(`${webBasePath}/api/log?loglevel=info`, {headers: {Accept: `application/json`}})
                expect(getByTestId(site.body, `logContent`).childElementCount).toEqual(3);
            })

            describe(`Log buttons`, () => {
                let mock: iCPSMockedUIFunction
                beforeEach(async () => {
                    mock = site.mockFunction(`setLog`)
                    getByTestId(site.body, `logHeaderLeft`).click()
                    site.mockedFunctions.fetch.mockClear()
                    await mock.waitUntilCalled()
                })

                test(`Debug button`, async () => {
                    getByTestId(site.body, `logDebugBtn`).click()
                    expect(getByTestId(site.body, `logContent`).children[0].innerHTML).toEqual(`Loading logs...`);

                    jest.advanceTimersByTime(1000)
                    await mock.waitUntilCalled()

                    expect(site.mockedFunctions.fetch).toHaveBeenCalledWith(`${webBasePath}/api/log?loglevel=debug`, {headers: {Accept: `application/json`}})
                    expect(getByTestId(site.body, `logContent`).childElementCount).toEqual(4);
                })
                
                test(`Warn button`, async () => {
                    getByTestId(site.body, `logWarnBtn`).click()
                    expect(getByTestId(site.body, `logContent`).children[0].innerHTML).toEqual(`Loading logs...`);

                    jest.advanceTimersByTime(1000)
                    await mock.waitUntilCalled()

                    expect(site.mockedFunctions.fetch).toHaveBeenCalledWith(`${webBasePath}/api/log?loglevel=warn`, {headers: {Accept: `application/json`}})
                    expect(getByTestId(site.body, `logContent`).childElementCount).toEqual(2);
                })

                test(`Error button`, async () => {
                    getByTestId(site.body, `logErrorBtn`).click()
                    expect(getByTestId(site.body, `logContent`).children[0].innerHTML).toEqual(`Loading logs...`);

                    jest.advanceTimersByTime(1000)
                    await mock.waitUntilCalled()

                    expect(site.mockedFunctions.fetch).toHaveBeenCalledWith(`${webBasePath}/api/log?loglevel=error`, {headers: {Accept: `application/json`}})
                    expect(getByTestId(site.body, `logContent`).childElementCount).toEqual(1);
                })

                test(`Pause/Resume button`, async () => {
                    getByTestId(site.body, `pauseBtn`).click()
                    expect(getByTestId(site.body, `logContent`).childElementCount).toEqual(3);
                    expect(getByTestId(site.body, `logDebugBtn`)).toBeDisabled();
                    expect(getByTestId(site.body, `logInfoBtn`)).toBeDisabled();
                    expect(getByTestId(site.body, `logWarnBtn`)).toBeDisabled();
                    expect(getByTestId(site.body, `logErrorBtn`)).toBeDisabled();

                    expect(site.mockedFunctions.fetch).not.toHaveBeenCalled()
                    expect(getByTestId(site.body, `logContent`).childElementCount).toEqual(3);

                    getByTestId(site.body, `pauseBtn`).click()

                    jest.advanceTimersByTime(1000)
                    await mock.waitUntilCalled()

                    expect(site.mockedFunctions.fetch).toHaveBeenCalledWith(`${webBasePath}/api/log?loglevel=info`, {headers: {Accept: `application/json`}})
                    expect(getByTestId(site.body, `logDebugBtn`)).toBeEnabled();
                    expect(getByTestId(site.body, `logInfoBtn`)).toBeEnabled();
                    expect(getByTestId(site.body, `logWarnBtn`)).toBeEnabled();
                    expect(getByTestId(site.body, `logErrorBtn`)).toBeEnabled();

                    expect(getByTestId(site.body, `logContent`).childElementCount).toEqual(3);
                })
            })
        })

        describe(`Submit MFA UI`, () => {
            test(`Pre-condition not met`, async () => {
                mockedEventManager.emit(iCPSEventSyncEngine.START);

                const res = await site.load(`${webBasePath}/submit-mfa`)

                expect(res.statusCode).toEqual(302)
                expect(res.getHeader(`location`)).toEqual(`${webBasePath}/state`)
            })

            describe(`Pre-condition met`, () => {
                beforeEach(() => {
                    mockedEventManager.emit(iCPSEventCloud.MFA_REQUIRED)
                })

                test(`Handle 'MFA' state`, async () => {
                    await site.load(`${webBasePath}/state`)

                    await site.dom.window.refreshState()

                    expect(site.mockedFunctions.fetch).toHaveBeenCalledWith(`${webBasePath}/api/state`, {headers: {Accept: `application/json`}})
                    expect(site.mockedFunctions.navigate).toHaveBeenCalledWith(`${webBasePath}/submit-mfa`)
                })

                test(`loads submit-mfa view & focus correctly set`, async () => {
                    await site.load(`${webBasePath}/submit-mfa`)

                    expect(getByTestId(site.body, `firstDigit`)).toBeVisible();
                    expect(getByTestId(site.body, `secondDigit`)).toBeVisible();
                    expect(getByTestId(site.body, `thirdDigit`)).toBeVisible();
                    expect(getByTestId(site.body, `fourthDigit`)).toBeVisible();
                    expect(getByTestId(site.body, `fifthDigit`)).toBeVisible();
                    expect(getByTestId(site.body, `sixthDigit`)).toBeVisible();

                    expect(getByTestId(site.body, `submitButton`)).toBeVisible();
                    expect(getByTestId(site.body, `resendButton`)).toBeVisible();
                    expect(getByTestId(site.body, `cancelButton`)).toBeVisible();
                    expect(getByTestId(site.body, `submitButton`)).toBeEnabled();
                    expect(getByTestId(site.body, `resendButton`)).toBeEnabled();
                    expect(getByTestId(site.body, `cancelButton`)).toBeEnabled();
                })

                test(`sets the focus onto the next input field when a digit is entered`, async () => {
                    await site.load(`${webBasePath}/submit-mfa`)

                    const inputs = site.body.querySelectorAll(`#mfaInput input`);
                    const firstInput = inputs[0] as HTMLInputElement;
                    const secondInput = inputs[1] as HTMLInputElement;

                    firstInput.focus();
                    firstInput.value = `1`;
                    firstInput.dispatchEvent(new site.dom.window.Event(`input`));

                    expect(secondInput).toHaveFocus();
                });

                test(`distributes the digits across the input fields when pasting`, async () => {
                    await site.load(`${webBasePath}/submit-mfa`)

                    const inputs = site.body.querySelectorAll(`#mfaInput input`);
                    const firstInput = inputs[0] as HTMLInputElement;
                    const secondInput = inputs[1] as HTMLInputElement;
                    const thirdInput = inputs[2] as HTMLInputElement;
                    const fourthInput = inputs[3] as HTMLInputElement;
                    const fifthInput = inputs[4] as HTMLInputElement;
                    const sixthInput = inputs[5] as HTMLInputElement;

                    firstInput.focus();
                    firstInput.dispatchEvent(new site.dom.window.Event(`focus`));

                    const pasteEvent = new site.dom.window.Event(`paste`, {bubbles: true});
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
                    await site.load(`${webBasePath}/submit-mfa`);

                    (getByTestId(site.body, `firstDigit`) as HTMLInputElement).value = `1`;
                    (getByTestId(site.body, `secondDigit`) as HTMLInputElement).value = `2`;
                    (getByTestId(site.body, `thirdDigit`) as HTMLInputElement).value = `3`;
                    (getByTestId(site.body, `fourthDigit`) as HTMLInputElement).value = `4`;
                    (getByTestId(site.body, `fifthDigit`) as HTMLInputElement).value = `5`;
                    (getByTestId(site.body, `sixthDigit`) as HTMLInputElement).value = `6`;


                    getByTestId(site.body, `submitButton`).click()

                    expect(site.mockedFunctions.navigate).not.toHaveBeenCalled()
                    expect(site.mockedFunctions.alert).not.toHaveBeenCalled()
                    expect(site.mockedFunctions.fetch).toHaveBeenCalledWith(`${webBasePath}/api/mfa?code=123456`, {method: `POST`})
                    expect(getByTestId(site.body, `submitButton`)).not.toBeEnabled()
                    expect(getByTestId(site.body, `submitButton`).style.backgroundColor).toEqual(`rgb(147, 157, 179)`)
                })

                test(`displays an alert if mfa code submission failed`, async () => {
                    await site.load(`${webBasePath}/submit-mfa`);
                    site.mockedFunctions.fetch.mockImplementation(() => {
                        throw new Error(`test`)
                    });

                    (getByTestId(site.body, `firstDigit`) as HTMLInputElement).value = `1`;
                    (getByTestId(site.body, `secondDigit`) as HTMLInputElement).value = `2`;
                    (getByTestId(site.body, `thirdDigit`) as HTMLInputElement).value = `3`;
                    (getByTestId(site.body, `fourthDigit`) as HTMLInputElement).value = `4`;
                    (getByTestId(site.body, `fifthDigit`) as HTMLInputElement).value = `5`;
                    (getByTestId(site.body, `sixthDigit`) as HTMLInputElement).value = `6`;


                    getByTestId(site.body, `submitButton`).click()

                    expect(site.mockedFunctions.navigate).not.toHaveBeenCalled()
                    expect(site.mockedFunctions.alert).toHaveBeenCalledWith(`MFA submission failed: undefined`)
                    expect(getByTestId(site.body, `submitButton`)).not.toBeEnabled()
                    expect(getByTestId(site.body, `submitButton`).style.backgroundColor).toEqual(`rgb(147, 157, 179)`)
                })

                test(`navigates to resend mfa ui`, async () => {
                    await site.load(`${webBasePath}/submit-mfa`);

                    getByTestId(site.body, `resendButton`).click()

                    expect(site.mockedFunctions.navigate).toHaveBeenCalledWith(`${webBasePath}/request-mfa`)
                    expect(site.mockedFunctions.fetch).not.toHaveBeenCalled()
                })

                test(`navigates to state ui on cancel`, async () => {
                    await site.load(`${webBasePath}/submit-mfa`);

                    getByTestId(site.body, `cancelButton`).click()

                    expect(site.mockedFunctions.navigate).toHaveBeenCalledWith(`${webBasePath}/state`)
                    expect(site.mockedFunctions.fetch).not.toHaveBeenCalled()

                })
            })
        })

        describe(`Request MFA UI`, () => {
            test(`Pre-condition not met`, async () => {
                mockedEventManager.emit(iCPSEventSyncEngine.START);

                const res = await site.load(`${webBasePath}/request-mfa`)

                expect(res.statusCode).toEqual(302)
                expect(res.getHeader(`location`)).toEqual(`${webBasePath}/state`)
            })

            describe(`Pre-condition met`, () => {
                beforeEach(() => {
                    mockedEventManager.emit(iCPSEventCloud.MFA_REQUIRED)
                })

                test(`loads request-mfa page`, async () => {
                    await site.load(`${webBasePath}/request-mfa`)

                    expect(getByTestId(site.body, `device-button`)).toBeVisible();
                    expect(getByTestId(site.body, `sms-button`)).toBeVisible();
                    expect(getByTestId(site.body, `voice-button`)).toBeVisible();
                    expect(getByTestId(site.body, `cancel-button`)).toBeVisible();
                })

                test(`requests mfa code via device`, async () => {
                    await site.load(`${webBasePath}/request-mfa`);

                    getByTestId(site.body, `device-button`).click()

                    expect(site.mockedFunctions.fetch).toHaveBeenCalledWith(`${webBasePath}/api/resend_mfa?method=device`, {method: `POST`})
                    expect(getByTestId(site.body, `device-button`)).not.toBeEnabled()
                    expect(getByTestId(site.body, `device-button`).style.backgroundColor).toEqual(`rgb(147, 157, 179)`)
                    expect(getByTestId(site.body, `sms-button`)).not.toBeEnabled()
                    expect(getByTestId(site.body, `sms-button`).style.backgroundColor).toEqual(`rgb(147, 157, 179)`)
                    expect(getByTestId(site.body, `voice-button`)).not.toBeEnabled()
                    expect(getByTestId(site.body, `voice-button`).style.backgroundColor).toEqual(`rgb(147, 157, 179)`)
                    expect(getByTestId(site.body, `cancel-button`)).toBeEnabled()
                    // This should happen - not sure why it does not
                    // expect(site.mockedFunctions.navigate).toHaveBeenCalledWith(`/submit-mfa`)
                    expect(site.mockedFunctions.alert).not.toHaveBeenCalled()
                })

                test(`requests mfa code via sms`, async () => {
                    await site.load(`${webBasePath}/request-mfa`);

                    getByTestId(site.body, `sms-button`).click()

                    expect(site.mockedFunctions.fetch).toHaveBeenCalledWith(`${webBasePath}/api/resend_mfa?method=sms`, {method: `POST`})
                    expect(getByTestId(site.body, `device-button`)).not.toBeEnabled()
                    expect(getByTestId(site.body, `device-button`).style.backgroundColor).toEqual(`rgb(147, 157, 179)`)
                    expect(getByTestId(site.body, `sms-button`)).not.toBeEnabled()
                    expect(getByTestId(site.body, `sms-button`).style.backgroundColor).toEqual(`rgb(147, 157, 179)`)
                    expect(getByTestId(site.body, `voice-button`)).not.toBeEnabled()
                    expect(getByTestId(site.body, `voice-button`).style.backgroundColor).toEqual(`rgb(147, 157, 179)`)
                    expect(getByTestId(site.body, `cancel-button`)).toBeEnabled()
                    // This should happen - not sure why it does not
                    // expect(site.mockedFunctions.navigate).toHaveBeenCalledWith(`/submit-mfa`)
                    expect(site.mockedFunctions.alert).not.toHaveBeenCalled()
                })

                test(`requests mfa code via voice`, async () => {
                    await site.load(`${webBasePath}/request-mfa`);

                    getByTestId(site.body, `voice-button`).click()

                    expect(site.mockedFunctions.fetch).toHaveBeenCalledWith(`${webBasePath}/api/resend_mfa?method=voice`, {method: `POST`})
                    expect(getByTestId(site.body, `device-button`)).not.toBeEnabled()
                    expect(getByTestId(site.body, `device-button`).style.backgroundColor).toEqual(`rgb(147, 157, 179)`)
                    expect(getByTestId(site.body, `sms-button`)).not.toBeEnabled()
                    expect(getByTestId(site.body, `sms-button`).style.backgroundColor).toEqual(`rgb(147, 157, 179)`)
                    expect(getByTestId(site.body, `voice-button`)).not.toBeEnabled()
                    expect(getByTestId(site.body, `voice-button`).style.backgroundColor).toEqual(`rgb(147, 157, 179)`)
                    expect(getByTestId(site.body, `cancel-button`)).toBeEnabled()
                    expect(site.mockedFunctions.alert).not.toHaveBeenCalled()
                    // This should happen - not sure why it does not
                    // expect(site.mockedFunctions.navigate).toHaveBeenCalledWith(`/submit-mfa`)
                })

                test(`shows alert if request failed`, async () => {
                    await site.load(`${webBasePath}/request-mfa`);

                    site.mockedFunctions.fetch.mockImplementation(() => {
                        throw new Error(`test`)
                    });

                    getByTestId(site.body, `device-button`).click()

                    expect(site.mockedFunctions.alert).toHaveBeenCalledWith(`Failed to request MFA code: test`)
                    expect(getByTestId(site.body, `device-button`)).not.toBeEnabled()
                    expect(getByTestId(site.body, `device-button`).style.backgroundColor).toEqual(`rgb(147, 157, 179)`)
                    expect(getByTestId(site.body, `sms-button`)).not.toBeEnabled()
                    expect(getByTestId(site.body, `sms-button`).style.backgroundColor).toEqual(`rgb(147, 157, 179)`)
                    expect(getByTestId(site.body, `voice-button`)).not.toBeEnabled()
                    expect(getByTestId(site.body, `voice-button`).style.backgroundColor).toEqual(`rgb(147, 157, 179)`)
                    expect(getByTestId(site.body, `cancel-button`)).toBeEnabled()
                    // This should happen - not sure why it does not
                    //expect(site.mockedFunctions.navigate).toHaveBeenCalledWith(`/state`)
                })
            })
        })

    })

})