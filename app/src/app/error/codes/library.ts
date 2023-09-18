import {buildErrorStruct, ErrorStruct} from "../error-codes.js";

const name = `LibraryError`;
const prefix = `LIBRARY`;

export const NO_DISTANCE_TO_ROOT: ErrorStruct = buildErrorStruct(
    name, prefix, `NO_DISTANCE_TO_ROOT`, `Unable to determine distance to root, no link to root!`,
);

export const UNKNOWN_FILETYPE_DESCRIPTOR: ErrorStruct = buildErrorStruct(
    name, prefix, `UNKNOWN_FILETYPE_DESCRIPTOR`, `Unknown filetype descriptor, please report in GH issue 143`,
);

export const UNKNOWN_FILETYPE_EXTENSION: ErrorStruct = buildErrorStruct(
    name, prefix, `UNKNOWN_FILETYPE_EXTENSION`, `Unknown filetype extension, please report in GH issue 143`,
);

export const UNKNOWN_SYMLINK_ERROR: ErrorStruct = buildErrorStruct(
    name, prefix, `UNKNOWN_SYMLINK_ERROR`, `Unknown error while processing symlink`,
);

export const NO_PARENT: ErrorStruct = buildErrorStruct(
    name, prefix, `NO_PARENT`, `Unable to find parent of album`,
);

export const MULTIPLE_MATCHES: ErrorStruct = buildErrorStruct(
    name, prefix, `MULTIPLE_MATCHES`, `Unable to find album: Multiple matches`,
);

export const EXISTS: ErrorStruct = buildErrorStruct(
    name, prefix, `EXISTS`, `Unable to create album: Already exists`,
);

export const FIND_PATH: ErrorStruct = buildErrorStruct(
    name, prefix, `FIND_PATH`, `Unable to find path`,
);

export const NOT_EMPTY: ErrorStruct = buildErrorStruct(
    name, prefix, `NOT_EMPTY`, `Album not empty`,
);

export const LOCK_ACQUISITION: ErrorStruct = buildErrorStruct(
    name, prefix, `LOCK_ACQUISITION`, `Unable to acquire library lock`,
);

export const LOCKED: ErrorStruct = buildErrorStruct(
    name, prefix, `LOCKED`, `Library locked. Use --force (or FORCE env variable) to forcefully remove the lock`,
);

export const ASSET_NOT_FOUND: ErrorStruct = buildErrorStruct(
    name, prefix, `ASSET_NOT_FOUND`, `File not found`,
);

export const ASSET_MODIFICATION_TIME: ErrorStruct = buildErrorStruct(
    name, prefix, `ASSET_MODIFICATION_TIME`, `File's modification time does not match iCloud record`,
);

export const ASSET_SIZE: ErrorStruct = buildErrorStruct(
    name, prefix, `ASSET_SIZE`, `File's size does not match iCloud record`,
);

export const VERSION_MISMATCH: ErrorStruct = buildErrorStruct(
    name, prefix, `VERSION_MISMATCH`, `Library version mismatch`,
);