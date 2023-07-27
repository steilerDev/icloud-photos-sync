import {buildErrorStruct, ErrorStruct} from "../error-codes.js";

const name = `ResManagerError`;
const prefix = `RES_MANAGER`;

export const NOT_INITIATED: ErrorStruct = buildErrorStruct(
    name, prefix, `NOT_INITIATED`, `Resource Manager has not been initiated`,
);

export const ALREADY_INITIATED: ErrorStruct = buildErrorStruct(
    name, prefix, `ALREADY_INITIATED`, `Resource Manager has already been initiated`,
);

export const UNABLE_TO_WRITE_FILE: ErrorStruct = buildErrorStruct(
    name, prefix, `UNABLE_TO_WRITE_FILE`, `Unable to write resource file`,
);

export const EXPIRED_COOKIES_DETECTED: ErrorStruct = buildErrorStruct(
    name, prefix, `EXPIRED_COOKIES_DETECTED`, `Expired cookies detected`,
);

export const NO_SESSION: ErrorStruct = buildErrorStruct(
    name, prefix, `NO_SESSION`, `No session token or session ID present`,
);

export const NO_PRIMARY_ZONE: ErrorStruct = buildErrorStruct(
    name, prefix, `NO_PRIMARY_ZONE`, `No primary photos zone present`,
);

export const NO_SHARED_ZONE: ErrorStruct = buildErrorStruct(
    name, prefix, `NO_SHARED_ZONE`, `No shared photos zone present`,
);

export const NO_AASP_COOKIE: ErrorStruct = buildErrorStruct(
    name, prefix, `NO_AASP_COOKIE`, `No AASP cookie present`,
);