/**
 * This file helps building queries for the iCloud Photos backend service
 */
import {Resources} from "../../resources/main.js";
import {PhotosAccountZone} from "../../resources/resource-types.js";

/**
 * All relevant record types for this application
 */
export const RECORD_TYPES = {
    PHOTO_MASTER_RECORD: `CPLMaster`,
    PHOTO_ASSET_RECORD: `CPLAsset`,
    PHOTO_ALBUM_RECORD: `CPLAlbum`,
    CONTAINER_RELATION: `CPLContainerRelation`, // Useless at the moment
    PHOTO_RECORDS: `CPLContainerRelationLiveByPosition`, // Record CPLContainerRelationLiveByAssetDate
    ALBUM_RECORDS: `CPLAlbumByPositionLive`,
    INDEX_COUNT: `HyperionIndexCountLookup`,
    ALL_PHOTOS: `CPLAssetAndMasterByAssetDateWithoutHiddenOrDeleted`, // CPLAssetAndMasterByAssetDateWithoutHiddenOrDeleted
};

/**
 * All relevant desired keys as provided to the backend
 */
const DESIRED_KEYS = {
    RECORD_NAME: `recordName`,
    IS_DELETED: `isDeleted`,
    ORIGINAL_RESOURCE: `resOriginalRes`,
    ORIGINAL_RESOURCE_FILE_TYPE: `resOriginalFileType`,
    JPEG_RESOURCE: `resJPEGFullRes`,
    JPEG_RESOURCE_FILE_TYPE: `resJPEGFullFileType`,
    VIDEO_RESOURCE: `resVidFullRes`,
    VIDEO_RESOURCE_FILE_TYPE: `resVidFullFileType`,
    ENCODED_FILE_NAME: `filenameEnc`,
    FAVORITE: `isFavorite`,
    IS_HIDDEN: `isHidden`,
    ADJUSTMENT_TYPE: `adjustmentType`,
    MASTER_REF: `masterRef`,
};

/**
 * Desired keys, requested in queries in order for this application to be functioning
 */
export const QUERY_KEYS = [
    DESIRED_KEYS.RECORD_NAME,
    DESIRED_KEYS.ORIGINAL_RESOURCE,
    DESIRED_KEYS.ORIGINAL_RESOURCE_FILE_TYPE,
    DESIRED_KEYS.JPEG_RESOURCE,
    DESIRED_KEYS.JPEG_RESOURCE_FILE_TYPE,
    DESIRED_KEYS.VIDEO_RESOURCE,
    DESIRED_KEYS.VIDEO_RESOURCE_FILE_TYPE,
    DESIRED_KEYS.ENCODED_FILE_NAME,
    DESIRED_KEYS.IS_DELETED,
    DESIRED_KEYS.FAVORITE,
    DESIRED_KEYS.IS_HIDDEN,
    DESIRED_KEYS.MASTER_REF,
    DESIRED_KEYS.ADJUSTMENT_TYPE,
];

/**
 * Aliases for the different available libraries
 */
export enum Zones {
    Primary = `PrimaryLibrary`,
    Shared = `SharedLibrary`
}

/**
 * Returns the zoneID object needed as part of requests against the iCloudPhotos backend
 * @param zone - The zone details to get
 * @returns
 */
export function getZoneID(zone: Zones): PhotosAccountZone {
    if (zone === Zones.Shared) {
        return Resources.manager().sharedZone;
    }

    return Resources.manager().primaryZone;
}

/**
 * Builds a filter, that reduce the query based on the parentId
 * @param parentId - The parentId (record name) of the parent album
 * @returns The filter required to perform a query
 */
export function getParentFilterForParentId(parentId: string): any {
    return {
        fieldName: `parentId`,
        comparator: `EQUALS`,
        fieldValue: {
            value: parentId,
            type: `STRING`,
        },
    };
}

/**
 * Builds a filter, that defines the sorting of the query
 * @param direction - Optionally the direction of the filter ('ASCENDING' by default)
 * @returns The filter required to perform a query
 */
export function getDirectionFilterForDirection(direction: string = `ASCENDING`): any {
    return {
        fieldName: `direction`,
        comparator: `EQUALS`,
        fieldValue: {
            value: direction,
            type: `STRING`,
        },
    };
}

/**
 * Builds a filter, that will define the start rank of the query
 * @param startRank - The startRank/index of the query
 * @returns The filter object
 */
export function getStartRankFilterForStartRank(startRank: number): any {
    return {
        fieldName: `startRank`,
        comparator: `EQUALS`,
        fieldValue: {
            value: startRank,
            type: `INT64`,
        },
    };
}

/**
 * Builds a filter, that will request the index count of a given folder, if parentId is undefined, all photos will be queried
 * @param parentId - The parentId of the folder
 * @returns The filter object
 */
export function getIndexCountFilter(parentId?: string): any {
    if (parentId) {
        return {
            fieldName: `indexCountID`,
            comparator: `IN`,
            fieldValue: {
                value: [`CPLContainerRelationNotDeletedByAssetDate:${parentId}`],
                type: `STRING_LIST`,
            },
        };
    }

    return {
        fieldName: `indexCountID`,
        comparator: `IN`,
        fieldValue: {
            value: [`CPLAssetByAssetDateWithoutHiddenOrDeleted`],
            type: `STRING_LIST`,
        },
    };
}

/**
 * Creates the operations field for isDeleted
 * @param _value - The value to set the field to - 1 by default
 * @returns The formatted field
 */
export function getIsDeletedField(value: number = 1): any {
    return {
        isDeleted: {
            value,
        },
    };
}