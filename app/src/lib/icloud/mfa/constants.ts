/**
 * Event lifecycle of MFA Server class
 */
export enum EVENTS {
    MFA_RECEIVED = `mfa_rec`,
    MFA_RESEND = `mfa_resend`,
    MFA_NOT_PROVIDED = `mfa_not_provided`
}

/**
 * Endpoint URI of MFA Server, all expect POST requests
 */
export const ENDPOINT = {
    "CODE_INPUT": `/mfa`, // Expecting URL parameter 'code' with 6 digits
    "RESEND_CODE": `/resend_mfa`, // Expecting URL parameter 'method' (either 'device', 'sms', 'voice') and optionally 'phoneNumberId' (any number > 0)
};