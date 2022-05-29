/**
 * File holding constant values for the iCloud class
 */

import * as ICLOUD from '../icloud.constants.js';

export enum EVENTS {
    SETUP_COMPLETE = `setup_complete`,
    INDEX_IN_PROGRESS = `index_in_progress`,
    READY = `ready`,
    ERROR = `error`,
}

export const DEFAULT_HEADER = {
    'User-Agent': ICLOUD.USER_AGENT,
    Accept: `application/json`,
    Origin: `https://www.icloud.com`,
};

export const PATHS = {
    QUERY: `/records/query`,
    SETUP: `/zones/list`,
};

export const SERVICE_ENDPOINT_PATH = `/database/1/com.apple.photos.cloud/production/private`;