import {AxiosResponse} from "axios";
import * as fs from 'fs/promises';
import {readFileSync, writeFileSync} from 'fs';
import * as path from 'path';
import {Cookie} from "tough-cookie";
import {iCPSError} from "../../app/error/error.js";
import {getLogger} from "../logger.js";

import * as ICLOUD from './constants.js';
import {AUTH_ERR} from "../../app/error/error-codes.js";
import {Zones} from "./icloud-photos/query-builder.js";
import {sanitized, serializeCookies, deserializeCookies} from "./utils.js";

/**
 * Secrets, required to track authentication request across the MFA process
 */
export interface AuthSecrets {
    /**
     * X-Apple-ID-Session-Id / X-Apple-Session-Token
     */
    sessionId?: string,
    /**
     * Apple provided header to identify requests during authentication
     */
    scnt?: string,
    /**
     * Apple session cookie during authentication
     */
    aasp?: string
}

/**
 * Account secrets
 */
export interface AccountSecrets {
    /**
     * Apple ID username
     */
    username?: string,
    /**
     * Apple ID Password
     */
    password?: string,
}

/**
 * Account tokens required to setup iCloud
 */
export interface AccountTokens {
    /**
     * Session Token
     */
    sessionToken?: string,
    /**
     * 2FA trust token
     */
    trustToken?: string
}

export interface PhotosAccountZone {
    zoneName?: string,
    zoneType?: string,
    ownerName?: string,
}

/**
 * Authentication information required to interact with the iCloud Photos backend
 */
export interface PhotosAccount {
    photosDomain?: string,
    primary?: PhotosAccountZone,
    shared?: PhotosAccountZone
}

/**
 * This class holds all iCloud related authentication information
 */
export class iCloudAuth {
    /**
     * Default logger for this class
     */
    private logger = getLogger(this);

    /**
     * Cookies required to access iCloud services
     */
    iCloudCookies: Cookie[] = [];

    /**
     * Secrets required during authentication process
     */
    iCloudAuthSecrets: AuthSecrets = {};

    /**
     * Account tokens
     */
    iCloudAccountTokens: AccountTokens = {};

    /**
     * General Account secrets
     */
    iCloudAccountSecrets: AccountSecrets = {};

    /**
     * Relevant account information for iCloud Photos Service
     */
    iCloudPhotosAccount: PhotosAccount = {};

    /**
     * File path to the location, where the trust token is persisted on disk to circumvent future MFA requests
     */
    trustTokenFile: string;
    cookieStoreFile: string;

    /**
     *
     * @param username - The AppleID username
     * @param password - The AppleID password
     * @param trustToken - The trust token in string format. Will take precedence over any stored file
     * @param appDataDir - The directory to store authentication tokens for future re-authentication without MFA
     * @param sharedLibrary - Specifies if the shared iCloud Photos Library should be used
     */
    constructor(username: string, password: string, trustToken: string, appDataDir: string) {
        this.iCloudAccountSecrets.username = username;
        this.iCloudAccountSecrets.password = password;
        this.cookieStoreFile = path.format({
            "dir": appDataDir,
            "base": `.${sanitized(username)}.cookies`,
        });

        this.trustTokenFile = path.format({
            "dir": appDataDir,
            "base": ICLOUD.TRUST_TOKEN_FILE_NAME,
        });

        this.loadPersistedCloudCookies();

        if (!trustToken) {
            this.loadTrustToken();
        } else {
            this.iCloudAccountTokens.trustToken = trustToken;
        }
    }

    loadPersistedCloudCookies() {
        this.logger.debug(`Trying to load cookies from disk`);
        try {
            const serializedCookies = readFileSync(this.cookieStoreFile, {"encoding": ICLOUD.TRUST_TOKEN_FILE_ENCODING});
            this.logger.debug(`Loaded cookies from file`);
            this.logger.trace(`  - token: ${serializedCookies}`);

            this.iCloudCookies = deserializeCookies(serializedCookies);
            this.validateCloudCookies()
        } catch (err) {
            this.logger.debug(`Unable to load cookies from file: ${err.message}`);
        }
    }

