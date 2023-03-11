import {buildErrorStruct, ErrorStruct} from "../error-codes.js";

const name = `iCloudAuthError`;
const prefix = `AUTH`;

export const FAILED: ErrorStruct = buildErrorStruct(
    name, prefix, `FAILED`, `iCloud Authentication failed`,
);

export const UNEXPECTED_RESPONSE: ErrorStruct = buildErrorStruct(
    name, prefix, `UNEXPECTED_RESPONSE`, `Unexpected HTTP response`,
);

export const ACQUIRE_AUTH_SECRETS: ErrorStruct = buildErrorStruct(
    name, prefix, `ACQUIRE_AUTH_SECRETS`, `Unable to process auth secrets`,
);

export const NO_RESPONSE: ErrorStruct = buildErrorStruct(
    name, prefix, `NO_RESPONSE`, `No response received during authentication`,
);

export const UNAUTHORIZED: ErrorStruct = buildErrorStruct(
    name, prefix, `UNAUTHORIZED`, `Username/Password does not seem to match`,
);

export const FORBIDDEN: ErrorStruct = buildErrorStruct(
    name, prefix, `FORBIDDEN`, `Username does not seem to exist`,
);

export const ACQUIRE_ACCOUNT_TOKENS: ErrorStruct = buildErrorStruct(
    name, prefix, `ACQUIRE_ACCOUNT_TOKENS`, `Unable to acquire account tokens`,
);

export const ACCOUNT_SETUP: ErrorStruct = buildErrorStruct(
    name, prefix, `ACCOUNT_SETUP`, `Unable to setup iCloud Account`,
);

export const STORE_TRUST_TOKEN: ErrorStruct = buildErrorStruct(
    name, prefix, `STORE_TRUST_TOKEN`, `Unable to store trust token`,
);

export const COOKIES: ErrorStruct = buildErrorStruct(
    name, prefix, `COOKIES`, `Unable to process cookies`,
);

export const NO_PHOTOS_DOMAIN: ErrorStruct = buildErrorStruct(
    name, prefix, `NO_PHOTOS_DOMAIN`, `Unable to get photosDomain from setup response`,
);

export const TOO_MANY_ZONES: ErrorStruct = buildErrorStruct(
    name, prefix, `TOO_MANY_ZONES`, `iCloud Photos returned more zones than expected`,
);

export const ZONE_RESPONSE_INVALID: ErrorStruct = buildErrorStruct(
    name, prefix, `ZONE_RESPONSE_INVALID`, `Unable to setup zones: response format invalid`,
);

export const COOKIE_VALIDATION: ErrorStruct = buildErrorStruct(
    name, prefix, `COOKIE_VALIDATION`, `Unable to validate cookies`,
);

export const ACCOUNT_SECRETS_VALIDATION: ErrorStruct = buildErrorStruct(
    name, prefix, `ACCOUNT_SECRETS_VALIDATION`, `Unable to validate account secrets`,
);

export const AUTH_SECRETS_VALIDATION: ErrorStruct = buildErrorStruct(
    name, prefix, `SECRETS_VALIDATION`, `Unable to validate auth secrets`,
);

export const ACCOUNT_TOKEN_VALIDATION: ErrorStruct = buildErrorStruct(
    name, prefix, `ACCOUNT_TOKEN_VALIDATION`, `Unable to validate account tokens`,
);

export const PHOTOS_ACCOUNT_VALIDATION: ErrorStruct = buildErrorStruct(
    name, prefix, `PHOTOS_ACCOUNT_VALIDATION`, `Unable to validate photos account`,
);