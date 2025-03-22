/**
 * Possible events emitted by the event bus
 */
export type iCPSEvent = iCPSEventArchiveEngine
    | iCPSEventLog
    | iCPSEventPhotos
    | iCPSEventMFA
    | iCPSEventCloud
    | iCPSEventSyncEngine
    | iCPSEventApp
    | iCPSEventRuntimeWarning
    | iCPSEventRuntimeError;

/**
 * Possible log events
 */
export enum iCPSEventLog {
    DEBUG = `log-debug`,
    INFO = `log-info`,
    WARN = `log-warn`,
    ERROR = `log-error`
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
    MFA_REQUIRED = `icloud-mfa_req`,
    /**
     * Emitted when the iCloud authentication process has completed after the MFA code has been submitted successfully
     */
    AUTHENTICATED = `icloud-auth_done`,
    /**
     * Emitted when the iCloud authentication trusted this device and stored the trust token for future requests - provides the trust token as argument
     */
    TRUSTED = `icloud-trusted`,
    /**
     * Emitted when ADP is enabled and PCS Cookies are required
     */
    PCS_REQUIRED = `icloud-pcs_req`,
    /**
     * Emitted when the access request has not been granted and the cookies are not ready yet
     */
    PCS_NOT_READY = `icloud-pcs_not_ready`,
    /**
     * Emitted when the iCloud account information have been retrieved
     */
    ACCOUNT_READY = `icloud-account_ready`,
    /**
     * Emitted if the session token expired
     */
    SESSION_EXPIRED = `icloud-session_expired`,
    /**
     * Emitted when the iCloud connection has experienced an error - provides an iCPSError as argument
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
    STARTED = `mfa-started`,
    /**
     * Emitted when the MFA server has received a valid MFA code - provides the method and code as arguments
     */
    MFA_RECEIVED = `mfa-received`,
    /**
     * Emitted when the MFA server has received a request to resend the MFA code - provides the method as argument
     */
    MFA_RESEND = `mfa-resend`,
    /**
     * Emitted when the MFA server has not received a valid MFA code within the timeout period
     */
    MFA_NOT_PROVIDED = `mfa-not_provided`,
    /**
     * Emitted when the MFA server has experienced an error - provides an iCPSError as argument
     */
    ERROR = `mfa-error`,
}

/**
 * Possible icloud photos events
 */
export enum iCPSEventPhotos {
    /**
     * Emitted when the photos library has completed it's setup
     */
    SETUP_COMPLETED = `photos-setup-complete`,
    /**
     * Emitted when the photos library is ready to use
     */
    READY = `photos-ready`,
     /**
     * Emitted when the icloud photos library has experienced an error - provides an iCPSError as argument
     */
     ERROR = `error-photos`,
}

/**
 * Runtime warnings, that are handled appropriately (e.g. by printing a summary and/or logging to the console and/or file)
 */
export enum iCPSEventRuntimeWarning {
    /**
     * Emitted, if the number of remote assets is not matching our expectation during sync - provides the album id, number of expected assets, actual CPL Assets and actual CPL Masters
     */
    COUNT_MISMATCH = `warn-count_mismatch`,
    /**
     * Emitted, if a local asset could not be loaded - provides the error and file path as arguments
     */
    LIBRARY_LOAD_ERROR = `warn-library_load_error`,
    /**
     * Emitted, if an extraneous file was found while loading the album tree - provides the parent directory as argument
     */
    EXTRANEOUS_FILE = `warn-extraneous_file`,
    /**
     * Emitted, if an iCloud asset could not be loaded - provides the error, asset and master object as arguments
     */
    ICLOUD_LOAD_ERROR = `warn-icloud_load_error`,
    /**
     * Emitted when the write process has experienced an error while verifying a written asset - provides the error and asset as argument
     */
    WRITE_ASSET_ERROR = `warn-write_asset_error`,
    /**
     * Emitted when the write process has experienced an error while writing an album - provides the error and album as argument
     */
    WRITE_ALBUM_ERROR = `warn-write_album_error`,
    /**
     * Emitted when an asset cannot be linked to an album - provides the error, src and destination path as arguments
     */
    LINK_ERROR = `warn-link_error`,
    /**
     * Emitted when a filetype is unknown to the script - provides the extension and descriptor as arguments (if available)
     */
    FILETYPE_ERROR = `warn-filetype_error`,
    /**
     * Emitted when there is an error related to the MFA flow - provides an iCPS error as argument
     */
    MFA_ERROR = `warn-mfa_error`,
    /**
     * Emitted when an asset could not be archived - provides the error and errored asset file path as argument
     */
    ARCHIVE_ASSET_ERROR = `warn-archive_asset_error`,
    /**
     * Emitted when there is a problem reading/writing the resource file - provides the iCPSError as argument
     */
    RESOURCE_FILE_ERROR = `warn-resource_file_error`,
}

