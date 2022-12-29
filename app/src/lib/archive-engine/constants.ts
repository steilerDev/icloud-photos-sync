/**
 * Event lifecycle of Archive Engine class
 */
export enum EVENTS {
    ARCHIVE_START = `archive_start`, // Path
    PERSISTING_START = `persist_start`, // Number of assets
    ARCHIVE_DONE = `archive_done`
}