    persistCloudCookies(cookies:Array<Cookie>) {
        this.logger.debug(`Trying to persist cookies to disk`);
        try {
            writeFileSync(this.cookieStoreFile, serializeCookies(cookies), {"encoding": ICLOUD.TRUST_TOKEN_FILE_ENCODING});
        } catch (err) {
            this.logger.debug(`Unable to persist cookies to file: ${err.message}`);
        }
    }

    /**
     * Tries loading the trust token from disk. Loading is done synchronously in order to avoid race conditions, where authentication is attempted before token is loaded
     */
    loadTrustToken() {
        this.logger.debug(`Trying to load trust token from disk`);
        try {
            const trustToken = readFileSync(this.trustTokenFile, {"encoding": ICLOUD.TRUST_TOKEN_FILE_ENCODING});
            this.logger.debug(`Acquired trust token from file`);
            this.logger.trace(`  - token: ${trustToken}`);
            this.iCloudAccountTokens.trustToken = trustToken;
        } catch (err) {
            this.logger.debug(`Unable to acquire trust token from file: ${err.message}`);
        }
    }

    /**
     * Tries to write the trust token to disk
     */
    async storeTrustToken() {
        this.logger.debug(`Trying to persist trust token to disk`);
        const trustTokenPath = path.dirname(this.trustTokenFile);
        try {
            await fs.mkdir(trustTokenPath, {"recursive": true});
            await fs.writeFile(this.trustTokenFile, this.iCloudAccountTokens.trustToken, {"encoding": ICLOUD.TRUST_TOKEN_FILE_ENCODING});
        } catch (err) {
            throw new iCPSError(AUTH_ERR.STORE_TRUST_TOKEN)
                .addCause(err);
        }
    }

    /**
     * Processing the response from the initial authentication request and populating the AuthSecret object
     * Trying to extract X-Apple-Session-Token, scnt Header and aasp Cookie
     * @param response - The response from the initial authentication request
     */
    processAuthSecrets(response: AxiosResponse) {
        this.logger.debug(`Processing iCloud authentication response`);
        this.iCloudAuthSecrets.sessionId = response.headers[ICLOUD.AUTH_RESPONSE_HEADER.SESSION_TOKEN.toLowerCase()];
        this.iCloudAccountTokens.sessionToken = this.iCloudAuthSecrets.sessionId;
        this.iCloudAuthSecrets.scnt = response.headers[ICLOUD.AUTH_RESPONSE_HEADER.SCNT.toLowerCase()];

        const cookieHeaders = response.headers[`set-cookie`];
        if (!cookieHeaders || !Array.isArray(cookieHeaders) || cookieHeaders.length === 0) {
            throw new iCPSError(AUTH_ERR.COOKIES)
                .addContext(`responseHeaders`, response.headers);
        }

        const extractedHeader: string = cookieHeaders.find(el => el.startsWith(`${ICLOUD.AUTH_RESPONSE_HEADER.AASP_COOKIE}=`));
        const removedKey: string = extractedHeader.substring(ICLOUD.AUTH_RESPONSE_HEADER.AASP_COOKIE.length + 1);
        const removedMetadata: string = removedKey.split(`;`)[0];
        this.iCloudAuthSecrets.aasp = removedMetadata;

        this.validateAuthSecrets();
        this.logger.debug(`Authentication processed, auth secrets populated`);
        this.logger.trace(`  - auth secrets: ${JSON.stringify(this.iCloudAuthSecrets)}`);
    }

    /**
     * Headers required for MFA authentication flow (Enter 2-FA + get tokens)
     * @returns The header object for the request
     */
    getMFAHeaders(): any {
        this.validateAuthSecrets();
        return {...ICLOUD.DEFAULT_AUTH_HEADER,
            "scnt": this.iCloudAuthSecrets.scnt,
            'X-Apple-ID-Session-Id': this.iCloudAuthSecrets.sessionId,
            "Cookie": `aasp=${this.iCloudAuthSecrets.aasp}`,
        };
    }

