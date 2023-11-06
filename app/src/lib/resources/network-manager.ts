import axios, {AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig} from "axios";
import fs from "fs/promises";
import {createWriteStream} from "fs";
import {HEADER_KEYS, SigninResponse, COOKIE_KEYS, TrustResponse, SetupResponse, ENDPOINTS, PhotosSetupResponse, USER_AGENT, CLIENT_ID, CLIENT_INFO, PCSResponse} from "./network-types.js";
import {Cookie} from "tough-cookie";
import {iCPSError} from "../../app/error/error.js";
import {RESOURCES_ERR} from "../../app/error/error-codes.js";
import {AxiosHarTracker} from "axios-har-tracker";
import PQueue from "p-queue";
import {Resources} from "./main.js";
import {iCPSAppOptions} from "../../app/factory.js";
import {pEvent} from "p-event";
import {jsonc} from "jsonc";

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

export class HeaderJar {
    headers: Map<string, Header> = new Map();
    cookies: Map<string, Cookie> = new Map();

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
    absoluteURLRegex = /^(?:[a-z+]+:)?\/\//i;

    /**
     * Creates a new header jar with static header values applied
     * @param axios - The axios instance to apply the headers to
     */
    constructor(axios: AxiosInstance) {
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

        axios.interceptors.request.use(config => this._injectHeaders(config));
        axios.interceptors.response.use(response => this._extractHeaders(response));
    }

    /**
     * Injects the relevant headers and cookies into the request
     * @param config - The request config
     * @returns An adjusted request config containing relevant cookies and headers
     */
    _injectHeaders(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
        const requestCookieString = Array.from(this.cookies.values())
            .filter(cookie => this.isApplicable(config, cookie))
            .filter(cookie => this.isNotExpired(cookie))
            .map(cookie => cookie.cookieString()).join(`; `);

        if (requestCookieString.length > 0) {
            config.headers[HEADER_KEYS.COOKIE] = requestCookieString;
        }

        Array.from(this.headers.values())
            .filter(cookie => this.isApplicable(config, cookie))
            .forEach(header => {
                config.headers[header.key] = header.value;
            });

        return config;
    }

