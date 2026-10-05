import {buildErrorStruct, ErrorStruct} from "../error-codes.js";

const name = `AppError`;
const prefix = `APP`;

export const DAEMON: ErrorStruct = buildErrorStruct(
    name, prefix, `DAEMON`, `Error during scheduled execution`,
);

export const TOKEN: ErrorStruct = buildErrorStruct(
    name, prefix, `TOKEN`, `Unable to acquire trust token`,
);

export const SYNC: ErrorStruct = buildErrorStruct(
    name, prefix, `SYNC`, `Sync failed`,
);

export const ARCHIVE: ErrorStruct = buildErrorStruct(
    name, prefix, `ARCHIVE`, `Archive failed`,
);

export const INSUFFICIENT_PERMISSIONS: ErrorStruct = buildErrorStruct(
    name, prefix, `INSUFFICIENT_PERMISSIONS`, `Node.js permission model is enabled, but required permissions are missing`,
);