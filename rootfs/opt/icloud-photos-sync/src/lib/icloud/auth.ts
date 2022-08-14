import {AxiosResponse} from "axios";
import {writeFile, mkdir} from 'fs/promises';
import {readFileSync} from 'fs';
import * as path from 'path';
import {Cookie} from "tough-cookie";
import {getLogger} from "../logger.js";

import * as ICLOUD from './constants.js';

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

/**
 * Authentication information required to interact with the iCloud Photos backend
 */
export interface PhotosAccount {
    photosDomain?: string,
    zoneName?: string,
    zoneType?: string,
    ownerName?: string,
    syncToken?: string
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

    /**
     *
     * @param username - The AppleID username
     * @param password - The AppleID password
     * @param trustToken - The trust token in string format. Will take presedence over any stored file
     * @param appDataDir - The directory to store authentication tokens for future re-authentication without MFA
     */
    constructor(username: string, password: string, trustToken: string, appDataDir: string) {
        this.iCloudAccountSecrets.username = username;
        this.iCloudAccountSecrets.password = password;
        this.trustTokenFile = path.format({
            dir: appDataDir,
            base: ICLOUD.TRUST_TOKEN_FILE_NAME,
        });
        if (!trustToken) {
            this.loadTrustToken();
        } else {
            this.iCloudAccountTokens.trustToken = trustToken;
        }
    }

    /**
     * Tries loading the trust token from disk. Loading is done synchronously in order to avoid race conditions, where authentication is attempted before token is loaded
     */
    loadTrustToken() {
        this.logger.debug(`Trying to load trust token from disk`);
        try {
            const trustToken = readFileSync(this.trustTokenFile, {encoding: ICLOUD.TRUST_TOKEN_FILE_ENCODING});
            this.logger.debug(`Acquired trust token from file: ${trustToken}`);
            this.iCloudAccountTokens.trustToken = trustToken;
        } catch (err) {
            this.logger.warn(`Unable to acquire trust token from file: ${err}`);
        }
    }

    /**
     * Tries to write the trust token to disk
     */
    storeTrustToken(): Promise<void>{
        this.logger.debug(`Trying to persist trust token to disk`);

        const trustTokenPath = path.dirname(this.trustTokenFile);
        return mkdir(trustTokenPath, {recursive: true})
            .catch(err => {
                this.logger.warn(`Unable to create trust token directory (${trustTokenPath}): ${err}`);
            })
            .then(() => writeFile(this.trustTokenFile, this.iCloudAccountTokens.trustToken, {encoding: ICLOUD.TRUST_TOKEN_FILE_ENCODING}))
            .catch(err => {
                this.logger.warn(`Unable to persist trust token to disk: ${err}`);
            });
    }

    /**
     * Processing the response from the initial authentication request and populating the AuthSecret object
     * Trying to extract X-Apple-Session-Token, scnt Header and aasp Cookie
     * @param response - The response from the initial authentication request
     */
    processAuthSecrets(response: AxiosResponse): boolean {
        this.logger.debug(`Processing iCloud authentication response`);
        this.iCloudAuthSecrets.sessionId = response.headers[ICLOUD.AUTH_RESPONSE_HEADER.SESSION_TOKEN.toLowerCase()];
        this.iCloudAccountTokens.sessionToken = this.iCloudAuthSecrets.sessionId;
        this.iCloudAuthSecrets.scnt = response.headers[ICLOUD.AUTH_RESPONSE_HEADER.SCNT.toLowerCase()];

        const cookieHeaders = response.headers[`set-cookie`];
        if (cookieHeaders && Array.isArray(cookieHeaders) && cookieHeaders.length > 0) {
            const extractedHeader:string = cookieHeaders.find(el => el.startsWith(`${ICLOUD.AUTH_RESPONSE_HEADER.AASP_COOKIE}=`));
            const removedKey: string = extractedHeader.substring(ICLOUD.AUTH_RESPONSE_HEADER.AASP_COOKIE.length + 1);
            const removedMetadata: string = removedKey.split(`;`)[0];
            this.iCloudAuthSecrets.aasp = removedMetadata;

            this.logger.debug(`Authentication processed, auth secrets populated: ${JSON.stringify(this.iCloudAuthSecrets)}`);
            return this.validateAuthSecrets();
        }

        this.logger.error(`Unable to process auth response: No set-cookie directive found`);
        return false;
    }

    /* MFA flow not testable in automation */
    /* c8 ignore start */
    /**
     * Headers required for MFA authentication flow (Enter 2-FA + get tokens)
     * @returns The header object for the request
     */
    getMFAHeaders(): any {
        return {...ICLOUD.DEFAULT_AUTH_HEADER,
            scnt: this.iCloudAuthSecrets.scnt,
            'X-Apple-ID-Session-Id': this.iCloudAuthSecrets.sessionId,
            Cookie: `aasp=${this.iCloudAuthSecrets.aasp}`,
        };
    }
    /* c8 ignore stop */

    /* MFA flow not testable in automation */
    /* c8 ignore start */
    /**
     * Processing the response from acquiring the necessary trust tokens. This method is automatically storing the trust token on disk
     * @param response - The response from the trust token endpoint
     * @returns True if acquied account tokens were sucesfully validated
     */
    async processAccountTokens(response: AxiosResponse): Promise<boolean> {
        this.logger.debug(`Processing trust token response`);
        this.iCloudAccountTokens.sessionToken = response?.headers[ICLOUD.AUTH_RESPONSE_HEADER.SESSION_TOKEN.toLowerCase()];
        this.iCloudAccountTokens.trustToken = response?.headers[ICLOUD.AUTH_RESPONSE_HEADER.TRUST_TOKEN.toLowerCase()];
        if(this.validateAccountTokens()) {
            await this.storeTrustToken();
            return true
        } else {
            return false
        }
    }
    /* c8 ignore stop */

