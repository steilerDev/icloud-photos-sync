import {buildErrorStruct, ErrorStruct} from "../error-codes.js";

const name = `CloudKitError`;
const prefix = `CLOUD_KIT_ERR`;

export const QUERY: ErrorStruct = buildErrorStruct(
    name, prefix, `QUERY`, `Error occurred while querying CloudKit`,
);

export const TOO_MANY_RECORDS: ErrorStruct = buildErrorStruct(
    name, prefix, `TOO_MANY_RECORDS`, `The query returned too many records`,
);

export const INDEXING_STATE: ErrorStruct = buildErrorStruct(
    name, prefix, `INDEXING_STATE`, `Error occurred while querying CloudKit for indexing state`,
);