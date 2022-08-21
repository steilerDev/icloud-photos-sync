import axios, {AxiosRequestConfig, AxiosResponse} from 'axios';
import {EventEmitter} from 'events';
import * as ICLOUD_PHOTOS from './constants.js';
import * as QueryBuilder from './query-builder.js';
import {iCloudAuth} from '../auth.js';
import {AlbumAssets, AlbumType} from '../../photos-library/model/album.js';
import {Asset} from '../../photos-library/model/asset.js';
import {CPLAlbum, CPLAsset, CPLMaster} from './query-parser.js';
import {getLogger} from '../../logger.js';
import {convertCPLAssets} from '../../sync-engine/helpers/fetchAndLoad-helpers.js';

/**
 * This class holds connection and state with the iCloud Photos Backend and provides functions to access the data stored there
 */
export class iCloudPhotos extends EventEmitter {
    /**
     * Default logger for this class
     */
    private logger = getLogger(this);

    /**
     * Cookie required to authenticate against the iCloud Services
     */
    private auth: iCloudAuth;

    /**
     * Creates a new iCloud Photos Class
     * @param auth - The populated authentication object
     */
    constructor(auth: iCloudAuth) {
        super();
        this.auth = auth;
        this.on(ICLOUD_PHOTOS.EVENTS.SETUP_COMPLETE, this.checkingIndexingStatus);
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
     * Will emit SETUP_COMPLETE or ERROR
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
                this.auth.processPhotosSetupResponse(res);
                this.logger.debug(`Successfully gathered iCloud Photos account information!`);
                this.emit(ICLOUD_PHOTOS.EVENTS.SETUP_COMPLETE);
            })
            .catch(err => {
                this.emit(ICLOUD_PHOTOS.EVENTS.ERROR, `Unexpected error while setup: ${err}`);
            });
    }

    /**
     * Checking indexing state of photos service (sync should only safely be performed, after indexing is completed)
     * Will emit READY, INDEX_IN_PROGRESS or ERROR
     */
    checkingIndexingStatus() {
        this.logger.debug(`Checking Indexing Status of iCloud Photos Account`);
        this.performQuery(`CheckIndexingState`, res => {
            const state = res.data.records[0].fields.state.value;
            if (!state) {
                this.emit(ICLOUD_PHOTOS.EVENTS.ERROR, `Unable to get indexing state: ${res.data}`);
                return;
            }

            if (state === `FINISHED`) {
                this.logger.info(`Indexing finished, sync can start!`);
                this.emit(ICLOUD_PHOTOS.EVENTS.READY);
                return;
            }

            const progress = res.data.records[0].fields.progress.value;
            if (progress) {
                this.emit(ICLOUD_PHOTOS.EVENTS.INDEX_IN_PROGRESS, progress);
                return;
            }

            this.emit(ICLOUD_PHOTOS.EVENTS.ERROR, `Unknown state (${state}): ${JSON.stringify(res.data)}`);
        });
    }

    /**
     * Performs an arbitrary iCloud Photos Query
     * @param recordType - The recordType requested in the query
     * @param callback - A callback, executed upon sucessfull execution of the query
     */
    performQuery(recordType: string, callback: (res: AxiosResponse<any, any>) => void) {
        this.auth.validatePhotosAccount();
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
        this.auth.validatePhotosAccount();
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
    }

    async performPromiseOperation(operationType: string, recordName: string, _fields: any) {
        this.auth.validatePhotosAccount();
        const config: AxiosRequestConfig = {
            headers: this.auth.getPhotosHeader(),
            params: {
                remapEnums: `True`,
            },
        };

        const data: any = {
            operations: [
                {
                    operationType: `${operationType}`,
                    record: {
                        recordName: `${recordName}`,
                        recordType: `CPLAsset`,
                        fields: _fields,
                    },
                },
            ],
            zoneID: {
                ownerRecordName: this.auth.iCloudPhotosAccount.ownerName,
                zoneName: this.auth.iCloudPhotosAccount.zoneName,
                zoneType: this.auth.iCloudPhotosAccount.zoneType,
            },
            atomic: true,
        };
        const deletedRecords = (await axios.post(this.getServiceEndpoint(ICLOUD_PHOTOS.PATHS.EXT.MODIFY), data, config)).data.records;
        if (!deletedRecords || !Array.isArray(deletedRecords)) {
            throw new Error(`Fetched records are not in an array: ${JSON.stringify(deletedRecords)}`);
        }

        return deletedRecords;
    }

    /**
     * Fetches all album records, traversing the directory tree
     * @returns An array of all album records in the account
     * Since we are requesting them based on parent folder and are starting from the root folder the results array should yield: If folder A is closer to the root than folder B, the index of A is smaller than the index of B
     */
    async fetchAllAlbumRecords(): Promise<CPLAlbum[]> {
        try {
            // Getting root folders as an initial set for the processing queue
            const queue: CPLAlbum[] = await this.fetchAlbumRecords();
            const albumRecords: CPLAlbum[] = [];
            while (queue.length > 0) {
                const next = queue.shift();
                try {
                    // If album is a folder, there is stuff in there, adding it to the queue
                    if (next.albumType === AlbumType.FOLDER) {
                        this.logger.debug(`Adding child elements of ${next.albumNameEnc} to the processing queue`);
                        queue.push(...(await this.fetchAlbumRecords(next.recordName)));
                    }

                    albumRecords.push(next);
                } catch (err) {
                    throw new Error(`Unable to process ${next.albumNameEnc}: ${err.message}`);
                }
            }

            return albumRecords;
        } catch (err) {
            throw new Error(`Unable to fetch folder structure: ${err}`);
        }
    }

    /**
     * Fetching a list of albums identified by their parent. If parent is undefined, all albums without parent will be returned
     * @param parentId - The record name of the parent folder, or empty
     * @returns An array of folder and album records. Unwanted folders and folder types are filtered out. Albums have their items included (as a promise)
     */
    async fetchAlbumRecords(parentId?: string): Promise<CPLAlbum[]> {
        let query: Promise<any[]>;
        if (parentId === undefined) {
            query = this.performPromiseQuery(QueryBuilder.RECORD_TYPES.ALBUM_RECORDS);
        } else {
            const parentFilter = QueryBuilder.getParentFilterforParentId(parentId);
            query = this.performPromiseQuery(
                QueryBuilder.RECORD_TYPES.ALBUM_RECORDS,
                [parentFilter],
            );
        }

        const cplAlbums: CPLAlbum[] = [];

        (await query).forEach(record => {
            try {
                if (record.deleted === true) {
                    this.logger.warn(`Filtering record ${record.recordName}: is deleted`);
                    return;
                }

                if (record.recordName === `----Project-Root-Folder----` || record.recordName === `----Root-Folder----`) {
                    this.logger.debug(`Filtering special folder ${record.recordName}`);
                    return;
                }

                if (!(record.fields.albumType.value === AlbumType.FOLDER || record.fields.albumType.value === AlbumType.ALBUM)) {
                    this.logger.warn(`Ignoring unknown album type ${record.fields.albumType.value}`);
                    return;
                }

                // Getting associated assets for albums
                if (record.fields.albumType.value === AlbumType.ALBUM) {
                    const albumAssets: Promise<AlbumAssets> = this.fetchAllPictureRecords(record.recordName)
                        .then(cplResult => convertCPLAssets(cplResult[0], cplResult[1]))
                        .then(assets => {
                            const _albumAssets: AlbumAssets = {};
                            assets.forEach(asset => {
                                _albumAssets[asset.getAssetFilename()] = asset.getPrettyFilename();
                            });
                            return _albumAssets;
                        });
                    cplAlbums.push(CPLAlbum.parseFromQuery(record, albumAssets));
                } else {
                    cplAlbums.push(CPLAlbum.parseFromQuery(record));
                }
            } catch (err) {
                this.logger.warn(`Error building CPLAlbum: ${err.message}`);
            }
        });
        return cplAlbums;
    }

    /**
     * Fetching all pictures associated to an album, identified by parentId
     * @param parentId - The record name of the album, if undefined all pictures will be returned
     * @returns An array of CPLMaster and CPLAsset records
     */
    async fetchAllPictureRecords(parentId?: string): Promise<[CPLAsset[], CPLMaster[]]> {
        this.logger.debug(`Fetching all picture records for album ${parentId === undefined ? `All photos` : parentId}`);
        // Getting number of items in folder
        let totalCount = -1;
        try {
            const indexCountFilter = QueryBuilder.getIndexCountFilter(parentId);
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

            const desiredKeys: string[] = [
                QueryBuilder.DESIRED_KEYS.RECORD_NAME,
                QueryBuilder.DESIRED_KEYS.ORIGINAL_RESOURCE,
                QueryBuilder.DESIRED_KEYS.ORIGINAL_RESOURCE_FILE_TYPE,
                QueryBuilder.DESIRED_KEYS.JPEG_RESOURCE,
                QueryBuilder.DESIRED_KEYS.JPEG_RESOURCE_FILE_TYPE,
                QueryBuilder.DESIRED_KEYS.VIDEO_RESOURCE,
                QueryBuilder.DESIRED_KEYS.VIDEO_RESOURCE_FILE_TYPE,
                QueryBuilder.DESIRED_KEYS.ENCODED_FILE_NAME,
                QueryBuilder.DESIRED_KEYS.IS_DELETED,
                QueryBuilder.DESIRED_KEYS.FAVORITE,
                QueryBuilder.DESIRED_KEYS.IS_HIDDEN,
                QueryBuilder.DESIRED_KEYS.MASTER_REF,
                QueryBuilder.DESIRED_KEYS.ADJUSTMENT_TYPE,
            ];
            // Different queries for 'all pictures' than album pictures
            if (parentId === undefined) {
                promiseQueries.push(this.performPromiseQuery(
                    QueryBuilder.RECORD_TYPES.ALL_PHOTOS,
                    [startRankFilter, directionFilter],
                    ICLOUD_PHOTOS.MAX_RECORDS_LIMIT,
                    QueryBuilder.QUERY_KEYS,
                ));
            } else {
                const parentFilter = QueryBuilder.getParentFilterforParentId(parentId);
                promiseQueries.push(this.performPromiseQuery(
                    QueryBuilder.RECORD_TYPES.PHOTO_RECORDS,
                    [startRankFilter, directionFilter, parentFilter],
                    ICLOUD_PHOTOS.MAX_RECORDS_LIMIT,
                    desiredKeys,
                ));
            }
        }

        // Executing queries in parallel and afterwards collecting parsed responses
        const cplMasters: CPLMaster[] = [];
        const cplAssets: CPLAsset[] = [];
        try {
            const allRecords: any[] = [];
            // Merging arrays of arrays
            (await Promise.all(promiseQueries)).forEach(records =>
                allRecords.push(...records),
            );

            // Post-processing response
            const seen = {};
            allRecords.forEach(record => {
                try {
                    if (record.deleted === true) {
                        this.logger.warn(`Filtering record ${record.recordName}: is deleted`);
                        return;
                    }

                    if (record.fields.isHidden?.value === 1) {
                        this.logger.warn(`Filtering record ${record.recordName}: is hidden`);
                        return;
                    }

                    if (Object.prototype.hasOwnProperty.call(seen, record.recordName)) {
                        this.logger.warn(`Filtering record ${record.recordName}: duplicate`);
                        return;
                    }

                    if (record.recordType === QueryBuilder.RECORD_TYPES.CONTAINER_RELATION) {
                        // Expecting unnecessary container relationships and ignoring them
                        return;
                    }

                    if (record.recordType === QueryBuilder.RECORD_TYPES.PHOTO_MASTER_RECORD) {
                        cplMasters.push(CPLMaster.parseFromQuery(record));
                        seen[record.recordName] = true;
                    } else if (record.recordType === QueryBuilder.RECORD_TYPES.PHOTO_ASSET_RECORD) {
                        cplAssets.push(CPLAsset.parseFromQuery(record));
                        seen[record.recordName] = true;
                    } else {
                        this.logger.warn(`Filtering record ${record.recordName}: unknown recordType: ${record.recordType}`);
                        return;
                    }
                } catch (err) {
                    this.logger.warn(`Error building CPLMaster/CPLAsset: ${err.message}`);
                }
            });
        } catch (err) {
            throw new Error(`Unable to fetch records for album ${parentId === undefined ? `'All photos'` : parentId}: ${err.message}`);
        }

        if (cplMasters.length !== totalCount || cplAssets.length !== totalCount) {
            this.logger.warn(`Expected ${totalCount} CPLMaster & ${totalCount} CPLAsset records, but got ${cplMasters.length} CPLMaster & ${cplAssets.length} CPLAsset records for album ${parentId === undefined ? `'All photos'` : parentId}`);
        } else {
            this.logger.debug(`Received expected amount (${totalCount}) of records for album ${parentId === undefined ? `'All photos'` : parentId}`);
        }

        return [cplAssets, cplMasters];
    }

    /**
     * Downloads an asset using the 'stream' method
     * @param asset - The asset to be downloaded
     * @returns A promise, that -once resolved-, contains the Axios response
     */
    async downloadAsset(asset: Asset): Promise<AxiosResponse<any, any>> {
        this.logger.debug(`Starting download of asset ${asset.fileChecksum}`);

        const config: AxiosRequestConfig = {
            headers: this.auth.getPhotosHeader(),
            responseType: `stream`,
        };

        return axios.get(
            asset.downloadURL,
            config,
        );
    }

    async deleteAsset(recordName: string) {
        this.logger.debug(`Deleting asset ${recordName}`);
        return this.performPromiseOperation(`update`, recordName, QueryBuilder.getIsDeletedField());
    }
}