import fs from "fs/promises";
import {setGlobalProxyFromEnv} from "http";
import {jsonc} from "jsonc";
import PQueue from "p-queue";
import {RESOURCES_ERR} from "../../app/error/error-codes.js";
import {errorMessage, iCPSError} from "../../app/error/error.js";
import {iCPSAppOptions} from "../../app/factory.js";
import {HeaderJar, Header, HttpClient, HttpRequestConfig, NetworkCapture, ResponseValidator} from "./http-client.js";
import {Resources} from "./main.js";
import {COOKIE_KEYS, ENDPOINTS, HEADER_KEYS, PhotosSetupResponseZone, SetupResponse, SigninResponse, TrustResponse} from "./network-types.js";
import {PhotosAccountZone, ZoneArea} from "./resource-types.js";

/**
 * This class is responsible for keeping track of the shared network connection
 */
export class NetworkManager {
    /**
     * HTTP client handling all network requests - applies the header jar and (if enabled) the network capture
     */
    _http: HttpClient;

    /**
     * Queue to enable metadata rate limiting. Applied to regular (non-streaming) requests
     */
    _rateLimiter: PQueue;

    /**
     * Restores the previous global proxy settings, if the system proxy was applied
     */
    _restoreProxy?: () => void;

    /**
     * Timeout (in ms) for asset downloads, undefined if downloads should not time out
     */
    _downloadTimeout?: number;

    /**
     * Queue to enable CCY rate limiting. Applied to streaming requests
     */
    _streamingCCYLimiter: PQueue;

    /**
     * Collection of header values and cookies that are applied based on the request - owned and applied by the HTTP client
     */
    _headerJar: HeaderJar;

    /**
     * The account's country code, as provided by the backend during signin - required for account setup
     */
    accountCountry?: string;

    /**
     * Captures network requests, if network capture is enabled - owned and applied by the HTTP client
     */
    _networkCapture?: NetworkCapture;

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

        if (resources.useSystemProxy) {
            try {
                // Applies HTTP_PROXY, HTTPS_PROXY and NO_PROXY to Node's built-in fetch (and http/https modules)
                this._restoreProxy = setGlobalProxyFromEnv(process.env);
            } catch (err) {
                throw new iCPSError(RESOURCES_ERR.INVALID_PROXY).addCause(err);
            }
        }

        this._headerJar = new HeaderJar();

        if (resources.enableNetworkCapture) {
            this._networkCapture = new NetworkCapture();
        }

        this._http = new HttpClient({
            headers: {
                Origin: `https://www.${this.iCloudRegionUrl(resources.region)}`,
            },
            headerJar: this._headerJar,
            networkCapture: this._networkCapture,
        });

        this._streamingCCYLimiter = new PQueue({
            concurrency: resources.downloadThreads,
        });

