
import {buildErrorStruct, ErrorStruct} from "../error-codes.js";

const name = `ValidatorError`;
const prefix = `VALIDATOR`;

export const RESOURCE_FILE: ErrorStruct = buildErrorStruct(
    name, prefix, `RESOURCE_FILE`, `Unable to parse and validate resource file`,
);

export const SIGNIN_RESPONSE: ErrorStruct = buildErrorStruct(
    name, prefix, `SIGNIN_RESPONSE`, `Unable to parse and validate signin response`,
);

export const TRUST_RESPONSE: ErrorStruct = buildErrorStruct(
    name, prefix, `TRUST_RESPONSE`, `Unable to parse and validate trust response`,
);

export const SETUP_RESPONSE: ErrorStruct = buildErrorStruct(
    name, prefix, `SETUP_RESPONSE`, `Unable to parse and validate setup response`,
);

export const PHOTOS_SETUP_RESPONSE: ErrorStruct = buildErrorStruct(
    name, prefix, `PHOTOS_SETUP_RESPONSE`, `Unable to parse and validate photos setup response`,
);

export const RESEND_MFA_PHONE_RESPONSE: ErrorStruct = buildErrorStruct(
    name, prefix, `RESEND_MFA_PHONE_RESPONSE`, `Unable to parse and validate resend MFA phone response`,
);

export const RESEND_MFA_DEVICE_RESPONSE: ErrorStruct = buildErrorStruct(
    name, prefix, `RESEND_MFA_DEVICE_RESPONSE`, `Unable to parse and validate resend MFA device response`,
);