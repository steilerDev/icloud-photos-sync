/**
 * Possible error names
 */
export type ErrorName =
    `ArchiveError` |
    `iCPSError` |
    `InterruptError` |
    `MFAError` |
    `iCloudAuthError` |
    `iCloudPhotosError` |
    `LibraryError` |
    `AppError` |
    `QueryParserError` |
    `ResManagerError` |
    `ValidatorError` |
    `SyncError`

/**
 * Error structure
 */
export type ErrorStruct = {
    /**
     * The name of the error
     */
    name: ErrorName,
    /**
     * The associated error code
     */
    code: string,
    /**
     * A user readable message
     */
    message: string
}

/**
 * Builds an error struct using the provided parameters
 * @param name - The error name
 * @param errorCodePrefix - The error code prefix
 * @param errorCode - The error code (combined with errorCodePrefix through '_')
 * @param message - A readable message
 * @returns The corresponding error construct
 */
export function buildErrorStruct(name: ErrorName, errorCodePrefix: string, errorCode: string, message: string): ErrorStruct {
    return {
        name,
        code: `${errorCodePrefix}_${errorCode}`,
        message,
    };
}

import * as ARCHIVE_ERR from './codes/archive.js';
import * as MFA_ERR from './codes/mfa.js';
import * as AUTH_ERR from './codes/icloud-auth.js';
import * as ICLOUD_PHOTOS_ERR from './codes/icloud-photos.js';
import * as LIBRARY_ERR from './codes/library.js';
import * as APP_ERR from './codes/app.js';
import * as QUERY_PARSER_ERR from './codes/icloud-query-parser.js';
import * as SYNC_ERR from './codes/sync.js';
import * as RES_MANAGER_ERR from './codes/resource-manager.js';
import * as VALIDATOR_ERR from './codes/validator.js';
export {MFA_ERR, ARCHIVE_ERR, AUTH_ERR, ICLOUD_PHOTOS_ERR, LIBRARY_ERR, APP_ERR, QUERY_PARSER_ERR, SYNC_ERR, RES_MANAGER_ERR, VALIDATOR_ERR};

export const ERR_UNKNOWN: ErrorStruct = {
    name: `iCPSError`,
    code: `UNKNOWN`,
    message: `Unknown error occurred`,
};

export const ERR_SIGINT: ErrorStruct = {
    name: `InterruptError`,
    code: `SIGINT`,
    message: `Received user interrupt: SIGINT`,
};

export const ERR_SIGTERM: ErrorStruct = {
    name: `InterruptError`,
    code: `SIGTERM`,
    message: `Received user interrupt: SIGTERM`,
};