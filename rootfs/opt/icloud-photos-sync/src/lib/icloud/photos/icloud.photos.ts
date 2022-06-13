import axios, {AxiosRequestConfig, AxiosResponse} from 'axios';
import log from 'loglevel';
import {EventEmitter} from 'events';

import * as ICLOUD_PHOTOS from './icloud.photos.constants.js';
import * as QueryBuilder from './icloud.photos.query-builder.js';
import {iCloudAuth} from '../icloud.auth.js';

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
     * @param recordType - The requested record type
     * @param filterBy - An array of filter instructions
     * @param resultsLimit - Results limit is maxed at 66 * 3 records (because every picture is returned three times)
     * @param desiredKeys - The fields requested from the backend
     * @returns An array of records as returned by the backend
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

    /**
     * Fetching a list of all top level albums
     * @returns An array of folder and album records without any parent
     */
    async fetchAllAlbumRecords(): Promise<any[]> {
        return this.performPromiseQuery(QueryBuilder.RECORD_TYPES.ALBUM_RECORDS);
    }

    /**
     * Fetches a list of directors with the same parent record name
     * @param parentId - The record name of the parent folder
     * @returns An array of folder and album records that have the specified parent folder
     */
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
        this.logger.debug(`Fetching all picture records for album ${parentId === undefined ? `All photos` : parentId}`);
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
        const numberOfRequests = parentId === undefined
            ? Math.ceil((totalCount * 2) / ICLOUD_PHOTOS.MAX_RECORDS_LIMIT) // On all pictures two records per photo are returned (CPLMaster & CPLAsset) which are counted against max
            : Math.ceil((totalCount * 3) / ICLOUD_PHOTOS.MAX_RECORDS_LIMIT); // On folders three records per photo are returned (CPLMaster, CPLAsset & CPLContainerRelation) which are counted against max

        this.logger.debug(`Expecting ${totalCount} records for album ${parentId === undefined ? `All photos` : parentId}, executing ${numberOfRequests} queries`);

        // Collecting all promise queries for parallel execution
        const promiseQueries: Promise<any>[] = [];
        for (let index = 0; index < numberOfRequests; index++) {
            const startRank = parentId === undefined // The start rank always refers to the touple/triple of records, therefore we need to adjust the start rank based on the amount of records returned
                ? index * Math.floor(ICLOUD_PHOTOS.MAX_RECORDS_LIMIT / 2)
                : index * Math.floor(ICLOUD_PHOTOS.MAX_RECORDS_LIMIT / 3);
            this.logger.debug(`Building query for records of album ${parentId === undefined ? `All photos` : parentId} at index ${startRank}`);
            const startRankFilter = QueryBuilder.getStartRankFilterForStartRank(startRank);
            const directionFilter = QueryBuilder.getDirectionFilterForDirection();

            // Different queries for 'all pictures' than album pictures
            if (parentId === undefined) {
                promiseQueries.push(this.performPromiseQuery(
                    QueryBuilder.RECORD_TYPES.ALL_PHOTOS,
                    [startRankFilter, directionFilter],
                    ICLOUD_PHOTOS.MAX_RECORDS_LIMIT,
                    [
                        QueryBuilder.DESIRED_KEYS.RECORD_NAME,
                        QueryBuilder.DESIRED_KEYS.ORIGINAL_RESSOURCE,
                        QueryBuilder.DESIRED_KEYS.ORIGINAL_RESSOURCE_FILE_TYPE,
                        QueryBuilder.DESIRED_KEYS.EDITED_JPEG_RESSOURCE,
                        QueryBuilder.DESIRED_KEYS.EDITED_JPEG_RESSOURCE_FILE_TYPE,
                        QueryBuilder.DESIRED_KEYS.EDITED_VIDEO_RESSOURCE,
                        QueryBuilder.DESIRED_KEYS.EDITED_VIDEO_RESSOURCE_FILE_TYPE,
                        QueryBuilder.DESIRED_KEYS.ENCODED_FILE_NAME,
                        QueryBuilder.DESIRED_KEYS.IS_DELETED,
                        QueryBuilder.DESIRED_KEYS.FAVORITE,
                        QueryBuilder.DESIRED_KEYS.IS_HIDDEN,
                    ],
                ));
            } else {
                const parentFilter = QueryBuilder.getParentFilterforParentId(parentId);
                promiseQueries.push(this.performPromiseQuery(
                    QueryBuilder.RECORD_TYPES.PHOTO_RECORDS,
                    [startRankFilter, directionFilter, parentFilter],
                    ICLOUD_PHOTOS.MAX_RECORDS_LIMIT,
                    [
                        QueryBuilder.DESIRED_KEYS.RECORD_NAME,
                        QueryBuilder.DESIRED_KEYS.IS_HIDDEN,
                        QueryBuilder.DESIRED_KEYS.IS_HIDDEN,
                    ],
                ));
            }
        }

        // Executing queries in parallel
        let resultRecords: any[];
        try {
            const allRecords: any[] = [];
            // Merging arrays of arrays
            (await Promise.all(promiseQueries)).forEach(records => allRecords.push(...records));

            this.logger.debug(`Got ${allRecords.length} for album ${parentId === undefined ? `'All photos'` : parentId} before filtering (out of expected ${totalCount})`);
            // Post-processing response
            const seen = {};
            resultRecords = allRecords.filter(record => {
                if (record.deleted === true) {
                    this.logger.debug(`Filtering record ${record.recordName}: is deleted`);
                    return false;
                }

                if (record.fields.isHidden?.value === 1) {
                    this.logger.debug(`Filtering record ${record.recordName}: is hidden`);
                    return false;
                }

                if (record.recordType !== QueryBuilder.RECORD_TYPES.PHOTO_MASTER_RECORD) {
                    this.logger.trace(`Filtering record ${record.recordName}: is not CPLMaster`);
                    return false;
                }

                if (Object.prototype.hasOwnProperty.call(seen, record.recordName)) {
                    this.logger.warn(`Filtering record ${record.recordName}: duplicate`);
                    return false;
                }

                // Saving record name for future de-duplication
                seen[record.recordName] = true;
                return true;
            });
        } catch (err) {
            throw new Error(`Unable to fetch records for album ${parentId === undefined ? `'All photos'` : parentId}: ${err.message}`);
        }

        if (resultRecords.length !== totalCount) {
            this.logger.warn(`Expected ${totalCount} items for album ${parentId === undefined ? `'All photos'` : parentId}, but got ${resultRecords.length}`);
        } else {
            this.logger.info(`Got the expected amount of items for album ${parentId === undefined ? `'All photos'` : parentId}: ${resultRecords.length} out of ${totalCount}`);
        }

        return resultRecords;
    }
}