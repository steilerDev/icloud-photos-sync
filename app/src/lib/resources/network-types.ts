/**
 * This file holds information relevant to networking, as well as type definitions of the expected responses
 */

import {jsonc} from "jsonc";
import {Resources} from "./main.js";

/**
 * Hard coded client id, extracted from previous requests
 */
export const CLIENT_ID = `d39ba9916b7251055b22c7f910e2ea796ee65e98b2ddecea8f5dde8d9d1a815d`;

/**
 * User Agent this CLI is using. Emulating a Firefox Browser
 */
export const USER_AGENT = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36`;

/**
 * Client information shared with the iCloud backend based on the user agent
 */
export const CLIENT_INFO = jsonc.stringify({
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
    AUTH_ATTRIBUTES: `X-Apple-Auth-Attributes`,
    FRAME_ID: `X-Apple-Frame-Id`,
    OAUTH_STATE: `X-Apple-OAuth-State`,
    COOKIE: `Cookie`,
};

/**
 * Keys for dynamic cookie values
 */
export const COOKIE_KEYS = {
    AASP: `aasp`,
    X_APPLE: `X-APPLE-`,
    PCS_PHOTOS: `X-APPLE-WEBAUTH-PCS-Photos`,
    PCS_SHARING: `X-APPLE-WEBAUTH-PCS-Sharing`,
    WEBAUTH_TOKEN: `X-APPLE-WEBAUTH-TOKEN`,
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
            SIGNIN: {
                LEGACY: `/signin`,
                INIT: `/signin/init`,
                COMPLETE: `/signin/complete`,
            },
            MFA: {
                /**
                 * Since iOS 26.4, the code is no longer pushed to trusted devices automatically - it needs to be requested via a PUT request to this endpoint
                 */
                DEVICE_RESEND: `/verify/trusteddevice/securitycode`,
                DEVICE_ENTER: `/verify/trusteddevice/securitycode`,
                PHONE_RESEND: `/verify/phone`,
                PHONE_ENTER: `/verify/phone/securitycode`,
                /**
                 * Security key endpoints:
                 * SECURITY_KEY_ENTER: '/verify/security/key'
                 * Payload:
                 * \{
                 *      "challenge":"43-character-challenge",
                 *      "clientData":"[redacted]",
                 *      "signatureData":"[redacted]",
                 *      "authenticatorData":"[redacted]",
                 *      "userHandle":"[redacted]",
                 *      "credentialID":"[redacted]",
                 *      "rpId":"apple.com"
                 * \}
                 */
            },
            TRUST: `/2sv/trust`,
            /**
             * Since iOS 26.4 the backend might require a second SRP-based password proof ('escrow'), signaled through the 'X-Apple-EDP' or 'X-Apple-PDP' header on a 409 response
             */
            ESCROW: {
                INIT: `/escrow/init`,
                COMPLETE: `/escrow/complete`,
            },
        },
    },
    /**
     * Setup endpoints needed to acquire cookies and Photos URL
     */
    SETUP: {
        BASE(): string {
            return `https://setup.${Resources.network().iCloudRegionUrl()}`;
        },
        PATH: {
            ACCOUNT_LOGIN: `/setup/ws/1/accountLogin`,
            LOGOUT: `/setup/ws/1/logout`,
            REQUEST_PCS: `/setup/ws/1/requestPCS`,
        },
    },
    /**
     * Photos endpoints needed to access the photos library
     */
    PHOTOS: {
        /**
         * Base URL for photos requests is dynamic - the path is static
         */
        BASE_PATH: `/database/1/com.apple.photos.cloud/production`,
        AREAS: {
            PRIVATE: `/private`,
            SHARED: `/shared`,
        },
        PATH: {
            QUERY: `/records/query`,
            MODIFY: `/records/modify`,
            ZONES: `/changes/database`,
        },
    },
};

/**
 * The expected response format for the signin request
 * @see {@link ENDPOINTS.AUTH.PATH.SIGNIN.LEGACY}
 * @see {@link ENDPOINTS.AUTH.PATH.SIGNIN.COMPLETE}
 */
