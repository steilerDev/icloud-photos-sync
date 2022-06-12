import axios, {AxiosRequestConfig, AxiosResponse} from 'axios';
import log from 'loglevel';
import {EventEmitter} from 'events';

import * as ICLOUD_PHOTOS from './icloud.photos.constants.js';
import * as QueryBuilder from './icloud.photos.query-builder.js';
import {iCloudAuth} from '../icloud.auth.js';
import {dir} from 'console';

/**
 * This class holds connection and state with the iCloud Photos Backend and provides functions to access the data stored there
 */
export class iCloudPhotos extends EventEmitter {
    /**
     * Cookie required to authenticate against the iCloud Services
     */
    auth: iCloudAuth;

    logger: log.Logger = log.getLogger(`I-Cloud-Photos`);

    constructor(auth: iCloudAuth) {
        super();
        this.auth = auth;

        this.on(ICLOUD_PHOTOS.EVENTS.SETUP_COMPLETE, this.checkingIndexingStatus);

        // This.on(ICLOUD_PHOTOS.EVENTS.READY, () => {

        // });

        // this.on(ICLOUD_PHOTOS.EVENTS.INDEX_IN_PROGRESS, (progress: string) => {
        // @todo: Implement retry instead of failure
        // });

        // this.on(ICLOUD_PHOTOS.EVENTS.ERROR, (msg: string) => {

        // });
    }

    /**
     * Builds the full service endpoint URL based on currently assigned iCP domain
     * @param ext - The service endpoint extension applied to the base domain
     */
    getServiceEndpoint(ext: string): string {
        return `${this.auth.iCloudPhotosAccount.photosDomain}${ICLOUD_PHOTOS.PATHS.BASE_PATH}${ext}`;
    }

    /**
     * Starting iCloud Photos service, acquiring all necessary account information stored in iCloudAuth.iCloudPhotosAccount
     */
    setup() {
        this.logger.debug(`Getting iCloud Photos account information`);

        const config: AxiosRequestConfig = {
            headers: this.auth.getPhotosHeader(),
            params: {
                getCurrentSyncToken: `True`,
                remapEnums: `True`,
            },
        };

        axios.get(this.getServiceEndpoint(ICLOUD_PHOTOS.PATHS.EXT.LIST), config)
            .then(res => {
                if (this.auth.processPhotosSetupResponse(res)) {
                    this.logger.debug(`Successfully gathered iCloud Photos account information!`);
                    this.emit(ICLOUD_PHOTOS.EVENTS.SETUP_COMPLETE);
                } else {
                    this.emit(ICLOUD_PHOTOS.EVENTS.ERROR, `Unable to acquire iCloud Photos account information`);
                }
            })
            .catch(err => {
                this.emit(ICLOUD_PHOTOS.EVENTS.ERROR, `Unexpected error while setup: ${err}`);
            });
    }

    /**
     * Checking indexing state of photos service (sync should only safely be performed, after indexing is completed)
     */
    checkingIndexingStatus() {
        this.logger.debug(`Checking Indexing Status of iCloud Photos Account`);
        this.performQuery(`CheckIndexingState`, res => {
            const state = res.data.records[0].fields.state.value;
            if (!state) {
                this.emit(ICLOUD_PHOTOS.EVENTS.ERROR, `Unable to get indexing state: ${res.data}`);
            } else if (state === `FINISHED`) {
                this.logger.info(`Indexing finished, sync can start!`);
                this.emit(ICLOUD_PHOTOS.EVENTS.READY);
            } else {
                const progress = res.data.records[0].fields.progress.value;
                if (progress) {
                    this.emit(ICLOUD_PHOTOS.EVENTS.INDEX_IN_PROGRESS, progress);
                } else {
                    this.emit(ICLOUD_PHOTOS.EVENTS.ERROR, `Unknown state (${state}): ${res.data}`);
                }
            }
        });
    }

    /**
     * Performs an arbitrary iCloud Photos Query
     * @param recordType - The recordType requested in the query
     * @param callback - A callback, executed upon sucessfull execution of the query
     */
    performQuery(recordType: string, callback: (res: AxiosResponse<any, any>) => void) {
        if (this.auth.validatePhotosAccount()) {
            const config: AxiosRequestConfig = {
                headers: this.auth.getPhotosHeader(),
            };

            const data = {
                query: {
                    recordType: `${recordType}`,
                },
                zoneID: {
                    ownerRecordName: this.auth.iCloudPhotosAccount.ownerName,
                    zoneName: this.auth.iCloudPhotosAccount.zoneName,
                    zoneType: this.auth.iCloudPhotosAccount.zoneType,
                },
            };

            axios.post(this.getServiceEndpoint(ICLOUD_PHOTOS.PATHS.EXT.QUERY), data, config)
                .then(callback)
                .catch(err => {
                    this.emit(ICLOUD_PHOTOS.EVENTS.ERROR, `Unexpected error when performing query ${recordType}: ${err}`);
                });
        } else {
            this.emit(ICLOUD_PHOTOS.EVENTS.ERROR, `Unable to perform query, because photos account validation failed`);
        }
    }

