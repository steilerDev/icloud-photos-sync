
import {default as Ajv} from 'ajv';
import ResourceFileSchema from "./schemas/resource-file.json" assert { type: "json" }; // eslint-disable-line
import SigninResponseSchema from "./schemas/signin-response.json" assert { type: "json" }; // eslint-disable-line
import TrustResponseSchema from "./schemas/trust-response.json" assert { type: "json" }; // eslint-disable-line
import SetupResponseSchema from "./schemas/setup-response.json" assert { type: "json" }; // eslint-disable-line
import PhotosSetupResponseSchema from "./schemas/photos-setup-response.json" assert { type: "json" }; // eslint-disable-line
import ResendMFADeviceResponseSchema from "./schemas/resend-mfa-device-response.json" assert { type: "json" }; // eslint-disable-line
import ResendMFAPhoneResponseSchema from "./schemas/resend-mfa-phone-response.json" assert { type: "json" }; // eslint-disable-line
import {ResourceFile} from "./resources.js";
import {iCPSError} from "../../app/error/error.js";
import {ErrorStruct, VALIDATOR_ERR} from "../../app/error/error-codes.js";
import {COOKIE_KEYS, PhotosSetupResponse, ResendMFADeviceResponse, ResendMFAPhoneResponse, SetupResponse, SigninResponse, TrustResponse} from "./network.js";

const AJV_CONF = {
    verbose: true,
    // Logger: ResourceManager.logger(`AjvValidator`),
};

/**
 * This class is responsible for validating 3rd party provided JSON based resources
 */
export class Validator {
    /**
     * Validator for the resource file schema
     */
    _resourceFileValidator: Ajv.ValidateFunction<ResourceFile> = new Ajv.default(AJV_CONF).compile<ResourceFile>(ResourceFileSchema);

    /**
     * Validator for the signin response schema
     */
    _signinResponseValidator: Ajv.ValidateFunction<SigninResponse> = new Ajv.default(AJV_CONF).compile<SigninResponse>(SigninResponseSchema);

    /**
     * Validator for MFA Device Response schema
     */
    _resendMFADeviceResponseValidator: Ajv.ValidateFunction<ResendMFADeviceResponse> = new Ajv.default(AJV_CONF).compile<ResendMFADeviceResponse>(ResendMFADeviceResponseSchema);

    /**
     * Validator for MFA Phone Response schema
     */
    _resendMFAPhoneResponseValidator: Ajv.ValidateFunction<ResendMFAPhoneResponse> = new Ajv.default(AJV_CONF).compile<ResendMFAPhoneResponse>(ResendMFAPhoneResponseSchema);

    /**
     * Validator for the trust response schema
     */
    _trustResponseValidator: Ajv.ValidateFunction<TrustResponse> = new Ajv.default(AJV_CONF).compile<TrustResponse>(TrustResponseSchema);

    /**
     * Validator for the iCloud setup response schema
     */
    _setupResponseValidator: Ajv.ValidateFunction<SetupResponse> = new Ajv.default(AJV_CONF).compile<SetupResponse>(SetupResponseSchema);

    /**
     * Validator for the iCloud photos setup response schema
     */
    _photosSetupResponseValidator: Ajv.ValidateFunction<PhotosSetupResponse> = new Ajv.default(AJV_CONF).compile<PhotosSetupResponse>(PhotosSetupResponseSchema);

    /**
     * Generic validation function
     * @param validator - Uses the pre-configured ajv validator to validate the data
     * @param errorStruct - The error struct to throw, in case validation fails
     * @param data - The data to validate
     * @param additionalValidations - Optional additional validation functions
     * @returns The validated data
     * @throws The error struct with context and message if validation fails
     */
    validate<T>(validator: Ajv.ValidateFunction<T>, errorStruct: ErrorStruct, data: unknown, ...additionalValidations: ((arg0: T) => boolean)[]): T {
        if (validator(data) && additionalValidations.every(validation => validation(data))) {
            return data;
        }

        if (validator.errors) {
            throw new iCPSError(errorStruct)
                .addMessage(`${validator.errors![0].message} (${validator.errors![0].instancePath})`)
                .addContext(`data`, data);
        }

        throw new iCPSError(errorStruct)
            .addMessage(`Additional validations failed`)
            .addContext(`data`, data);
    }

    /**
     * Validates the provided data string against the resource file schema
     * @param data - The data to validate
     * @throws An error if the data cannot be parsed
     * @returns The parsed ResourceFile data
     */
    validateResourceFile(data: unknown): ResourceFile {
        return this.validate(
            this._resourceFileValidator,
            VALIDATOR_ERR.RESOURCE_FILE,
            data,
        );
    }

    /**
     * Validates the response from the signin request
     * @param data - The data to validate
     * @returns A validated SigninResponse object
     * @throws An error if the data cannot be validated
     */
    validateSigninResponse(data: unknown): SigninResponse {
        return this.validate(
            this._signinResponseValidator,
            VALIDATOR_ERR.SIGNIN_RESPONSE,
            data,
            (data: SigninResponse) => data.headers[`set-cookie`].filter(cookieString => cookieString.startsWith(COOKIE_KEYS.AASP)).length <= 1, // AASP cookie is optional
        );
    }

    validateResendMFADeviceResponse(data: unknown): ResendMFADeviceResponse {
        return this.validate(
            this._resendMFADeviceResponseValidator,
            VALIDATOR_ERR.RESEND_MFA_DEVICE_RESPONSE,
            data,
        );
    }

    validateResendMFAPhoneResponse(data: unknown): ResendMFAPhoneResponse {
        return this.validate(
            this._resendMFAPhoneResponseValidator,
            VALIDATOR_ERR.RESEND_MFA_PHONE_RESPONSE,
            data,
        );
    }

    /**
     * Validates the response from the trust request
     * @param data - The data to validate
     * @returns A validated TrustResponse object
     * @throws An error if the data cannot be validated
     */
    validateTrustResponse(data: unknown): TrustResponse {
        return this.validate(
            this._trustResponseValidator,
            VALIDATOR_ERR.TRUST_RESPONSE,
            data,
        );
    }

    /**
     * Validates the response from the setup request
     * @param data - The data to validate
     * @returns A validated SetupResponse object
     * @throws An error if the data cannot be validated
     */
    validateSetupResponse(data: unknown): SetupResponse {
        return this.validate(
            this._setupResponseValidator,
            VALIDATOR_ERR.SETUP_RESPONSE,
            data,
            (data: SetupResponse) => data.headers[`set-cookie`].filter(cookieString => cookieString.startsWith(COOKIE_KEYS.X_APPLE)).length > 1, // Making sure there are authentication cookies
        );
    }

    /**
     * Validates the response from the photos setup request
     * @param data - The data to validate
     * @returns A validated PhotosSetupResponse object
     * @throws An error if the data cannot be validated
     */
    validatePhotosSetupResponse(data: unknown): PhotosSetupResponse {
        return this.validate(
            this._photosSetupResponseValidator,
            VALIDATOR_ERR.PHOTOS_SETUP_RESPONSE,
            data,
        );
    }
}