    /**
     * Processing the response from acquiring the necessary trust tokens. This method is automatically storing the trust token on disk
     * @param response - The response from the trust token endpoint
     * @throws A fatal error in case it failed
     */
    async processAccountTokens(response: AxiosResponse) {
        this.logger.debug(`Processing trust token response`);
        this.iCloudAccountTokens.sessionToken = response?.headers[ICLOUD.AUTH_RESPONSE_HEADER.SESSION_TOKEN.toLowerCase()];
        this.iCloudAccountTokens.trustToken = response?.headers[ICLOUD.AUTH_RESPONSE_HEADER.TRUST_TOKEN.toLowerCase()];
        this.validateAccountTokens();
        await this.storeTrustToken();
    }

    /**
     *
     * @returns Data required for iCloud setup request
     */
    getSetupData(): any {
        return {
            "dsWebAuthToken": this.iCloudAccountTokens.sessionToken,
            "trustToken": this.iCloudAccountTokens.trustToken,
        };
    }

    /**
     * Parses the iCloud setup response in order to acquire necessary secrets for further requests
     * @param response - The successful response during iCloud Setup
     * @returns True if successful processing, false otherwise
     * @throws An iCloudAuthError in case the response cannot be processed
     */
    processCloudSetupResponse(response: AxiosResponse) {
        this.logger.debug(`Processing iCloud setup response`);
        const cookieHeaders = response.headers[`set-cookie`];
        if (!cookieHeaders || !Array.isArray(cookieHeaders) || cookieHeaders.length === 0) {
            throw new iCPSError(AUTH_ERR.COOKIES)
                .addContext(`responseHeaders`, response.headers);
        }

        this.iCloudCookies = [];

        cookieHeaders.forEach(cookieString => {
            const cookie = Cookie.parse(cookieString);
            // Filtering empty cookies
            if (cookie.value) {
                this.logger.trace(`Adding cookie: ${cookie}`);
                this.iCloudCookies.push(cookie);
            }
        });

        if (!response?.data?.webservices?.ckdatabasews?.url) {
            throw new iCPSError(AUTH_ERR.NO_PHOTOS_DOMAIN)
                .addContext(`responseData`, response.data);
        }

        this.iCloudPhotosAccount.photosDomain = response.data.webservices.ckdatabasews.url;

        this.validateCloudCookies();
        this.persistCloudCookies(this.iCloudCookies);
    }

    /**
     *
     * @returns A fully authenticated header, to be used with the iCloud Photos Service
     * @throws An iCloudAuthError in case the returned headers would be expired
     */
    getPhotosHeader(): any {
        return {...ICLOUD.DEFAULT_HEADER,
            "Cookie": this.getCookiesHeaderString(),
        };
    }

    /**
     * Builds the cookie header string for future requests
     * @returns The cookie header string or an empty string (if cookies are not available)
     * @throws An iCloudAuthError in case the returned headers would be expired
     */
    getCookiesHeaderString(): string {
        let cookieString: string = ``;
        this.validateCloudCookies();
        this.iCloudCookies.forEach(cookie => {
            if (cookieString.length === 0) {
                cookieString = cookie.cookieString();
            } else {
                cookieString = `${cookieString}; ${cookie.cookieString()}`;
            }
        });
        this.logger.trace(`Build cookie string: ${cookieString}`);
        return cookieString;
    }

    /**
     * Processing setup response to acquire PhotosAccount
     * @param response - The Photos Setup response
     * @throws An iCloudAuthError in case the setup response cannot be processed
     */
    processPhotosSetupResponse(response: AxiosResponse) {
        this.logger.debug(`Processing Photos setup request`);

        if (response.data?.moreComing) {
            throw new iCPSError(AUTH_ERR.TOO_MANY_ZONES);
        }

        if (!Array.isArray(response.data?.zones)) {
            throw new iCPSError(AUTH_ERR.ZONE_RESPONSE_INVALID);
        }

        const availableZones = response.data.zones as any[];
        this.logger.info(`Found ${availableZones.length} available zones`);

        const primaryZone = availableZones.find(zone => zone.zoneID.zoneName === `PrimarySync`);
        this.iCloudPhotosAccount.primary = {
            "ownerName": primaryZone?.zoneID?.ownerRecordName,
            "zoneName": primaryZone?.zoneID?.zoneName,
            "zoneType": primaryZone?.zoneID?.zoneType,
        };

        const sharedZone = availableZones.find(zone => zone.zoneID.zoneName.startsWith(`SharedSync-`));
        if (sharedZone) {
            this.logger.debug(`Found shared zone ${sharedZone.zoneID?.zoneName}`);
            this.iCloudPhotosAccount.shared = {
                "ownerName": sharedZone.zoneID?.ownerRecordName,
                "zoneName": sharedZone.zoneID?.zoneName,
                "zoneType": sharedZone.zoneID?.zoneType,
            };
        }

        this.validatePhotosAccount(!sharedZone ? Zones.Primary : undefined);
    }