    /**
     * Extracts general applicable header (scnt) and set-cookies from the response
     * @param response - The Axios response
     * @returns The unmodified response
     */
    _extractHeaders(response: AxiosResponse): AxiosResponse {
        if (response.headers.scnt && this.isApplicable(response.config, new Header(`idmsa.apple.com`, ``, ``))) {
            Resources.logger(this).debug(`Extracted scnt from response header with length ` + response.headers.scnt.length);
            this.setHeader(new Header(`idmsa.apple.com`, HEADER_KEYS.SCNT, response.headers.scnt));
        }

        if (response.headers[`set-cookie`] && Array.isArray(response.headers[`set-cookie`])) {
            response.headers[`set-cookie`].forEach(cookie => {
                const parsedCookie = Cookie.parse(cookie);
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
     * Checks if a given object is applicable to the axios request. Takes URL and base URL into account
     * @param config - The axios request config
     * @param object - The object to check
     * @returns True if the object is applicable to the request, false otherwise
     */
    isApplicable(config: InternalAxiosRequestConfig, object: Header | Cookie): boolean {
        const objectDomain = object.domain;

        if (config.baseURL && !this.absoluteURLRegex.test(config.url)) {
            // Base URL is not used if config URL is absolute
            return config.baseURL.includes(objectDomain);
        }

        return config.url.includes(objectDomain);
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
            this.cookies.set(_cookie.key, _cookie);
        }
    }
}

/**
 * This class is responsible for keeping track of the shared network connection
 */
export class NetworkManager {
    /**
     * Local axios instance to handle network requests
     */
    _axios: AxiosInstance;

    /**
     * Queue to enable metadata rate limiting. Applied to regular (non-streaming) requests
     */
    _rateLimiter: PQueue;

    /**
     * A separate axios instance to handle stream based downloads of assets
     * This allows us to bypass har files for those big files - additionally HarTracker is not handling the stream correctly
     */
    _streamingAxios: AxiosInstance;

    /**
     * Queue to enable CCY rate limiting. Applied to streaming requests
     */
    _streamingCCYLimiter: PQueue;

    /**
     * Collection of header values and cookies that are applied based on the request
     */
    _headerJar: HeaderJar;

    /**
     * Axios HAR tracker to capture network requests
     */
    _harTracker?: AxiosHarTracker;

    /**
     * Creates a new network manager
     * Should not be called directly, but through the static setup function.
     * @param resources - The global configuration resources - because Resources Singleton is not yet available, but required for setup
     */
    constructor(resources: iCPSAppOptions) {
        this._rateLimiter = new PQueue({
            intervalCap: resources.metadataRate[0],
            interval: resources.metadataRate[1],
        });

        this._axios = axios.create({
            headers: {
                Origin: `https://www.${this.iCloudRegionUrl(resources.region)}`,
            },
        });

        if (resources.enableNetworkCapture) {
            this._harTracker = new AxiosHarTracker(this._axios as any);
            this.resetHarTracker(this._harTracker);
        }

        this._headerJar = new HeaderJar(this._axios);

        this._streamingCCYLimiter = new PQueue({
            concurrency: resources.downloadThreads,
            timeout: resources.downloadTimeout === Infinity ? undefined : (1000 * 60 * resources.downloadTimeout),
        });

        this._streamingAxios = axios.create({
            responseType: `stream`,
        });
    }

    /**
     * This closes the current session, clears resources that are not persisted and writes the HAR file to disk, in case network capture is enabled
     */
    async resetSession() {
        this._axios.defaults.baseURL = undefined;

        this._headerJar.clearHeader(HEADER_KEYS.SCNT);
        this._headerJar.clearHeader(HEADER_KEYS.SESSION_ID);

        await this.settleRateLimiter();
        await this.settleCCYLimiter();

        if (Resources.manager().enableNetworkCapture) {
            await this.writeHarFile();
            this.resetHarTracker(this._harTracker);
        }
    }

    /**
     * Resets the generated HAR file to make sure it does not grow too much while reusing the same instance
     * Unfortunately the relevant members are private, so we have to cast it to any
     * @param tracker - The AxiosHarTracker instance to reset
     */
    resetHarTracker(tracker: AxiosHarTracker) {
        (tracker as any).generatedHar = {
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
        (tracker as any).newEntry = (this._harTracker as any).generateNewEntry();
    }

    /**
     * Settles the rate limiter queue
     * @see {@link settleQueue}
     */
    async settleRateLimiter() {
        Resources.logger(this).debug(`Settling rate limiter queue...`);
        await this.settleQueue(this._rateLimiter);
    }

    /**
     * Settles the CCY limiter queue
     * @see {@link settleQueue}
     */
    async settleCCYLimiter() {
        Resources.logger(this).debug(`Settling CCY limiter queue...`);
        await this.settleQueue(this._streamingCCYLimiter);
    }

    /**
     * Makes sure that the queue is settled before continuing (no more pending or running jobs)
     * Pending jobs will be cancelled and running jobs will be awaited
     * @param queue - The queue to settle
     */
    async settleQueue(queue: PQueue, clearQueuedJobs: boolean = true) {
        if (clearQueuedJobs && queue.size > 0) {
            Resources.logger(this).info(`Clearing queue with ${queue.size} queued job(s)...`);
            queue.clear();
        }

        if (queue.pending > 0) {
            Resources.logger(this).info(`${queue.pending} pending job(s) (${queue.size} queued jobs), waiting for them to settle...`);
            await queue.onIdle();
        }

        Resources.logger(this).debug(`Queue has settled!`);
    }

    /**
     * Writes the HAR file to disk, if network capture was enabled
     * @returns - Returns a promise that resolves to false, if network capture was disabled or no entries were captured, true if a file was written
     */
    async writeHarFile(): Promise<boolean> {
        if (!Resources.manager().enableNetworkCapture) {
            Resources.logger(this).debug(`Not writing HAR file because network capture is disabled`);
            return false;
        }

        try {
            const generatedObject = this._harTracker.getGeneratedHar();

            if (generatedObject.log.entries.length === 0) {
                Resources.logger(this).debug(`Not writing HAR file because no entries were captured`);
                return false;
            }

            Resources.logger(this).info(`Generated HAR archive with ${generatedObject.log.entries.length} entries`);

            jsonc.write(Resources.manager().harFilePath, generatedObject, {autoPath: true});
            Resources.logger(this).info(`HAR file written`);
            return true;
        } catch (err) {
            Resources.logger(this).error(`Unable to write HAR file: ${err.message}`);
            return false;
        }
    }

    /**
     * Persists the X-Apple-Id-Session-Id header required for the MFA flow, stores it as sessionSecret and adds the relevant header to the header jar
     * @param sessionId - The session id value to use
     */
    set sessionId(sessionId: string) {
        Resources.logger(this).debug(`Setting session secret to ${sessionId}`);
        Resources.manager().sessionSecret = sessionId;
        this._headerJar.setHeader(new Header(`idmsa.apple.com`, HEADER_KEYS.SESSION_ID, sessionId));
    }

    /**
     * Persist the session token as session secret, required for setup
     */
    set sessionToken(sessionToken: string) {
        Resources.logger(this).debug(`Setting session secret to ${sessionToken}`);
        Resources.manager().sessionSecret = sessionToken;
    }

    /**
     * @param region - The region to use, currently set region in resource manager is set as default
     * @returns 'icloud.com.cn' if region is set to 'china', 'icloud.com' otherwise
     */
    iCloudRegionUrl(region: Resources.Types.Region = Resources.manager().region) {
        return region === Resources.Types.Region.CHINA
            ? `icloud.com.cn`
            : `icloud.com`;
    }

    /**
     * Sets the photos URL including the default path to be the default base url going forward
     * @param url - The url to set, including the protocol and port.
     */
    set photosUrl(url: string) {
        Resources.logger(this).debug(`Setting photosUrl to ${url}`);
        this._axios.defaults.baseURL = url + ENDPOINTS.PHOTOS.BASE_PATH;
    }

    /**
     * Applies configurations from the response received if the MFA code is required. This includes setting the AASP cookie, the scnt header and session token.
     * @param mfaRequiredResponse - The response received from the server
     */
    applySigninResponse(signinResponse: SigninResponse) {
        this.sessionId = signinResponse.headers[`x-apple-session-token`];
    }

    /**
     * Applies configurations from the response received after the device was trusted. This includes setting the trust and session token.
     * @param trustResponse - The response received from the server
     */
    applyTrustResponse(trustResponse: TrustResponse) {
        Resources.manager().trustToken = trustResponse.headers[`x-apple-twosv-trust-token`];
        this.sessionToken = trustResponse.headers[`x-apple-session-token`];
    }

    /**
     * Applies configurations from the response received after the setup request. This includes setting the photos URL and persisting the iCloud authentication cookies.
     * @param setupResponse - The response received from the server
     * @returns True if necessary PCS cookies were found, false otherwise
     */
    applySetupResponse(setupResponse: SetupResponse) {
        this.photosUrl = setupResponse.data.webservices.ckdatabasews.url;
        if (!setupResponse.data.webservices.ckdatabasews.pcsRequired) {
            return true;
        }

        return [...this._headerJar.cookies.values()]
            .filter(cookie => cookie.key === COOKIE_KEYS.PCS_PHOTOS || cookie.key === COOKIE_KEYS.PCS_SHARING).length === 2;
    }

    /**
     * Applies the acquired PCS cookies received from the PCS request to the header jar.
     * @param pcsResponse - The response received from the server
     */
    applyPCSResponse(_pcsResponse: PCSResponse) {}

    /**
     * Applies configurations from the response received after the photos setup request. This includes information about the available zones.
     * @param photosSetupResponse - The response received from the server
     */
    applyPhotosSetupResponse(photosSetupResponse: PhotosSetupResponse) {
        Resources.logger(this).info(`Found ${photosSetupResponse.data.zones.length} available zones: ${photosSetupResponse.data.zones.map(zone => zone.zoneID.zoneName).join(`, `)}`);

        const primaryZoneData = photosSetupResponse.data.zones.find(zone => zone.zoneID.zoneName === `PrimarySync`);
        if (!primaryZoneData || (primaryZoneData.deleted !== undefined && primaryZoneData.deleted === true)) {
            throw new iCPSError(RESOURCES_ERR.NO_PRIMARY_ZONE)
                .addContext(`zones`, photosSetupResponse.data.zones);
        }

        Resources.manager().primaryZone = primaryZoneData.zoneID;

        const sharedZoneData = photosSetupResponse.data.zones.find(zone => zone.zoneID.zoneName.startsWith(`SharedSync-`));
        if (sharedZoneData && (sharedZoneData.deleted === undefined || sharedZoneData.deleted === false)) {
            Resources.logger(this).debug(`Found shared zone ${sharedZoneData.zoneID.zoneName}`);
            Resources.manager().sharedZone = sharedZoneData.zoneID;
        }
    }

    /**
     * Perform a POST request using the local axios instance and configuration
     * Uses metadata rate limiting to ensure that the request is not sent too often
     * @param url - The url to request
     * @param data - The data to send
     * @param config - Additional configuration
     * @returns A promise, that resolves once the request has been completed, or rejects if the request was not successful.
     */
    async post<T = any, R = AxiosResponse<T>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>): Promise<R> {
        return this._rateLimiter.add(async () => this._axios.post(url, data, config)) as R;
    }

    /**
     * Perform a GET request using the local axios instance and configuration
     * Uses metadata rate limiting to ensure that the request is not sent too often
     * @param url - The url to request
     * @param config - Additional configuration
     * @returns A promise, that resolves once the request has been completed, or rejects if the request was not successful.
     */
    async get<T = any, R = AxiosResponse<T>, D = any>(url: string, config?: AxiosRequestConfig<D>): Promise<R> {
        return this._rateLimiter.add(async () => this._axios.get(url, config)) as Promise<R>;
    }

    /**
     * Perform a PUT request using the local axios instance and configuration
     * Uses metadata rate limiting to ensure that the request is not sent too often
     * @param url - The url to request
     * @param data - The data to send
     * @param config - Additional configuration
     * @returns A promise, that resolves once the request has been completed.
     */
    async put<T = any, R = AxiosResponse<T>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>): Promise<R> {
        return this._rateLimiter.add(async () => this._axios.put(url, data, config)) as R;
    }

    /**
     * Downloads the provided url's content and writes it to the provided location
     * Uses the CCY limiter to ensure that the network is not overwhelmed
     * @param url - The url to download
     * @param location - The location to write the file to (existing files will be overwritten)
     * @returns A promise, that resolves once the download has been completed, or rejects if the download was not successful.
     */
    async downloadData(url: string, location: string): Promise<void> {
        await this._streamingCCYLimiter.add(async () => {
            const fileExists = await fs.stat(location)
                .then(stat => stat.isFile())
                .catch(() => false);

            if (fileExists) {
                Resources.logger(this).info(`File ${location} already exists - skipping download`);
                return;
            }

            Resources.logger(this).debug(`Starting download of ${url}`);
            const response = await this._streamingAxios.get(url);
            Resources.logger(this).debug(`Starting to write ${url} to ${location}`);
            const writeStream = createWriteStream(location, {flags: `w`});
            response.data.pipe(writeStream);
            await pEvent(writeStream, `finish`, {rejectionEvents: [`error`]});
            Resources.logger(this).debug(`Finished download of ${url}`);
        });
    }
}