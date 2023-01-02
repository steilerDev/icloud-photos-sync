/**
 * Event lifecycle of Archive Engine class
 */
export enum EVENTS {
    ARCHIVE_START = `archive_start`, // Path
    PERSISTING_START = `persist_start`, // Number of assets
    REMOTE_DELETE = `remote_delete`, // Number of remotely deleted assets
    ARCHIVE_DONE = `archive_done`
}