import {default as axios, AxiosInstance, AxiosRequestConfig, AxiosResponse} from "axios";
import {HEADER, HEADER_KEYS, SigninResponse, NetworkResources, COOKIE_KEYS, TrustResponse, SetupResponse, ENDPOINTS, PhotosSetupResponse} from "./network.js";
import {Cookie} from "tough-cookie";
import {ResourceManager} from "./resource-manager.js";
import {iCPSEventError} from "./events.js";
import {iCPSError} from "../../app/error/error.js";
import {RES_MANAGER_ERR} from "../../app/error/error-codes.js";

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

    constructor() {
        this._axios = axios.create({
            headers: HEADER.DEFAULT,
        });
    }

    /**
     * Returns the currently stored scnt value
     */
    get scnt(): string | undefined {
        return this._resources.scnt;
    }

    /**
     * Persists the scnt header required for the MFA flow and setting a default header for future requests
     * @param scnt - The scnt value to use,  undefined to delete the header
     */
    set scnt(scnt: string | undefined) {
        ResourceManager.logger(this).debug(`Setting scnt to ${scnt}`);
        this._resources.scnt = scnt;
        if (this._resources.scnt === undefined) {
            delete this._axios.defaults.headers[HEADER_KEYS.SCNT];
            return;
        }

        this._axios.defaults.headers[HEADER_KEYS.SCNT] = this._resources.scnt;
    }

    /**
     * Returns the session secret required to setup the account
     * This can either be the session ID acquired from authentication with a valid trust token, or the session token acquired after going through the MFA flow and trusting the device
     * @throws An error if neither session ID nor session token are set
     */
    get session(): string {
        if (this._resources.sessionToken !== undefined) {
            return this.sessionToken;
        }

        if (this._resources.sessionId !== undefined) {
            return this.sessionId;
        }

        throw new iCPSError(RES_MANAGER_ERR.NO_SESSION);
    }

    /**
     * Returns the currently stored session ID value
     */
    get sessionId(): string | undefined {
        return this._resources.sessionId;
    }

    /**
     * Persists the X-Apple-Id-Session-Id header required for the MFA flow and setting a default header for future requests
     * @param sessionId - The session id value to use - undefined to delete the header
     */
    set sessionId(sessionId: string | undefined) {
        ResourceManager.logger(this).debug(`Setting sessionId to ${sessionId}`);
        this._resources.sessionId = sessionId;
        if (this._resources.sessionId === undefined) {
            delete this._axios.defaults.headers[HEADER_KEYS.SESSION_ID];
            return;
        }

        this._axios.defaults.headers[HEADER_KEYS.SESSION_ID] = this._resources.sessionId;
    }

    /**
     * @returns The currently stored session token
     */
    get sessionToken(): string | undefined {
        return this._resources.sessionToken;
    }

    /**
     * Persist the session token required for setup
     */
    set sessionToken(sessionToken: string | undefined) {
        ResourceManager.logger(this).debug(`Setting sessionToken to ${sessionToken}`);
        this._resources.sessionToken = sessionToken;
    }

    /**
     * @returns The currently stored aasp cookie as a single element array
     * @throws An error if no aasp cookie is present
     */
    get aaspCookie(): string[] {
        const aaspCookies = this._resources.cookies.filter(cookie => cookie.key === COOKIE_KEYS.AASP).map(cookie => cookie.value);
        if (aaspCookies.length !== 1) {
            throw new iCPSError(RES_MANAGER_ERR.NO_AASP_COOKIE);
        }

        return aaspCookies;
    }

    /**
     * Sets the aasp cookie from a list of set cookie for the current session
     */
    set aaspCookie(setCookies: string[]) {
        this.pushCookieString(
            setCookies.filter(cookieString => cookieString.startsWith(COOKIE_KEYS.AASP)),
        );
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
     * @param url - The url to set, including the protocol and port
     */
    set photosUrl(url: string | undefined) {
        ResourceManager.logger(this).debug(`Setting photosUrl to ${url}`);
        this._resources.photosUrl = url;
        this._axios.defaults.baseURL = this._resources.photosUrl + ENDPOINTS.PHOTOS.BASE_PATH;
    }

    /**
     * Applies configurations from the response received if the MFA code is required
     * @param mfaRequiredResponse - The response received from the server
     */
    applySigninResponse(signinResponse: SigninResponse) {
        this.scnt = signinResponse.headers.scnt;
        this.sessionId = signinResponse.headers[`x-apple-session-token`];
        this.aaspCookie = signinResponse.headers[`set-cookie`];
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
        this.pushCookieString(setupResponse.headers[`set-cookie`]);
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
     * Updates the cookie header string used in requests to match the currently stored cookies. Will filter all expired cookies.
     */
    _updateCookieHeader() {
        const validCookies = this._resources.cookies.filter(
            cookie => cookie.TTL() > 0
            || (cookie.expires as Date).getTime() === 1000, // Cookie.expires could also be the string 'Infinity', but then TTL() would be the number Infinity
            // For some reason some Apple Headers have a magic expire unix time of 1000 (X-APPLE-WEBAUTH-HSA-LOGIN)
        );

        if (validCookies.length !== this._resources.cookies.length) {
            ResourceManager.logger(this).debug(`Removing ${this._resources.cookies.length - validCookies.length} expired cookies`);
            ResourceManager.emit(iCPSEventError.HANDLER_EVENT, new iCPSError(RES_MANAGER_ERR.EXPIRED_COOKIES_DETECTED)
                .addContext(`cookies`, this._resources.cookies)
                .setWarning(),
            );
        }

        this._resources.cookies = validCookies;
        this._axios.defaults.headers[HEADER_KEYS.COOKIE] = this._resources.cookies.map(cookie => cookie.cookieString()).join(`; `);
        ResourceManager.logger(this).debug(`Updated cookie header to ${JSON.stringify(this._axios.defaults.headers[HEADER_KEYS.COOKIE])}`);
    }

    /**
     * Pushes a list of set-cookie header strings to the session and updates the cookie header
     * @param cookieString - The cookie string to add
     */
    pushCookieString(cookieString: string[]) {
        this.pushCookie(cookieString.map(cookieString => Cookie.parse(cookieString)));
    }

    /**
     * Adds cookies to the session and updates the cookie header
     * @param cookies - The cookies to add
     */
    pushCookie(cookies: Cookie[]) {
        if (this._resources.cookies === undefined) {
            this._resources.cookies = [];
        }

        ResourceManager.logger(this).debug(`Adding ${cookies.length} cookies to the session`);
        this._resources.cookies.push(...cookies);
        this._updateCookieHeader();
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