import {isDeepStrictEqual} from 'util';
import {HttpClient, HttpMethod, HttpRawResponse, HttpRequest, HttpResponse, ResponseValidator} from '../../src/lib/resources/http-client';

/**
 * Test only: Passes the raw response through - production code needs to use the schema backed validators provided by the Validator
 */
export const RAW_RESPONSE = (response => response) as ResponseValidator<HttpResponse>;

/**
 * The reply of a mocked route: status, data and headers
 */
type MockReply = [status: number, data?: unknown, headers?: Record<string, string | string[]>];

/**
 * Function producing a reply for a request
 */
type MockReplyFunction = (request: HttpRequest) => MockReply | Promise<MockReply>;

/**
 * Additional request matchers
 */
type MockRequestMatcher = {
    headers?: Record<string, string>,
    params?: Record<string, string>,
};

/**
 * Options of the mock
 */
type HttpMockOptions = {
    /**
     * By default, unmatched requests are answered with status 404 - 'throwException' rejects them instead
     */
    onNoMatch?: `throwException`,
};

/**
 * A single mocked route
 */
class MockHandler {
    mock: HttpMock;
    method?: HttpMethod;
    url?: string | RegExp;
    body?: unknown;
    matcher?: MockRequestMatcher;
    respond?: (request: HttpRequest) => Promise<HttpRawResponse>;

    constructor(mock: HttpMock, method?: HttpMethod, url?: string | RegExp, body?: unknown, matcher?: MockRequestMatcher) {
        this.mock = mock;
        this.method = method;
        this.url = url;
        this.body = body;
        this.matcher = matcher;
    }

    /**
     * Replies with the provided status, data and headers - or the result of the provided function
     * @returns The mock, for chaining
     */
    reply(statusOrFunction: number | MockReplyFunction, data?: unknown, headers?: Record<string, string | string[]>): HttpMock {
        const replyFunction: MockReplyFunction = typeof statusOrFunction === `function`
            ? statusOrFunction
            : () => [statusOrFunction, data, headers];

        this.respond = async request => toRawResponse(await replyFunction(request));
        return this.mock;
    }

    /**
     * Rejects matching requests like a failed connection
     * @returns The mock, for chaining
     */
    networkError(): HttpMock {
        this.respond = () => Promise.reject(new TypeError(`Network Error`));
        return this.mock;
    }

    /**
     * Rejects matching requests like a timed out request
     * @returns The mock, for chaining
     */
    timeout(): HttpMock {
        this.respond = () => Promise.reject(new DOMException(`The operation was aborted due to timeout`, `TimeoutError`));
        return this.mock;
    }

    /**
     * Checks if the request matches this route
     * @param request - The request
     * @returns True, if the request matches
     */
    matches(request: HttpRequest): boolean {
        if (this.method && this.method !== request.method) {
            return false;
        }

        if (this.url !== undefined) {
            const candidates = [
                request.url,
                (request.baseURL ?? ``) + request.url,
                request.fullURL.split(`?`)[0],
            ];
            const urlMatches = this.url instanceof RegExp
                ? candidates.some(candidate => (this.url as RegExp).test(candidate))
                : candidates.includes(this.url);
            if (!urlMatches) {
                return false;
            }
        }

        if (this.body !== undefined) {
            const requestBody = request.data === undefined ? undefined : parseBody(request.data);
            if (!isDeepStrictEqual(requestBody, this.body)) {
                return false;
            }
        }

        if (this.matcher?.headers && !isDeepStrictEqual(request.headers, this.matcher.headers)) {
            return false;
        }

        if (this.matcher?.params && !isDeepStrictEqual(request.params, this.matcher.params)) {
            return false;
        }

        return true;
    }
}

/**
 * Converts a mock reply into a raw transport response
 * @param reply - The reply
 * @returns The raw response
 */
function toRawResponse([status, data, headers]: MockReply): HttpRawResponse {
    const rawHeaders = new Headers();
    for (const [key, value] of Object.entries(headers ?? {})) {
        for (const v of Array.isArray(value) ? value : [value]) {
            rawHeaders.append(key, v);
        }
    }

    return {
        status,
        statusText: ``,
        headers: rawHeaders,
        body: data === undefined || data === null
            ? ``
            : (typeof data === `string` ? data : JSON.stringify(data)),
    };
}

/**
 * Parses a serialized request body
 * @param data - The serialized body
 * @returns The parsed JSON, or the raw string
 */
function parseBody(data: string): unknown {
    try {
        return JSON.parse(data);
    } catch {
        return data;
    }
}

/**
 * Mocks the transport of an HttpClient, mirroring the parts of the axios-mock-adapter API used in this project
 * Routes are matched in registration order, requests are recorded synchronously in the history
 */
export class HttpMock {
    client: HttpClient;
    options: HttpMockOptions;
    handlers: MockHandler[] = [];
    history: Record<`get` | `post` | `put`, HttpRequest[]> = {get: [], post: [], put: []};
    originalSend: HttpClient[`_send`];

    /**
     * Attaches the mock to the provided client
     * @param client - The client to mock
     * @param options - Mock options
     */
    constructor(client: HttpClient, options: HttpMockOptions = {}) {
        this.client = client;
        this.options = options;
        this.originalSend = client._send;
        client._send = request => this.handle(request);
    }

    onGet(url?: string | RegExp, matcher?: MockRequestMatcher): MockHandler {
        return this.addHandler(new MockHandler(this, `GET`, url, undefined, matcher));
    }

    onPost(url?: string | RegExp, body?: unknown, matcher?: MockRequestMatcher): MockHandler {
        return this.addHandler(new MockHandler(this, `POST`, url, body, matcher));
    }

    onPut(url?: string | RegExp, body?: unknown, matcher?: MockRequestMatcher): MockHandler {
        return this.addHandler(new MockHandler(this, `PUT`, url, body, matcher));
    }

    onAny(url?: string | RegExp, matcher?: MockRequestMatcher): MockHandler {
        return this.addHandler(new MockHandler(this, undefined, url, undefined, matcher));
    }

    /**
     * Removes all routes and clears the history
     */
    reset() {
        this.handlers = [];
        this.resetHistory();
    }

    /**
     * Clears the history
     */
    resetHistory() {
        this.history = {get: [], post: [], put: []};
    }

    /**
     * Detaches the mock from the client
     */
    restore() {
        this.client._send = this.originalSend;
    }

    addHandler(handler: MockHandler): MockHandler {
        this.handlers.push(handler);
        return handler;
    }

    /**
     * Handles a request - the request is recorded synchronously
     * @param request - The request
     * @returns The mocked raw response
     */
    handle(request: HttpRequest): Promise<HttpRawResponse> {
        this.history[request.method.toLowerCase() as `get` | `post` | `put`].push(request);

        const handler = this.handlers.find(h => h.respond && h.matches(request));
        if (handler) {
            return handler.respond!(request);
        }

        if (this.options.onNoMatch === `throwException`) {
            return Promise.reject(new Error(`Could not find mock for ${request.method} ${request.fullURL}`));
        }

        return Promise.resolve(toRawResponse([404]));
    }
}
