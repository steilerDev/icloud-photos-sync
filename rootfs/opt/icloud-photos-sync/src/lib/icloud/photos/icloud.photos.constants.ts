/**
 * File holding constant values for the iCloud class
 */

export enum EVENTS {
    SETUP_COMPLETE = `setup_complete`,
    INDEX_IN_PROGRESS = `index_in_progress`,
    READY = `ready`,
    ERROR = `error`,
}

export const PATHS = {
    /**
     * Base Path (between Domain & EXT)
     */
    BASE_PATH: `/database/1/com.apple.photos.cloud/production/private`,
    EXT: {
        QUERY: `/records/query`,
        LIST: `/zones/list`,
    },
};
export const MAX_PICTURE_RECORDS_LIMIT = 66; // 66 seems to be max
export const MAX_RECORDS_LIMIT = MAX_PICTURE_RECORDS_LIMIT * 3; // Pictures are always returned in pairs of three