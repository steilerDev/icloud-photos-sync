import {buildErrorStruct, ErrorStruct} from "../error-codes.js";

const name = `MFAError`;
const prefix = `MFA`;

export const FAIL_ON_MFA: ErrorStruct = buildErrorStruct(
    name, prefix, `FAIL_ON_MFA`, `MFA code required, failing due to failOnMfa flag`,
);

export const NO_PHONE_NUMBERS: ErrorStruct = buildErrorStruct(
    name, prefix, `NO_PHONE_NUMBERS`, `Unable to acquire trusted phone numbers`,
);

export const MFA_TIMEOUT: ErrorStruct = buildErrorStruct(
    name, prefix, `TIMEOUT`, `MFA code timeout (code needs to be provided within 10 minutes)`,
);

export const SUBMIT_FAILED: ErrorStruct = buildErrorStruct(
    name, prefix, `SUBMIT_FAILED`, `Unable to submit MFA code`,
);

export const CODE_REJECTED: ErrorStruct = buildErrorStruct(
    name, prefix, `CODE_REJECTED`, `MFA code rejected`,
);

export const RESEND_FAILED: ErrorStruct = buildErrorStruct(
    name, prefix, `RESEND_FAILED`, `Unable to resend MFA code`,
);
