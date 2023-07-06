import {buildErrorStruct, ErrorStruct} from "../error-codes.js";

const name = `MFAError`;
const prefix = `MFA`;

export const FAIL_ON_MFA: ErrorStruct = buildErrorStruct(
    name, prefix, `FAIL_ON_MFA`, `MFA code required, failing due to failOnMfa flag`,
);

export const STARTUP_FAILED: ErrorStruct = buildErrorStruct(
    name, prefix, `STARTUP_FAILED`, `Unable to start MFA server`,
);

export const SERVER_ERR: ErrorStruct = buildErrorStruct(
    name, prefix, `SERVER_ERR`, `HTTP Server Error`,
);

export const ADDR_IN_USE_ERR: ErrorStruct = buildErrorStruct(
    name, prefix, `ADDR_IN_USE`, `HTTP Server could not start, because address/port is in use`,
);

export const RESEND_REQUEST_FAILED: ErrorStruct = buildErrorStruct(
    name, prefix, `RESEND_REQUEST_FAILED`, `Resending request failed`,
);

export const RESEND_FAILED: ErrorStruct = buildErrorStruct(
    name, prefix, `RESEND_FAILED`, `Unable to request new MFA code`,
);

export const SUBMIT_FAILED: ErrorStruct = buildErrorStruct(
    name, prefix, `SUBMIT_FAILED`, `Unable to submit MFA code`,
);

export const CODE_FORMAT: ErrorStruct = buildErrorStruct(
    name, prefix, `CODE_FORMAT`, `Received unexpected MFA code format, expecting 6 digits`,
);

export const RESEND_METHOD_FORMAT: ErrorStruct = buildErrorStruct(
    name, prefix, `RESEND_METHOD_FORMAT`, `Resend method does not match expected format`,
);

export const ROUTE_NOT_FOUND: ErrorStruct = buildErrorStruct(
    name, prefix, `ROUTE_NOT_FOUND`, `Received request to unknown endpoint`,
);

export const METHOD_NOT_FOUND: ErrorStruct = buildErrorStruct(
    name, prefix, `METHOD_NOT_FOUND`, `Received request with unsupported method`,
);

export const NO_RESPONSE: ErrorStruct = buildErrorStruct(
    name, prefix, `NO_RESPONSE`, `No response received`,
);

export const TIMEOUT: ErrorStruct = buildErrorStruct(
    name, prefix, `TIMEOUT`, `Timeout`,
);

export const PRECONDITION_FAILED: ErrorStruct = buildErrorStruct(
    name, prefix, `PRECONDITION_FAILED`, `Precondition Failed (412) with no response`,
);

export const NO_TRUSTED_NUMBERS: ErrorStruct = buildErrorStruct(
    name, prefix, `NO_TRUSTED_NUMBERS`, `No trusted phone numbers registered`,
);

export const TRUSTED_NUMBER_NOT_AVAILABLE: ErrorStruct = buildErrorStruct(
    name, prefix, `TRUSTED_NUMBER_NOT_AVAILABLE`, `Selected Phone Number ID does not exist.`,
);

export const UNKNOWN_RESEND_ERROR: ErrorStruct = buildErrorStruct(
    name, prefix, `UNKNOWN_RESEND_ERROR`, `Unknown error, while trying to resend MFA code`,
);