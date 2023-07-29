/**
 * This file holds constants relevant to the networking layer
 */
import {Cookie} from "tough-cookie";

/**
 * Hard coded client id, extracted from previous requests
 */
const CLIENT_ID = `d39ba9916b7251055b22c7f910e2ea796ee65e98b2ddecea8f5dde8d9d1a815d`;
/**
 * User Agent this CLI is using. Emulating a Firefox Browser
 */
const USER_AGENT = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:97.0) Gecko/20100101 Firefox/97.0`;
/**
 * Client information shared with the iCloud backend based on the user agent
 */
const CLIENT_INFO = JSON.stringify({
    U: USER_AGENT,
    L: `en-US`,
    Z: `GMT+01:00`,
    V: `1.1`,
    F: ``,
});

/**
 * Keys for dynamic header values
 */
export const HEADER_KEYS = {
    SCNT: `scnt`,
    SESSION_ID: `X-Apple-ID-Session-Id`,
    COOKIE: `Cookie`,
};

/**
 * Keys for dynamic cookie values
 */
export const COOKIE_KEYS = {
    AASP: `aasp`,
    X_APPLE: `X-APPLE-`,
};

export const HEADER = {
    /**
     * Default base header for most iCloud requests
     */
    DEFAULT: {
        'User-Agent': USER_AGENT,
        Accept: `application/json`,
        'Content-Type': `application/json`,
        Origin: `https://www.icloud.com`,
        Connection: `keep-alive`,
        'Accept-Encoding': `gzip, deflate, br`,
    },
    /**
     * Additional header used for authentication flow
     */
    AUTH: {
        Origin: `https://idmsa.apple.com`,
        Referer: `https://idmsa.apple.com/`,
        'X-Apple-Widget-Key': CLIENT_ID,
        'X-Apple-OAuth-Client-Id': CLIENT_ID,
        'X-Apple-I-FD-Client-Info': CLIENT_INFO,
        'X-Apple-OAuth-Response-Type': `code`,
        'X-Apple-OAuth-Response-Mode': `web_message`,
        'X-Apple-OAuth-Client-Type': `firstPartyAuth`,
    },
};

/**
 * List of endpoints used in this application
 */
export const ENDPOINTS = {
    /**
     * Authentication endpoints needed to acquire the session secret and two trust token
     */
    AUTH: {
        BASE: `https://idmsa.apple.com/appleauth/auth`,
        PATH: {
            SIGNIN: `/signin`,
            MFA: {
                DEVICE_RESEND: `/verify/trusteddevice`,
                DEVICE_ENTER: `/verify/trusteddevice/securitycode`,
                PHONE_RESEND: `/verify/phone`,
                PHONE_ENTER: `/verify/phone/securitycode`,
            },
            TRUST: `/2sv/trust`,
        },
    },
    /**
     * Setup endpoints needed to acquire cookies and Photos URL
     */
    SETUP: {
        BASE: `https://setup.icloud.com`,
        PATH: {
            ACCOUNT: `/setup/ws/1/accountLogin`,
        },
    },
    /**
     * Photos endpoints needed to access the photos library
     */
    PHOTOS: {
        /**
         * Base URL for photos requests is dynamic - the path is static
         */
        BASE_PATH: `/database/1/com.apple.photos.cloud/production/private`,
        PATH: {
            QUERY: `/records/query`,
            MODIFY: `/records/modify`,
            ZONES: `/changes/database`,
        },
    },
};

/**
 * Non persistent network resources, required to access the iCloud API
 */
export type NetworkResources = {
    /**
     * X-Apple-ID-Session-Id
     */
    sessionId?: string,
    /**
     * X-Apple-Session-Token after trusting the device
     */
    sessionToken?: string,
    /**
     * Apple provided header to identify requests during authentication
     */
    scnt?: string,
    /**
     * Cookies acquired after authentication
     */
    cookies?: Cookie[],
    /**
     * The dynamic iCloud photos URL
     */
    photosUrl?: string,
}

/**
 * The expected response format for the signin request
 * @see {@link ENDPOINTS.AUTH.PATH.SIGNIN}
 */
