import {iCPSAppOptions} from "../../app/factory.js";

/**
 * File encoding for all text based files written by this application
 */
export const FILE_ENCODING = `utf8`;

/**
 * Filename of the resource file
 */
export const RESOURCE_FILE_NAME = `.icloud-photos-sync`;

/**
 * The name of the log file
 */
export const LOG_FILE_NAME = `.icloud-photos-sync.log`;

/**
 * The name of the metrics file
 */
export const METRICS_FILE_NAME = `.icloud-photos-sync.metrics`;

/**
 * Resources held by the resource manager
 */
export type iCPSResources = ResourceFile
    & iCPSAppOptions
    & PhotosAccount
    & iCPSRuntimeResources;

/**
 * Persistent information, stored in a resource file
 */
export type ResourceFile = {
    /**
     * The library version of the currently present library
     * @minimum 1
     * @default 1
     */
    libraryVersion: number,
    /**
     * The currently used trust token
     */
    trustToken?: string
}

/**
 * Information to interact with the iCloud Photos backend
 */
type PhotosAccount = {
    /**
     * The primary photos library zone
     */
    primaryZone?: PhotosAccountZone,
    /**
     * The shared photos library zone
     */
    sharedZone?: PhotosAccountZone
}

/**
 * Information about photos library zones
 */
export type PhotosAccountZone = {
    /**
     * The zone name, either PrimarySync or SharedSync-<UUID>
     */
    zoneName: string,
    /**
     * The zone type, usually REGULAR_CUSTOM_ZONE
     */
    zoneType: string,
    /**
     * The owner name, usually _<UUID>
     */
    ownerRecordName: string,
}

/**
 * Optional runtime resources
 */
type iCPSRuntimeResources = {
    /**
     * The path to the log file, undefined if logging is disabled
     */
    logFilePath?: string,
    /**
     * The path to the metrics file, undefined if the metrics exporter is disabled
     */
    metricsFilePath?: string,
    /**
     * The path to the HAR file, undefined if the HAR exporter is disabled
     */
    harFilePath?: string,
}