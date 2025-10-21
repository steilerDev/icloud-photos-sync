import {buildErrorStruct, ErrorStruct} from "../error-codes.js";

const name = `ResourceError`;
const prefix = `RESOURCES`;

export const NOT_INITIATED: ErrorStruct = buildErrorStruct(
    name, prefix, `NOT_INITIATED`, `Resources have not been initiated`,
);

export const EVENT_NOT_INITIATED: ErrorStruct = buildErrorStruct(
    name, prefix, `EVENT_NOT_INITIATED`, `EventManager has not been initiated`,
);

export const NETWORK_NOT_INITIATED: ErrorStruct = buildErrorStruct(
    name, prefix, `NETWORK_NOT_INITIATED`, `NetworkManager has not been initiated`,
);

export const RESOURCE_NOT_INITIATED: ErrorStruct = buildErrorStruct(
    name, prefix, `RESOURCE_NOT_INITIATED`, `ResourceManager has not been initiated`,
);

export const VALIDATOR_NOT_INITIATED: ErrorStruct = buildErrorStruct(
    name, prefix, `VALIDATOR_NOT_INITIATED`, `Validator has not been initiated`,
);

export const STATE_NOT_INITIATED: ErrorStruct = buildErrorStruct(
    name, prefix, `STATE_NOT_INITIATED`, `State has not been initiated`,
);

export const ALREADY_INITIATED: ErrorStruct = buildErrorStruct(
    name, prefix, `ALREADY_INITIATED`, `Resources have already been initiated`,
);

export const UNABLE_TO_WRITE_FILE: ErrorStruct = buildErrorStruct(
    name, prefix, `UNABLE_TO_WRITE_FILE`, `Unable to write resource file`,
);

export const UNABLE_TO_READ_FILE: ErrorStruct = buildErrorStruct(
    name, prefix, `UNABLE_TO_READ_FILE`, `Unable to read resource file`,
);

export const NO_SESSION_SECRET: ErrorStruct = buildErrorStruct(
    name, prefix, `NO_SESSION_SECRET`, `No session secret present`,
);

export const NO_PRIMARY_ZONE: ErrorStruct = buildErrorStruct(
    name, prefix, `NO_PRIMARY_ZONE`, `No primary photos zone present`,
);

export const NO_SHARED_ZONE: ErrorStruct = buildErrorStruct(
    name, prefix, `NO_SHARED_ZONE`, `No shared photos zone present`,
);