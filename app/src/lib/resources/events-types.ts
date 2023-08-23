/**
 * Possible events emitted by the event bus
 */
export type iCPSEvent = iCPSEventError
    | iCPSEventResourceManager
    | iCPSEventArchiveEngine
    | iCPSEventLog
    | iCPSEventPhotos
    | iCPSEventMFA
    | iCPSEventCloud
    | iCPSEventSyncEngine
    | iCPSEventApp;

/**
 * Possible error events
 */
export enum iCPSEventError {
    /**
     * Emitted when an error occurs that needs to be handled - provides the error as argument
     */
    HANDLER_EVENT = `handler-event`,
    HANDLER_WARN = `handler-warn`,
    HANDLER_ERROR = `handler-error`,
}

/**
 * Possible log events
 */
export enum iCPSEventLog {
    DEBUG = `debug`,
    INFO = `info`,
    WARN = `warn`,
    ERROR = `error`
}

/**
 * Possible resource manager events
 */
export enum iCPSEventResourceManager {
    /**
     * Emitted when resource file cannot be found
     */
    NO_RESOURCE_FILE_FOUND = `no-file-find`
}

/**
 * Possible iCloud events
 */
export enum iCPSEventCloud {
    /**
     * Emitted when the iCloud authentication process has started
     */
    AUTHENTICATION_STARTED = `icloud-auth_started`,
    /**
     * Emitted when the iCloud authentication process requires MFA input
     */
    MFA_REQUIRED = `mfa_req`,
    /**
     * Emitted when the iCloud authentication process has completed after the MFA code has been submitted successfully
     */
    AUTHENTICATED = `icloud-auth_done`,
    /**
     * Emitted when the iCloud authentication trusted this device and stored the trust token for future requests - provides the trust token as argument
     */
    TRUSTED = `icloud-trusted`,
    /**
     * Emitted when the iCloud account information have been retrieved
     */
    ACCOUNT_READY = `icloud-account_ready`,
    /**
     * Emitted when the iCloud authentication process experienced a failure
     */
    ERROR = `icloud-error`,
}

/**
 * Possible MFA server events
 */
export enum iCPSEventMFA {
    /**
     * Emitted when the MFA server has started - provides the port as argument
     */
    STARTED = `mfa_started`,
    /**
     * Emitted when the MFA server has received a valid MFA code - provides the method and code as arguments
     */
    MFA_RECEIVED = `mfa_rec`,
    /**
     * Emitted when the MFA server has received a request to resend the MFA code - provides the method as argument
     */
    MFA_RESEND = `mfa_resend`,
    /**
     * Emitted when the MFA server has not received a valid MFA code within the timeout period
     */
    MFA_NOT_PROVIDED = `mfa_not_provided`,
    /**
     * Emitted when the MFA server has experienced an error
     */
    ERROR = `mfa_error`
}

/**
 * Possible icloud photos events
 */
export enum iCPSEventPhotos {
    /**
     * Emitted when the photos library has completed it's setup
     */
    SETUP_COMPLETED = `photos_setup_complete`,
    /**
     * Emitted when the photos library is ready to use
     */
    READY = `photos_ready`,
    /**
     * Emitted when the photos library has experienced a fatal error
     */
    ERROR = `photos_error`
}

/**
 * Possible sync engine events
 */
export enum iCPSEventSyncEngine {
    /**
     * Emitted when the sync process has started
     */
    START = `start`,
    /**
     * Emitted when the fetch and load process has started
     */
    FETCH_N_LOAD = `fetch-n-load`,
    /**
     * Emitted when the fetch and load process has completed - provides the number of remote assets and albums as well as the number of local assets and albums as arguments
     */
    FETCH_N_LOAD_COMPLETED = `fetch-n-load-completed`,
    /**
     * Emitted when the diff process has started
     */
    DIFF = `diff`,
    /**
     * Emitted when the diff process has completed
     */
    DIFF_COMPLETED = `diff-completed`, // No arg
    /**
     * Emitted when the write process has started
     */
    WRITE = `write`,
    /**
     * Emitted when the write process has started writing assets - provides the number of assets to be deleted, added and kept as arguments
     */
    WRITE_ASSETS = `write-assets`,
    /**
     * Emitted when the write process has completed writing an asset - provides the asset name as argument
     */
    WRITE_ASSET_COMPLETED = `write-asset-completed`,
    /**
     * Emitted when the write process has experienced an error writing an asset - provides the asset name as argument
     */
    WRITE_ASSET_ERROR = `write-asset-error`,
    /**
     * Emitted when the write process has completed writing all assets
     */
    WRITE_ASSETS_COMPLETED = `write-assets-completed`,
    /**
     * Emitted when the write process has started writing albums - provides the number of albums to be deleted, added and kept as arguments
     */
    WRITE_ALBUMS = `write-albums`,
    /**
     * Emitted when the write process has completed writing all albums
     */
    WRITE_ALBUMS_COMPLETED = `write-albums-completed`,
    /**
     * Emitted when the write process has completed
     */
    WRITE_COMPLETED = `write-completed`,
    /**
     * Emitted when the sync process has completed
     */
    DONE = `done`,
    /**
     * Emitted when the sync process has experienced an error and will retry - provides the number of retries as argument
     */
    RETRY = `retry`,
}

/**
 * Possible archive engine events
 */
export enum iCPSEventArchiveEngine {
    /**
     * Emitted when the archive engine starts archiving a path - provides the path as argument
     */
    ARCHIVE_START = `archive_start`, // Path
    /**
     * Emitted when the archive engine starts persisting assets - provides the number of assets as argument
     */
    PERSISTING_START = `archive_persist_start`,
    /**
     * Emitted when the archive engine starts deleting remote assets - provides the number of assets as argument
     */
    REMOTE_DELETE = `archive_remote_delete`,
    /**
     * Emitted when the archive engine is done archiving a path
     */
    ARCHIVE_DONE = `archive_done`
}

/**
 * Possible app events
 */
export enum iCPSEventApp {
    /**
     * Emitted when the app has scheduled the next execution, but has not have previous executions - provides a date object for the next run as argument
     */
    SCHEDULED = `scheduled`,
    /**
     * Emitted when the app has started the next execution
     */
    SCHEDULED_START = `scheduled-start`,
    /**
     * Emitted when the app has successfully completed an execution - provides a date object for the next run as argument
     */
    SCHEDULED_DONE = `scheduled-done`,
    /**
     * Emitted when the app has experienced an error and will retry - provides a date object for the next run as argument
     */
    SCHEDULED_RETRY = `scheduled-retry`,
    /**
     * Emitted when the app should display the latest acquired token - provides the token as argument
     */
    TOKEN = `token`
}