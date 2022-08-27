/**
 * File holding constant values for the iCloud class
 */

/**
 * Hard coded client id, extracted from previous requests
 */
export const CLIENT_ID = `d39ba9916b7251055b22c7f910e2ea796ee65e98b2ddecea8f5dde8d9d1a815d`;
/**
 * User Agent this CLI is using. Emulating a Firefox Browser
 */
export const USER_AGENT = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:97.0) Gecko/20100101 Firefox/97.0`;
/**
 * Client information shared with the iCloud backend
 */
export const CLIENT_INFO = JSON.stringify({
    "U": USER_AGENT,
    "L": `en-US`,
    "Z": `GMT+01:00`,
    "V": `1.1`,
    "F": ``,
});

/**
 * Header used for authentication flow
 */
export const DEFAULT_AUTH_HEADER = {
    'User-Agent': USER_AGENT,
    "Accept": `application/json`,
    "Connection": `keep-alive`,
    "Origin": `https://idmsa.apple.com`,
    "Referer": `https://idmsa.apple.com/`,
    'Accept-Encoding': `gzip, deflate, br`,
    'Content-Type': `application/json`,
    'X-Apple-Widget-Key': CLIENT_ID,
    'X-Apple-OAuth-Client-Id': CLIENT_ID,
    'X-Apple-I-FD-Client-Info': CLIENT_INFO,
    'X-Apple-OAuth-Response-Type': `code`,
    'X-Apple-OAuth-Response-Mode': `web_message`,
    'X-Apple-OAuth-Client-Type': `firstPartyAuth`,
};

/**
 * Default header for most iCloud requests
 */
export const DEFAULT_HEADER = {
    'User-Agent': USER_AGENT,
    "Accept": `application/json`,
    'Content-Type': `application/json`,
    "Origin": `https://www.icloud.com`,
};

/**
 * Values extracted from auth response headers
 */
export enum AUTH_RESPONSE_HEADER {
    SESSION_TOKEN = `X-Apple-Session-Token`,
    SCNT = `scnt`,
    TRUST_TOKEN = `X-Apple-TwoSV-Trust-Token`,
    AASP_COOKIE = `aasp`
}

/**
 * Events lifecycle of the iCloud class
 */
export enum EVENTS {
    AUTHENTICATION_STARTED = `auth_started`,
    MFA_REQUIRED = `mfa_req`, // Will provide port as arg
    MFA_RECEIVED = `mfa_rec`,
    AUTHENTICATED = `auth`,
    TRUSTED = `trusted`,
    ACCOUNT_READY = `account_ready`,
    READY = `ready`,
    ERROR = `error`
}

/**
 * List of endpoints, required by the iCloud class
 */
export const ENPOINT = {
    "AUTH": {
        "BASE": `https://idmsa.apple.com/appleauth/auth`,
        "PATH": {
            "SIGNIN": `/signin`,
            "MFA": {
                "DEVICE": `/verify/trusteddevice`,
                "PHONE": `/verify/phone`,
            },
            "TRUST": `/2sv/trust`,
        },
    },
    "SETUP": {
        "BASE": `https://setup.icloud.com`,
        "PATH": {
            "ACCOUNT": `/setup/ws/1/accountLogin`,
        },
    },
};

/**
 * Pre-composing URLs, required by iCloud class
 */
export const URL = {
    "SIGNIN": `${ENPOINT.AUTH.BASE}${ENPOINT.AUTH.PATH.SIGNIN}`,
    "MFA_DEVICE": `${ENPOINT.AUTH.BASE}${ENPOINT.AUTH.PATH.MFA.DEVICE}/securitycode`, // Maybe??
    "MFA_DEVICE_ENTER": `${ENPOINT.AUTH.BASE}${ENPOINT.AUTH.PATH.MFA.DEVICE}/securitycode`,
    "MFA_PHONE": `${ENPOINT.AUTH.BASE}${ENPOINT.AUTH.PATH.MFA.PHONE}`,
    "MFA_PHONE_ENTER": `${ENPOINT.AUTH.BASE}${ENPOINT.AUTH.PATH.MFA.PHONE}/securitycode`,
    "TRUST": `${ENPOINT.AUTH.BASE}${ENPOINT.AUTH.PATH.TRUST}`,
    "SETUP": `${ENPOINT.SETUP.BASE}${ENPOINT.SETUP.PATH.ACCOUNT}`,
};

/**
 * Indicating, which MFA method should be used
 */
export enum MFAMethod {
    DEVICE = 1,
    SMS = 2,
    VOICE = 3
}

/**
 * Filename of persistent trust token file
 */
export const TRUST_TOKEN_FILE_NAME = `.trust-token.icloud`;
export const TRUST_TOKEN_FILE_ENCODING = `utf8`;