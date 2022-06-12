export const RECORD_TYPES = {
    PHOTO_RECORDS: `CPLContainerRelationLiveByPosition`, // Record
    PHOTO_MASTER_RECORD: `CPLMaster`,
    ALBUM_RECORDS: `CPLAlbumByPositionLive`,
    INDEX_COUNT: `HyperionIndexCountLookup`,
    //   ALL_PHOTOS_FOLDER: `CPLAssetByAssetDateWithoutHiddenOrDeleted`,
    ALL_PHOTOS: `CPLAssetAndMasterByAddedDate`,
//    ALL_PHOTOS: `CPLAssetAndMasterByAssetDateWithoutHiddenOrDeleted`,
};

export const DESIRED_KEYS = {
    RECORD_NAME: `recordName`,
    IS_DELETED: `isDeleted`,
    ORIGINAL_RESSOURCE: `resOriginalRes`,
    ORIGINAL_RESSOURCE_FILE_TYPE: `resOriginalFileType`,
    EDITED_JPEG_RESSOURCE: `resJPEGFullRes`,
    EDITED_JPEG_RESSOURCE_FILE_TYPE: `resJPEGFullFileType`,
    EDITED_VIDEO_RESSOURCE: `resVidFullRes`,
    EDITED_VIDEO_RESSOURCE_FILE_TYPE: `resVidFullFileType`,
    ENCODED_FILE_NAME: `filenameEnc`,
    FAVORITE: `isFavorite`,
//    ITEM_TYPE: `itemType`,
};

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