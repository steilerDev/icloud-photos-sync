
import * as Ajv from 'ajv';
import {ErrorStruct, ICLOUD_PHOTOS_ERR, VALIDATOR_ERR} from "../../app/error/error-codes.js";
import {iCPSError} from "../../app/error/error.js";
import {HttpResponse, ResponseValidator} from "./http-client.js";
import {AuthInformationResponse, CloudKitRecordsResponse, COOKIE_KEYS, EscrowCompleteResponse, EscrowInitResponse, HealthCheckPingResponse, LogoutResponse, MFASubmitResponse, PCSResponse, PhotosSetupResponse, ResendMFADeviceResponse, ResendMFAPhoneResponse, SetupResponse, SigninInitResponse, SigninResponse, TrustResponse} from "./network-types.js";
import {ResourceFile} from "./resource-types.js";
import {PushSubscription} from './web-server-types.js';
import PCSResponseSchema from "./schemas/pcs-response.json" with { type: "json" };
import PhotosSetupResponseSchema from "./schemas/photos-setup-response.json" with { type: "json" };
import AuthInformationResponseSchema from "./schemas/auth-information-response.json" with { type: "json" };
import ResendMFADeviceResponseSchema from "./schemas/resend-mfa-device-response.json" with { type: "json" };
import ResendMFAPhoneResponseSchema from "./schemas/resend-mfa-phone-response.json" with { type: "json" };
import ResourceFileSchema from "./schemas/resource-file.json" with { type: "json" };
import PushSubscriptionSchema from "./schemas/push-subscription.json" with { type: "json" };
import SetupResponseSchema from "./schemas/setup-response.json" with { type: "json" };
import SigninInitResponseSchema from "./schemas/signin-init-response.json" with { type: "json" };
import EscrowInitResponseSchema from "./schemas/escrow-init-response.json" with { type: "json" };
import SigninResponseSchema from "./schemas/signin-response.json" with { type: "json" };
import TrustResponseSchema from "./schemas/trust-response.json" with { type: "json" };
import MFASubmitResponseSchema from "./schemas/mfa-submit-response.json" with { type: "json" };
import EscrowCompleteResponseSchema from "./schemas/escrow-complete-response.json" with { type: "json" };
import LogoutResponseSchema from "./schemas/logout-response.json" with { type: "json" };
import CloudKitRecordsResponseSchema from "./schemas/cloud-kit-records-response.json" with { type: "json" };
import HealthCheckPingResponseSchema from "./schemas/health-check-ping-response.json" with { type: "json" };

/**
 * Common configuration for the schema validator
 */
const AJV_CONF = {
    verbose: true,
    // Logger: ResourceManager.logger(`AjvValidator`),
};

/**
 * Marks a function as response validator - only used within this module, so every response validator passed to a request is backed by a JSON schema
 * @param validate - The validation function, expected to validate the response (or the value derived from it) against a JSON schema
 * @returns The response validator
 */
function responseValidator<T>(validate: (response: HttpResponse) => T): ResponseValidator<T> {
    return validate as ResponseValidator<T>;
}

/**
 * This class is responsible for validating 3rd party provided JSON based resources using previously compiled JSON schemas
 */
export class Validator {
    /**
     * Validator for the resource file schema
     */
    _resourceFileValidator: Ajv.ValidateFunction<ResourceFile> = new Ajv.Ajv(AJV_CONF).compile<ResourceFile>(ResourceFileSchema);

    /**
     * Validator for the push subscription web server request
     */
    _pushSubscriptionValidator: Ajv.ValidateFunction<PushSubscription> = new Ajv.Ajv(AJV_CONF).compile<PushSubscription>(PushSubscriptionSchema);

    /**
     * Validator for the signin init response schema
     */
    _signinInitResponseValidator: Ajv.ValidateFunction<SigninInitResponse> = new Ajv.Ajv(AJV_CONF).compile<SigninInitResponse>(SigninInitResponseSchema);

    /**
     * Validator for the escrow init response schema
     */
    _escrowInitResponseValidator: Ajv.ValidateFunction<EscrowInitResponse> = new Ajv.Ajv(AJV_CONF).compile<EscrowInitResponse>(EscrowInitResponseSchema);

    /**
     * Validator for the signin response schema
     */
    _signinResponseValidator: Ajv.ValidateFunction<SigninResponse> = new Ajv.Ajv(AJV_CONF).compile<SigninResponse>(SigninResponseSchema);

    /**
     * Validator for the auth information response schema
     */
    _authInformationResponseValidator: Ajv.ValidateFunction<AuthInformationResponse> = new Ajv.Ajv(AJV_CONF).compile<AuthInformationResponse>(AuthInformationResponseSchema);

    /**
     * Validator for MFA Device Response schema
     */
    _resendMFADeviceResponseValidator: Ajv.ValidateFunction<ResendMFADeviceResponse> = new Ajv.Ajv(AJV_CONF).compile<ResendMFADeviceResponse>(ResendMFADeviceResponseSchema);