    /**
     * Validates that the object is in a authenticated iCloud state
     * @throws An iCloudAuthError, if the cloud cookies are no longer valid
     */
    validateCloudCookies() {
        if (!this.iCloudCookies || this.iCloudCookies.length === 0) {
            throw new iCPSError(AUTH_ERR.COOKIE_VALIDATION)
                .addMessage(`No cookies loaded`);
        }

        const expiredCookies = this.iCloudCookies
            .filter(cookie => cookie.expires !== `Infinity`) // Being explicit about that
            .filter(cookie => cookie.TTL() <= 0)
            .filter(cookie => (cookie.expires as Date).getTime() !== 1000);

        if (expiredCookies.length > 0) {
            this.logger.trace(`Found expired cookies: ${JSON.stringify(expiredCookies)}`);
            // Cleaning data before attaching it to error
            this.iCloudCookies.forEach(cookie => {
                cookie.value = ``;
            });
            throw new iCPSError(AUTH_ERR.COOKIE_VALIDATION)
                .addMessage(`Some cookies are expired`)
                .addContext(`iCloudCookies`, this.iCloudCookies);
        }
    }

    /**
     * Validates that the object holds all information required to perform actions against the photos service
     * @param zone - The zone to validate, undefined to validate both
     * @throws An iCloudAuthError, if the photos account cannot be validated
     */
    validatePhotosAccount(zone?: Zones) {
        this.validateCloudCookies();

        if (!this.iCloudPhotosAccount.photosDomain || this.iCloudPhotosAccount.photosDomain.length === 0) {
            throw new iCPSError(AUTH_ERR.PHOTOS_ACCOUNT_VALIDATION)
                .addMessage(`PhotosDomain invalid`)
                .addContext(`invalidPhotosAccount`, this.iCloudPhotosAccount);
        }

        if (zone) {
            this.validateZone(zone);
        } else {
            this.validateZone(Zones.Primary);
            this.validateZone(Zones.Shared);
        }
    }

    /**
     * Validates a given zone
     */
    validateZone(zone: Zones) {
        if (zone === Zones.Primary) {
            if (!this.iCloudPhotosAccount.primary) {
                throw new iCPSError(AUTH_ERR.PHOTOS_ACCOUNT_VALIDATION)
                    .addMessage(`PrimaryZone missing`)
                    .addContext(`invalidPhotosAccount`, this.iCloudPhotosAccount);
            }

            if (!this.iCloudPhotosAccount.primary?.zoneName || this.iCloudPhotosAccount.primary?.zoneName.length === 0) {
                throw new iCPSError(AUTH_ERR.PHOTOS_ACCOUNT_VALIDATION)
                    .addMessage(`Primary ZoneName invalid`)
                    .addContext(`invalidPhotosAccount`, this.iCloudPhotosAccount);
            }

            if (!this.iCloudPhotosAccount.primary?.zoneType || this.iCloudPhotosAccount.primary?.zoneType.length === 0) {
                throw new iCPSError(AUTH_ERR.PHOTOS_ACCOUNT_VALIDATION)
                    .addMessage(`Primary ZoneType invalid`)
                    .addContext(`invalidPhotosAccount`, this.iCloudPhotosAccount);
            }

            if (!this.iCloudPhotosAccount.primary?.ownerName || this.iCloudPhotosAccount.primary?.ownerName.length === 0) {
                throw new iCPSError(AUTH_ERR.PHOTOS_ACCOUNT_VALIDATION)
                    .addMessage(`Primary OwnerName invalid`)
                    .addContext(`invalidPhotosAccount`, this.iCloudPhotosAccount);
            }
        }

        if (zone === Zones.Shared) {
            if (!this.iCloudPhotosAccount.shared) {
                throw new iCPSError(AUTH_ERR.PHOTOS_ACCOUNT_VALIDATION)
                    .addMessage(`PrimaryZone missing`)
                    .addContext(`invalidPhotosAccount`, this.iCloudPhotosAccount);
            }

            if (!this.iCloudPhotosAccount.shared?.zoneName || this.iCloudPhotosAccount.shared?.zoneName.length === 0) {
                throw new iCPSError(AUTH_ERR.PHOTOS_ACCOUNT_VALIDATION)
                    .addMessage(`Shared ZoneName invalid`)
                    .addContext(`invalidPhotosAccount`, this.iCloudPhotosAccount);
            }

            if (!this.iCloudPhotosAccount.shared?.zoneType || this.iCloudPhotosAccount.shared?.zoneType.length === 0) {
                throw new iCPSError(AUTH_ERR.PHOTOS_ACCOUNT_VALIDATION)
                    .addMessage(`Shared ZoneType invalid`)
                    .addContext(`invalidPhotosAccount`, this.iCloudPhotosAccount);
            }

            if (!this.iCloudPhotosAccount.shared?.ownerName || this.iCloudPhotosAccount.shared?.ownerName.length === 0) {
                throw new iCPSError(AUTH_ERR.PHOTOS_ACCOUNT_VALIDATION)
                    .addMessage(`Shared OwnerName invalid`)
                    .addContext(`invalidPhotosAccount`, this.iCloudPhotosAccount);
            }
        }
    }

