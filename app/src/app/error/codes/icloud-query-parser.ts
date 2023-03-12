import {buildErrorStruct, ErrorStruct} from "../error-codes.js";

const name = `QueryParserError`;
const prefix = `QUERY_PARSER`;

export const ASSET_ID_FORMAT: ErrorStruct = buildErrorStruct(
    name, prefix, `ASSET_ID_FORMAT`, `Unexpected query format for assetId`,
);

export const CPLASSET_FORMAT: ErrorStruct = buildErrorStruct(
    name, prefix, `CPLASSET_FORMAT`, `Unexpected query format for CPL Asset`,
);

export const CPLMASTER_FORMAT: ErrorStruct = buildErrorStruct(
    name, prefix, `CPLMASTER_FORMAT`, `Unexpected query format for CPL Master`,
);

export const CPLALBUM_FORMAT: ErrorStruct = buildErrorStruct(
    name, prefix, `CPLALBUM_FORMAT`, `Unexpected query format for CPL Album`,
);