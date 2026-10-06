import {createWriteStream} from "fs";
import fs from "fs/promises";
import {randomUUID} from "crypto";
import {Readable} from "stream";
import {pipeline} from "stream/promises";
import {ReadableStream} from "stream/web";
import {jsonc} from "jsonc";
import {Cookie} from "tough-cookie";
import {errorMessage} from "../../app/error/error.js";
import {Resources} from "./main.js";
import {CLIENT_ID, CLIENT_INFO, HEADER_KEYS, USER_AGENT} from "./network-types.js";

/**
 * A regex to check if a URL is absolute:
 * ^ - beginning of the string
 * (?: - beginning of a non-captured group
 *   [a-z+]+ - any character of 'a' to 'z' or "+" 1 or more times
 *   : - string (colon character)
 * )? - end of the non-captured group. Group appearing 0 or 1 times
 * // - string (two forward slash characters)
 * 'i' - non case-sensitive flag
 */
const ABSOLUTE_URL_REGEX = /^(?:[a-z+]+:)?\/\//i;

/**
 * The HTTP methods used by the application
 */
export type HttpMethod = `GET` | `POST` | `PUT`;

/**
 * Per-request configuration
 */
export type HttpRequestConfig = {
    /**
     * Query parameters, appended to the request URL
     */
    params?: Record<string, string>,
    /**
     * Additional request headers - headers from the header jar take precedence
     */
    headers?: Record<string, string>,
    /**
     * Decides, if a response status is accepted - a rejected status results in an HttpError (defaults to accepting 2xx)
     */
    validateStatus?: (status: number) => boolean,
}

/**
 * A fully prepared request, as sent to the backend
 */
export type HttpRequest = {
    method: HttpMethod,
    /**
     * The URL as requested - might be relative to the base URL
     */
    url: string,
    /**
     * The base URL of the client at the time of the request
     */
    baseURL?: string,
    /**
     * The resolved, absolute URL including query parameters
     */
    fullURL: string,
    params?: Record<string, string>,
    headers: Record<string, string>,
    /**
     * The serialized request body, if any
     */
    data?: string,
    /**
     * Unix timestamp (in ms) of the moment the request was issued
     */
    startedAt: number,
}

/**
 * A received response
 */
export type HttpResponse<T = any> = {
    status: number,
    statusText: string,
    /**
     * Response headers with lower-cased names - values are strings, except 'set-cookie', which is always a string array
     */
    headers: Record<string, any>,
    /**
     * The response body - parsed JSON if possible, the raw string otherwise (an empty body results in an empty string)
     */
    data: T,
    /**
     * The request that lead to this response
     */
    config: HttpRequest,
}

/**
 * The raw response, as returned by the transport layer
 */
export type HttpRawResponse = {
    status: number,
    statusText: string,
    headers: Headers,
    body: string,
}

/**
 * Brand of response validators - only exists on type level
 */
declare const RESPONSE_VALIDATOR: unique symbol;

/**
 * Validates a response against a JSON schema and provides the validated value - throws an iCPSError, if the response is invalid
 * The brand ensures that response validators can only be created by the Validator (see `Validator.response`), so every request's response is schema validated
 */
export type ResponseValidator<T> = ((response: HttpResponse) => T) & {readonly [RESPONSE_VALIDATOR]: true};

/**
 * Error thrown by the HttpClient, if a request fails or the response status is not accepted
 * The error code follows the codes previously provided by axios, in order to keep error reports comparable
 */
export class HttpError extends Error {
    /**
     * The error code - ERR_BAD_REQUEST (4xx status), ERR_BAD_RESPONSE (other rejected status), ECONNABORTED (timeout or abort), the underlying network error code (e.g. ECONNREFUSED) or ERR_NETWORK
     */
    code: string;

    /**
     * The request that failed
     */
    request: HttpRequest;

    /**
     * The response, if one was received
     */
    response?: HttpResponse;

    /**
     * Creates a new HttpError
     * @param message - The error message
     * @param code - The error code
     * @param request - The request that failed
     * @param response - The response, if one was received
     * @param cause - The underlying error, if any
     */
    constructor(message: string, code: string, request: HttpRequest, response?: HttpResponse, cause?: unknown) {
        super(message, cause === undefined ? undefined : {cause});
        this.name = `HttpError`;
        this.code = code;
        this.request = request;
        this.response = response;
    }

