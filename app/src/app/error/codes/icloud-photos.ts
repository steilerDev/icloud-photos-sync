import {buildErrorStruct, ErrorStruct} from "../error-codes.js";

const name = `iCloudPhotosError`;
const prefix = `ICLOUD_PHOTOS`;

export const NOT_FOUND: ErrorStruct = buildErrorStruct(
    name, prefix, `NOT_FOUND`, `iCloud Photos object does not exist`,
);

export const SETUP_FAILED: ErrorStruct = buildErrorStruct(
    name, prefix, `SETUP_FAILED`, `Unable to get iCloud Photos service ready`,
);

export const DOMAIN_MISSING: ErrorStruct = buildErrorStruct(
    name, prefix, `DOMAIN_MISSING`, `Unable to get service endpoint: Photos Domain not defined`,
);

export const SETUP_ERROR: ErrorStruct = buildErrorStruct(
    name, prefix, `SETUP_ERROR`, `Unexpected error while setting up iCloud Photos`,
);

export const INDEXING_STATE_UNAVAILABLE: ErrorStruct = buildErrorStruct(
    name, prefix, `INDEXING_STATE_UNAVAILABLE`, `Unable to get indexing state`,
);

export const INDEXING_IN_PROGRESS: ErrorStruct = buildErrorStruct(
    name, prefix, `INDEXING_IN_PROGRESS`, `Indexing in progress, try again later`,
);

export const INDEXING_STATE_UNKNOWN: ErrorStruct = buildErrorStruct(
    name, prefix, `INDEXING_STATE_UNKNOWN`, `Unknown indexing state`,
);

export const UNEXPECTED_QUERY_RESPONSE: ErrorStruct = buildErrorStruct(
    name, prefix, `UNEXPECTED_QUERY_RESPONSE`, `Received unexpected query response format`,
);

export const UNEXPECTED_OPERATIONS_RESPONSE: ErrorStruct = buildErrorStruct(
    name, prefix, `UNEXPECTED_OPERATIONS_RESPONSE`, `Received unexpected operations response format`,
);

export const ALBUM_PROCESSING: ErrorStruct = buildErrorStruct(
    name, prefix, `ALBUM_PROCESSING`, `Error while processing album`,
);

export const FOLDER_STRUCTURE: ErrorStruct = buildErrorStruct(
    name, prefix, `FOLDER_STRUCTURE`, `Unable to fetch folder structure`,
);

export const DELETED_RECORD: ErrorStruct = buildErrorStruct(
    name, prefix, `DELETED_RECORD`, `Ignoring deleted record`,
);

export const HIDDEN_RECORD: ErrorStruct = buildErrorStruct(
    name, prefix, `HIDDEN_RECORD`, `Ignoring hidden record`,
);

export const DUPLICATE_RECORD: ErrorStruct = buildErrorStruct(
    name, prefix, `DUPLICATE_RECORD`, `Ignoring duplicate record`,
);

export const UNWANTED_RECORD_TYPE: ErrorStruct = buildErrorStruct(
    name, prefix, `UNWANTED_RECORD_TYPE`, `Ignoring unwanted record type`,
);

export const UNKNOWN_RECORD_TYPE: ErrorStruct = buildErrorStruct(
    name, prefix, `UNKNOWN_RECORD_TYPE`, `Ignoring unknown record type`,
);

export const UNKNOWN_ALBUM: ErrorStruct = buildErrorStruct(
    name, prefix, `UNKNOWN_ALBUM`, `Ignoring unknown album`,
);

export const UNWANTED_ALBUM: ErrorStruct = buildErrorStruct(
    name, prefix, `UNWANTED_ALBUM`, `Ignoring unwanted album`,
);

export const COUNT_DATA: ErrorStruct = buildErrorStruct(
    name, prefix, `COUNT_DATA`, `Unable to extract count data`,
);

export const PROCESS_ALBUM: ErrorStruct = buildErrorStruct(
    name, prefix, `PROCESS_CPLALBUM`, `Error processing CPLAlbum`,
);

export const PROCESS_ASSET: ErrorStruct = buildErrorStruct(
    name, prefix, `PROCESS_ASSET`, `Error processing asset`,
);

export const FETCH_RECORDS: ErrorStruct = buildErrorStruct(
    name, prefix, `FETCH_RECORDS`, `Unable to fetch records`,
);

export const FILTER_RECORDS: ErrorStruct = buildErrorStruct(
    name, prefix, `FILTER_RECORDS`, `Unable to filter records`,
);

export const COUNT_MISMATCH: ErrorStruct = buildErrorStruct(
    name, prefix, `COUNT_MISMATCH`, `Received unexpected amount of records`,
);