import axios, {AxiosInstance, AxiosRequestConfig, AxiosResponse} from 'axios';
import {EventEmitter} from 'events';
import * as ICLOUD_PHOTOS from './constants.js';
import * as QueryBuilder from './query-builder.js';
import {iCloudAuth} from '../auth.js';
import {AlbumAssets, AlbumType} from '../../photos-library/model/album.js';
import {Asset} from '../../photos-library/model/asset.js';
import {CPLAlbum, CPLAsset, CPLMaster} from './query-parser.js';
import {getLogger} from '../../logger.js';
import {convertCPLAssets} from '../../sync-engine/helpers/fetchAndLoad-helpers.js';
import {HANDLER_EVENT} from '../../../app/event/error-handler.js';
import {iCPSError} from '../../../app/error/error.js';
import {ICLOUD_PHOTOS_ERR} from '../../../app/error/error-codes.js';

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
     * Local axios instance to handle network requests
     */
    axios: AxiosInstance;

    /**
     * A promise that will resolve, once the object is ready or reject, in case there is an error
     */
    ready: Promise<void>;

    /**
     * Creates a new iCloud Photos Class
     * @param auth - The populated authentication object
     */
    constructor(auth: iCloudAuth) {
        super();
        this.auth = auth;
        this.axios = axios.create();
        this.on(ICLOUD_PHOTOS.EVENTS.SETUP_COMPLETE, async () => {
            await this.checkingIndexingStatus();
        });

        this.ready = this.getReady();
    }

    /**
     *
     * @returns - A promise, that will resolve once this objects emits 'READY' or reject if it emits 'ERROR'
     */
    getReady(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.once(ICLOUD_PHOTOS.EVENTS.READY, () => resolve());
            this.once(ICLOUD_PHOTOS.EVENTS.ERROR, err => reject(err));
        });
    }

    /**
     * Builds the full service endpoint URL based on currently assigned iCP domain
     * @param ext - The service endpoint extension applied to the base domain
     * @returns The full URL to the current active service endpoint
     */
    getServiceEndpoint(ext: string): string {
        if (!this.auth.iCloudPhotosAccount.photosDomain || this.auth.iCloudPhotosAccount.photosDomain.length === 0) {
            throw new iCPSError(ICLOUD_PHOTOS_ERR.DOMAIN_MISSING);
        }

        return `${this.auth.iCloudPhotosAccount.photosDomain}${ICLOUD_PHOTOS.PATHS.BASE_PATH}${ext}`;
    }

    /**
     * Starting iCloud Photos service, acquiring all necessary account information stored in iCloudAuth.iCloudPhotosAccount
     * Will emit SETUP_COMPLETE or ERROR
     * @returns A promise, that will resolve once the service is available or reject in case of an error
     */
    async setup() {
        try {
            this.logger.debug(`Getting iCloud Photos account information`);

            const config: AxiosRequestConfig = {
                "headers": this.auth.getPhotosHeader(),
                "params": {
                    "getCurrentSyncToken": `True`,
                    "remapEnums": `True`,
                },
            };
            //
            // For Shared library support change this to {{Photos_URL}}/database/1/com.apple.photos.cloud/production/private/changes/database
            //
            const setupResponse = await this.axios.get(this.getServiceEndpoint(ICLOUD_PHOTOS.PATHS.EXT.LIST), config);
            this.auth.processPhotosSetupResponse(setupResponse);
            this.logger.debug(`Successfully gathered iCloud Photos account information`);
            this.emit(ICLOUD_PHOTOS.EVENTS.SETUP_COMPLETE);
        } catch (err) {
            this.emit(ICLOUD_PHOTOS.EVENTS.ERROR, new iCPSError(ICLOUD_PHOTOS_ERR.SETUP_ERROR).addCause(err));
        } finally {
            return this.ready;
        }
    }

    /**
     * Checking indexing state of photos service (sync should only safely be performed, after indexing is completed)
     * Will emit READY, INDEX_IN_PROGRESS or ERROR
     */
    async checkingIndexingStatus() {
        this.logger.debug(`Checking Indexing Status of iCloud Photos Account`);
        try {
            const result = await this.performQuery(`CheckIndexingState`);
            const state = result[0]?.fields?.state?.value;
            if (!state) {
                this.emit(ICLOUD_PHOTOS.EVENTS.ERROR, new iCPSError(ICLOUD_PHOTOS_ERR.INDEXING_STATE_UNAVAILABLE).addContext(`icloudResult`, result));
                return;
            }

            if (state === `RUNNING`) {
                const progress = result[0]?.fields?.progress?.value;
                const indexingInProgressError = new iCPSError(ICLOUD_PHOTOS_ERR.INDEXING_IN_PROGRESS)
                if (progress) {
                    indexingInProgressError.addMessage(`progress ${progress}`)
                }
                this.emit(ICLOUD_PHOTOS.EVENTS.ERROR, indexingInProgressError)
                return
            }

            if(state === `FINISHED`) {
                this.logger.info(`Indexing finished, sync can start!`);
                this.emit(ICLOUD_PHOTOS.EVENTS.READY);
                return
            }

            this.emit(ICLOUD_PHOTOS.EVENTS.ERROR, new iCPSError(ICLOUD_PHOTOS_ERR.INDEXING_STATE_UNKNOWN)
                .addContext(`icloudResult`, result));
            return;
        } catch (err) {
            this.emit(ICLOUD_PHOTOS.EVENTS.ERROR, new iCPSError(ICLOUD_PHOTOS_ERR.INDEXING_STATE_UNKNOWN).addCause(err));
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
    async performQuery(recordType: string, filterBy?: any[], resultsLimit?: number, desiredKeys?: string[]): Promise<any[]> {
        this.auth.validatePhotosAccount();
        const config: AxiosRequestConfig = {
            "headers": this.auth.getPhotosHeader(),
            "params": {
                "remapEnums": `True`,
            },
        };

        const data: any = {
            "query": {
                "recordType": `${recordType}`,
            },
            "zoneID": {
                "ownerRecordName": this.auth.iCloudPhotosAccount.ownerName,
                "zoneName": this.auth.iCloudPhotosAccount.zoneName,
                "zoneType": this.auth.iCloudPhotosAccount.zoneType,
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

        const queryResponse = (await this.axios.post(this.getServiceEndpoint(ICLOUD_PHOTOS.PATHS.EXT.QUERY), data, config));
        const fetchedRecords = queryResponse.data.records;
        if (!fetchedRecords || !Array.isArray(fetchedRecords)) {
            throw new iCPSError(ICLOUD_PHOTOS_ERR.UNEXPECTED_QUERY_RESPONSE)
                .addContext(`queryResponse`, queryResponse);
        }

        return fetchedRecords;
    }

    /**
     * Performs a single operation with the iCloud Backend
     * @param operationType - The type of operation, that should be performed
     * @param recordNames - The list of recordNames of the asset the operation should be performed on
     * @param fields - The fields to be altered
     * @returns An array of records that have been altered
     */
    async performOperation(operationType: string, fields: any, recordNames: string[]) {
        this.auth.validatePhotosAccount();
        const config: AxiosRequestConfig = {
            "headers": this.auth.getPhotosHeader(),
            "params": {
                "remapEnums": `True`,
            },
        };

        const data: any = {
            "operations": [],
            "zoneID": {
                "ownerRecordName": this.auth.iCloudPhotosAccount.ownerName,
                "zoneName": this.auth.iCloudPhotosAccount.zoneName,
                "zoneType": this.auth.iCloudPhotosAccount.zoneType,
            },
            "atomic": true,
        };

        data.operations = recordNames.map(recordName => ({
            "operationType": `${operationType}`,
            "record": {
                "recordName": `${recordName}`,
                "recordType": `CPLAsset`,
                "recordChangeTag": ICLOUD_PHOTOS.RECORD_CHANGE_TAG,
                fields,
            },
        }));

        const operationResponse = await this.axios.post(this.getServiceEndpoint(ICLOUD_PHOTOS.PATHS.EXT.MODIFY), data, config);
        const fetchedRecords = operationResponse.data.records;
        if (!fetchedRecords || !Array.isArray(fetchedRecords)) {
            throw new iCPSError(ICLOUD_PHOTOS_ERR.UNEXPECTED_OPERATIONS_RESPONSE)
                .addContext(`operationResponse`, operationResponse);
        }

        return fetchedRecords;
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
                    throw new iCPSError(ICLOUD_PHOTOS_ERR.ALBUM_PROCESSING)
                        .addMessage(next.albumNameEnc)
                        .addCause(err);
                }
            }

            return albumRecords;
        } catch (err) {
            throw new iCPSError(ICLOUD_PHOTOS_ERR.FOLDER_STRUCTURE).addCause(err);
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
            query = this.performQuery(QueryBuilder.RECORD_TYPES.ALBUM_RECORDS);
        } else {
            const parentFilter = QueryBuilder.getParentFilterForParentId(parentId);
            query = this.performQuery(
                QueryBuilder.RECORD_TYPES.ALBUM_RECORDS,
                [parentFilter],
            );
        }

        const cplAlbums: CPLAlbum[] = [];

        (await query).forEach(record => {
            try {
                if (record.deleted === true) {
                    this.emit(HANDLER_EVENT, new iCPSError(ICLOUD_PHOTOS_ERR.DELETED_RECORD)
                        .addMessage(record.recordName)
                        .setWarning()
                        .addContext(`record`, record));
                    return;
                }

                if (record.recordName === `----Project-Root-Folder----` || record.recordName === `----Root-Folder----`) {
                    this.logger.debug(`Filtering special folder ${record.recordName}`);
                    return;
                }

                if (!(record.fields.albumType.value === AlbumType.FOLDER || record.fields.albumType.value === AlbumType.ALBUM)) {
                    this.emit(HANDLER_EVENT, new iCPSError(ICLOUD_PHOTOS_ERR.UNKNOWN_ALBUM)
                        .setWarning()
                        .addMessage(record.fields.albumType.value)
                        .addContext(`record.fields`, record.fields));
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
                this.emit(HANDLER_EVENT, new iCPSError(ICLOUD_PHOTOS_ERR.PROCESS_ALBUM)
                    .addCause(err)
                    .addContext(`record`, record));
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
            const countData = await this.performQuery(
                QueryBuilder.RECORD_TYPES.INDEX_COUNT,
                [indexCountFilter],
            );
            totalCount = countData[0].fields.itemCount.value;
        } catch (err) {
            throw new iCPSError(ICLOUD_PHOTOS_ERR.COUNT_DATA)
                .setWarning()
                .addCause(err);
        }

        // Calculating number of concurrent requests, in order to execute in parallel
        const numberOfRequests = parentId === undefined
            ? Math.ceil((totalCount * 2) / ICLOUD_PHOTOS.MAX_RECORDS_LIMIT) // On all pictures two records per photo are returned (CPLMaster & CPLAsset) which are counted against max
            : Math.ceil((totalCount * 3) / ICLOUD_PHOTOS.MAX_RECORDS_LIMIT); // On folders three records per photo are returned (CPLMaster, CPLAsset & CPLContainerRelation) which are counted against max

        this.logger.debug(`Expecting ${totalCount} records for album ${parentId === undefined ? `All photos` : parentId}, executing ${numberOfRequests} queries`);

        // Collecting all promise queries for parallel execution
        const promiseQueries: Promise<any>[] = [];
        for (let index = 0; index < numberOfRequests; index++) {
            const startRank = parentId === undefined // The start rank always refers to the tuple/triple of records, therefore we need to adjust the start rank based on the amount of records returned
                ? index * Math.floor(ICLOUD_PHOTOS.MAX_RECORDS_LIMIT / 2)
                : index * Math.floor(ICLOUD_PHOTOS.MAX_RECORDS_LIMIT / 3);
            this.logger.debug(`Building query for records of album ${parentId === undefined ? `All photos` : parentId} at index ${startRank}`);
            const startRankFilter = QueryBuilder.getStartRankFilterForStartRank(startRank);
            const directionFilter = QueryBuilder.getDirectionFilterForDirection();

            // Different queries for 'all pictures' than album pictures
            if (parentId === undefined) {
                promiseQueries.push(this.performQuery(
                    QueryBuilder.RECORD_TYPES.ALL_PHOTOS,
                    [startRankFilter, directionFilter],
                    ICLOUD_PHOTOS.MAX_RECORDS_LIMIT,
                    QueryBuilder.QUERY_KEYS,
                ));
            } else {
                const parentFilter = QueryBuilder.getParentFilterForParentId(parentId);
                promiseQueries.push(this.performQuery(
                    QueryBuilder.RECORD_TYPES.PHOTO_RECORDS,
                    [startRankFilter, directionFilter, parentFilter],
                    ICLOUD_PHOTOS.MAX_RECORDS_LIMIT,
                    QueryBuilder.QUERY_KEYS,
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
                        throw new iCPSError(ICLOUD_PHOTOS_ERR.DELETED_RECORD)
                            .setWarning()
                            .addContext(`record`, record);
                    }

                    if (record.fields.isHidden?.value === 1) {
                        throw new iCPSError(ICLOUD_PHOTOS_ERR.HIDDEN_RECORD)
                            .setWarning()
                            .addContext(`record`, record);
                    }

                    if (Object.prototype.hasOwnProperty.call(seen, record.recordName)) {
                        throw new iCPSError(ICLOUD_PHOTOS_ERR.DUPLICATE_RECORD)
                            .setWarning()
                            .addContext(`record`, record);
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
                        throw new iCPSError(ICLOUD_PHOTOS_ERR.UNKNOWN_RECORD_TYPE)
                            .setWarning()
                            .addContext(`recordType`, record.recordType);
                    }
                } catch (err) {
                    this.emit(HANDLER_EVENT, new iCPSError(ICLOUD_PHOTOS_ERR.PROCESS_ASSET)
                        .setWarning()
                        .addCause(err));
                }
            });
        } catch (err) {
            throw new iCPSError(ICLOUD_PHOTOS_ERR.FETCH_RECORDS)
                .addMessage(`album ${parentId === undefined ? `'All photos'` : parentId}`)
                .addCause(err);
        }

        if (cplMasters.length !== totalCount || cplAssets.length !== totalCount) {
            this.emit(HANDLER_EVENT, new iCPSError(ICLOUD_PHOTOS_ERR.COUNT_MISMATCH)
                .addMessage(`expected ${totalCount} CPLMaster & ${totalCount} CPLAsset records, but got ${cplMasters.length} CPLMaster & ${cplAssets.length} CPLAsset records for album ${parentId === undefined ? `'All photos'` : parentId}`));
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
        this.logger.debug(`Starting download of asset ${asset.getDisplayName()}`);

        const config: AxiosRequestConfig = {
            "headers": this.auth.getPhotosHeader(),
            "responseType": `stream`,
        };

        return this.axios.get(
            asset.downloadURL,
            config,
        );
    }

    /**
     * Deletes the records in the remote library
     * @param recordNames - A list of record names that need to be deleted
     * @returns A Promise, that fulfils once the operation has been performed
     */
    async deleteAssets(recordNames: string[]) {
        this.logger.debug(`Deleting ${recordNames.length} assets: ${JSON.stringify(recordNames)}`);
        await this.performOperation(`update`, QueryBuilder.getIsDeletedField(), recordNames);
    }
}