    /**
     * Creates an error for a response with a rejected status
     * @param response - The response
     * @returns The error
     */
    static fromResponse(response: HttpResponse): HttpError {
        const code = response.status >= 400 && response.status < 500
            ? `ERR_BAD_REQUEST`
            : `ERR_BAD_RESPONSE`;
        return new HttpError(`Request failed with status code ${response.status}`, code, response.config, response);
    }

    /**
     * Creates an error for a request that did not receive a response
     * Node's fetch rejects with a generic `TypeError('fetch failed')`, the actual network error code is provided by its cause
     * @param err - The error thrown by fetch
     * @param request - The request that failed
     * @returns The error
     */
    static fromNetworkError(err: unknown, request: HttpRequest): HttpError {
        if (err instanceof HttpError) {
            return err;
        }

        if (Error.isError(err) && (err.name === `TimeoutError` || err.name === `AbortError`)) {
            return new HttpError(err.message, `ECONNABORTED`, request, undefined, err);
        }

        const cause = Error.isError(err) ? err.cause as {code?: unknown, message?: unknown} | undefined : undefined;
        const code = typeof cause?.code === `string` ? cause.code : `ERR_NETWORK`;
        const message = typeof cause?.message === `string` && cause.message.length > 0
            ? cause.message
            : errorMessage(err);
        return new HttpError(message, code, request, undefined, err);
    }
}

/**
 * Type guard for HttpErrors
 * @param err - The value to check
 * @returns True, if the value is an HttpError
 */
export function isHttpError(err: unknown): err is HttpError {
    return err instanceof HttpError;
}

/**
 * Object holding all necessary information for a specific header value, that needs to be reused across multiple requests
 */
export class Header {
    key: string;
    value: string;
    domain: string;

    /**
     * Creates a new header object
     * @param domain - The domain the header should be applied to, or an empty string if it should be applied to all domains
     * @param key - The header key
     * @param value - The header value
     */
    constructor(domain: string, key: string, value: string) {
        this.domain = domain;
        this.key = key;
        this.value = value;
    }
}

/**
 * Keeps track of headers and cookies, that need to be applied to requests based on their domain
 */
export class HeaderJar {
    headers: Map<string, Header> = new Map();
    cookies: Map<string, Cookie> = new Map();

    /**
     * Creates a new header jar with static header values applied
     */
    constructor() {
        // Default headers
        this.setHeader(new Header(``, `Accept`, `application/json`));
        this.setHeader(new Header(``, `Content-Type`, `application/json`));
        this.setHeader(new Header(``, `Connection`, `keep-alive`));
        this.setHeader(new Header(``, `Accept-Encoding`, `gzip, deflate, br`));
        this.setHeader(new Header(``, `User-Agent`, USER_AGENT));

        // Static auth headers
        this.setHeader(new Header(`idmsa.apple.com`, `Origin`, `https://idmsa.apple.com`)); // This should overwrite the default 'Origin' header
        this.setHeader(new Header(`idmsa.apple.com`, `Referer`, `https://idmsa.apple.com/`));
        this.setHeader(new Header(`idmsa.apple.com`, `X-Apple-Widget-Key`, CLIENT_ID));
        this.setHeader(new Header(`idmsa.apple.com`, `X-Apple-OAuth-Client-Id`, CLIENT_ID));
        this.setHeader(new Header(`idmsa.apple.com`, `X-Apple-I-FD-Client-Info`, CLIENT_INFO));
        this.setHeader(new Header(`idmsa.apple.com`, `X-Apple-OAuth-Response-Type`, `code`));
        this.setHeader(new Header(`idmsa.apple.com`, `X-Apple-OAuth-Response-Mode`, `web_message`));
        this.setHeader(new Header(`idmsa.apple.com`, `X-Apple-OAuth-Client-Type`, `firstPartyAuth`));
        this.setHeader(new Header(`idmsa.apple.com`, `X-Apple-OAuth-Redirect-URI`, `https://www.icloud.com`));
        this.setHeader(new Header(`idmsa.apple.com`, `X-Apple-OAuth-Require-Grant-Code`, `true`));
        this.setHeader(new Header(`idmsa.apple.com`, `X-Apple-Offer-Security-Upgrade`, `1`));
        this.setHeader(new Header(`idmsa.apple.com`, `X-Apple-Domain-Id`, `3`));
        this.resetFrameId();
    }

