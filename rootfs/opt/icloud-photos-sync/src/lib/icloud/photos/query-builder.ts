/**
 * This file helps building queries for the iCloud Photos backend service
 */

/**
 * All relevant record types for this application
 */
export const RECORD_TYPES = {
    PHOTO_MASTER_RECORD: `CPLMaster`,
    PHOTO_ASSET_RECORD: `CPLAsset`,
    PHOTO_ALBUM_RECORD: `CPLAlbum`,
    PHOTO_RECORDS: `CPLContainerRelationLiveByPosition`, // Record
    ALBUM_RECORDS: `CPLAlbumByPositionLive`,
    INDEX_COUNT: `HyperionIndexCountLookup`,
    ALL_PHOTOS: `CPLAssetAndMasterByAddedDate`,
};

/**
 * All relevant desired keys as provided to the backend
 */
export const DESIRED_KEYS = {
    RECORD_NAME: `recordName`,
    IS_DELETED: `isDeleted`,
    ORIGINAL_RESSOURCE: `resOriginalRes`,
    ORIGINAL_RESSOURCE_FILE_TYPE: `resOriginalFileType`,
    JPEG_RESSOURCE: `resJPEGFullRes`,
    JPEG_RESSOURCE_FILE_TYPE: `resJPEGFullFileType`,
    VIDEO_RESSOURCE: `resVidFullRes`,
    VIDEO_RESSOURCE_FILE_TYPE: `resVidFullFileType`,
    ENCODED_FILE_NAME: `filenameEnc`,
    FAVORITE: `isFavorite`,
    IS_HIDDEN: `isHidden`,
    ADJUSTMENT_TYPE: `adjustmentType`,
    MASTER_REF: `masterRef`,
    // Folder keys for parsing
    ALBUM_TYPE: `albumType`,
    ENCODED_ALBUM_NAME: `albumNameEnc`,
    PARENT_ID: `parentId`,
};

/**
 * Builds a filter, that reduce the query based on the parentId
 * @param parentId - The parentId (record name) of the parent album
 * @returns The filter required to perform a query
 */
export function getParentFilterforParentId(parentId: string): any {
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

export function getIndexCountFilterForParentId(parentId: string): any {
    return {
        fieldName: `indexCountID`,
        comparator: `IN`,
        fieldValue: {
            value: [`CPLContainerRelationNotDeletedByAssetDate:${parentId}`],
            type: `STRING_LIST`,
        },
    };
}

export function getIndexCountForAllPhotos(): any {
    return {
        fieldName: `indexCountID`,
        comparator: `IN`,
        fieldValue: {
            value: [`CPLAssetByAssetDateWithoutHiddenOrDeleted`],
            type: `STRING_LIST`,
        },
    };
}