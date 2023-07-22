/**
 * Event lifecycle of MFA Server class
 */
export enum EVENTS {
    MFA_RECEIVED = `mfa_rec`,
    MFA_RESEND = `mfa_resend`,
    MFA_NOT_PROVIDED = `mfa_not_provided`
}