import {AxiosRequestConfig} from 'axios';
import * as QueryBuilder from './query-builder.js';
import {AlbumAssets, AlbumType} from '../../photos-library/model/album.js';
import {Asset} from '../../photos-library/model/asset.js';
import {CPLAlbum, CPLAsset, CPLMaster} from './query-parser.js';
import {iCPSError} from '../../../app/error/error.js';
import {ICLOUD_PHOTOS_ERR} from '../../../app/error/error-codes.js';
import {Resources} from '../../resources/main.js';
import {ENDPOINTS, RecordDict} from '../../resources/network-types.js';
import {SyncEngineHelper} from '../../sync-engine/helper.js';
import {iCPSEventPhotos, iCPSEventRuntimeWarning} from '../../resources/events-types.js';
import fs from 'fs/promises';
import {jsonc} from 'jsonc';
import { FieldKey, FilterDictionary, OperationTypeValues, PhotosFieldKey, PhotosOperationRequest, PhotosQueryRequest, RecordTypeValue } from '../../resources/cloud-kit-types.js';
import { PhotosLibrary } from '../../photos-library/photos-library.js';
import { EventEmitterAsyncResource } from 'stream';
import { CloudKitIndexingState } from './cloud-kit.js';

/**
 * To perform an operation, a record change tag is required. Hardcoding it for now
 */
const RECORD_CHANGE_TAG = `21h2`;

/**
 * This class holds connection and state with the iCloud Photos Backend and provides functions to access the data stored there
 */
export class iCloudPhotos {
    /**
     * A promise that will resolve, once the object is ready or reject, in case there is an error
     */
    ready: Promise<void>;

    /**
     * Creates a new iCloud Photos Class
     */
    constructor() {
        Resources.events(this).on(iCPSEventPhotos.SETUP_COMPLETED, async () => {
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
            Resources.events(this)
                .once(iCPSEventPhotos.READY, () => resolve())
                .once(iCPSEventPhotos.ERROR, err => reject(err));
        });
    }

    /**
     * Starting iCloud Photos service, acquiring all necessary account information required to interact with the backend. This includes information about a shared library
     * Will emit SETUP_COMPLETE or ERROR
     * @returns A promise, that will resolve once the service is available or reject in case of an error
     * @emits iCPSEventPhotos.SETUP_COMPLETED - Once the setup is completed
     * @emits iCPSEventPhotos.ERROR - In case of an error during setup - The iCPSError is provided as argument
     */
    async setup() {
        try {
            Resources.logger(this).debug(`Getting iCloud Photos account information`);

            const response = await Resources.network().post(ENDPOINTS.PHOTOS.PATH.ZONES, {});
            const validatedResponse = Resources.validator().validatePhotosSetupResponse(response);
            Resources.network().applyPhotosSetupResponse(validatedResponse);

            Resources.logger(this).debug(`Successfully gathered iCloud Photos account information`);
            Resources.emit(iCPSEventPhotos.SETUP_COMPLETED);
        } catch (err) {
            Resources.emit(iCPSEventPhotos.ERROR, new iCPSError(ICLOUD_PHOTOS_ERR.SETUP_ERROR).addCause(err));
        } finally {
            return this.ready;
        }
    }

    /**
     * Checking indexing state of all available zones of the photos service (sync should only safely be performed, after indexing is completed)
     * @emits iCPSEventPhotos.READY - If indexing is completed
     * @emits iCPSEventPhotos.ERROR - If indexing is not completed - The iCPSError is provided as argument
     * Will emit READY, or ERROR
     */
    async checkingIndexingStatus() {
        Resources.logger(this).debug(`Checking Indexing Status of iCloud Photos Account`);
        try {
            CloudKitIndexingState.build()
            (new CloudKitIndexingState(QueryBuilder.Zones.Primary)).execute();
            await this.checkIndexingStatusForZone(QueryBuilder.Zones.Primary);
            if (Resources.manager().sharedZoneAvailable) {
                await this.checkIndexingStatusForZone(QueryBuilder.Zones.Shared);
            }

            Resources.emit(iCPSEventPhotos.READY);
        } catch (err) {
            Resources.emit(iCPSEventPhotos.ERROR, new iCPSError(ICLOUD_PHOTOS_ERR.INDEXING_STATE_UNAVAILABLE).addCause(err));
        }
    }

