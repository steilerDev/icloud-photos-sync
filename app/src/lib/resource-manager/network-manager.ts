import axios, {AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig} from "axios";
import fs from "fs/promises";
import {HEADER, HEADER_KEYS, SigninResponse, NetworkResources, COOKIE_KEYS, TrustResponse, SetupResponse, ENDPOINTS, PhotosSetupResponse, EMPTY_HAR} from "./network.js";
import {Cookie} from "tough-cookie";
import {ResourceManager} from "./resource-manager.js";
import {iCPSError} from "../../app/error/error.js";
import {RES_MANAGER_ERR} from "../../app/error/error-codes.js";
import {AxiosHarTracker} from "axios-har-tracker";
import {FILE_ENCODING} from "./resources.js";
import {Readable} from "stream";

class Header {
    key: string;
    value: string;
    domain: string;

    constructor(domain: string, key: string, value: string) {
        this.domain = domain;
        this.key = key;
        this.value = value;
    }
}

class HeaderJar {
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

    constructor(axios: AxiosInstance) {
        axios.interceptors.request.use(config => {
            config.headers[HEADER_KEYS.COOKIE] = Array.from(this.cookies.values())
                .filter(cookie => this.isApplicable(config, cookie))
                .filter(
                    cookie => cookie.TTL() > 0
                    || (cookie.expires as Date).getTime() === 1000, // Cookie.expires could also be the string 'Infinity', but then TTL() would be the number Infinity
                    // For some reason some Apple Headers have a magic expire unix time of 1000 (X-APPLE-WEBAUTH-HSA-LOGIN)
                )
                .map(cookie => cookie.cookieString()).join(`; `);

            Array.from(this.headers.values())
                .filter(cookie => this.isApplicable(config, cookie))
                .forEach(header => {
                    config.headers[header.key] = header.value;
                });

            return config;
        });
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
    setHeader(header: Header) {
        this.headers.set(header.key, header);
    }

    /**
     * Sets a cookie object in the header jar - overwrites existing cookies with the same key
     * @param cookie - The cookie to set
     */
    setCookie(cookie: Cookie | string) {
        const _cookie = typeof cookie === `string` ? Cookie.parse(cookie) : cookie;
        this.cookies.set(_cookie.key, _cookie);
    }
}

/**
 * This class is responsible for keeping track of the shared network connection
 */
export class NetworkManager {
    /**
     * Non persistent network resources, required to access the iCloud API
     */
    _resources: NetworkResources = {};

    /**
     * Local axios instance to handle network requests
     */
    _axios: AxiosInstance;

    /**
     * A separate axios instance to handle stream based downloads of assets
     * This allows us to bypass har files for those big files - additionally something is not handling the stream correctly
     */
    _streamingAxios: AxiosInstance;

    /**
     * Collection of header values and cookies that are applied based on the request
     */
    _headerJar: HeaderJar;

    /**
     * Axios HAR tracker to capture network requests
     */
    _harTracker: AxiosHarTracker | undefined;

    constructor(enableNetworkCapture: boolean) {
        this._axios = axios.create({
            headers: HEADER.DEFAULT,
        });

        this._streamingAxios = axios.create({
            headers: HEADER.DEFAULT,
            responseType: `stream`,
        });

        if (enableNetworkCapture) {
            this._harTracker = new AxiosHarTracker(this._axios as any);
        }

        this._headerJar = new HeaderJar(this._axios);
    }

    /**
     * This closes the current session and clears resources that are not persisted
     * This will write the HAR file to disk, in case network capture is enabled
     */
    async resetSession() {
        await this.writeHarFile();

        this._axios.defaults.baseURL = undefined;

        if (ResourceManager.networkCapture) {
            // Resets the generated HAR file to make sure it does not grow too much while reusing the same instance
            // Unfortunately this object is private, so we have to cast it to any
            (this._harTracker as any).generatedHar = EMPTY_HAR;
        }
    }

    /**
     * Writes the HAR file to disk, if network capture was enabled
     * @returns - True if the file could be written, false otherwise
     */
    async writeHarFile(): Promise<boolean> {
        if (!ResourceManager.networkCapture) {
            ResourceManager.logger(this).debug(`Not writing HAR file because network capture is disabled`);
            return false;
        }

        try {
            const generatedObject = this._harTracker.getGeneratedHar();
            ResourceManager.logger(this).info(`Generated HAR archive with ${generatedObject.log.entries.length} entries`);

            if (generatedObject.log.entries.length === 0) {
                ResourceManager.logger(this).debug(`Not writing HAR file because no entries were captured`);
                return false;
            }

            await fs.writeFile(ResourceManager.harFilePath, JSON.stringify(generatedObject), {encoding: FILE_ENCODING, flag: `w`});
            ResourceManager.logger(this).info(`HAR file written`);
        } catch (err) {
            ResourceManager.logger(this).error(`Unable to write HAR file: ${err.message}`);
            return false;
        }

        return true;
    }

    /**
     * Persists the scnt header required for the MFA flow and adds the relevant header to the header jar
     * @param scnt - The scnt value to use,  undefined to delete the header
     */
    set scnt(scnt: string) {
        ResourceManager.logger(this).debug(`Setting scnt header to ${scnt}`);
        this._headerJar.setHeader(new Header(`idmsa.apple.com`, HEADER_KEYS.SCNT, scnt));
    }

    /**
     * Returns the session secret required to setup the account
     * This can either be the session ID acquired from authentication with a valid trust token, or the session token acquired after going through the MFA flow and trusting the device
     * @throws An error if neither session ID nor session token are set
     */
    get sessionSecret(): string {
        if (this._resources.sessionSecret !== undefined) {
            return this._resources.sessionSecret;
        }

        throw new iCPSError(RES_MANAGER_ERR.NO_SESSION);
    }