    /**
     * Validator for MFA Phone Response schema
     */
    _resendMFAPhoneResponseValidator: Ajv.ValidateFunction<ResendMFAPhoneResponse> = new Ajv.Ajv(AJV_CONF).compile<ResendMFAPhoneResponse>(ResendMFAPhoneResponseSchema);

    /**
     * Validator for the trust response schema
     */
    _trustResponseValidator: Ajv.ValidateFunction<TrustResponse> = new Ajv.Ajv(AJV_CONF).compile<TrustResponse>(TrustResponseSchema);

    /**
     * Validator for the iCloud setup response schema
     */
    _setupResponseValidator: Ajv.ValidateFunction<SetupResponse> = new Ajv.Ajv(AJV_CONF).compile<SetupResponse>(SetupResponseSchema);

    /**
     * Validator for the PCS response schema
     */
    _pcsResponseValidator: Ajv.ValidateFunction<PCSResponse> = new Ajv.Ajv(AJV_CONF).compile<PCSResponse>(PCSResponseSchema);

    /**
     * Validator for the iCloud photos setup response schema
     */
    _photosSetupResponseValidator: Ajv.ValidateFunction<PhotosSetupResponse> = new Ajv.Ajv(AJV_CONF).compile<PhotosSetupResponse>(PhotosSetupResponseSchema);

    /**
     * Validator for the MFA submit response schema
     */
    _mfaSubmitResponseValidator: Ajv.ValidateFunction<MFASubmitResponse> = new Ajv.Ajv(AJV_CONF).compile<MFASubmitResponse>(MFASubmitResponseSchema);

    /**
     * Validator for the escrow complete response schema
     */
    _escrowCompleteResponseValidator: Ajv.ValidateFunction<EscrowCompleteResponse> = new Ajv.Ajv(AJV_CONF).compile<EscrowCompleteResponse>(EscrowCompleteResponseSchema);

    /**
     * Validator for the logout response schema
     */
    _logoutResponseValidator: Ajv.ValidateFunction<LogoutResponse> = new Ajv.Ajv(AJV_CONF).compile<LogoutResponse>(LogoutResponseSchema);

    /**
     * Validator for the CloudKit records response schema (queries and operations)
     */
    _cloudKitRecordsResponseValidator: Ajv.ValidateFunction<CloudKitRecordsResponse> = new Ajv.Ajv(AJV_CONF).compile<CloudKitRecordsResponse>(CloudKitRecordsResponseSchema);

    /**
     * Validator for the health check ping response schema
     */
    _healthCheckPingResponseValidator: Ajv.ValidateFunction<HealthCheckPingResponse> = new Ajv.Ajv(AJV_CONF).compile<HealthCheckPingResponse>(HealthCheckPingResponseSchema);

    /**
     * Response validators, to be passed to network requests - every request needs to validate its response against a JSON schema
     * The validators delegate to the respective validate function at the time of validation
     */
    response = {
        signinInit: responseValidator(response => this.validateSigninInitResponse(response)),
        signin: responseValidator(response => this.validateSigninResponse(response)),
        escrowInit: responseValidator(response => this.validateEscrowInitResponse(response)),
        escrowComplete: responseValidator(response => this.validateEscrowCompleteResponse(response)),
        /**
         * The auth information is either provided as JSON or embedded in HTML, therefore it needs to be extracted before validation
         * @param extract - Extracts the auth information from the response
         * @returns The response validator
         */
        authInformation: (extract: (response: HttpResponse) => unknown) => responseValidator(response => this.validateAuthInformationResponse(extract(response))),
        resendMFADevice: responseValidator(response => this.validateResendMFADeviceResponse(response)),
        resendMFAPhone: responseValidator(response => this.validateResendMFAPhoneResponse(response)),
        mfaSubmit: responseValidator(response => this.validateMFASubmitResponse(response)),
        trust: responseValidator(response => this.validateTrustResponse(response)),
        setup: responseValidator(response => this.validateSetupResponse(response)),
        pcs: responseValidator(response => this.validatePCSResponse(response)),
        logout: responseValidator(response => this.validateLogoutResponse(response)),
        photosSetup: responseValidator(response => this.validatePhotosSetupResponse(response)),
        query: responseValidator(response => this.validateQueryResponse(response)),
        operation: responseValidator(response => this.validateOperationResponse(response)),
        healthCheckPing: responseValidator(response => this.validateHealthCheckPingResponse(response)),
    };

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
     * Validates the provided data string against the push subscription schema
     * @param data - The data to validate
     * @throws An error if the data cannot be parsed
     * @returns The parsed ResourceFile data
     */
    validatePushSubscription(data: unknown): PushSubscription {
        return this.validate(
            this._pushSubscriptionValidator,
            VALIDATOR_ERR.PUSH_SUBSCRIPTION,
            data,
        );
    }

