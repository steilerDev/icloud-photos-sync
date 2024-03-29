import {buildErrorStruct, ErrorStruct} from "../error-codes.js";

const name = `SyncError`;
const prefix = `SYNC`;

export const STASH_RETRIEVE: ErrorStruct = buildErrorStruct(
    name, prefix, `STASH_RETRIEVE`, `Unable to retrieve stashed archived album`,
);

export const STASH: ErrorStruct = buildErrorStruct(
    name, prefix, `STASH`, `Unable to stash archived album`,
);

export const ADD_ALBUM: ErrorStruct = buildErrorStruct(
    name, prefix, `ADD_ALBUM`, `Unable to add album`,
);

export const DELETE_ALBUM: ErrorStruct = buildErrorStruct(
    name, prefix, `DELETE_ALBUM`, `Unable to delete album`,
);

export const MAX_RETRY: ErrorStruct = buildErrorStruct(
    name, prefix, `MAX_RETRY`, `Sync did not complete successfully within expected amount of tries`,
);

export const NETWORK: ErrorStruct = buildErrorStruct(
    name, prefix, `NETWORK`, `Network error during sync`,
);

export const UNKNOWN: ErrorStruct = buildErrorStruct(
    name, prefix, `UNKNOWN`, `Unknown error during sync`,
);