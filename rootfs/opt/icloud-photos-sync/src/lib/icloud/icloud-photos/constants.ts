/**
 * File holding constant values for the iCloud class
 */

/**
 * Event lifecycle of iCloud-Photos class
 */
export enum EVENTS {
    SETUP_COMPLETE = `setup_complete`,
    INDEX_IN_PROGRESS = `index_in_progress`,
    READY = `ready`,
    ERROR = `error`,
}

/**
 * URL paths required to perform queries
 */
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

/**
 * The max record limit, requested & returned by iCloud.
 * Should be 200, but in order to divide by 3 (for albums) and 2 (for all pictures) 198 is more convenient
 */
export const MAX_RECORDS_LIMIT = 198;