    /**
     * Generates a new frame id, identifying the current authentication flow (similar to the iCloud web frontend, which generates one per login iframe)
     * The same value is used as OAuth state
     * @param frameId - The frame id to use - a random UUID is generated by default
     */
    resetFrameId(frameId: string = randomUUID()) {
        this.setHeader(new Header(`idmsa.apple.com`, HEADER_KEYS.FRAME_ID, frameId));
        this.setHeader(new Header(`idmsa.apple.com`, HEADER_KEYS.OAUTH_STATE, frameId));
    }

    /**
     * Injects the relevant headers and cookies into the request
     * @param request - The request
     * @returns The adjusted request containing relevant cookies and headers
     */
    _injectHeaders(request: HttpRequest): HttpRequest {
        const requestCookieString = Array.from(this.cookies.values())
            .filter(cookie => this.isApplicable(request, cookie))
            .filter(cookie => this.isNotExpired(cookie))
            .map(cookie => cookie.cookieString()).join(`; `);

        if (requestCookieString.length > 0) {
            request.headers[HEADER_KEYS.COOKIE] = requestCookieString;
        }

        Array.from(this.headers.values())
            .filter(cookie => this.isApplicable(request, cookie))
            .forEach(header => {
                request.headers[header.key] = header.value;
            });

        return request;
    }

    /**
     * Extracts general applicable header (scnt) and set-cookies from the response
     * @param response - The response
     * @returns The unmodified response
     */
    _extractHeaders(response: HttpResponse): HttpResponse {
        if (response.headers.scnt && this.isApplicable(response.config, new Header(`idmsa.apple.com`, ``, ``))) {
            Resources.logger(this).debug(`Extracted scnt from response header with length ` + response.headers.scnt.length);
            this.setHeader(new Header(`idmsa.apple.com`, HEADER_KEYS.SCNT, response.headers.scnt));
        }

        const authAttributes = response.headers[HEADER_KEYS.AUTH_ATTRIBUTES.toLowerCase()];
        if (authAttributes && this.isApplicable(response.config, new Header(`idmsa.apple.com`, ``, ``))) {
            Resources.logger(this).debug(`Extracted auth attributes from response header with length ` + authAttributes.length);
            this.setHeader(new Header(`idmsa.apple.com`, HEADER_KEYS.AUTH_ATTRIBUTES, authAttributes));
        }

        if (response.headers[`set-cookie`] && Array.isArray(response.headers[`set-cookie`])) {
            response.headers[`set-cookie`].forEach(cookie => {
                const parsedCookie = Cookie.parse(cookie);
                if (!parsedCookie) {
                    Resources.logger(this).debug(`Unable to parse cookie from response header, ignoring...`);
                    return;
                }

                Resources.logger(this).debug(`Extracted cookie from response header: ${parsedCookie.key} (domain ${parsedCookie.domain}) with length ${parsedCookie.value.length}`);
                this.setCookie(parsedCookie);
            });
        }

        return response;
    }

    /**
     * Checks metadata of the provided cookie to check if it's still valid
     * @param cookie - The cookie to check
     * @returns False if expired, true otherwise
     */
    isNotExpired(cookie: Cookie): boolean {
        if (cookie.TTL() > 0) {
            return true;
        }

        // Cookie.expires could also be the string 'Infinity', but then TTL() would be the number Infinity
        if ((cookie.expires as Date).getTime() === 1000) { // For some reason some Apple Headers have a magic expire unix time of 1000 (X-APPLE-WEBAUTH-HSA-LOGIN), including them for now...
            return true;
        }

        Resources.logger(this).debug(`Not applying expired cookie ${cookie.key}`);
        return false;
    }

