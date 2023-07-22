/**
 * Possible events emitted by the event bus
 */
export type iCPSEvent = iCPSEventError
    | iCPSEventResourceManager

/**
 * Possible error events
 */
export enum iCPSEventError {
    HANDLER_EVENT = `handler-event`
}

/**
 * Possible resource manager events
 */
export enum iCPSEventResourceManager {
    NO_RESOURCE_FILE_FOUND = `no-file-find`
}