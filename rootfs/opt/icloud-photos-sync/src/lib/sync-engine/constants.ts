export const FILE_NAME = `photos-library.db`;

export enum EVENTS {
    FETCH = `fetch`,
    DIFF = `diff`,
    WRITE = `write`,
    RECORD_STARTED = `record-started`,
    RECORD_COMPLETED = `record-completed`,
    DONE = `done`,
    ERROR = `error`
}