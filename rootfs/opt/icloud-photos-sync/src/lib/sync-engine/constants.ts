export const FILE_NAME = `photos-library.db`;

export enum EVENTS {
    FETCH = `fetch`,
    FETCH_COMPLETED = `fetch-completed`,
    DIFF = `diff`,
    WRITE = `write`,
    RECORD_COMPLETED = `record-completed`,
    APPLY_STRUCTURE = `structure`,
    DONE = `done`,
    ERROR = `error`
}