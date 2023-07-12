import {buildErrorStruct, ErrorStruct} from "../error-codes.js";

const name = `ResManagerError`;
const prefix = `ResManager`;

export const NOT_INITIATED: ErrorStruct = buildErrorStruct(
    name, prefix, `NOT_INITIATED`, `Resource Manager has not been initiated`,
);

export const ALREADY_INITIATED: ErrorStruct = buildErrorStruct(
    name, prefix, `ALREADY_INITIATED`, `Resource Manager has already been initiated`,
);

export const UNABLE_TO_LOAD_FILE: ErrorStruct = buildErrorStruct(
    name, prefix, `UNABLE_TO_LOAD_FILE`, `Unable to load resource file`,
);

export const UNABLE_TO_PARSE_FILE: ErrorStruct = buildErrorStruct(
    name, prefix, `UNABLE_TO_PARSE_FILE`, `Unable to parse resource file`,
);