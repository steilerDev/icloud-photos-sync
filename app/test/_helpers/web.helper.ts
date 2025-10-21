import {IncomingMessage, ServerResponse} from "http"
import {createRequest, createResponse, MockRequest, MockResponse, RequestMethod} from "node-mocks-http"
import {WebServer} from "../../src/app/web-ui/web-server"
import {JSDOM} from "jsdom";
import {jest} from "@jest/globals";
import {EventEmitter} from "events";

/**
 * This type extends the mock request type to cover arbitrary body data
 */
export type iCPSMockRequest = MockRequest<IncomingMessage> &
    {
        /**
         * This data will be send as a body to the server
         */
        data?: any
        /**
         * The query parameter will be appended to the URL
         */
        queryParameters?: {
            [key: string]: string
        }
    }

/**
 * This is a workaround to make MockRequest work with our implementation of the http server
 * @param webServer - The webserver to send the request to
 * @param req - The request to be made to the server
 */
export async function sendMockedRequest(webServer: WebServer, req: iCPSMockRequest): Promise<MockResponse<ServerResponse>> {
    // We need to properly set the request's content-length header
    const contentLength = req.data?.length ?? 0
    req.headers[`content-length`] = `${contentLength}`

    // Query Parameters are not appended to the URL as expected
    if(req.queryParameters && Object.keys(req.queryParameters).length > 0) {
        req.url += `?`
        for(const key in req.queryParameters) {
            req.url += `${key}=${req.queryParameters[key]}`
        }
    }

    const res = createResponse({req})

    // So we can make sure the response is written to mock
    res.writable = true

    const requestPromise = webServer.handleRequest(req, res)
    if(contentLength > 0) {
        // We need to trigger the send event after invoking `.handleRequest` in order to trigger the stream `data` and `end` event
        req.send(req.data)
    }
    await requestPromise

    return res
}

/**
 * This class provides access to a mocked UI page
 * It will pipe
 */
export class iCPSMockedUISite {

    webServer: WebServer

    dom!: JSDOM
    body!: HTMLElement

    mockedFunctions: {
        alert: any,
        warn: any,
        navigate: any,
        fetch: any,
        [key: string]: any
    } = {} as any

    constructor(webServer: WebServer) {
        this.webServer = webServer
    }

    async load(url: string): Promise<MockResponse<ServerResponse>> {
        const req = createRequest<IncomingMessage>({
            method: `GET`,
            url: url
        })

        const res = await sendMockedRequest(this.webServer, req)
        this.dom = new JSDOM(res._getData(), {
            runScripts: `dangerously`,
            url: `https://localhost${url}`
        })

        this.mockedFunctions.fetch = this.mockFetch()
        this.mockedFunctions = {
            fetch: this.mockFetch(),
            alert: this.mockAlert(),
            warn: this.mockWarn(),
            navigate: this.mockNavigate()
        }
        
        this.body = this.dom.window.document.body

        return res
    }

    mockFetch() {
        // This is piping together the browser's fetch method and the provided web server
        this.dom.window.fetch = jest.fn<typeof this.dom.window.fetch>().mockImplementation(async (fetchUrl: string, init?: RequestInit) => {
            const fetchReq = createRequest<IncomingMessage>({
                method: init?.method as RequestMethod,
                url: fetchUrl,
                data: init?.body
            })

            const fetchRes = await sendMockedRequest(this.webServer, fetchReq)
            
            return {
                ok: fetchRes.statusCode >= 200 && fetchRes.statusCode < 300,
                statusText: fetchRes.statusMessage,
                json: fetchRes._getJSONData
            } as Response
        })
        return this.dom.window.fetch
    }

    mockAlert() {
        this.dom.window.alert = jest.fn<typeof this.dom.window.alert>()
        return this.dom.window.alert
    }

    mockWarn() {
        this.dom.window.console.warn = jest.fn()
        return this.dom.window.console.warn
    } 

    mockNavigate() {
        this.dom.window.navigate = jest.fn()
        return this.dom.window.navigate
    }

    /**
     * This function enables a "wait for" listener to any window function. The original functionality is still provided.
     * @param functionName 
     * @returns 
     */
    mockFunction(functionName: string): iCPSMockedUIFunction {
        this.mockedFunctions[functionName] = new iCPSMockedUIFunction(this, functionName)
        return this.mockedFunctions[functionName] as iCPSMockedUIFunction
    }
}

/**
 * This class represents a mocked function and establishes an EventListener for any JSDOM class to allow us to wait for content to be loaded.
 */
export class iCPSMockedUIFunction {
    event: EventEmitter = new EventEmitter()
    callCounter: number = 0
    originalFunction: any
    jestMock = jest.fn(this.mockFunction.bind(this))
    static EVENT_NAME = `event`

    constructor(site: iCPSMockedUISite, functionName: string) {
        if(!Object.hasOwn(site.dom.window, functionName)){
            throw new Error(`Site does not have ${functionName}!`)
        }
        this.originalFunction = site.dom.window[functionName]

        site.dom.window[functionName] = this.jestMock
    }

    private mockFunction(...args: any[]) {
        const ret = this.originalFunction(...args)
        this.event.emit(iCPSMockedUIFunction.EVENT_NAME, ++this.callCounter)
        return ret
    }

    /**
     * This function will resolve, once the mocked function has been called and finished execution
     * NOTE: The trigger will probably not work on async functions
     * @returns 
     */
    waitUntilCalled(): Promise<void> {
        return new Promise<void>((resolve) => {
            this.event.on(iCPSMockedUIFunction.EVENT_NAME, () => {
                resolve()
                this.event.removeAllListeners()
            })
        })
    }
}

// return {
//     dom,
//     view: dom.window.document.body,
//     window: dom.window,
//     res,
//     functions: {
//         alert: dom.window.alert,
//         fetch: dom.window.fetch,
//         navigate: dom.window.navigate
//     }
// }