export type SigninResponse = {
    /**
     * 409 if MFA or escrow is required, 200 if the trust token was accepted
     */
    status: 200 | 409,
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
        'x-apple-session-token': string,
        /**
         * Session id used by the web frontend to track the authentication flow
         * @minLength 1
         */
        'x-apple-id-session-id'?: string,
        /**
         * Country code of the account, used during account setup
         */
        'x-apple-id-account-country'?: string,
        /**
         * Should hold the 'aasp' cookie
         * @minItems 1
         */
        'set-cookie': string[],
    }
}

/**
 * Currently supported SRP password hashing protocols
 */
export type SRPProtocol = `s2k` | `s2k_fo`;

/**
 * The expected response format for the signin init request
 * @see {@link ENDPOINTS.AUTH.PATH.SIGNIN.INIT}
 */
export type SigninInitResponse = {
    data: {
        /**
         * Number of iterations for PBKDF2 key derivation function
         */
        iteration: number,
        /**
         * Salt for the PBKDF2 key derivation function and SRP protocol
         * @minLength 1
         */
        salt: string,
        /**
         * How to encode the hashed password
         */
        protocol: SRPProtocol,
        /**
         * The servers's ephemeral public key
         * @minLength 1
         */
        b: string,
        /**
         * Some kind of session ID
         * @minLength 1
         */
        c: string
    },
    headers: {
        /**
         * Scnt token - required to keep track of auth request
         * @minLength 1
         */
        scnt: string
    }
}

/**
 * The expected response format for the escrow init request - holding the same SRP challenge as the signin init response
 * @see {@link ENDPOINTS.AUTH.PATH.ESCROW.INIT}
 */
export type EscrowInitResponse = {
    data: SigninInitResponse[`data`]
}

/**
 * The expected response format when getting auth information
 * @see {@link ENDPOINTS.AUTH.BASE}
 */
export type AuthInformationResponse = {
    data: {
        /**
         * @minItems 1
         */
        trustedPhoneNumbers: TrustedPhoneNumber[]
    }
}

/**
 * The expected response format for the MFA resend request on a trusted device
 * @see {@link ENDPOINTS.AUTH.PATH.MFA.DEVICE_RESEND}
 */
export type ResendMFADeviceResponse = {
    /**
     * Apple does not reliably return a body for this request (usually status 202 without content)
     */
    data?: {
        /**
         * Number of available trusted devices
         */
        trustedDeviceCount?: number,
        /**
         * Properties of the requested security code
         */
        securityCode?: SecurityCodeFormat,
        /**
         * Object holding information about alternative phone number verification
         */
        phoneNumberVerification?: PhoneNumberVerification
    } | ``
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
    trustedPhoneNumbers?: TrustedPhoneNumber[],
    securityCode?: SecurityCodeFormat,
}

/**
 * Object representing a trusted phone number used in MFA resend responses
 */
export type TrustedPhoneNumber = {
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
    pushMode?: string,
    obfuscatedNumber?: string,
    lastTwoDigits?: string,
    /**
     * Flag provided by the backend, that needs to be echoed when submitting a code received through this number
     */
    nonFTEU?: boolean
}

/**
 * Format of the expected security code used in MFA resend responses
 */
type SecurityCodeFormat = {
    length?: number,
    tooManyCodesSent?: boolean,
    tooManyCodesValidated?: boolean,
    securityCodeLocked?: boolean,
    securityCodeCooldown?: boolean,
    /**
     * Since iOS 26.4 a successfully validated code is acknowledged with status 409 and this flag set to true
     */
    valid?: boolean
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
        'x-apple-twosv-trust-token': string,
        /**
         * Session token to setup the account
         * @minLength 1
         */
        'x-apple-session-token': string,
    }
}

/**
 * The expected response format for the account setup request
 * @see {@link ENDPOINTS.SETUP.PATH.ACCOUNT_LOGIN}
 */