    /**
     * Validates that the objects holds all account secrets
     * @throws An iCloudAuthError, if the account secrets cannot be validated
     */
    validateAccountSecrets() {
        if (!this.iCloudAccountSecrets.username || this.iCloudAccountSecrets.username.length === 0) {
            throw new iCPSError(AUTH_ERR.ACCOUNT_SECRETS_VALIDATION)
                .addMessage(`Username invalid`);
        }

        if (!this.iCloudAccountSecrets.password || this.iCloudAccountSecrets.password.length === 0) {
            throw new iCPSError(AUTH_ERR.ACCOUNT_SECRETS_VALIDATION)
                .addMessage(`Password invalid`);
        }
    }

    /**
     * Validates the authentication secrets
     * @throws An iCloudAuthError, if authentication secrets cannot be validated
     */
    validateAuthSecrets() {
        if (!this.iCloudAuthSecrets.aasp || this.iCloudAuthSecrets.aasp.length === 0) {
            throw new iCPSError(AUTH_ERR.AUTH_SECRETS_VALIDATION)
                .addMessage(`aasp invalid`)
                .addContext(`invalidAuthSecrets`, this.iCloudAuthSecrets);
        }

        if (!this.iCloudAuthSecrets.scnt || this.iCloudAuthSecrets.scnt.length === 0) {
            throw new iCPSError(AUTH_ERR.AUTH_SECRETS_VALIDATION)
                .addMessage(`scnt invalid`)
                .addContext(`invalidAuthSecrets`, this.iCloudAuthSecrets);
        }

        if (!this.iCloudAuthSecrets.sessionId || this.iCloudAuthSecrets.sessionId.length === 0) {
            throw new iCPSError(AUTH_ERR.AUTH_SECRETS_VALIDATION)
                .addMessage(`sessionId invalid`)
                .addContext(`invalidAuthSecrets`, this.iCloudAuthSecrets);
        }
    }

    /**
     * Validates the account tokens
     * @throws An iCloudAuthError, if account tokens cannot be validated
     */
    validateAccountTokens() {
        if (!this.iCloudAccountTokens.sessionToken || this.iCloudAccountTokens.sessionToken.length === 0) {
            throw new iCPSError(AUTH_ERR.ACCOUNT_TOKEN_VALIDATION)
                .addMessage(`sessionToken invalid`);
        }

        if (!this.iCloudAccountTokens.trustToken || this.iCloudAccountTokens.trustToken.length === 0) {
            throw new iCPSError(AUTH_ERR.ACCOUNT_TOKEN_VALIDATION)
                .addMessage(`trustToken invalid`);
        }
    }

    /**
     *
     * @returns True if shared library is available, false otherwise
     */
    sharedLibraryAvailable(): boolean {
        return Boolean(this.iCloudPhotosAccount.shared);
    }
}