    /**
     * Checks if a given object is applicable to the request. Takes URL and base URL into account
     * @param request - The request
     * @param object - The object to check
     * @returns True if the object is applicable to the request, false otherwise
     */
    isApplicable(request: Pick<HttpRequest, `url` | `baseURL`>, object: Header | Cookie): boolean {
        const objectDomain = object.domain;
        if (objectDomain === null) {
            // Cookies without domain are never applicable
            return false;
        }

        const url = request.url ?? ``;
        if (request.baseURL && !ABSOLUTE_URL_REGEX.test(url)) {
            // Base URL is not used if request URL is absolute
            return request.baseURL.includes(objectDomain);
        }

        return url.includes(objectDomain);
    }

    /**
     * Sets a header object in the header jar - overwrites existing headers with the same key
     * @param header - The header to set
     */
    setHeader(...header: Header[]) {
        for (const h of header) {
            this.headers.set(h.key, h);
        }
    }

    /**
     * Clearing a header from the header jar
     * @param key - The key of the header to clear
     */
    clearHeader(key: string) {
        this.headers.delete(key);
    }

    /**
     * Sets a cookie object in the header jar - overwrites existing cookies with the same key
     * @param cookie - The cookie to set
     */
    setCookie(...cookie: (Cookie | string)[]) {
        for (const c of cookie) {
            const _cookie = typeof c === `string` ? Cookie.parse(c) : c;
            if (!_cookie) {
                continue;
            }

            if (_cookie.value.length > 0) {
                this.cookies.set(_cookie.key, _cookie);
            } else {
                this.cookies.delete(_cookie.key);
            }
        }
    }
}

/**
 * A name/value pair, as used for headers in the network capture
 */
type CaptureNameValue = {
    name: string,
    value: string,
}

/**
 * A single captured request/response pair, loosely following the HAR 1.2 entry format, so the file can be opened in common HAR viewers
 */
type CaptureEntry = {
    startedDateTime: string,
    /**
     * Duration of the request in milliseconds
     */
    time: number,
    request: {
        method: string,
        url: string,
        httpVersion: string,
        cookies: CaptureNameValue[],
        headers: CaptureNameValue[],
        queryString: CaptureNameValue[],
        postData?: {
            mimeType: string,
            text: string,
        },
        headersSize: number,
        bodySize: number,
    },
    response: {
        /**
         * The HTTP status code, 0 if no response was received
         */
        status: number,
        statusText: string,
        httpVersion: string,
        cookies: CaptureNameValue[],
        headers: CaptureNameValue[],
        content: {
            size: number,
            mimeType: string,
            text?: string,
        },
        redirectURL: string,
        headersSize: number,
        bodySize: number,
    },
    cache: object,
    timings: {
        send: number,
        wait: number,
        receive: number,
    },
    /**
     * The error code and message, if the request failed (e.g. rejected status, timeout or connection error)
     */
    _error?: string,
}

/**
 * The captured network log, loosely following the HAR 1.2 format
 */
type CaptureLog = {
    log: {
        version: string,
        creator: {
            name: string,
            version: string,
        },
        pages: [],
        entries: CaptureEntry[],
    },
}

/**
 * Captures requests and responses for debugging purposes
 * Each entry is built from the completed request, so concurrent requests are captured independently
 */
export class NetworkCapture {
    /**
     * The captured network log
     */
    log!: CaptureLog;

    /**
     * Creates a new, empty network capture
     */
    constructor() {
        this.reset();
    }

    /**
     * Clears all captured entries
     */
    reset() {
        this.log = {
            log: {
                version: `1.2`,
                creator: {
                    name: Resources.PackageInfo.name,
                    version: Resources.PackageInfo.version,
                },
                pages: [],
                entries: [],
            },
        };
    }