        this._downloadTimeout = resources.downloadTimeout === Infinity
            ? undefined
            : (1000 * 60 * resources.downloadTimeout);
    }

    /**
     * This closes the current session, clears resources that are not persisted and writes the HAR file to disk, in case network capture is enabled
     */
    async resetSession() {
        this._http.baseURL = undefined;

        this._headerJar.clearHeader(HEADER_KEYS.SCNT);
        this._headerJar.clearHeader(HEADER_KEYS.SESSION_ID);
        this._headerJar.clearHeader(HEADER_KEYS.AUTH_ATTRIBUTES);
        this._headerJar.resetFrameId();

        await this.settleRateLimiter();
        await this.settleCCYLimiter();

        if (Resources.manager().enableNetworkCapture) {
            await this.writeHarFile();
            this._networkCapture?.reset();
        }
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
    async settleQueue(queue: PQueue) {
        if (queue.size > 0) {
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
            const generatedObject = this._networkCapture?.log;

            if (!generatedObject || generatedObject.log.entries.length === 0) {
                Resources.logger(this).debug(`Not writing HAR file because no entries were captured`);
                return false;
            }

            Resources.logger(this).info(`Generated HAR archive with ${generatedObject.log.entries.length} entries`);

            await jsonc.write(Resources.manager().harFilePath, generatedObject, {autoPath: true});
            Resources.logger(this).info(`HAR file written`);
            return true;
        } catch (err) {
            Resources.logger(this).error(`Unable to write HAR file: ${errorMessage(err)}`);
            return false;
        }
    }

    /**
     * Persists the X-Apple-Id-Session-Id header required for the MFA flow, stores it as sessionSecret and adds the relevant header to the header jar
     * @param sessionId - The session id value to use
     */
    set sessionId(sessionId: string) {
        Resources.logger(this).debug(`Setting session id with length ${sessionId.length}`);
        this._headerJar.setHeader(new Header(`idmsa.apple.com`, HEADER_KEYS.SESSION_ID, sessionId));
    }

    /**
     * Persist the session token as session secret, required for setup
     */
    set sessionToken(sessionToken: string) {
        Resources.logger(this).debug(`Setting session secret with length ${sessionToken.length}`);
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
        this._http.baseURL = url + ENDPOINTS.PHOTOS.BASE_PATH;
    }

    /**
     * Applies configurations from the response received if the MFA code is required. This includes setting the AASP cookie, the scnt header and session token.
     * @param signinResponse- The response received from the server
     */
    applySigninResponse(signinResponse: SigninResponse) {
        this.sessionToken = signinResponse.headers[`x-apple-session-token`];
        this.accountCountry = signinResponse.headers[`x-apple-id-account-country`];
        // The backend provides a dedicated session id, which is used by the web frontend - falling back to the session token for backwards compatibility
        this.sessionId = signinResponse.headers[`x-apple-id-session-id`] ?? signinResponse.headers[`x-apple-session-token`];
    }

    /**
     * Applies an updated session token, provided by the backend after a successfully validated MFA code or completed escrow (since iOS 26.4)
     * @param response - The response received from the server
     */
    applySessionTokenUpdate(response: {headers: {'x-apple-session-token'?: string}}) {
        const sessionToken = response.headers[`x-apple-session-token`];
        if (typeof sessionToken === `string` && sessionToken.length > 0) {
            this.sessionToken = sessionToken;
        }
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
     * Applies configurations from the response received after the photos setup request. This includes information about the available zones.
     * @param zones - The zones received from the server
     */
    applyZones(privateZones: PhotosSetupResponseZone[], sharedZones: PhotosSetupResponseZone[]) {
        Resources.logger(this).info(`Found ${privateZones.length} available private zones (${privateZones.map(zone => zone.zoneID.zoneName).join(`, `)}) and ${sharedZones.length} available shared zones (${sharedZones.map(zone => zone.zoneID.zoneName).join(`, `)})`);

        // Primary zone is always private
        const primaryZoneData = this.extractZone(privateZones, `PRIVATE`, /^PrimarySync$/);
        if (primaryZoneData === undefined) {
            throw new iCPSError(RESOURCES_ERR.NO_PRIMARY_ZONE)
                .addContext(`privateZones`, privateZones)
                .addContext(`sharedZones`, sharedZones)
        }

        Resources.manager().primaryZone = primaryZoneData

        // if shared sync is owned by user it is in private zone, otherwise check if shared sync is available from other user
        const sharedZoneData = this.extractZone(privateZones, `PRIVATE`, /^SharedSync-/) ?? this.extractZone(sharedZones, `SHARED`, /^SharedSync-/)
        if(sharedZoneData !== undefined) {
            Resources.logger(this).debug(`Found shared zone ${sharedZoneData.zoneName}`);
            Resources.manager().sharedZone = sharedZoneData
        }
    }

    /**
     * Extract available zones matching the provided regular expression
     * @param zone The list of zones to check
     * @param area Indicates if the zones are owned by this user or another one
     * @param zoneName A regular expression matched against the zones
     * @returns A converted zone if a non-deleted zone matching the reg ex was found otherwise undefined
     */
    extractZone(zones: PhotosSetupResponseZone[], area: ZoneArea, zoneNameMatch: RegExp): PhotosAccountZone | undefined {
        const match = zones.find(zone => zone.zoneID.zoneName.match(zoneNameMatch));
        if(match && (match.deleted === undefined || match.deleted === false)) {
            return {
                ...match.zoneID,
                area
            }
        }
        return undefined
    }

    /**
     * Perform a POST request using the HTTP client
     * Uses metadata rate limiting to ensure that the request is not sent too often
     * @param url - The url to request
     * @param data - The data to send
     * @param validate - Validates the response and provides the return value - created by the Validator (see `Validator.response`)
     * @param config - Additional configuration
     * @returns A promise, that resolves to the validated response once the request has been completed
     * @throws An HttpError if the request was not successful, the validator's error if the response is invalid
     */
    async post<T>(url: string, data: unknown, validate: ResponseValidator<T>, config?: HttpRequestConfig): Promise<T> {
        return this._rateLimiter.add(async () => this._http.post(url, data, validate, config));
    }

    /**
     * Perform a GET request using the HTTP client
     * Uses metadata rate limiting to ensure that the request is not sent too often
     * @param url - The url to request
     * @param validate - Validates the response and provides the return value - created by the Validator (see `Validator.response`)
     * @param config - Additional configuration
     * @returns A promise, that resolves to the validated response once the request has been completed
     * @throws An HttpError if the request was not successful, the validator's error if the response is invalid
     */
    async get<T>(url: string, validate: ResponseValidator<T>, config?: HttpRequestConfig): Promise<T> {
        return this._rateLimiter.add(async () => this._http.get(url, validate, config));
    }

    /**
     * Perform a PUT request using the HTTP client
     * Uses metadata rate limiting to ensure that the request is not sent too often
     * @param url - The url to request
     * @param data - The data to send
     * @param validate - Validates the response and provides the return value - created by the Validator (see `Validator.response`)
     * @param config - Additional configuration
     * @returns A promise, that resolves to the validated response once the request has been completed
     * @throws An HttpError if the request was not successful, the validator's error if the response is invalid
     */
    async put<T>(url: string, data: unknown, validate: ResponseValidator<T>, config?: HttpRequestConfig): Promise<T> {
        return this._rateLimiter.add(async () => this._http.put(url, data, validate, config));
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
            const locationExists = await fs.stat(location)
                .then(() => true)
                .catch(() => false);

            if (locationExists) {
                Resources.logger(this).info(`File ${location} already exists - skipping download`);
                return;
            }

            Resources.logger(this).debug(`Starting download of ${url} to ${location}`);
            await this._http.download(url, location, this._downloadTimeout);
            Resources.logger(this).debug(`Finished download of ${url}`);
        });
    }
}