/**
 * Runtime errors
 */
export enum iCPSEventRuntimeError {
    /**
     * Emitted upon a fatal error during the scheduled execution - provides an iCPSError as argument
     * Should only be handled by the error handler
     */
    SCHEDULED_ERROR = `scheduled-error`,
    /**
     * Emitted upon after an unexpected error was handled by the error handler for it to get logged - provides an iCPSError as argument
     * Should be used to log/print fatal errors
     */
    HANDLED_ERROR = `error-handled`,
}

/**
 * Possible sync engine events
 */
export enum iCPSEventSyncEngine {
    /**
     * Emitted when the sync process has started
     */
    START = `sync-start`,
    /**
     * Emitted when the fetch and load process has started
     */
    FETCH_N_LOAD = `sync-fetch_n_load`,
    /**
     * Emitted when the fetch and load process has completed - provides the number of remote assets and albums as well as the number of local assets and albums as arguments
     */
    FETCH_N_LOAD_COMPLETED = `sync-fetch_n_load_completed`,
    /**
     * Emitted when the diff process has started
     */
    DIFF = `sync-diff`,
    /**
     * Emitted when the diff process has completed
     */
    DIFF_COMPLETED = `sync-diff_completed`,
    /**
     * Emitted when the write process has started
     */
    WRITE = `sync-write`,
    /**
     * Emitted when the write process has started writing assets - provides the number of assets to be deleted, added and kept as arguments
     */
    WRITE_ASSETS = `sync-write_assets`,
    /**
     * Emitted when the write process has completed writing an asset - provides the asset name as argument
     */
    WRITE_ASSET_COMPLETED = `sync-write_asset_completed`,
    /**
     * Emitted when the write process has completed writing all assets
     */
    WRITE_ASSETS_COMPLETED = `sync-write_assets_completed`,
    /**
     * Emitted when the write process has started writing albums - provides the number of albums to be deleted, added and kept as arguments
     */
    WRITE_ALBUMS = `sync-write_albums`,
    /**
     * Emitted when the write process has completed writing all albums
     */
    WRITE_ALBUMS_COMPLETED = `sync-write_albums_completed`,
    /**
     * Emitted when the write process has completed
     */
    WRITE_COMPLETED = `sync-write_completed`,
    /**
     * Emitted when the sync process has completed
     */
    DONE = `sync-done`,
    /**
     * Emitted when the sync process has experienced an error and will retry - provides the number of retries as argument as well as the iCPSError leading to the retry
     */
    RETRY = `sync-retry`,
}

/**
 * Possible archive engine events
 */
export enum iCPSEventArchiveEngine {
    /**
     * Emitted when the archive engine starts archiving a path - provides the path as argument
     */
    ARCHIVE_START = `archive-start`,
    /**
     * Emitted when the archive engine starts persisting assets - provides the number of assets as argument
     */
    PERSISTING_START = `archive-persist_start`,
    /**
     * Emitted when the archive engine starts deleting remote assets - provides the number of assets as argument
     */
    REMOTE_DELETE = `archive-remote_delete`,
    /**
     * Emitted when the archive engine is done archiving a path
     */
    ARCHIVE_DONE = `archive-done`
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
     * Emitted when a scheduled execution was skipped, because there is already an execution running - provides a date object for the next run as argument
     */
    SCHEDULED_OVERRUN = `scheduled-overrun`,
    /**
     * Emitted when the app should display the latest acquired token - provides the token as argument
     */
    TOKEN = `token`
}