    /**
     * Checks the indexing status of a given zone.
     * @param zone - The zone to check
     * @returns If indexing is successful
     * @throws If non-completed indexing state is found
     */
    async checkIndexingStatusForZone(zone: QueryBuilder.Zones) {
        const result = await (new CloudKitIndexingState(zone)).execute();

        if (result[0].fields.state.value === `RUNNING`) {
            Resources.logger(this).debug(`Indexing for zone ${zone} in progress, sync needs to wait!`);
            throw new iCPSError(ICLOUD_PHOTOS_ERR.INDEXING_IN_PROGRESS)
                .addMessage(`zone: ${zone}`)
                .addMessage(`progress ${result[0].fields.progress.value}`);
        }

        Resources.logger(this).info(`Indexing of ${zone} finished, sync can start!`);
    }

   

    /**
     * Performs a single operation with the iCloud Backend
     * @param zone - Defines the zone to be used
     * @param operationType - The type of operation, that should be performed
     * @param recordNames - The list of recordNames of the asset the operation should be performed on
     * @param fields - The fields to be altered
     * @returns An array of records that have been altered
     */
    async performOperation(zone: QueryBuilder.Zones, operationType: OperationTypeValues, fields: any, recordNames: string[]): Promise<any[]> {
        const config: AxiosRequestConfig = {
            params: {
                remapEnums: `True`,
            },
        };

        const data: PhotosOperationRequest = {
            operations: [],
            zoneID: QueryBuilder.getZoneID(zone),
            atomic: true,
        };

        data.operations = recordNames.map(recordName => ({
            operationType,
            record: {
                recordName: `${recordName}`,
                recordType: RecordTypeValue.CPL_ASSET,
                recordChangeTag: RECORD_CHANGE_TAG,
                fields,
            },
        }));

        const operationResponse = await Resources.network().post(ENDPOINTS.PHOTOS.PATH.MODIFY, data, config);
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
     * @remarks Since we are requesting them based on parent folder and are starting from the root folder the results array should yield: If folder A is closer to the root than folder B, the index of A is smaller than the index of B
     * @returns An array of all album records in the account
     * @throws An iCPSError if fetching fails
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
                        Resources.logger(this).debug(`Adding child elements of ${nextAlbum.albumNameEnc} to the processing queue`);
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
            ? this.performQuery(QueryBuilder.Zones.Primary, RecordTypeValue.ALBUM_RECORDS)
            : this.performQuery(
                QueryBuilder.Zones.Primary,
                RecordTypeValue.ALBUM_RECORDS,
                [QueryBuilder.getParentFilterForParentId(folderId)],
            );
    }