    /**
     * Adds an entry to the network log - failing to capture a request never fails the request itself
     * @param request - The request
     * @param response - The response, if one was received
     * @param error - The error, if the request failed
     */
    addEntry(request: HttpRequest, response?: HttpResponse, error?: HttpError) {
        try {
            const time = Date.now() - request.startedAt;

            const requestHeaders = this._toNameValue(request.headers);
            const requestBody = request.data;
            const responseHeaders = this._toNameValue(response?.headers);
            const responseBody = this._toText(response?.data);

            const entry: CaptureEntry = {
                startedDateTime: new Date(request.startedAt).toISOString(),
                time,
                request: {
                    method: request.method,
                    url: request.fullURL,
                    httpVersion: `HTTP/1.1`,
                    cookies: [],
                    headers: requestHeaders,
                    queryString: this._toNameValue(request.params),
                    headersSize: -1,
                    bodySize: requestBody?.length ?? 0,
                },
                response: {
                    status: response?.status ?? 0,
                    statusText: response?.statusText ?? ``,
                    httpVersion: `HTTP/1.1`,
                    cookies: [],
                    headers: responseHeaders,
                    content: {
                        size: responseBody?.length ?? 0,
                        mimeType: this._findValue(responseHeaders, `content-type`),
                        text: responseBody,
                    },
                    redirectURL: ``,
                    headersSize: -1,
                    bodySize: responseBody?.length ?? 0,
                },
                cache: {},
                timings: {
                    send: 0,
                    wait: time,
                    receive: 0,
                },
            };

            if (requestBody !== undefined) {
                entry.request.postData = {
                    mimeType: this._findValue(requestHeaders, `content-type`),
                    text: requestBody,
                };
            }

            if (error) {
                entry._error = `${error.code}: ${error.message}`;
            }

            this.log.log.entries.push(entry);
        } catch (err) {
            Resources.logger(this).debug(`Unable to capture request: ${errorMessage(err)}`);
        }
    }

    /**
     * Converts a header object into a list of name/value pairs - multi-value headers (e.g. set-cookie) result in one pair per value
     * @param headers - The headers to convert
     * @returns The list of name/value pairs
     */
    _toNameValue(headers?: Record<string, unknown>): CaptureNameValue[] {
        if (!headers) {
            return [];
        }

        return Object.entries(headers)
            .flatMap(([name, value]) => (Array.isArray(value) ? value : [value])
                .filter(v => v !== undefined && v !== null && v !== false)
                .map(v => ({name, value: String(v)})));
    }

    /**
     * Finds the value of the first name/value pair matching the name (case-insensitive)
     * @param list - The list to search
     * @param name - The name to look for
     * @returns The value, or an empty string if not found
     */
    _findValue(list: CaptureNameValue[], name: string): string {
        return list.find(item => item.name.toLowerCase() === name)?.value ?? ``;
    }

    /**
     * Converts a response body into text
     * @param data - The parsed response body
     * @returns The textual representation, or undefined if there is no body
     */
    _toText(data: unknown): string | undefined {
        if (data === undefined || data === null || data === ``) {
            return undefined;
        }

        if (typeof data === `string`) {
            return data;
        }

        return jsonc.stringify(data);
    }
}

/**
 * Options for creating an HttpClient
 */
export type HttpClientOptions = {
    /**
     * The base URL relative request URLs are resolved against
     */
    baseURL?: string,
    /**
     * Headers applied to every request
     */
    headers?: Record<string, string>,
    /**
     * Header jar applying (and extracting) headers and cookies - none is used if not provided
     */
    headerJar?: HeaderJar,
    /**
     * Network capture recording all requests - none is used if not provided
     */
    networkCapture?: NetworkCapture,
}

/**
 * Minimal HTTP client based on Node's built-in fetch
 * Every request needs to provide a validator for its response, making response validation part of the call signature
 */
export class HttpClient {
    /**
     * The base URL relative request URLs are resolved against
     */
    baseURL?: string;

    /**
     * Headers applied to every request
     */
    defaultHeaders: Record<string, string>;

    /**
     * Header jar applying headers and cookies to requests and extracting them from accepted responses
     */
    headerJar?: HeaderJar;

    /**
     * Network capture recording all requests and responses
     */
    networkCapture?: NetworkCapture;

    /**
     * Creates a new HttpClient
     * @param options - The client options
     */
    constructor(options: HttpClientOptions = {}) {
        this.baseURL = options.baseURL;
        this.defaultHeaders = {...options.headers};
        this.headerJar = options.headerJar;
        this.networkCapture = options.networkCapture;
    }

    /**
     * Performs a GET request
     * @param url - The URL to request, absolute or relative to the base URL
     * @param validate - Validates the response and provides the return value
     * @param config - Additional request configuration
     * @returns A promise resolving to the validated response
     * @throws An HttpError, if the request failed or the status was rejected - the validator's error, if the response is invalid
     */
    get<T>(url: string, validate: ResponseValidator<T>, config?: HttpRequestConfig): Promise<T> {
        return this.request(`GET`, url, undefined, validate, config);
    }

