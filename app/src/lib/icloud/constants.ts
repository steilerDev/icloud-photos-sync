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
    ERROR = `error`, // Error - will reject 'ready' promise and be handled on top level
    TOKEN = `token` // TokenString - only fired if needed to be picked up
}