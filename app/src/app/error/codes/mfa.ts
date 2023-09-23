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

export const SERVER_TIMEOUT: ErrorStruct = buildErrorStruct(
    name, prefix, `TIMEOUT`, `MFA server timeout (code needs to be provided within 10 minutes)`,
);

export const ADDR_IN_USE_ERR: ErrorStruct = buildErrorStruct(
    name, prefix, `ADDR_IN_USE`, `HTTP Server could not start, because address/port is in use`,
);

export const INSUFFICIENT_PRIVILEGES: ErrorStruct = buildErrorStruct(
    name, prefix, `ADDR_IN_USE`, `HTTP Server could not start, because user has insufficient privileges to open address/port`,
);

export const SUBMIT_FAILED: ErrorStruct = buildErrorStruct(
    name, prefix, `SUBMIT_FAILED`, `Unable to submit MFA code`,
);

export const RESEND_FAILED: ErrorStruct = buildErrorStruct(
    name, prefix, `RESEND_FAILED`, `Unable to resend MFA code`,
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