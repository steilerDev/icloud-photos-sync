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
import PQueue from 'p-queue';
import {iCloudApp} from '../../../app/icloud-app.js';

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
    auth: iCloudAuth;

    /**
     * Local axios instance to handle network requests
     */
    axios: AxiosInstance;

    /**
     * A promise that will resolve, once the object is ready or reject, in case there is an error
     */
    ready: Promise<void>;

    /**
     * The queue holding all query operations. Used to rate limit metadata fetching
     */
    queryQueue: PQueue;

    /**
     * Creates a new iCloud Photos Class
     * @param auth - The populated authentication object
     */
    constructor(app: iCloudApp, auth: iCloudAuth) {
        super();
        this.auth = auth;
        this.axios = axios.create();

        this.queryQueue = new PQueue({
            "intervalCap": app.options.metadataRate[0],
            "interval": app.options.metadataRate[1],
        });

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
     * Starting iCloud Photos service, acquiring all necessary account information stored in iCloudAuth.iCloudPhotosAccount. This includes information about a shared library
     * Will emit SETUP_COMPLETE or ERROR
     * @returns A promise, that will resolve once the service is available or reject in case of an error
     */
    async setup() {
        try {
            this.logger.debug(`Getting iCloud Photos account information`);

            const config: AxiosRequestConfig = {
                "headers": this.auth.getPhotosHeader(),
            };

            const setupResponse = await this.axios.post(this.getServiceEndpoint(ICLOUD_PHOTOS.PATHS.EXT.ZONES), {}, config);

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
     * Checking indexing state of all available zones of the photos service (sync should only safely be performed, after indexing is completed)
     * Will emit READY, or ERROR
     */
    async checkingIndexingStatus() {
        this.logger.debug(`Checking Indexing Status of iCloud Photos Account`);
        try {
            await this.checkIndexingStatusForZone(QueryBuilder.Zones.Primary);
            if (this.auth.sharedLibraryAvailable()) {
                await this.checkIndexingStatusForZone(QueryBuilder.Zones.Shared);
            }

            this.emit(ICLOUD_PHOTOS.EVENTS.READY);
        } catch (err) {
            this.emit(ICLOUD_PHOTOS.EVENTS.ERROR, new iCPSError(ICLOUD_PHOTOS_ERR.INDEXING_STATE_UNAVAILABLE).addCause(err));
        }
    }

    /**
     * Checks the indexing status of a given zone.
     * @param zone - The zone to check
     * @returns If indexing is successful
     * @throws If non-completed indexing state is found
     */
    async checkIndexingStatusForZone(zone: QueryBuilder.Zones) {
        const result = await this.performQuery(zone, `CheckIndexingState`);

        const indexingState = result[0]?.fields?.state?.value as string;

        if (!indexingState) {
            throw new iCPSError(ICLOUD_PHOTOS_ERR.INDEXING_STATE_UNAVAILABLE)
                .addMessage(`zone: ${zone}`)
                .addContext(`icloudResult`, result);
        }

        if (indexingState === `RUNNING`) {
            this.logger.debug(`Indexing for zone ${zone} in progress, sync needs to wait!`);
            const indexingInProgressError = new iCPSError(ICLOUD_PHOTOS_ERR.INDEXING_IN_PROGRESS)
                .addMessage(`zone: ${zone}`);

            const progress = result[0]?.fields?.progress?.value;
            if (progress) {
                indexingInProgressError.addMessage(`progress ${progress}`);
            }

            throw indexingInProgressError;
        }

        if (indexingState === `FINISHED`) {
            this.logger.info(`Indexing of ${zone} finished, sync can start!`);
            return;
        }

        throw new iCPSError(ICLOUD_PHOTOS_ERR.INDEXING_STATE_UNKNOWN)
            .addContext(`icloudResult`, result)
            .addMessage(`zone: ${zone}`)
            .addMessage(`indexing state: ${indexingState}`);
    }

    /**
     * Performs a query against the iCloud Photos Service
     * @param zone - Defines the zone to be used
     * @param recordType - The requested record type
     * @param filterBy - An array of filter instructions
     * @param resultsLimit - Results limit is maxed at 66 * 3 records (because every picture is returned three times)
     * @param desiredKeys - The fields requested from the backend
     * @returns An array of records as returned by the backend
     */
    async performQuery(zone: QueryBuilder.Zones, recordType: string, filterBy?: any[], resultsLimit?: number, desiredKeys?: string[]): Promise<any[]> {
        this.auth.validatePhotosAccount(zone);
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
            "zoneID": QueryBuilder.getZoneID(zone, this.auth),
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

        let queryResponse: any;

        await this.queryQueue.add(async () => {
            queryResponse = await this.axios.post(this.getServiceEndpoint(ICLOUD_PHOTOS.PATHS.EXT.QUERY), data, config);
        });

        const fetchedRecords = queryResponse?.data?.records;
        if (!fetchedRecords || !Array.isArray(fetchedRecords)) {
            throw new iCPSError(ICLOUD_PHOTOS_ERR.UNEXPECTED_QUERY_RESPONSE)
                .addContext(`queryResponse`, queryResponse);
        }

        return fetchedRecords;
    }

    /**
     * Performs a single operation with the iCloud Backend
     * @param zone - Defines the zone to be used
     * @param operationType - The type of operation, that should be performed
     * @param recordNames - The list of recordNames of the asset the operation should be performed on
     * @param fields - The fields to be altered
     * @returns An array of records that have been altered
     */
    async performOperation(zone: QueryBuilder.Zones, operationType: string, fields: any, recordNames: string[]) {
        this.auth.validatePhotosAccount(zone);
        const config: AxiosRequestConfig = {
            "headers": this.auth.getPhotosHeader(),
            "params": {
                "remapEnums": `True`,
            },
        };

        const data: any = {
            "operations": [],
            "zoneID": QueryBuilder.getZoneID(zone, this.auth),
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
        const fetchedRecords = operationResponse?.data?.records;
        if (!fetchedRecords || !Array.isArray(fetchedRecords)) {
            throw new iCPSError(ICLOUD_PHOTOS_ERR.UNEXPECTED_OPERATIONS_RESPONSE)
                .addContext(`operationResponse`, operationResponse);
        }

        return fetchedRecords;
    }

    /**
     * Fetches all album records, traversing the directory tree
     * @remarks Since the shared library currently does not support it's own directory tree / WebUI does not show pictures in folders we only do this for the primary zone
     * @returns An array of all album records in the account
     * Since we are requesting them based on parent folder and are starting from the root folder the results array should yield: If folder A is closer to the root than folder B, the index of A is smaller than the index of B
     */
    async fetchAllCPLAlbums(): Promise<CPLAlbum[]> {
        try {
            // Processing queue
            const queue: Promise<CPLAlbum[]>[] = [];

            // Final list of all albums
            const albumRecords: CPLAlbum[] = [];

            // Getting root folders as an initial set for the processing queue
            queue.push(this.fetchCPLAlbums());

            while (queue.length > 0) {
                // Getting next item in the queue
                for (const nextAlbum of await queue.shift()) {
                    // If album is a folder, there is stuff in there, adding it to the queue
                    if (nextAlbum.albumType === AlbumType.FOLDER) {
                        this.logger.debug(`Adding child elements of ${nextAlbum.albumNameEnc} to the processing queue`);
                        queue.push(this.fetchCPLAlbums(nextAlbum.recordName));
                    }

                    // Adding completed album
                    albumRecords.push(nextAlbum);
                }
            }

            return albumRecords;
        } catch (err) {
            throw new iCPSError(ICLOUD_PHOTOS_ERR.FOLDER_STRUCTURE).addCause(err);
        }
    }

    /**
     * Builds the request to receive all albums and folders for the given folder from the iCloud backend
     * @remarks Since the shared library currently does not support it's own directory tree / WebUI does not show pictures in folders we only do this for the primary zone
     * @param albumId - The record name of the folder. If parent is undefined, all albums without parent will be returned.
     * @returns A promise, that once resolved, contains all subfolders for the provided folder
     */
    buildAlbumRecordsRequest(folderId?: string): Promise<any[]> {
        return folderId === undefined
            ? this.performQuery(QueryBuilder.Zones.Primary, QueryBuilder.RECORD_TYPES.ALBUM_RECORDS)
            : this.performQuery(
                QueryBuilder.Zones.Primary,
                QueryBuilder.RECORD_TYPES.ALBUM_RECORDS,
                [QueryBuilder.getParentFilterForParentId(folderId)],
            );
    }

    /**
     * Filters unwanted picture records before post-processing
     * @param record - The record to be filtered
     * @throws An error, in case the provided record should be ignored
     */
    filterAlbumRecord(record: any) {
        if (record.deleted === true) {
            throw new iCPSError(ICLOUD_PHOTOS_ERR.DELETED_RECORD)
                .addMessage(record.recordName)
                .addContext(`record`, record);
        }

        if (record.recordName === `----Project-Root-Folder----` || record.recordName === `----Root-Folder----`) {
            throw new iCPSError(ICLOUD_PHOTOS_ERR.UNWANTED_ALBUM)
                .addMessage(record.recordName)
                .addContext(`record`, record);
        }

        if (record.fields.albumType.value !== AlbumType.FOLDER
            && record.fields.albumType.value !== AlbumType.ALBUM) {
            throw new iCPSError(ICLOUD_PHOTOS_ERR.UNKNOWN_ALBUM)
                .addMessage(record.fields.albumType.value)
                .addContext(`record.fields`, record.fields);
        }
    }

    /**
     * Fetching a list of albums identified by their parent.
     * @remarks Since the shared library currently does not support it's own directory tree / WebUI does not show pictures in folders we only do this for the primary zone
     * @param parentId - The record name of the parent folder. If parent is undefined, all albums without parent will be returned.
     * @returns An array of folder and album records. Unwanted folders and folder types are filtered out. Albums have their items included (as a promise)
     */
    async fetchCPLAlbums(parentId?: string): Promise<CPLAlbum[]> {
        const cplAlbums: CPLAlbum[] = [];

        for (const album of await this.buildAlbumRecordsRequest(parentId)) {
            try {
                this.filterAlbumRecord(album);

                if (album.fields.albumType.value === AlbumType.ALBUM) {
                    const [albumCPLAssets, albumCPLMasters] = await this.fetchAllCPLAssetsMasters(album.recordName);

                    const albumAssets: AlbumAssets = {};

                    convertCPLAssets(albumCPLAssets, albumCPLMasters).forEach(asset => {
                        /**
                         * @remarks this probably needs to be more complex to support shared library folders once available from the API
                         */
                        albumAssets[asset.getAssetFilename()] = asset.getPrettyFilename();
                    });

                    cplAlbums.push(CPLAlbum.parseFromQuery(album, albumAssets));
                }

                if (album.fields.albumType.value === AlbumType.FOLDER) {
                    cplAlbums.push(CPLAlbum.parseFromQuery(album));
                }
            } catch (err) {
                this.logger.info(`Error processing CPLAlbum: ${JSON.stringify(album)}: ${err.message}`);
            }
        }

        return cplAlbums;
    }

    /**
     * Returns the number of records currently present in a given album.
     * This is necessary to properly handling splitting up the record requests (keeping iCloud API limitations in mind)
     * @param zone - Defines the zone to be used
     * @param albumId - The record name of the album, if undefined all pictures will be returned
     * @returns The number of assets within the given album
     * @throws An error in case the count cannot be obtained
     */
    async getPictureRecordsCountForZone(zone: QueryBuilder.Zones, albumId?: string): Promise<number> {
        try {
            const indexCountFilter = QueryBuilder.getIndexCountFilter(albumId);
            const countData = await this.performQuery(
                zone,
                QueryBuilder.RECORD_TYPES.INDEX_COUNT,
                [indexCountFilter],
            );
            return Number.parseInt(countData[0].fields.itemCount.value, 10);
        } catch (err) {
            throw new iCPSError(ICLOUD_PHOTOS_ERR.COUNT_DATA)
                .addMessage(`zone ${zone}`)
                .addCause(err);
        }
    }

    /**
     * The iCloud API is limiting the amount of records that can be obtained with a single request.
     * This function will build separate requests, based on the expected size of the album.
     * @param zone - Defines the zone to be used
     * @param expectedNumberOfRecords - The amount of records expected within the given album
     * @param albumId - The record name of the album, if undefined all pictures will be returned
     * @returns An array of Promises, that will resolve to arrays of picture records and the amount of pictures expected from the requests.
     */
    buildPictureRecordsRequestsForZone(zone: QueryBuilder.Zones, expectedNumberOfRecords: number, albumId?: string): Promise<any[]>[] {
        // Calculating number of concurrent requests, in order to execute in parallel
        const numberOfRequests = albumId === undefined
            ? Math.ceil((expectedNumberOfRecords * 2) / ICLOUD_PHOTOS.MAX_RECORDS_LIMIT) // On all pictures two records per photo are returned (CPLMaster & CPLAsset) which are counted against max
            : Math.ceil((expectedNumberOfRecords * 3) / ICLOUD_PHOTOS.MAX_RECORDS_LIMIT); // On folders three records per photo are returned (CPLMaster, CPLAsset & CPLContainerRelation) which are counted against max

        this.logger.debug(`Expecting ${expectedNumberOfRecords} records for album ${albumId === undefined ? `All photos` : albumId} in ${zone} library, executing ${numberOfRequests} queries`);

        // Collecting all promise queries for parallel execution
        const pictureRecordsRequests: Promise<any[]>[] = [];
        for (let index = 0; index < numberOfRequests; index++) {
            const startRank = albumId === undefined // The start rank always refers to the tuple/triple of records, therefore we need to adjust the start rank based on the amount of records returned
                ? index * Math.floor(ICLOUD_PHOTOS.MAX_RECORDS_LIMIT / 2)
                : index * Math.floor(ICLOUD_PHOTOS.MAX_RECORDS_LIMIT / 3);
            this.logger.debug(`Building query for records of album ${albumId === undefined ? `All photos` : albumId} in ${zone} library at index ${startRank}`);
            const startRankFilter = QueryBuilder.getStartRankFilterForStartRank(startRank);
            const directionFilter = QueryBuilder.getDirectionFilterForDirection();

            // Different queries for 'all pictures' than album pictures
            if (albumId === undefined) {
                pictureRecordsRequests.push(this.performQuery(
                    zone,
                    QueryBuilder.RECORD_TYPES.ALL_PHOTOS,
                    [startRankFilter, directionFilter],
                    ICLOUD_PHOTOS.MAX_RECORDS_LIMIT,
                    QueryBuilder.QUERY_KEYS,
                ));
            } else {
                const parentFilter = QueryBuilder.getParentFilterForParentId(albumId);
                pictureRecordsRequests.push(this.performQuery(
                    zone,
                    QueryBuilder.RECORD_TYPES.PHOTO_RECORDS,
                    [startRankFilter, directionFilter, parentFilter],
                    ICLOUD_PHOTOS.MAX_RECORDS_LIMIT,
                    QueryBuilder.QUERY_KEYS,
                ));
            }
        }

        return pictureRecordsRequests;
    }

    /**
     * Filters unwanted picture records before post-processing
     * @param record - The record to be filtered
     * @param seen - An array of previously seen recordNames
     * @throws An error, in case the provided record should be ignored
     */
    filterPictureRecord(record: any, seen: Set<string>) {
        if (record?.deleted === true) {
            throw new iCPSError(ICLOUD_PHOTOS_ERR.DELETED_RECORD)
                .addContext(`record`, record);
        }

        if (record.fields?.isHidden?.value === 1) {
            throw new iCPSError(ICLOUD_PHOTOS_ERR.HIDDEN_RECORD)
                .addContext(`record`, record);
        }

        // If (Object.prototype.hasOwnProperty.call(seen, record.recordName)) {
        if (seen.has(record.recordName)) {
            throw new iCPSError(ICLOUD_PHOTOS_ERR.DUPLICATE_RECORD)
                .addContext(`record`, record);
        }

        if (record.recordType === QueryBuilder.RECORD_TYPES.CONTAINER_RELATION) {
            throw new iCPSError(ICLOUD_PHOTOS_ERR.UNWANTED_RECORD_TYPE)
                .addMessage(record.recordType)
                .addContext(`recordType`, record.recordType);
        }

        if (record.recordType !== QueryBuilder.RECORD_TYPES.PHOTO_MASTER_RECORD
            && record.recordType !== QueryBuilder.RECORD_TYPES.PHOTO_ASSET_RECORD) {
            throw new iCPSError(ICLOUD_PHOTOS_ERR.UNKNOWN_RECORD_TYPE)
                .addMessage(record.recordType)
                .addContext(`recordType`, record.recordType);
        }
    }

    /**
     * Fetching all pictures associated to an album within the given zone, identified by parentId
     * @param zone - Defines the zone to be used
     * @param parentId - The record name of the album, if undefined all pictures will be returned
     * @returns A tuple containing the plain records as returned by the backend and the expected number of assets within the album
     */
    async fetchAllPictureRecordsForZone(zone: QueryBuilder.Zones, parentId?: string): Promise<[any[], number]> {
        // Getting number of items in folder
        const expectedNumberOfRecords = await this.getPictureRecordsCountForZone(zone, parentId);

        // Creating requests, based on number of expected items
        const pictureRecordsRequests = this.buildPictureRecordsRequestsForZone(zone, expectedNumberOfRecords, parentId);

        // Merging arrays of arrays and waiting for all promises to settle
        const allRecords: any[] = [];

        (await Promise.all(pictureRecordsRequests)).forEach(records => {
            allRecords.push(...records);
        });

        return [allRecords, expectedNumberOfRecords];
    }

    /**
     * Fetching all pictures associated to an album, identified by parentId
     * @param parentId - The record name of the album, if undefined all pictures will be returned
     * @returns An array of CPLMaster and CPLAsset records
     */
    async fetchAllCPLAssetsMasters(parentId?: string): Promise<[CPLAsset[], CPLMaster[]]> {
        this.logger.debug(`Fetching all picture records for album ${parentId === undefined ? `All photos` : parentId}`);

        let expectedNumberOfRecords = -1;
        let allRecords: any[] = [];
        const cplMasters: CPLMaster[] = [];
        const cplAssets: CPLAsset[] = [];
        try {
            [allRecords, expectedNumberOfRecords] = await this.fetchAllPictureRecordsForZone(QueryBuilder.Zones.Primary, parentId);

            // Merging assets of shared library, if available
            if (this.auth.sharedLibraryAvailable()) {
                this.logger.debug(`Fetching all picture records for album ${parentId === undefined ? `All photos` : parentId} for shared zone`);
                const [sharedRecords, sharedExpectedCount] = await this.fetchAllPictureRecordsForZone(QueryBuilder.Zones.Shared);
                allRecords = [...allRecords, ...sharedRecords];
                expectedNumberOfRecords += sharedExpectedCount;
            }
        } catch (err) {
            throw new iCPSError(ICLOUD_PHOTOS_ERR.FETCH_RECORDS)
                .addMessage(`album ${parentId === undefined ? `'All photos'` : parentId}`)
                .addCause(err);
        }

        // Post-processing response
        const seen = new Set<string>();
        for (const record of allRecords) {
            try {
                this.filterPictureRecord(record, seen);

                if (record.recordType === QueryBuilder.RECORD_TYPES.PHOTO_MASTER_RECORD) {
                    cplMasters.push(CPLMaster.parseFromQuery(record));
                    seen.add(record.recordName);
                }

                if (record.recordType === QueryBuilder.RECORD_TYPES.PHOTO_ASSET_RECORD) {
                    cplAssets.push(CPLAsset.parseFromQuery(record));
                    seen.add(record.recordName);
                }
            } catch (err) {
                this.logger.info(`Error processing asset ${JSON.stringify(record)}: ${err.message}`);
            }
        }

        // There should be one CPLMaster and one CPLAsset per record, however the iCloud response is sometimes not adhering to this.
        if (cplMasters.length !== expectedNumberOfRecords || cplAssets.length !== expectedNumberOfRecords) {
            this.emit(HANDLER_EVENT, new iCPSError(ICLOUD_PHOTOS_ERR.COUNT_MISMATCH)
                .setWarning()
                .addMessage(`expected ${expectedNumberOfRecords} CPLMaster & ${expectedNumberOfRecords} CPLAsset records, but got ${cplMasters.length} CPLMaster & ${cplAssets.length} CPLAsset records for album ${parentId === undefined ? `'All photos'` : parentId}`));
        } else {
            this.logger.debug(`Received expected amount (${expectedNumberOfRecords}) of records for album ${parentId === undefined ? `'All photos'` : parentId}`);
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
     * @remarks Since the shared library currently does not support it's own directory tree / WebUI does not show pictures in folders we only do this for the primary zone, because archiving is only possible of folders
     * @param recordNames - A list of record names that need to be deleted
     * @returns A Promise, that fulfils once the operation has been performed
     */
    async deleteAssets(recordNames: string[]) {
        this.logger.debug(`Deleting ${recordNames.length} assets: ${JSON.stringify(recordNames)}`);
        await this.performOperation(QueryBuilder.Zones.Primary, `update`, QueryBuilder.getIsDeletedField(), recordNames);
    }
}
