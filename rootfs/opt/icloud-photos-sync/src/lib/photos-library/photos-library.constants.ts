export const FILE_NAME = `photos-library.db`;

export enum EVENTS {
    SAVED = `saved`,
    READY = `ready`,
    ERROR = `error`
}

export enum RecordState {
    NEW = 0,
    CHANGED = 1,
    STALE = 2,
    SYNCED = 3,
    ARCHIVED = 4
}