    /**
     * Performs a POST request
     * @param url - The URL to request, absolute or relative to the base URL
     * @param data - The request body - objects are serialized as JSON
     * @param validate - Validates the response and provides the return value
     * @param config - Additional request configuration
     * @returns A promise resolving to the validated response
     * @throws An HttpError, if the request failed or the status was rejected - the validator's error, if the response is invalid
     */
    post<T>(url: string, data: unknown, validate: ResponseValidator<T>, config?: HttpRequestConfig): Promise<T> {
        return this.request(`POST`, url, data, validate, config);
    }

    /**
     * Performs a PUT request
     * @param url - The URL to request, absolute or relative to the base URL
     * @param data - The request body - objects are serialized as JSON
     * @param validate - Validates the response and provides the return value
     * @param config - Additional request configuration
     * @returns A promise resolving to the validated response
     * @throws An HttpError, if the request failed or the status was rejected - the validator's error, if the response is invalid
     */
    put<T>(url: string, data: unknown, validate: ResponseValidator<T>, config?: HttpRequestConfig): Promise<T> {
        return this.request(`PUT`, url, data, validate, config);
    }

    /**
     * Performs a request: Applies the header jar, sends the request, checks the status, extracts headers and cookies, records the network capture and validates the response
     * The request is handed to the transport synchronously, before the first asynchronous step
     * @param method - The HTTP method
     * @param url - The URL to request, absolute or relative to the base URL
     * @param data - The request body
     * @param validate - Validates the response and provides the return value
     * @param config - Additional request configuration
     * @returns A promise resolving to the validated response
     */
    request<T>(method: HttpMethod, url: string, data: unknown, validate: ResponseValidator<T>, config: HttpRequestConfig = {}): Promise<T> {
        let request: HttpRequest;
        let pending: Promise<HttpRawResponse>;
        try {
            request = this._buildRequest(method, url, data, config);
            pending = this._send(request);
        } catch (err) {
            return Promise.reject(err);
        }

        return this._complete(request, pending, validate, config.validateStatus ?? (status => status >= 200 && status < 300));
    }

    /**
     * Downloads the provided URL and streams the body to the provided location
     * No headers, cookies or network capture are applied, since these are plain asset downloads
     * The partially written file is removed, if the download fails
     * @param url - The URL to download
     * @param location - The file location to write to (existing files will be overwritten)
     * @param timeout - Timeout in milliseconds, after which the download is aborted
     * @returns A promise that resolves, once the file has been written
     * @throws An HttpError, if the download failed - file system errors are rethrown as is
     */
    async download(url: string, location: string, timeout?: number): Promise<void> {
        const request: HttpRequest = {
            method: `GET`,
            url,
            fullURL: url,
            headers: {},
            startedAt: Date.now(),
        };
        const signal = timeout === undefined ? undefined : AbortSignal.timeout(timeout);

        let response: Response;
        try {
            response = await this._fetch(url, {signal});
        } catch (err) {
            throw HttpError.fromNetworkError(err, request);
        }

        if (!response.ok || !response.body) {
            await response.body?.cancel();
            throw HttpError.fromResponse(this._parseResponse(request, {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
                body: ``,
            }));
        }

        try {
            await pipeline(Readable.fromWeb(response.body as ReadableStream), createWriteStream(location, {flags: `w`}));
        } catch (err) {
            await fs.rm(location, {force: true});
            // Errors while receiving the body surface as TypeError (connection terminated) or DOMException (timeout / abort) - file system errors are passed on
            if (Error.isError(err) && [`TypeError`, `TimeoutError`, `AbortError`].includes(err.name)) {
                throw HttpError.fromNetworkError(err, request);
            }

            throw err;
        }
    }