    /**
     * Filters unwanted picture records before post-processing
     * @param record - The record to be filtered
     * @throws An iCPSError, in case the provided record should be ignored
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

                    SyncEngineHelper.convertCPLAssets(albumCPLAssets, albumCPLMasters).forEach(asset => {
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
                Resources.logger(this).info(`Error processing CPLAlbum: ${jsonc.stringify(album)}: ${err.message}`);
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
     * @throws An iCPSError in case the count cannot be obtained
     */
    async getPictureRecordsCountForZone(zone: QueryBuilder.Zones, albumId?: string): Promise<number> {
        try {
            const indexCountFilter = QueryBuilder.getIndexCountFilter(albumId);
            const countData = await this.performQuery(
                zone,
                RecordTypeValue.INDEX_COUNT,
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
    buildPictureRecordsRequestsForZone(zone: QueryBuilder.Zones, expectedNumberOfRecords: number, albumId?: string): Promise<RecordDict[]> {
        Resources.logger(this).debug(`Building query for records of album ${albumId === undefined ? `All photos` : albumId} in ${zone} library (expecting ${expectedNumberOfRecords} records)`);

        const directionFilter = QueryBuilder.getDirectionFilterForDirection();

        // Different queries for 'all pictures' than album pictures
        if (albumId === undefined) {
            return this.performQuery(
                zone,
                RecordTypeValue.ALL_PHOTOS,
                [directionFilter],
                QueryBuilder.QUERY_KEYS,
            );
        }

        const parentFilter = QueryBuilder.getParentFilterForParentId(albumId);
        return this.performQuery(
            zone,
            QueryBuilder.RECORD_TYPES.PHOTO_RECORDS,
            [directionFilter, parentFilter],
            QueryBuilder.QUERY_KEYS,
        );
    }

    /**
     * Filters unwanted picture records before post-processing
     * @param record - The record to be filtered
     * @param seen - An array of previously seen recordNames
     * @throws An iCPSError, in case the provided record should be ignored
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
        const pictureRecords = await this.buildPictureRecordsRequestsForZone(zone, expectedNumberOfRecords, parentId);

        return [pictureRecords, expectedNumberOfRecords];
    }

    /**
     * Fetching all pictures associated to an album, identified by parentId
     * @param parentId - The record name of the album, if undefined all pictures will be returned
     * @returns An array of CPLMaster and CPLAsset records
     * @throws An iCPSError, in case the records could not be fetched
     * @emits iCPSEventRuntimeWarning.COUNT_MISMATCH - In case the number of fetched records does not match the expected number of records -  provides the album id, number of expected assets, actual CPL Assets and actual CPL Masters
     */
    async fetchAllCPLAssetsMasters(parentId?: string): Promise<[CPLAsset[], CPLMaster[]]> {
        Resources.logger(this).debug(`Fetching all picture records for album ${parentId === undefined ? `All photos` : parentId}`);

        let expectedNumberOfRecords = -1;
        let allRecords: any[] = [];
        const cplMasters: CPLMaster[] = [];
        const cplAssets: CPLAsset[] = [];
        try {
            [allRecords, expectedNumberOfRecords] = await this.fetchAllPictureRecordsForZone(QueryBuilder.Zones.Primary, parentId);

            // Merging assets of shared library, if available
            if (Resources.manager().sharedZoneAvailable && typeof parentId === `undefined`) { // Only fetch shared album records if no parentId is specified, since icloud api does not yet support shared records in albums
                Resources.logger(this).debug(`Fetching all picture records for album ${parentId === undefined ? `All photos` : parentId} for shared zone`);
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
        const ignoredAssets: iCPSError[] = [];
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
                // Summarizing errors/warnings
                ignoredAssets.push((err as iCPSError));
            }
        }

        // Pretty printing ignored assets
        if (ignoredAssets.length > 0) {
            Resources.logger(this).info(`Ignoring ${ignoredAssets.length} assets for ${parentId === undefined ? `All photos` : parentId}:`);
            const erroredAssets = ignoredAssets.filter(err => err.code !== ICLOUD_PHOTOS_ERR.UNWANTED_RECORD_TYPE.code); // Filtering 'expected' errors
            if (erroredAssets.length > 0) {
                Resources.logger(this).warn(`${erroredAssets.length} unexpected errors for ${parentId === undefined ? `All photos` : parentId}: ${erroredAssets.map(err => err.code).join(`, `)}`);
            }
        }

        // There should be one CPLMaster and one CPLAsset per record, however the iCloud response is sometimes not adhering to this.
        if (cplMasters.length !== expectedNumberOfRecords || cplAssets.length !== expectedNumberOfRecords) {
            debugger;
            Resources.emit(iCPSEventRuntimeWarning.COUNT_MISMATCH,
                parentId === undefined ? `All photos` : parentId,
                expectedNumberOfRecords,
                cplAssets.length,
                cplMasters.length,
            );
        } else {
            Resources.logger(this).debug(`Received expected amount (${expectedNumberOfRecords}) of records for album ${parentId === undefined ? `'All photos'` : parentId}`);
        }

        return [cplAssets, cplMasters];
    }

    /**
     * Downloads an asset to the correct file location and applies relevant metadata to the file
     * @param asset - The asset to be downloaded
     * @returns A promise, that resolves, once the asset has been written to disk
     * @throws An error, in case the asset could not be downloaded
     */
    async downloadAsset(asset: Asset): Promise<void> {
        const location = asset.getAssetFilePath();
        await Resources.network().downloadData(asset.downloadURL, location);
        // If 410 -> refetch asset download url:
        // fetch("https://p64-ckdatabasews.icloud.com/database/1/com.apple.photos.cloud/production/private/records/lookup?ckjsBuildVersion=2402ProjectDev11&ckjsVersion=2.6.4&getCurrentSyncToken=true&remapEnums=true&clientBuildNumber=2402Project30&clientMasteringNumber=2402B17&clientId=59c34ecf-5d78-4025-abe3-dcb1b6afed57&dsid=21248602866", {
        //     "headers": {
        //         "accept": "*/*",
        //         "accept-language": "de-DE,de;q=0.9",
        //         "cache-control": "no-cache",
        //         "content-type": "text/plain",
        //         "pragma": "no-cache",
        //         "sec-ch-ua": "\"Chromium\";v=\"118\", \"Brave\";v=\"118\", \"Not=A?Brand\";v=\"99\"",
        //         "sec-ch-ua-mobile": "?0",
        //         "sec-ch-ua-platform": "\"macOS\"",
        //         "sec-fetch-dest": "empty",
        //         "sec-fetch-mode": "cors",
        //         "sec-fetch-site": "same-site",
        //         "sec-gpc": "1"
        //     },
        //     "referrer": "https://www.icloud.com/",
        //     "referrerPolicy": "strict-origin-when-cross-origin",
        //     "body": "{\"records\":[{\"recordName\":\"Aer07a4zFC7jEvpOxHY8UQjNI0ee\"}],\"zoneID\":{\"zoneName\":\"PrimarySync\",\"ownerRecordName\":\"_334c6ec122c2c85abfd3b80a968cdae7\",\"zoneType\":\"REGULAR_CUSTOM_ZONE\"}}",
        //     "method": "POST",
        //     "mode": "cors",
        //     "credentials": "include"
        //     });

        // fetch("https://p64-ckdatabasews.icloud.com/database/1/com.apple.photos.cloud/production/private/records/lookup?ckjsBuildVersion=2402ProjectDev11&ckjsVersion=2.6.4&getCurrentSyncToken=true&remapEnums=true&clientBuildNumber=2402Project30&clientMasteringNumber=2402B17&clientId=59c34ecf-5d78-4025-abe3-dcb1b6afed57&dsid=21248602866", {
        // "headers": {
        //     "accept": "*/*",
        //     "accept-language": "de-DE,de;q=0.9",
        //     "cache-control": "no-cache",
        //     "content-type": "text/plain",
        //     "pragma": "no-cache",
        //     "sec-ch-ua": "\"Chromium\";v=\"118\", \"Brave\";v=\"118\", \"Not=A?Brand\";v=\"99\"",
        //     "sec-ch-ua-mobile": "?0",
        //     "sec-ch-ua-platform": "\"macOS\"",
        //     "sec-fetch-dest": "empty",
        //     "sec-fetch-mode": "cors",
        //     "sec-fetch-site": "same-site",
        //     "sec-gpc": "1",
        //     "cookie": "X-APPLE-WEBAUTH-USER=\"v=1:s=0:d=21248602866\"; X_APPLE_WEB_KB-VZTP0P9JJVFFRG1GOGKZ4AH5SRK=\"v=1:t=AQ==BST_IAAAAAAABLwIAAAAAGVd9LwRDmdzLmljbG91ZC5hdXRovQAlTL0LWB6cPMkrEBcYjTxd4EejGX77sVX3VrcIpHYyB5I8c9WqAwzS_hjpej5fYmEKZrw_z73BNjmFcUsRax8xcrbMucDmxCFT_qmfc-cRB0tM2FO43lMrmdMKM8u_gNqIa2aKy93u0hBXD7n7fexdbQqXwQ~~\"; X-APPLE-WEBAUTH-HSA-TRUST=\"8a7c91e6fc2338d1c47fd02380b5563e8914ca9fcb11e5a003a3be93b11aa051_HSARMTKNSRVXWFla1HlnHtKRtgfVTs+0B+qmYs+8I3Ht3k2dAyZ2Xxg2UDYyDLe/uWxcluZNjZnWyCeq/VW4sZ1Z73fEeqXpifhvjT+KBME79d3ax35AS+sx+KTnAaSBmtBKv1zdPOhQgWs2rGr4lzeRUpY9ADPQqv/FWl86CYzuoo5i7/quxdJEXYRf1AzRQF09J6Twc+YPOOjDChu5zpLREQYXhfpBwzjWxdnmZOI=SRVX:08fb891443068ff28e4cd021ff68be70a541e7ef4c059f30e5d32ab7b52c18bf_HSARMTKNSRVXWFlaaae2L5XevmYHCkLisBk0+N6Neu9uKbLS8khp09sDr5Vs1egvl+7vMybOZbvTDRjNsmpbTx9iQw+pAGPlWEbX8flCzlB915QDNX0ImAFr+DzZvcfFN1oSiWHr6T1OOK1ip0Xn09dcyowCYZ3ie1AQRijq4NwNnUSRAw8t/w2DaqRLHjUuBkmLhMX6LBkdRLFCIUzrKowwGqAsad79wCESrDjl3403SRVX\"; X-APPLE-UNIQUE-CLIENT-ID=\"Ag==\"; X-APPLE-WEBAUTH-LOGIN=\"v=1:t=Ag==BST_IAAAAAAABLwIAAAAAGVd9M8RDmdzLmljbG91ZC5hdXRovQAbnKTrV4NeW_iYEFlmsYCRG2hvmDCrqnlEiDfp0Av7_S7QJ21B3GilKoRHbiXyLlB4Z5T_mwQ7VOSFHMl7eNeyaimWua5erfc0GewDiN2x1_JpNcvY04qLUbnX2K9HTPbdXGyK4C_RUTze7NnXpJyshxDMTg~~\"; X-APPLE-DS-WEB-SESSION-TOKEN=\"AQEyqLX40kPosiGN7CIrMSBBnz1J2+crFnNXriYYqniKfqN6LNiyAq/DNh/0zVu0jxOwvn+rTRlcZmY8yteNveilzBVf5q/wq4eQ/qcrOZeGOQj6MOcuUmgTJElbWm4cCa+0eCubiD7r4jhQmqNEwReI0OwRZe+H/c0DU03tcYPFOMw4hncQ5RlnCvOi9DbyxsIQCsczxVIjez5w9xkg5oP9YQzV97eXTRwKOh/qdfQ06167RJ3coCKFTT0vTa8olOWTuUzn5Pf/9hJunDVn+x/xKKQ7f1brd0Ks8GZB5tMvVMh5BtW0zN8fhYK8BJjmBzJMvim+etiC1r4Q08B9pX3FPKgjMV2tvlbCx/c0S8kQw5+MCCos/jutGbvZKB+hiuYF8jvUmMvw6IWAEejUn/FH+8+KgAH+e6DypQMIzXIZBhNIhRutPbMEz0TuVBBVnXHeQfeTT9/wmQkxy7CsJuwO3f+YrRL9Jm/NBvdprCubgMtBsTbpAw6bcL/URNt3uV0bmln1sRXJJ3rO+5ZyFIUUiibD9aJb6W7cLWuYt95D7AAqOi7bW6M5KIHIYZUOzMxlwcm0C6jx0xspSJCI246AePqec7d6AqFKvbkRPnQ69bPx5IfYFPrxNnniXgfRJ6YENVmikeKA06oTE86vDzOHPLVobl4grmv/aITytM5YgCVtkAbLdYm1hbwOYfBOX2E3UyiY11yp9g3z/4hWh6sjrKVbIQeSNKoKNdYeJqrfGyeCYtK92/BVGYYEdZ7/+Hvvxf6sOvqzZ2gPZKiNTWzwyFodbwVPDEB5BQ==\"; X-APPLE-WEB-ID=2FEBC0A80DA4542817092A5E7DD51B6992B4CB51; X-APPLE-WEBAUTH-PCS-Photos=\"TGlzdEFwcGw6MTpBcHBsOjE6AXipG71rTe+2rlGXFaD/XwS21wgptWxLCYb8GUgLHIpQNaduMmeIWunp3gCRGOrFOLkgITiZnkwp3z8OjG6LoqxF7Y97sbCrf8NkiloUwOOpOf8kZ6be4GURBeOG89y67CwO9zq9OHf+Py5att7CF9tcyoybXJ6BZEdItHasQT99SF0nTflgqME5iCZQwQPrYdB6/sHvnfpZAeznxV+hAYCXwWA3qJ+bGK7yGxnrl1RsWQ==\"; X-APPLE-WEBAUTH-PCS-Sharing=\"TGlzdEFwcGw6MTpBcHBsOjE6AVJNjIeJc1dc0w7kcCDoSNy4OzJ7VchE9e/V314CT6N1P88c4WFCFoyj00/0CHLHaZRFW8TkjyAFfjJcGi1fRCY9tVe0J+1+Q1DiWr7xEshj9EQINupl0PQTSNi3CZa6aiP1Xp36Yv6vC7ORl51zPkjyjD8iBYRwDwv2cKdO+7ovWzO44buh3+ND5+z4iehTD6+3wGxwTMyQO5KLbQo2s4o/1aj2V2GPsyfjWW76bUIZCg==\"; X-APPLE-WEBAUTH-VALIDATE=\"v=1:t=Ag==BST_IAAAAAAABLwIAAAAAGVe_t0RDmdzLmljbG91ZC5hdXRovQDNTBBJ1CjaY_hyzXJ3mzr4Usv7x_Gh7ZFGpn6_SviupG4chnt0LlFZ2H22O5lFg_RXJProxjI5tETlyUUUROXFHblslkKRE4RE33xxvPeHN01tcxg5yddNy2N8SaXwfBRJaQB5LeqVDouwxU11x7UF8TQiUA~~\"; X-APPLE-WEBAUTH-TOKEN=\"v=2:t=Ag==BST_IAAAAAAABLwIAAAAAGVe_8kRDmdzLmljbG91ZC5hdXRovQAa4oLM6pl41Nqu-SZmQluCmSrdCQqddSu1sNeEOFW7ksVcHt_AqNFdd9RcHS2kaehCl0o4fuu6A5pIjIz8XHzC-emqF81SL_ib7URgAQcaAZSUy1XLvDXSmdwHAi9NKlVWm3sL1xvWdX_lMjzJ_SzllCgUKA~~\"",
        //     "Referer": "https://www.icloud.com/",
        //     "Referrer-Policy": "strict-origin-when-cross-origin"
        // }, -> First one is a CPL Asset, second one a CPL Master
        // "body": "{\"records\":[{\"recordName\":\"52CF7381-7D1A-4BB6-9497-8BE55EAC9CC9\"},{\"recordName\":\"AYzV3cCErh9dIXOddR+2ZGcTga7t\"}],\"zoneID\":{\"zoneName\":\"PrimarySync\",\"ownerRecordName\":\"_334c6ec122c2c85abfd3b80a968cdae7\",\"zoneType\":\"REGULAR_CUSTOM_ZONE\"}}",
        // "method": "POST"
        // });
        // Response:

        // {
        //     "records" : [ {
        //       "recordName" : "52CF7381-7D1A-4BB6-9497-8BE55EAC9CC9",
        //       "recordType" : "CPLAsset",
        //       "fields" : {
        //         "assetDate" : {
        //           "value" : 1660843074000,
        //           "type" : "TIMESTAMP"
        //         },
        //         "orientation" : {
        //           "value" : 1,
        //           "type" : "INT64"
        //         },
        //         "addedDate" : {
        //           "value" : 1700643349834,
        //           "type" : "TIMESTAMP"
        //         },
        //         "assetSubtype" : {
        //           "value" : 0,
        //           "type" : "INT64"
        //         },
        //         "timeZoneOffset" : {
        //           "value" : 3600,
        //           "type" : "INT64"
        //         },
        //         "masterRef" : {
        //           "value" : {
        //             "recordName" : "AYzV3cCErh9dIXOddR+2ZGcTga7t",
        //             "action" : "DELETE_SELF"
        //           },
        //           "type" : "REFERENCE"
        //         },
        //         "timeZoneNameEnc" : {
        //           "value" : "R01UKzAxMDA=",
        //           "type" : "ENCRYPTED_BYTES"
        //         },
        //         "customRenderedValue" : {
        //           "value" : 0,
        //           "type" : "INT64"
        //         }
        //       },
        //       "pluginFields" : { },
        //       "recordChangeTag" : "qt",
        //       "created" : {
        //         "timestamp" : 1700643349901,
        //         "userRecordName" : "_334c6ec122c2c85abfd3b80a968cdae7",
        //         "deviceID" : "2"
        //       },
        //       "modified" : {
        //         "timestamp" : 1700643349901,
        //         "userRecordName" : "_334c6ec122c2c85abfd3b80a968cdae7",
        //         "deviceID" : "2"
        //       },
        //       "deleted" : false
        //     }, {
        //       "recordName" : "AYzV3cCErh9dIXOddR+2ZGcTga7t",
        //       "recordType" : "CPLMaster",
        //       "fields" : {
        //         "itemType" : {
        //           "value" : "public.jpeg",
        //           "type" : "STRING"
        //         },
        //         "mediaMetaDataType" : {
        //           "value" : "CGImageProperties",
        //           "type" : "STRING"
        //         },
        //         "resJPEGThumbFingerprint" : {
        //           "value" : "AX9kpy4IF4I8uWRXk4E6tJumjVWS",
        //           "type" : "STRING"
        //         },
        //         "filenameEnc" : {
        //           "value" : "QVl6VjNjQ0VyaDlkSVhPZGRSLTJaR2NUZ2E3dC5qcGVn",
        //           "type" : "ENCRYPTED_BYTES"
        //         },
        //         "originalOrientation" : {
        //           "value" : 1,
        //           "type" : "INT64"
        //         },
        //         "resOriginalRes" : {
        //           "value" : {
        //             "fileChecksum" : "AYzV3cCErh9dIXOddR+2ZGcTga7t",
        //             "size" : 202346,
        //             "wrappingKey" : "VSROIV2Hssbkxd5GyfTYdw==",
        //             "referenceChecksum" : "AYucM95eM2mmBv3GosdV5QQo/3qm",
        //             "downloadURL" : "https://cvws.icloud-content.com/B/AYzV3cCErh9dIXOddR-2ZGcTga7tAYucM95eM2mmBv3GosdV5QQo_3qm/${f}?o=AiXDEFWhyJrKj9u8QtI8hD4UOFCc1xxx_sBXYxvaMpFe&v=1&x=3&a=CAogMlChEvtv6nhSQvV8myDFbFhnkQ6X1J8Ax8fYwU2j20kSbxCj3NzYvzEYo7m42r8xIgEAUgQTga7tWgQo_3qmaie8IKcGl_p-t4EqwTWRGcqHh2NAt_TphSwMqIQfSkVm7M7aY8TswuZyJ43q3AZcC61eLGeBWNZtxHYGAEjp8RSKmnw2-76OCkbhSWbta_o-Tg&e=1700728282&fl=&r=33c0475f-9563-4967-84dd-0059a26f3094-1&k=VSROIV2Hssbkxd5GyfTYdw&ckc=com.apple.photos.cloud&ckz=PrimarySync&y=1&p=64&s=nQ7Bvqc7ix72B4NP7h2ae8eqUi0"
        //           },
        //           "type" : "ASSETID"
        //         },
        //         "originalCreationDate" : {
        //           "value" : 1660843074000,
        //           "type" : "TIMESTAMP"
        //         },
        //         "resJPEGThumbHeight" : {
        //           "value" : 519,
        //           "type" : "INT64"
        //         },
        //         "resJPEGThumbWidth" : {
        //           "value" : 332,
        //           "type" : "INT64"
        //         },
        //         "resOriginalWidth" : {
        //           "value" : 573,
        //           "type" : "INT64"
        //         },
        //         "resOriginalFileSize" : {
        //           "value" : 202346,
        //           "type" : "INT64"
        //         },
        //         "mediaMetaDataEnc" : {
        //           "value" : "YnBsaXN0MDDbAQIDBAUGBwgJCgsMDQ4PEBESDxMUFVpQaXhlbFdpZHRoVntFeGlmfVVEZXB0aFlEUElIZWlnaHRWe0pGSUZ9WkNvbG9yTW9kZWxbT3JpZW50YXRpb25YRFBJV2lkdGhWe1RJRkZ9W1BpeGVsSGVpZ2h0W1Byb2ZpbGVOYW1lEQI91xYXGBkaGxwdEh4fICEiEAgjQFIAAAAAAADTIyQlJhImVFJHQiAQAdQHJygpEg8PKhEDf1pEaXNwbGF5IFAzXxAXQ29tcG9uZW50c0NvbmZpZ3VyYXRpb25aQ29sb3JTcGFjZV8QD1BpeGVsWERpbWVuc2lvbltFeGlmVmVyc2lvbl8QD0ZsYXNoUGl4VmVyc2lvbl8QD1BpeGVsWURpbWVuc2lvbl8QEFNjZW5lQ2FwdHVyZVR5cGWkKywtLhECPaMsLCuiKy4RA38QAFhYRGVuc2l0eVtEZW5zaXR5VW5pdFhZRGVuc2l0eRBIW1hSZXNvbHV0aW9uW1lSZXNvbHV0aW9uXlJlc29sdXRpb25Vbml0EAIQARACEAMQAAAIAB8AKgAxADcAQQBIAFMAXwBoAG8AewCHAIoAmQCbAKQAqwCwALIAuwC+AMkA4wDuAQABDAEeATABQwFIAUsBTwFSAVUBVwFgAWwBdQF3AYMBjwGeAaABogGkAaYAAAAAAAACAQAAAAAAAAAvAAAAAAAAAAAAAAAAAAABqA==",
        //           "type" : "ENCRYPTED_BYTES"
        //         },
        //         "resJPEGThumbFileType" : {
        //           "value" : "public.jpeg",
        //           "type" : "STRING"
        //         },
        //         "dataClassType" : {
        //           "value" : 1,
        //           "type" : "INT64"
        //         },
        //         "resJPEGThumbFileSize" : {
        //           "value" : 37782,
        //           "type" : "INT64"
        //         },
        //         "resOriginalFingerprint" : {
        //           "value" : "AYzV3cCErh9dIXOddR+2ZGcTga7t",
        //           "type" : "STRING"
        //         },
        //         "resJPEGThumbRes" : {
        //           "value" : {
        //             "fileChecksum" : "AX9kpy4IF4I8uWRXk4E6tJumjVWS",
        //             "size" : 37782,
        //             "wrappingKey" : "TGIlr+yTT2j53fnzcyTmTA==",
        //             "referenceChecksum" : "AWWZZOLGZape8YPXdJHzYoDHS53z",
        //             "downloadURL" : "https://cvws.icloud-content.com/B/AX9kpy4IF4I8uWRXk4E6tJumjVWSAWWZZOLGZape8YPXdJHzYoDHS53z/${f}?o=AppaCHQddute0HI3TnBt2BevwDbuR7GMYnO8xE9zXOGt&v=1&x=3&a=CAogTAjlpGM3czmZre67W3iSHnvLTZvO6N_eDWDwz5NWu_kSbxCj3NzYvzEYo7m42r8xIgEAUgSmjVWSWgTHS53zaifsY3nX1cb3H9dl9uxlFWBXLW7ZgKccoUYSRZyTmO4MVKNWPq4q9bJyJ9jKML-H2U3m8uF48KEHi8XjUDSK3BlVaP6KvisgSaQf7-2L0TRCxw&e=1700728282&fl=&r=33c0475f-9563-4967-84dd-0059a26f3094-1&k=TGIlr-yTT2j53fnzcyTmTA&ckc=com.apple.photos.cloud&ckz=PrimarySync&y=1&p=64&s=7Gg3tjuWXpApElC65pqjaf4JDrU"
        //           },
        //           "type" : "ASSETID"
        //         },
        //         "resOriginalFileType" : {
        //           "value" : "public.jpeg",
        //           "type" : "STRING"
        //         },
        //         "resOriginalHeight" : {
        //           "value" : 895,
        //           "type" : "INT64"
        //         }
        //       },
        //       "pluginFields" : { },
        //       "recordChangeTag" : "qs",
        //       "created" : {
        //         "timestamp" : 1700643349901,
        //         "userRecordName" : "_334c6ec122c2c85abfd3b80a968cdae7",
        //         "deviceID" : "2"
        //       },
        //       "modified" : {
        //         "timestamp" : 1700643349901,
        //         "userRecordName" : "_334c6ec122c2c85abfd3b80a968cdae7",
        //         "deviceID" : "2"
        //       },
        //       "deleted" : false
        //     } ],
        //     "syncToken" : "HwoDCI4IGAAiFgivgs3KpOOXs8gBEJ3vpemuuc+hoAEoAA=="
        //   }
        await fs.utimes(location, new Date(asset.modified), new Date(asset.modified)); // Setting modified date on file
    }

    /**
     * Deletes the records in the remote library
     * @remarks Since the shared library currently does not support it's own directory tree / WebUI does not show pictures in folders we only do this for the primary zone, because archiving is only possible of folders
     * @param recordNames - A list of record names that need to be deleted
     * @returns A Promise, that fulfils once the operation has been performed
     * @throws An iCPSError, in case the records could not be deleted
     */
    async deleteAssets(recordNames: string[]) {
        Resources.logger(this).debug(`Deleting ${recordNames.length} assets: ${jsonc.stringify(recordNames)}`);
        await this.performOperation(QueryBuilder.Zones.Primary, OperationTypeValues.FORCE_DELETE, QueryBuilder.getIsDeletedField(), recordNames);
    }
}