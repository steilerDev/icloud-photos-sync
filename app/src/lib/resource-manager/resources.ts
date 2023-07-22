import {iCPSAppOptions} from "../../app/factory.js";

/**
 * Filename of the resource file
 */
export const RESOURCE_FILE_NAME = `.icloud-photos-sync`;
export const RESOURCE_FILE_ENCODING = `utf8`;

/**
 * Resources held by the resource manager
 */
export type iCPSResources = ResourceFile
    & iCPSAppOptions
    & PhotosAccount

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
export type PhotosAccount = {
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