/**
 * Event lifecycle of Archive Engine class
 */
 export enum EVENTS {
    ARCHIVE_START = `archive_start`, // path
    PERSISTING_START = `persist_start`, // number of assets
    ARCHIVE_DONE = `archive_done`
}