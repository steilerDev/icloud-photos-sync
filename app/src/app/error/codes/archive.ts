import {buildErrorStruct, ErrorStruct} from "../error-codes.js";

const name = `ArchiveError`;
const prefix = `ARCHIVE`;

export const NO_ASSETS: ErrorStruct = buildErrorStruct(
    name, prefix, `NO_ASSETS`, `No remote assets available`,
);

export const UUID_PATH: ErrorStruct = buildErrorStruct(
    name, prefix, `UUID_PATH`, `UUID path selected, use named path only`,
);

export const NON_ALBUM: ErrorStruct = buildErrorStruct(
    name, prefix, `NON_ALBUM`, `Only able to archive non-archived albums`,
);

export const LOAD_FAILED: ErrorStruct = buildErrorStruct(
    name, prefix, `LOAD_FAILED`, `Unable to load album`,
);

export const PERSIST_FAILED: ErrorStruct = buildErrorStruct(
    name, prefix, `PERSIST_FAILED`, `Unable to persist asset`,
);

export const REMOTE_DELETE_FAILED: ErrorStruct = buildErrorStruct(
    name, prefix, `REMOTE_DELETE_FAILED`, `Unable to delete remote assets`,
);

export const NO_REMOTE_ASSET: ErrorStruct = buildErrorStruct(
    name, prefix, `NO_REMOTE_ASSET`, `Unable to find remote asset`,
);

export const NO_REMOTE_RECORD_NAME: ErrorStruct = buildErrorStruct(
    name, prefix, `NO_REMOTE_RECORD_NAME`, `Unable to get record name`,
);