    /**
     * Persists the X-Apple-Id-Session-Id header required for the MFA flow and adds the relevant header to the header jar
     * @param sessionId - The session id value to use - undefined to delete the header
     */
    set sessionId(sessionId: string) {
        ResourceManager.logger(this).debug(`Setting session secret to ${sessionId}`);
        this._resources.sessionSecret = sessionId;
        this._headerJar.setHeader(new Header(`idmsa.apple.com`, HEADER_KEYS.SESSION_ID, sessionId));
    }

    /**
     * Persist the session token as session secret, required for setup
     */
    set sessionToken(sessionToken: string) {
        ResourceManager.logger(this).debug(`Setting session secret to ${sessionToken}`);
        this._resources.sessionSecret = sessionToken;
    }

    /**
     * @returns The currently stored trust token from the resource manager
     */
    get trustToken(): string | undefined {
        return ResourceManager.trustToken;
    }

    /**
     * Persists the trust token required for setup using the resource
     */
    set trustToken(string: string | undefined) {
        ResourceManager.trustToken = string;
    }

    /**
     * @returns The currently stored photos URL
     */
    get photosUrl(): string | undefined {
        return this._resources.photosUrl;
    }

    /**
     * Sets the photos URL including the default path to be the default base url going forward
     * @param url - The url to set, including the protocol and port. If undefined this will unset the base url
     */
    set photosUrl(url: string | undefined) {
        ResourceManager.logger(this).debug(`Setting photosUrl to ${url}`);
        this._resources.photosUrl = url;
        this._axios.defaults.baseURL = this._resources.photosUrl === undefined
            ? undefined
            : this._resources.photosUrl + ENDPOINTS.PHOTOS.BASE_PATH;
    }

    /**
     * Applies configurations from the response received if the MFA code is required
     * @param mfaRequiredResponse - The response received from the server
     */
    applySigninResponse(signinResponse: SigninResponse) {
        this.scnt = signinResponse.headers.scnt;
        this.sessionId = signinResponse.headers[`x-apple-session-token`];

        const aaspCookie = signinResponse.headers[`set-cookie`].filter(cookieString => cookieString.startsWith(COOKIE_KEYS.AASP));
        if (aaspCookie.length !== 1) {
            ResourceManager.logger(this).warn(`Expected exactly one AASP cookie, but found ${aaspCookie.length}`);
            return;
        }

        this._headerJar.setCookie(aaspCookie[0]);
    }

    /**
     * Applies configurations from the response received after the device was trusted
     * @param trustResponse - The response received from the server
     */
    applyTrustResponse(trustResponse: TrustResponse) {
        this.trustToken = trustResponse.headers[`x-apple-twosv-trust-token`];
        this.sessionToken = trustResponse.headers[`x-apple-session-token`];
    }

    /**
     * Applies configurations from the response received after the setup request
     * @param setupResponse - The response received from the server
     */
    applySetupResponse(setupResponse: SetupResponse) {
        this.photosUrl = setupResponse.data.webservices.ckdatabasews.url;
        setupResponse.headers[`set-cookie`]
            .forEach(cookie => {
                this._headerJar.setCookie(cookie);
            });
    }

    applyPhotosSetupResponse(photosSetupResponse: PhotosSetupResponse) {
        ResourceManager.logger(this).info(`Found ${photosSetupResponse.data.zones.length} available zones: ${photosSetupResponse.data.zones.map(zone => zone.zoneID.zoneName).join(`, `)}`);

        const primaryZoneData = photosSetupResponse.data.zones.find(zone => zone.zoneID.zoneName === `PrimarySync`);
        if (!primaryZoneData) {
            throw new iCPSError(RES_MANAGER_ERR.NO_PRIMARY_ZONE)
                .addContext(`zones`, photosSetupResponse.data.zones);
        }

        ResourceManager.primaryZone = primaryZoneData.zoneID;

        const sharedZoneData = photosSetupResponse.data.zones.find(zone => zone.zoneID.zoneName.startsWith(`SharedSync-`));
        if (sharedZoneData) {
            ResourceManager.logger(this).debug(`Found shared zone ${sharedZoneData.zoneID.zoneName}`);
            ResourceManager.sharedZone = sharedZoneData.zoneID;
        }
    }

    /**
     * Perform a POST request using the local axios instance and configuration
     * @param url - The url to request
     * @param data - The data to send
     * @param config - Additional configuration
     * @returns A promise, that resolves once the request has been completed.
     */
    async post<T = any, R = AxiosResponse<T>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>): Promise<R> {
        return this._axios.post(url, data, config);
    }

    /**
     * Perform a GET request using the local axios instance and configuration
     * @param url - The url to request
     * @param config - Additional configuration
     * @returns A promise, that resolves once the request has been completed.
     */
    async get<T = any, R = AxiosResponse<T>, D = any>(url: string, config?: AxiosRequestConfig<D>): Promise<R> {
        return this._axios.get(url, config);
    }

    /**
     * Performs a GET request to acquire a asset's data stream
     * @param url - The location of the asset
     * @returns A promise, that resolves once the request has been completed.
     */
    // async getDataStream<R = AxiosResponse<Readable>, D = any>(url: string, config?: AxiosRequestConfig<D>): Promise<R> {
    async getDataStream(url: string): Promise<AxiosResponse<Readable>> {
        return this._streamingAxios.get(url);
    }

    /**
     * Perform a PUT request using the local axios instance and configuration
     * @param url - The url to request
     * @param data - The data to send
     * @param config - Additional configuration
     * @returns A promise, that resolves once the request has been completed.
     */
    async put<T = any, R = AxiosResponse<T>, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>): Promise<R> {
        return this._axios.put(url, data, config);
    }
}