    /**
     *
     * @returns Data required for iCloud setup request
     */
    getSetupData(): any {
        return {
            dsWebAuthToken: this.iCloudAccountTokens.sessionToken,
            trustToken: this.iCloudAccountTokens.trustToken,
        };
    }

    /**
     * Parses the iCloud setup response in order to acquire necessary secrets for further requests
     * @param response - The succesfull response during iCloud Setup
     * @Returns True if successful processing, false otherwise
     */
    processCloudSetupResponse(response: AxiosResponse): boolean {
        this.logger.debug(`Processing iCloud setup response`);
        const cookieHeaders = response.headers[`set-cookie`];
        if (cookieHeaders && Array.isArray(cookieHeaders) && cookieHeaders.length > 0) {
            this.iCloudCookies = [];
            cookieHeaders.forEach(cookieString => {
                const cookie = Cookie.parse(cookieString);
                this.logger.debug(`Adding cookie: ${cookie}`);
                this.iCloudCookies.push(cookie);
            });
        } else {
            this.logger.error(`Unable to store cookies from response header, no 'set-cookie' directive found: ${JSON.stringify(response.headers)}`);
            return false;
        }

        this.iCloudPhotosAccount.photosDomain = response.data.webservices.ckdatabasews.url;
        return this.validateCloudCookies();
    }

    /**
     *
     * @returns A fully authenticated header, to be used with the iCloud Photos Service
     */
    getPhotosHeader(): any {
        return {...ICLOUD.DEFAULT_HEADER,
            Cookie: this.getCookiesHeaderString(),
        };
    }

    /**
     * Builds the cookie header string for future requests
     * @returns The cookie header string or an empty string (if cookies are not available)
     */
    getCookiesHeaderString(): string {
        let cookieString: string = ``;
        if (this.validateCloudCookies()) {
            this.iCloudCookies.forEach(cookie => {
                if (cookieString.length === 0) {
                    cookieString = cookie.cookieString();
                } else {
                    cookieString = `${cookieString}; ${cookie.cookieString()}`;
                }
            });
            this.logger.trace(`Build cookie string: ${cookieString}`);
        } else {
            this.logger.warn(`Unable to parse cookies, because object is empty: ${this.iCloudCookies})`);
        }

        return cookieString;
    }

    /**
     * Processing setup response to acquire PhotosAccount
     * @param response - The Photos Setup response
     */
    processPhotosSetupResponse(response: AxiosResponse): boolean {
        this.logger.debug(`Processing Photos setup request`);
        this.iCloudPhotosAccount.ownerName = response.data.zones[0].zoneID.ownerRecordName;
        this.iCloudPhotosAccount.zoneName = response.data.zones[0].zoneID.zoneName;
        this.iCloudPhotosAccount.zoneType = response.data.zones[0].zoneID.zoneType;
        this.iCloudPhotosAccount.syncToken = response.data.zones[0].syncToken;
        return this.validatePhotosAccount();
    }

    /**
     * Validates that the object is in a authenticated iCloud state
     * @Returns true if there are cookies stored and they are valid
     */
    validateCloudCookies(): boolean {
        // @todo Check if cookies are still valid
        return this.iCloudCookies && this.iCloudCookies.length > 0
            && this.iCloudPhotosAccount.photosDomain && this.iCloudPhotosAccount.photosDomain.length > 0;
    }

    /**
     * Validates that the object holds all information required to perform actions against the photos service
     * @returns
     */
    validatePhotosAccount(): boolean {
        return this.validateCloudCookies()
            && this.iCloudPhotosAccount.zoneName && this.iCloudPhotosAccount.zoneName.length > 0
            && this.iCloudPhotosAccount.zoneType && this.iCloudPhotosAccount.zoneType.length > 0
            && this.iCloudPhotosAccount.ownerName && this.iCloudPhotosAccount.ownerName.length > 0
            && this.iCloudPhotosAccount.syncToken && this.iCloudPhotosAccount.syncToken.length > 0;
    }

    /**
     * Validates that the objects holds all account secrets
     * @returns True if acount secrets are present
     */
    validateAccountSecrets(): boolean {
        return this.iCloudAccountSecrets.username && this.iCloudAccountSecrets.username.length > 0
            && this.iCloudAccountSecrets.password && this.iCloudAccountSecrets.password.length > 0;
    }

    /**
     * Validates the authentication secrets
     * @returns True if authentication secrets are present
     */
    validateAuthSecrets(): boolean {
        return this.iCloudAuthSecrets.aasp && this.iCloudAuthSecrets.aasp.length > 0
            && this.iCloudAuthSecrets.scnt && this.iCloudAuthSecrets.scnt.length > 0
            && this.iCloudAuthSecrets.sessionId && this.iCloudAuthSecrets.sessionId.length > 0;
    }

    /**
     * Validates the account tokens
     * @returns True if account tokens are present
     */
    validateAccountTokens(): boolean {
        return this.iCloudAccountTokens.sessionToken && this.iCloudAccountTokens.sessionToken.length > 0
            && this.iCloudAccountTokens.trustToken && this.iCloudAccountTokens.trustToken.length > 0;
    }
}