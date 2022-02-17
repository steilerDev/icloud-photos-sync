/**
 * File holding constant values for the iCloud class
 */

export const CLIENT_ID = `d39ba9916b7251055b22c7f910e2ea796ee65e98b2ddecea8f5dde8d9d1a815d`;
export const USER_AGENT = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:97.0) Gecko/20100101 Firefox/97.0`;
export const CLIENT_INFO = JSON.stringify({
    U: USER_AGENT,
    L: `en-US`,
    Z: `GMT+01:00`,
    V: `1.1`,
    F: ``,
});

/**
 * Header used for authentication
 */
export const DEFAULT_AUTH_HEADER = {
    'User-Agent': USER_AGENT,
    Accept: `application/json`,
    Connection: `keep-alive`,
    Origin: `https://idmsa.apple.com`,
    Referer: `https://idmsa.apple.com/`,
    'Accept-Encoding': `gzip, deflate, br`,
    'Content-Type': `application/json`,
    'X-Apple-Widget-Key': CLIENT_ID,
    'X-Apple-OAuth-Client-Id': CLIENT_ID,
    'X-Apple-I-FD-Client-Info': CLIENT_INFO,
    'X-Apple-OAuth-Response-Type': `code`,
    'X-Apple-OAuth-Response-Mode': `web_message`,
    'X-Apple-OAuth-Client-Type': `firstPartyAuth`,
};

export const DEFAULT_SETUP_HEADER = {
    'User-Agent': USER_AGENT,
    Accept: `application/json`,
    'Content-Type': `application/json`,
    Origin: `https://www.icloud.com`,
};

export enum AUTH_RESPONSE_HEADER {
    SESSION_TOKEN = `x-apple-session-token`,
    SCNT = `scnt`,
    TRUST_TOKEN = `x-apple-twosv-trust-token`
}

export enum EVENTS {
    MFA_REQUIRED = `mfa_req`,
    MFA_RECEIVED = `mfa_rec`,
    AUTHENTICATED = `auth`,
    SETUP_REQUIRED = `setup_req`,
    READY = `ready`,
    ERROR = `error`
}

export const AUTH_ENDPOINT = `https://idmsa.apple.com/appleauth/auth`;
export const SETUP_ENDPOINT = `https://setup.icloud.com/setup/ws/1/accountLogin`;