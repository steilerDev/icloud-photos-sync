import {buildErrorStruct, ErrorStruct} from "../error-codes.js";

const name = `WebServerError`;
const prefix = `WEB_SERVER`;

export const STARTUP_FAILED: ErrorStruct = buildErrorStruct(
    name, prefix, `STARTUP_FAILED`, `Unable to start Web server`,
);

export const NO_CODE_EXPECTED: ErrorStruct = buildErrorStruct(
    name, prefix, `NO_CODE_EXPECTED`, `No MFA code expected`,
);

export const SYNC_IN_PROGRESS: ErrorStruct = buildErrorStruct(
    name, prefix, `SYNC_IN_PROGRESS`, `Cannot perform action while sync is in progress`,
);

export const ADDR_IN_USE_ERR: ErrorStruct = buildErrorStruct(
    name, prefix, `ADDR_IN_USE`, `HTTP Server could not start, because address/port is in use`,
);

export const INSUFFICIENT_PRIVILEGES: ErrorStruct = buildErrorStruct(
    name, prefix, `INSUFFICIENT_PRIVILEGES`, `HTTP Server could not start, because user has insufficient privileges to open address/port`,
);

export const BAD_REQUEST: ErrorStruct = buildErrorStruct(
    name, prefix, `BAD_REQUEST`, `Received unexpected request to unknown endpoint`,
);

export const UNABLE_TO_READ_BODY: ErrorStruct = buildErrorStruct(
    name, prefix, `UNABLE_TO_READ_BODY`, `Unable to read request's body`
);

export const CODE_FORMAT: ErrorStruct = buildErrorStruct(
    name, prefix, `CODE_FORMAT`, `Received unexpected MFA code format, expecting 6 digits`,
);

export const RESEND_METHOD_FORMAT: ErrorStruct = buildErrorStruct(
    name, prefix, `RESEND_METHOD_FORMAT`, `Resend method does not match expected format`,
);

export const UNKNOWN_ERR: ErrorStruct = buildErrorStruct(
    name, prefix, `UNKNOWN_ERR`, `Unknown error`,
);

export const MFA_CODE_NOT_PROVIDED: ErrorStruct = buildErrorStruct(
    name, prefix, `MFA_CODE_NOT_PROVIDED`, `MFA code not provided`,
);