    /**
     * Builds the request, applying default headers, the request configuration and the header jar
     * @param method - The HTTP method
     * @param url - The URL to request
     * @param data - The request body
     * @param config - The request configuration
     * @returns The prepared request
     */
    _buildRequest(method: HttpMethod, url: string, data: unknown, config: HttpRequestConfig): HttpRequest {
        const request: HttpRequest = {
            method,
            url,
            baseURL: this.baseURL,
            fullURL: this._resolveURL(url, config.params),
            params: config.params,
            headers: {
                ...this.defaultHeaders,
                ...config.headers,
            },
            startedAt: Date.now(),
        };

        if (data !== undefined && data !== null) {
            if (typeof data === `string`) {
                request.data = data;
            } else {
                request.data = JSON.stringify(data);
                if (!Object.keys(request.headers).some(key => key.toLowerCase() === `content-type`)) {
                    request.headers[`Content-Type`] = `application/json`;
                }
            }
        }

        if (this.headerJar) {
            return this.headerJar._injectHeaders(request);
        }

        return request;
    }

    /**
     * Resolves the URL against the base URL and appends query parameters
     * @param url - The URL to resolve
     * @param params - The query parameters
     * @returns The resolved URL
     */
    _resolveURL(url: string, params?: Record<string, string>): string {
        let fullURL = url;
        if (this.baseURL && !ABSOLUTE_URL_REGEX.test(url)) {
            fullURL = url.length > 0
                ? this.baseURL.replace(/\/?\/$/, ``) + `/` + url.replace(/^\/+/, ``)
                : this.baseURL;
        }

        if (params && Object.keys(params).length > 0) {
            fullURL += (fullURL.includes(`?`) ? `&` : `?`) + new URLSearchParams(params).toString();
        }

        return fullURL;
    }

    /**
     * Completes a request, once the transport has been invoked
     * @param request - The request
     * @param pending - The pending transport response
     * @param validate - The response validator
     * @param validateStatus - Decides, if the response status is accepted
     * @returns A promise resolving to the validated response
     */
    async _complete<T>(request: HttpRequest, pending: Promise<HttpRawResponse>, validate: ResponseValidator<T>, validateStatus: (status: number) => boolean): Promise<T> {
        let response: HttpResponse | undefined;
        let error: HttpError | undefined;
        try {
            let rawResponse: HttpRawResponse;
            try {
                rawResponse = await pending;
            } catch (err) {
                throw HttpError.fromNetworkError(err, request);
            }

            response = this._parseResponse(request, rawResponse);

            if (!validateStatus(response.status)) {
                throw HttpError.fromResponse(response);
            }

            this.headerJar?._extractHeaders(response);
        } catch (err) {
            if (isHttpError(err)) {
                error = err;
            }

            throw err;
        } finally {
            this.networkCapture?.addEntry(request, response, error);
        }

        return validate(response);
    }

    /**
     * Converts the raw transport response
     * @param request - The request
     * @param rawResponse - The raw response
     * @returns The response with normalized headers and parsed body
     */
    _parseResponse(request: HttpRequest, rawResponse: HttpRawResponse): HttpResponse {
        const headers: Record<string, any> = {};
        rawResponse.headers.forEach((value, key) => {
            if (key !== `set-cookie`) {
                headers[key] = value;
            }
        });

        const setCookie = rawResponse.headers.getSetCookie();
        if (setCookie.length > 0) {
            headers[`set-cookie`] = setCookie;
        }

        return {
            status: rawResponse.status,
            statusText: rawResponse.statusText,
            headers,
            data: this._parseBody(rawResponse.body),
            config: request,
        };
    }

    /**
     * Parses the body as JSON, if possible - an empty body is kept as empty string, a non-JSON body as raw string
     * @param body - The raw body
     * @returns The parsed body
     */
    _parseBody(body: string): any {
        if (body.length === 0) {
            return body;
        }

        try {
            return JSON.parse(body);
        } catch {
            return body;
        }
    }

    /**
     * Sends the request using fetch - the transport layer of this client
     * @param request - The request to send
     * @returns The raw response
     */
    async _send(request: HttpRequest): Promise<HttpRawResponse> {
        const response = await this._fetch(request.fullURL, {
            method: request.method,
            headers: request.headers,
            body: request.data,
        });

        return {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            body: await response.text(),
        };
    }

    /**
     * The fetch implementation used by this client
     * @param input - The URL
     * @param init - The request options
     * @returns The fetch response
     */
    _fetch(input: string, init: RequestInit): Promise<Response> {
        return fetch(input, init);
    }
}
