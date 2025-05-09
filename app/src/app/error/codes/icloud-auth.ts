import {buildErrorStruct, ErrorStruct} from "../error-codes.js";

const name = `iCloudAuthError`;
const prefix = `AUTH`;

export const FAILED: ErrorStruct = buildErrorStruct(
    name, prefix, `FAILED`, `iCloud Authentication failed`,
);

export const UNEXPECTED_RESPONSE: ErrorStruct = buildErrorStruct(
    name, prefix, `UNEXPECTED_RESPONSE`, `Unexpected HTTP response`,
);

export const UNKNOWN: ErrorStruct = buildErrorStruct(
    name, prefix, `UNKNOWN`, `Received unknown error during authentication`,
);

export const UNAUTHORIZED: ErrorStruct = buildErrorStruct(
    name, prefix, `UNAUTHORIZED`, `Username/Password does not seem to match`,
);

export const FORBIDDEN: ErrorStruct = buildErrorStruct(
    name, prefix, `FORBIDDEN`, `Username does not seem to exist`,
);

export const PRECONDITION_FAILED: ErrorStruct = buildErrorStruct(
    name, prefix, `PRECONDITION_FAILED`, `iCloud refused login - you might need to update your password`,
);

export const ACQUIRE_ACCOUNT_TOKENS: ErrorStruct = buildErrorStruct(
    name, prefix, `ACQUIRE_ACCOUNT_TOKENS`, `Unable to acquire account tokens`,
);

export const ACCOUNT_SETUP: ErrorStruct = buildErrorStruct(
    name, prefix, `ACCOUNT_SETUP`, `Unable to setup iCloud Account`,
);

export const SETUP_TIMEOUT: ErrorStruct = buildErrorStruct(
    name, prefix, `SETUP_TIMEOUT`, `iCloud setup did not complete successfully within expected amount of time`,
);

export const PCS_REQUEST_FAILED: ErrorStruct = buildErrorStruct(
    name, prefix, `PCS_REQUEST_FAILED`, `Unable to acquire PCS cookies`,
);

export const PCS_COOKIE_MISSING: ErrorStruct = buildErrorStruct(
    name, prefix, `PCS_COOKIE_MISSING`, `Required PCS cookies not in response`,
);

export const SRP_INIT_FAILED: ErrorStruct = buildErrorStruct(
    name, prefix, `SRP_INIT_FAILED`, `Unable to initialize SRP authentication protocol`,
);

export const LOGOUT_FAILED: ErrorStruct = buildErrorStruct(
    name, prefix, `LOGOUT_FAILED`, `Failed to logout from iCloud`,
);