    /**
     * Validates the response from the signin init request
     * @param data - The data to validate
     * @returns A validated SigninInitResponse object
     * @throws An error if the data cannot be validated
     */
    validateSigninInitResponse(data: unknown): SigninInitResponse {
        return this.validate(
            this._signinInitResponseValidator,
            VALIDATOR_ERR.SIGNIN_INIT_RESPONSE,
            data,
        );
    }

    /**
     * Validates the response from the escrow init request
     * @param data - The data to validate
     * @returns A validated EscrowInitResponse object
     * @throws An error if the data cannot be validated
     */
    validateEscrowInitResponse(data: unknown): EscrowInitResponse {
        return this.validate(
            this._escrowInitResponseValidator,
            VALIDATOR_ERR.ESCROW_INIT_RESPONSE,
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

    /**
     * Validates the response from the auth information request
     * @param data - The data to validate
     * @returns A validated SigninResponse object
     * @throws An error if the data cannot be validated
     */
    validateAuthInformationResponse(data: unknown): AuthInformationResponse {
        return this.validate(
            this._authInformationResponseValidator,
            VALIDATOR_ERR.AUTH_INFORMATION_RESPONSE,
            data
        );
    }

    /**
     * Validates the response from resending the MFA code via a device
     * @param data - The data to validate
     * @returns A validated ResendMFADeviceResponse object
     * @throws An error if the data cannot be validated
     */
    validateResendMFADeviceResponse(data: unknown): ResendMFADeviceResponse {
        return this.validate(
            this._resendMFADeviceResponseValidator,
            VALIDATOR_ERR.RESEND_MFA_DEVICE_RESPONSE,
            data,
        );
    }

    /**
     * Validates the response from resending the MFA code via a phone
     * @param data - The data to validate
     * @returns A validated ResendMFAPhoneResponse object
     * @throws An error if the data cannot be validated
     */
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
     * Validates the response from the PCS acquisition request
     * @param data - The data to validate
     * @returns A validated PCSResponse object
     * @throws An error if the data cannot be validated
     */
    validatePCSResponse(data: unknown): PCSResponse {
        return this.validate(
            this._pcsResponseValidator,
            VALIDATOR_ERR.PCS_RESPONSE,
            data,
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

    /**
     * Validates the response from the MFA code submission
     * @param data - The data to validate
     * @returns A validated MFASubmitResponse object
     * @throws An error if the data cannot be validated
     */
    validateMFASubmitResponse(data: unknown): MFASubmitResponse {
        return this.validate(
            this._mfaSubmitResponseValidator,
            VALIDATOR_ERR.MFA_SUBMIT_RESPONSE,
            data,
        );
    }

    /**
     * Validates the response from the escrow completion request
     * @param data - The data to validate
     * @returns A validated EscrowCompleteResponse object
     * @throws An error if the data cannot be validated
     */
    validateEscrowCompleteResponse(data: unknown): EscrowCompleteResponse {
        return this.validate(
            this._escrowCompleteResponseValidator,
            VALIDATOR_ERR.ESCROW_COMPLETE_RESPONSE,
            data,
        );
    }

    /**
     * Validates the response from the logout request
     * @param data - The data to validate
     * @returns A validated LogoutResponse object
     * @throws An error if the data cannot be validated
     */
    validateLogoutResponse(data: unknown): LogoutResponse {
        return this.validate(
            this._logoutResponseValidator,
            VALIDATOR_ERR.LOGOUT_RESPONSE,
            data,
        );
    }

    /**
     * Validates the response from a CloudKit query - the records themselves are parsed defensively by the query parser
     * @param data - The data to validate
     * @returns A validated CloudKitRecordsResponse object
     * @throws An error if the data cannot be validated
     */
    validateQueryResponse(data: unknown): CloudKitRecordsResponse {
        return this.validate(
            this._cloudKitRecordsResponseValidator,
            ICLOUD_PHOTOS_ERR.UNEXPECTED_QUERY_RESPONSE,
            data,
        );
    }

    /**
     * Validates the response from a CloudKit operation - the records themselves are parsed defensively by the query parser
     * @param data - The data to validate
     * @returns A validated CloudKitRecordsResponse object
     * @throws An error if the data cannot be validated
     */
    validateOperationResponse(data: unknown): CloudKitRecordsResponse {
        return this.validate(
            this._cloudKitRecordsResponseValidator,
            ICLOUD_PHOTOS_ERR.UNEXPECTED_OPERATIONS_RESPONSE,
            data,
        );
    }

    /**
     * Validates the response from a health check ping
     * @param data - The data to validate
     * @returns A validated HealthCheckPingResponse object
     * @throws An error if the data cannot be validated
     */
    validateHealthCheckPingResponse(data: unknown): HealthCheckPingResponse {
        return this.validate(
            this._healthCheckPingResponseValidator,
            VALIDATOR_ERR.HEALTH_CHECK_PING_RESPONSE,
            data,
        );
    }
}