export type SigninResponse = {
    /**
     * Data should be irrelevant for this one
     */
    data: {
        authType: `hsa2`,
    },
    headers: {
        /**
         * Scnt token - required to keep track of MFA request
         * @minLength 1
         */
        scnt: string,
        /**
         * Session secret - required to keep track of MFA request
         * @minLength 1
         */
        'x-apple-session-token': string, // eslint-disable-line
        /**
         * Should hold the 'aasp' cookie
         * @minItems 1
         */
        'set-cookie': string[], // eslint-disable-line
    }
}

/**
 * The expected response format for the MFA resend request on a trusted device
 * @see {@link ENDPOINTS.AUTH.PATH.MFA.DEVICE_RESEND}
 */
export type ResendMFADeviceResponse = {
    data: {
         /**
         * Number of available trusted devices
         * @minimum 1
         */
        trustedDeviceCount: number,
        /**
         * Properties of the requested security code
         */
        securityCode: SecurityCodeFormat,
        /**
         * Object holding information about alternative phone number verification
         */
        phoneNumberVerification: PhoneNumberVerification
    }
}

/**
 * The expected response format for the MFA resend request on a trusted phone number
 * @see {@link ENDPOINTS.AUTH.PATH.MFA.PHONE_RESEND}
 */
export type ResendMFAPhoneResponse = {
    data: PhoneNumberVerification
}

/**
 * Information about phone number verification used in MFA resend responses
 */
type PhoneNumberVerification = {
    /**
     * The phone number used for verification
     */
    trustedPhoneNumber: TrustedPhoneNumber,
    trustedPhoneNumbers: TrustedPhoneNumber[],
    securityCode: SecurityCodeFormat,
    authenticationType: `hsa2`,
    hsa2Account: true,
    restrictedAccount: false,
}

/**
 * Object representing a trusted phone number used in MFA resend responses
 */
type TrustedPhoneNumber = {
    /**
     * @minimum 0
     */
    id: number,
    /**
     * @minLength 1
     */
    numberWithDialCode: string,
    /**
     * @pattern ^sms|voice$
     */
    pushMode: string,
    /**
     * @minLength 1
     */
    obfuscatedNumber: string,
    /**
     * @minLength 1
     * @maxLength 2
     */
    lastTwoDigits: string
}

/**
 * Format of the expected security code used in MFA resend responses
 */
type SecurityCodeFormat = {
    length: 6,
    tooManyCodesSent: false,
    tooManyCodesValidated: false,
    securityCodeLocked: false,
    securityCodeCooldown: false
}

/**
 * The expected response format for the device trust request
 * @see {@link ENDPOINTS.AUTH.PATH.TRUST}
 */
export type TrustResponse = {
    headers: {
        /**
         * TwoTrust token for future requests
         * @minLength 1
         */
        'x-apple-twosv-trust-token': string, // eslint-disable-line
        /**
         * Session token to setup the account
         * @minLength 1
         */
        'x-apple-session-token': string, // eslint-disable-line
    }
}

/**
 * The expected response format for the account setup request
 * @see {@link ENDPOINTS.SETUP.PATH.ACCOUNT}
 */
export type SetupResponse = {
    headers: {
        /**
         * Should hold the apple authentication
         * @minItems 1
         */
        'set-cookie': string[],  // eslint-disable-line
    }
    data: {
        dsInfo: {
            /**
             * Web access is necessary for the application
             */
            isWebAccessAllowed: true,
        }
        /**
         * Holds the dynamic iCloud service URLs
         */
        webservices: {
            /**
             * Service for iCloud Photos
             */
            ckdatabasews: {
                /**
                 * @minLength 1
                 */
                url: string,
                /**
                 * Service needs to be active
                 */
                status: `active`
            }
        }
    }
}

/**
 * The expected response format for the photos setup request
 */
export type PhotosSetupResponse = {
    data: {
        /**
         * Should always be false
         */
        moreComing: false,
        /**
         * Sync token - currently not used
         * @minLength 1
         */
        syncToken: string,
        /**
         * The list of photos account zones - either primary or primary and shared
         * @minItems 1
         * @maxItems 2
         */
        zones: PhotosSetupResponseZone[]
    }
}

/**
 * Response zone object from photos setup response
 */
type PhotosSetupResponseZone = {
    zoneID: {
        /**
         * @minLength 1
         * @pattern ^PrimarySync|SharedSync-[0-9A-F-]+$
         */
        zoneName: string,
        /**
         * @minLength 1
         */
        ownerRecordName: string,
        zoneType: `REGULAR_CUSTOM_ZONE`,
    }
}