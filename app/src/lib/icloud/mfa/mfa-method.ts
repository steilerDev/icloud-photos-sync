import {ENDPOINTS} from '../../resources/network-types.js';

/**
 * Indicating, which MFA method should be used
 */
enum MFAMethodType {
    DEVICE = 1,
    SMS = 2,
    VOICE = 3
}

/**
 * A class to hold the status of the currently executed MFA method
 */
export class MFAMethod {
    /**
     * The type of MFA method used
     */
    type!: MFAMethodType;
    /**
     * The id of the phone number used - only set for sms and voice methods
     */
    numberId?: number;
    /**
     * The backend's 'nonFTEU' flag of the phone number used - only set for sms and voice methods, if provided by the backend
     */
    nonFTEU?: boolean;

    /**
     * Creates a new MFAMethod object to hold status information
     * @param mfaMethod - The method to be used. Defaults to `device`
     * @param numberId - The number id used for sending sms or voice codes. Defaults to 1
     * @param nonFTEU - The backend's 'nonFTEU' flag of the phone number used for sending sms or voice codes
     */
    constructor(mfaMethod: `device` | `voice` | `sms` = `device`, numberId: number = 1, nonFTEU?: boolean) {
        this.update(mfaMethod, numberId, nonFTEU);
    }

    /**
     * Updates this object to the given method and number id
     * @param mfaMethod - The method to be used. Defaults to `device`
     * @param numberId - The number id used for sending sms or voice codes. Defaults to 1
     * @param nonFTEU - The backend's 'nonFTEU' flag of the phone number used for sending sms or voice codes
     */
    update(mfaMethod: `device` | `voice` | `sms` | string = `device`, numberId: number = 1, nonFTEU?: boolean) {
        switch (mfaMethod) {
        case `sms`:
            this.type = MFAMethodType.SMS;
            this.numberId = numberId;
            this.nonFTEU = nonFTEU;
            break;
        case `voice`:
            this.type = MFAMethodType.VOICE;
            this.numberId = numberId;
            this.nonFTEU = nonFTEU;
            break;
        default:
        case `device`:
            this.type = MFAMethodType.DEVICE;
            this.numberId = undefined;
            this.nonFTEU = undefined;
            break;
        }
    }

    /**
     *
     * @returns True, if the 'device' method is active
     */
    get isDevice(): boolean {
        return this.type === MFAMethodType.DEVICE;
    }

    /**
     *
     * @returns True, if the 'sms' method is active
     */
    get isSMS(): boolean {
        return this.type === MFAMethodType.SMS;
    }

    /**
     *
     * @returns True, if the 'voice' method is active
     */
    get isVoice(): boolean {
        return this.type === MFAMethodType.VOICE;
    }

    /**
     *
     * @returns A string representation of this object
     */
    toString(): string {
        switch (this.type) {
        case MFAMethodType.SMS:
            return `'SMS' (Number ID: ${this.numberId})`;
        case MFAMethodType.VOICE:
            return `'Voice' (Number ID: ${this.numberId})`;
        default:
        case MFAMethodType.DEVICE:
            return `'Device'`;
        }
    }

    /**
     *
     * @returns The appropriate URL endpoint for resending the code, given the currently selected MFA Method
     */
    getResendURL(): string {
        switch (this.type) {
        case MFAMethodType.VOICE:
        case MFAMethodType.SMS:
            return ENDPOINTS.AUTH.BASE + ENDPOINTS.AUTH.PATH.MFA.PHONE_RESEND;
        default:
        case MFAMethodType.DEVICE:
            return ENDPOINTS.AUTH.BASE + ENDPOINTS.AUTH.PATH.MFA.DEVICE_RESEND;
        }
    }

    /**
     *
     * @returns The appropriate payload for resending the code, given the currently selected MFA Method
     */
    getResendPayload(): any {
        switch (this.type) {
        case MFAMethodType.VOICE:
            return {
                phoneNumber: this.phoneNumberPayload,
                mode: `voice`,
            };
        case MFAMethodType.SMS:
            return {
                phoneNumber: this.phoneNumberPayload,
                mode: `sms`,
            };
        default:
        case MFAMethodType.DEVICE:
            return undefined;
        }
    }

    /**
     * Checks if the status code matches our expectation for a successful resend
     * @param status - The status code for the response received from the backend
     * @returns True, if the response was successful, based on the currently selected MFA Method
     */
    resendSuccessful(status: number): boolean {
        switch (this.type) {
        case MFAMethodType.VOICE:
        case MFAMethodType.SMS:
            return status === 200;
        default:
        case MFAMethodType.DEVICE:
            return status === 202 || status === 200;
        }
    }

    /**
     * @param mfa - The MFA code, that should be send for validation
     * @returns The appropriate payload for entering the code, given the currently selected MFA Method
     */
    getEnterPayload(mfa: string): any {
        switch (this.type) {
        case MFAMethodType.VOICE:
            return {
                securityCode: {
                    code: `${mfa}`,
                },
                phoneNumber: this.phoneNumberPayload,
                mode: `voice`,
            };
        case MFAMethodType.SMS:
            return {
                securityCode: {
                    code: `${mfa}`,
                },
                phoneNumber: this.phoneNumberPayload,
                mode: `sms`,
            };
        default:
        case MFAMethodType.DEVICE:
            return {
                securityCode: {
                    code: `${mfa}`,
                },
            };
        }
    }

    /**
     *
     * @returns The appropriate URL endpoint for entering the code, given the currently selected MFA Method
     */
    getEnterURL(): string {
        switch (this.type) {
        case MFAMethodType.VOICE:
        case MFAMethodType.SMS:
            return ENDPOINTS.AUTH.BASE + ENDPOINTS.AUTH.PATH.MFA.PHONE_ENTER;
        default:
        case MFAMethodType.DEVICE:
            return ENDPOINTS.AUTH.BASE + ENDPOINTS.AUTH.PATH.MFA.DEVICE_ENTER;
        }
    }

    /**
     * The phone number object used in the payload when requesting or entering a code via sms or voice
     */
    private get phoneNumberPayload(): {id?: number, nonFTEU?: boolean} {
        return this.nonFTEU === undefined
            ? {id: this.numberId}
            : {id: this.numberId, nonFTEU: this.nonFTEU};
    }

    /**
     * Checks if the status code matches our expectation for a successful enter
     * Since iOS 26.4 the backend acknowledges a valid code with status 409 - the response body needs to be checked by the caller in this case
     * @param status - The status code for the response received from the backend
     * @returns True, if the response was successful (or potentially successful), based on the currently selected MFA Method
     */
    enterSuccessful(status: number): boolean {
        if (status === 409) {
            return true;
        }

        switch (this.type) {
        case MFAMethodType.VOICE:
        case MFAMethodType.SMS:
            return status === 200;
        default:
        case MFAMethodType.DEVICE:
            return status === 204;
        }
    }
}