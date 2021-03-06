import {AxiosResponse} from "axios";
import log from "loglevel";
import {Cookie} from "tough-cookie";

import * as ICLOUD from './icloud.constants.js';

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

export interface PhotosAccount {
    photosDomain?: string,
    zoneName?: string,
    zoneType?: string,
    ownerName?: string,
    syncToken?: string
}

export class iCloudAuth {
    logger: log.Logger = log.getLogger(`I-Cloud-Auth`);

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

    constructor(username: string, password: string, trustToken?: string) {
        this.iCloudAccountSecrets.username = username;
        this.iCloudAccountSecrets.password = password;
        this.iCloudAccountTokens.trustToken = trustToken;
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

    /**
     * Headers required for MFA authentication flow (Enter 2-FA + get tokens)
     * @returns
     */
    getMFAHeaders(): any {
        return {...ICLOUD.DEFAULT_AUTH_HEADER,
            scnt: this.iCloudAuthSecrets.scnt,
            'X-Apple-ID-Session-Id': this.iCloudAuthSecrets.sessionId,
            Cookie: `aasp=${this.iCloudAuthSecrets.aasp}`,
        };
    }

    /**
     * Processing the response from acquiring the necessary trust tokens
     * @param response - The response from the trust token endpoint
     */
    processAccountTokens(response: AxiosResponse): boolean {
        this.logger.debug(`Processing trust token response`);
        this.iCloudAccountTokens.sessionToken = response.headers[ICLOUD.AUTH_RESPONSE_HEADER.SESSION_TOKEN.toLowerCase()];
        this.iCloudAccountTokens.trustToken = response.headers[ICLOUD.AUTH_RESPONSE_HEADER.TRUST_TOKEN.toLowerCase()];
        return this.validateAccountTokens();
    }

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
            this.logger.debug(`Build cookie string: ${cookieString}`);
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
     * @returns
     */
    validateAccountSecrets(): boolean {
        return this.iCloudAccountSecrets.username && this.iCloudAccountSecrets.username.length > 0
            && this.iCloudAccountSecrets.password && this.iCloudAccountSecrets.password.length > 0;
    }

    validateAuthSecrets(): boolean {
        return this.iCloudAuthSecrets.aasp && this.iCloudAuthSecrets.aasp.length > 0
            && this.iCloudAuthSecrets.scnt && this.iCloudAuthSecrets.scnt.length > 0
            && this.iCloudAuthSecrets.sessionId && this.iCloudAuthSecrets.sessionId.length > 0;
    }

    validateAccountTokens(): boolean {
        return this.iCloudAccountTokens.sessionToken && this.iCloudAccountTokens.sessionToken.length > 0
            && this.iCloudAccountTokens.trustToken && this.iCloudAccountTokens.trustToken.length > 0;
    }
}