export type SetupResponse = {
    headers: {
        /**
         * Should hold the apple authentication
         * @minItems 1
         */
        'set-cookie': string[],
    }
    data: {
        dsInfo: {
            /**
             * Web access is necessary for the application
             */
            isWebAccessAllowed: true,
        }
        /**
         * Set, if the account requires a repair through the iCloud web frontend - if missing not necessary
         */
        isRepairNeeded?: boolean,
        /**
         * Set, if updated terms and conditions need to be accepted through the iCloud web frontend - if missing not necessary
         */
        termsUpdateNeeded?: boolean,
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
                 * Shows if additional PCS cookies are required - if missing not necessary
                 */
                pcsRequired?: boolean,
                /**
                 * Service needs to be active
                 */
                status: `active`
            }
        }
    }
}

/**
 * The expected response when trying to acquire PCS cookies
 */
export type PCSResponse = {
    headers: {
        /**
         * Should hold the PCS cookies
         */
        'set-cookie'?: string[],
    }
    data: {
        /**
         * Needs to be yes, otherwise this tool will not work
         */
        isWebAccessAllowed: true,
        /**
         * @minLength 1
         */
        message: string,
        /**
         * Status of the PCS request
         */
        status: `success` | `failure`
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
         * @minItems 0
         */
        zones: PhotosSetupResponseZone[]
    }
}

/**
 * Response zone object from photos setup response
 */
export type PhotosSetupResponseZone = {
    zoneID: {
        /**
         * @minLength 1
         */
        zoneName: string,
        /**
         * @minLength 1
         */
        ownerRecordName: string,
        /**
         * Fixed zone type
         */
        zoneType: `REGULAR_CUSTOM_ZONE`,
    }
    /**
     * Might be marked as deleted
     */
    deleted?: boolean
}

/**
 * A service error, as returned by the auth backend
 */
type ServiceError = {
    code?: string,
    message?: string,
}

/**
 * The expected response format for the MFA code submission
 * @see {@link ENDPOINTS.AUTH.PATH.MFA.DEVICE_ENTER}
 * @see {@link ENDPOINTS.AUTH.PATH.MFA.PHONE_ENTER}
 */
export type MFASubmitResponse = {
    /**
     * 204 (device) or 200 (phone) for an accepted code - since iOS 26.4 the backend responds with 409, the body indicates if the code was valid
     */
    status: 200 | 204 | 409,
    /**
     * Empty for status 204
     */
    data: {
        /**
         * Result of the code verification (since iOS 26.4)
         */
        securityCode?: {
            valid?: boolean,
        },
        /**
         * Errors, e.g. if the code was incorrect
         */
        service_errors?: ServiceError[],
    } | ``,
    headers: {
        /**
         * Updated session token, provided for a valid code since iOS 26.4
         * @minLength 1
         */
        'x-apple-session-token'?: string,
    },
}

/**
 * The expected response format for the escrow completion request
 * @see {@link ENDPOINTS.AUTH.PATH.ESCROW.COMPLETE}
 */
export type EscrowCompleteResponse = {
    headers: {
        /**
         * Updated session token
         * @minLength 1
         */
        'x-apple-session-token'?: string,
    },
}

/**
 * The expected response format for the logout request
 * @see {@link ENDPOINTS.SETUP.PATH.LOGOUT}
 */
export type LogoutResponse = {
    /**
     * 200 if the logout was successful, 421 if the session was no longer valid
     */
    status: 200 | 421,
}

/**
 * The expected response format for CloudKit record queries and operations
 * The records themselves are parsed defensively by the query parser
 * @see {@link ENDPOINTS.PHOTOS.PATH.QUERY}
 * @see {@link ENDPOINTS.PHOTOS.PATH.MODIFY}
 */
export type CloudKitRecordsResponse = {
    data: {
        records: any[],
        /**
         * Provided by queries, if more results are available - requests the next page when sent with the same query
         */
        continuationMarker?: string,
    },
}

/**
 * The expected response format for health check pings - a successful plain text response (healthchecks.io responds with 'OK')
 */
export type HealthCheckPingResponse = {
    /**
     * Any successful status (healthchecks.io responds with 200)
     * @minimum 200
     * @maximum 299
     */
    status: number,
    headers: {
        /**
         * The ping endpoint responds with plain text
         * @pattern ^text/plain
         */
        'content-type': string,
    },
    /**
     * The raw response body
     */
    text: string,
}