    /**
     * Performs a query against the iCloud Photos Service
     * @param recordType
     * @param filterBy
     * @param resultsLimit Results limit is maxed at 66 * 3 records (because every picture is returned three times)
     * @param desiredKeys
     * @returns
     */
    async performPromiseQuery(recordType: string, filterBy?: any[], resultsLimit?: number, desiredKeys?: string[]): Promise<any[]> {
        if (this.auth.validatePhotosAccount()) {
            const config: AxiosRequestConfig = {
                headers: this.auth.getPhotosHeader(),
                params: {
                    remapEnums: `True`,
                },
            };

            const data: any = {
                query: {
                    recordType: `${recordType}`,
                },
                zoneID: {
                    ownerRecordName: this.auth.iCloudPhotosAccount.ownerName,
                    zoneName: this.auth.iCloudPhotosAccount.zoneName,
                    zoneType: this.auth.iCloudPhotosAccount.zoneType,
                },
            };

            if (filterBy) {
                data.query.filterBy = filterBy;
            }

            if (desiredKeys) {
                data.desiredKeys = desiredKeys;
            }

            if (resultsLimit) {
                data.resultsLimit = resultsLimit;
            }

            const fetchedRecords = (await axios.post(this.getServiceEndpoint(ICLOUD_PHOTOS.PATHS.EXT.QUERY), data, config)).data.records;
            if (fetchedRecords && Array.isArray(fetchedRecords)) {
                return fetchedRecords;
            }

            throw new Error(`Fetched records are not in an array: ${JSON.stringify(fetchedRecords)}`);
        } else {
            throw (new Error(`Unable to perform query, because photos account validation failed`));
        }
    }

    async fetchAllAlbumRecords(): Promise<any[]> {
        return this.performPromiseQuery(QueryBuilder.RECORD_TYPES.ALBUM_RECORDS);
    }

    async fetchAllAlbumRecordsByParentId(parentId: string): Promise<any[]> {
        const parentFilter = QueryBuilder.getParentFilterforParentId(parentId);
        return this.performPromiseQuery(
            QueryBuilder.RECORD_TYPES.ALBUM_RECORDS,
            [parentFilter],
        );
    }

    /**
     * Fetching all pictures associated to an album, identified by parentId
     * @param parentId - The record name of the album, if undefined all pictures will be returned
     * @returns An array of CPLMaster filtered records containing the RecordName
     */
    async fetchAllPictureRecords(parentId?: string): Promise<any[]> {
        // Getting number of items in folder
        let totalCount = -1;
        try {
            const indexCountFilter = parentId === undefined
                ? QueryBuilder.getIndexCountForAllPhotos()
                : QueryBuilder.getIndexCountFilterForParentId(parentId);
            const countData = await this.performPromiseQuery(
                QueryBuilder.RECORD_TYPES.INDEX_COUNT,
                [indexCountFilter],
            );
            totalCount = countData[0].fields.itemCount.value;
        } catch (err) {
            throw new Error(`Unable to extract count data: ${err.message}`);
        }

        // Calculating number of concurrent requests, in order to execute in parallel
        const numberOfRequests = Math.ceil(totalCount / ICLOUD_PHOTOS.MAX_PICTURE_RECORDS_LIMIT);
        this.logger.debug(`Expecting ${totalCount} records for album ${parentId === undefined ? `All photos` : parentId}, executing ${numberOfRequests} queries`);
        // Collecting all promise queries
        const promiseQueries: Promise<any>[] = [];
        for (let index = 0; index < numberOfRequests; index++) {
            const startRank = index * ICLOUD_PHOTOS.MAX_PICTURE_RECORDS_LIMIT;
            this.logger.debug(`Building query for records at index ${startRank}`);
            const startRankFilter = QueryBuilder.getStartRankFilterForStartRank(startRank);
            const directionFilter = QueryBuilder.getDirectionFilterForDirection();

            // Different queries for 'all pictures' than album pictures
            if (parentId === undefined) {
                promiseQueries.push(this.performPromiseQuery(
                    QueryBuilder.RECORD_TYPES.ALL_PHOTOS,
                    [startRank, directionFilter],
                    ICLOUD_PHOTOS.MAX_RECORDS_LIMIT,
                    [QueryBuilder.DESIRED_KEYS.EDITED_JPEG_RESSOURCE, QueryBuilder.DESIRED_KEYS.EDITED_VIDEO_RESSOURCE, QueryBuilder.DESIRED_KEYS.ENCODED_FILE_NAME, QueryBuilder.DESIRED_KEYS.IS_DELETED, QueryBuilder.DESIRED_KEYS.ORIGINAL_RESSOURCE, QueryBuilder.DESIRED_KEYS.RECORD_NAME],
                ));
            } else {
                const parentFilter = QueryBuilder.getParentFilterforParentId(parentId);
                promiseQueries.push(this.performPromiseQuery(
                    QueryBuilder.RECORD_TYPES.PHOTO_RECORDS,
                    [startRankFilter, directionFilter, parentFilter],
                    ICLOUD_PHOTOS.MAX_RECORDS_LIMIT,
                    [QueryBuilder.DESIRED_KEYS.RECORD_NAME],
                ));
            }
        }

        // Executing queries in parallel
        let resultRecords: any[];
        try {
            const allRecords: any[] = [];
            // Merging arrays of arrays
            (await Promise.all(promiseQueries)).forEach(records => allRecords.push(...records));

            resultRecords = allRecords.filter(record => record.recordType === QueryBuilder.RECORD_TYPES.PHOTO_MASTER_RECORD);
        } catch (err) {
            throw new Error(`Unable to fetch records for album ${parentId}: ${err.message}`);
        }

        if (resultRecords.length !== totalCount) {
            this.logger.warn(`Expected ${totalCount} items for album ${parentId}, but got ${resultRecords.length}`);
        } else {
            this.logger.debug(`Got the expected amount of items for album ${parentId}: ${resultRecords.length} out of ${totalCount}`);
        }

        return resultRecords;
    }
}