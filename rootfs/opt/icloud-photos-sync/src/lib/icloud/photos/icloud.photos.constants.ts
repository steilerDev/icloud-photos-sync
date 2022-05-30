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
        SETUP: `/zones/list`,
    },
};