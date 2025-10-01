import {IncomingMessage, ServerResponse} from "http"
import {createRequest, createResponse, MockRequest, MockResponse, RequestMethod} from "node-mocks-http"
import {WebServer} from "../../src/app/web-ui/web-server"
import {DOMWindow, JSDOM} from "jsdom";
import {jest} from "@jest/globals";

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
 * This type represents a mocked site with all required functions exposed
 */
export type iCPSMockSite = {
    dom: JSDOM,
    view: any,
    window: DOMWindow,
    res: MockResponse<ServerResponse<IncomingMessage>>,
    functions: {
        alert: any,
        fetch: any,
        navigate: any
    }
}

/**
 * This functions loads a site provided by the webServer using JSDOM and connects the browser's fetch function with the handleRequest from the webserver
 * @param webServer - the webserver that should be used
 * @param url - the url path
 * @returns A promise that resolves to a mock site
 */
export async function loadMockedSite(webServer: WebServer, url: string): Promise<iCPSMockSite> {
    const req = createRequest<IncomingMessage>({
        method: `GET`,
        url: url
    })

    const res = await sendMockedRequest(webServer, req)
    const dom = new JSDOM(res._getData(), {
        runScripts: `dangerously`,
        url: `https://localhost${url}`
    })

    // This is piping together the browser's fetch method and the provided web server
    dom.window.fetch = jest.fn<typeof dom.window.fetch>().mockImplementation(async (fetchUrl: string, init?: RequestInit) => {
        const fetchReq = createRequest<IncomingMessage>({
            method: init?.method as RequestMethod,
            url: fetchUrl,
            data: init?.body
        })

        const fetchRes = await sendMockedRequest(webServer, fetchReq)
        
        return {
            ok: fetchRes.statusCode >= 200 && fetchRes.statusCode < 300,
            statusText: fetchRes.statusMessage,
            json: fetchRes._getJSONData
        } as Response
    })
    dom.window.alert = jest.fn<typeof dom.window.alert>()
    dom.window.navigate = jest.fn()

    // Suppressing warnings posted to console
    dom.window.console.warn = jest.fn()

    return {
        dom,
        view: dom.window.document.body,
        window: dom.window,
        res,
        functions: {
            alert: dom.window.alert,
            fetch: dom.window.fetch,
            navigate: dom.window.navigate
        }
    }
}