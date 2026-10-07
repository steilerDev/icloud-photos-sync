import {jsonc} from 'jsonc';
import {ICLOUD_PHOTOS_ERR} from '../../../app/error/error-codes.js';
import {errorMessage, iCPSError} from '../../../app/error/error.js';
import {AlbumAssets, AlbumType} from '../../photos-library/model/album.js';
import {Asset} from '../../photos-library/model/asset.js';
import {iCPSEventPhotos, iCPSEventRuntimeWarning} from '../../resources/events-types.js';
import {HttpRequestConfig, isHttpError} from '../../resources/http-client.js';
import {Resources} from '../../resources/main.js';
import {ENDPOINTS, PhotosSetupResponseZone} from '../../resources/network-types.js';
import {SyncEngineHelper} from '../../sync-engine/helper.js';
import * as QueryBuilder from './query-builder.js';
import {CPLAlbum, CPLAsset, CPLMaster} from './query-parser.js';
import {ZoneArea} from '../../resources/resource-types.js';

/**
 * To perform an operation, a record change tag is required. Hardcoding it for now
 */
const RECORD_CHANGE_TAG = `21h2`;

/**
 * The record limit requested per query.
 * iCloud returns at most 200 records per request, but in order to divide by 3 (for albums) and 2 (for all pictures) 198 is more convenient.
 * Requests are only planned based on this limit - if iCloud returns fewer records, the missing records are requested again.
 */
const MAX_RECORDS_LIMIT = 198;

/**
 * A single page of query results
 */
export type QueryPage = {
    /**
     * The records returned by the backend
     */
    records: any[],
    /**
     * The marker to request the next page of the same query, if more results are available
     */
    continuationMarker?: string,
}

/**
 * The maximum length of a non-JSON response body included in an error message
 */
const MAX_ERROR_BODY_LENGTH = 200;

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
     * Listeners of a previously created promise are removed, so that a stale (already settled) promise does not consume the events of a later setup
     * @returns - A promise, that will resolve once this objects emits 'READY' or reject if it emits 'ERROR'
     */
    getReady(): Promise<void> {
        Resources.events(this)
            .removeListeners(iCPSEventPhotos.READY)
            .removeListeners(iCPSEventPhotos.ERROR);

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
        // The setup is repeated when re-establishing the connection (e.g. on sync retries), the result of a previous setup must not be re-used
        this.ready = this.getReady();
        try {
            Resources.logger(this).debug(`Getting iCloud Photos account information`);

            Resources.network().applyZones(
                await this.getZonesInArea(`PRIVATE`),
                await this.getZonesInArea(`SHARED`)
            )

            Resources.logger(this).debug(`Successfully gathered iCloud Photos account information`);
            Resources.emit(iCPSEventPhotos.SETUP_COMPLETED);
        } catch (err) {
            Resources.emit(iCPSEventPhotos.ERROR, new iCPSError(ICLOUD_PHOTOS_ERR.SETUP_ERROR).addCause(err));
        } 
        return this.ready;
    }

    /**
     * Checks for everyone zone available in the respective area
     * @param area Either private or shared - depending on the ownership of the area
     * @returns An array of zone references
     */
    private async getZonesInArea(area: ZoneArea): Promise<PhotosSetupResponseZone[]> {
        Resources.logger(this).debug(`Getting zones in ${area} area`);
        const validatedResponse = await Resources.network().post(ENDPOINTS.PHOTOS.AREAS[area] + ENDPOINTS.PHOTOS.PATH.ZONES, {}, Resources.validator().response.photosSetup);
        return validatedResponse.data.zones;
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
        const result = await this.performQuery(zone, `CheckIndexingState`);

        const indexingState = result[0]?.fields?.state?.value as string;

        if (!indexingState) {
            throw new iCPSError(ICLOUD_PHOTOS_ERR.INDEXING_STATE_UNAVAILABLE)
                .addMessage(`zone: ${zone}`)
                .addContext(`icloudResult`, result);
        }

        if (indexingState === `RUNNING`) {
            Resources.logger(this).debug(`Indexing for zone ${zone} in progress, sync needs to wait!`);
            const indexingInProgressError = new iCPSError(ICLOUD_PHOTOS_ERR.INDEXING_IN_PROGRESS)
                .addMessage(`zone: ${zone}`);

            const progress = result[0]?.fields?.progress?.value;
            if (progress) {
                indexingInProgressError.addMessage(`progress ${progress}`);
            }

            throw indexingInProgressError;
        }

        if (indexingState === `FINISHED`) {
            Resources.logger(this).info(`Indexing of ${zone} finished, sync can start!`);
            return;
        }

        throw new iCPSError(ICLOUD_PHOTOS_ERR.INDEXING_STATE_UNKNOWN)
            .addContext(`icloudResult`, result)
            .addMessage(`zone: ${zone}`)
            .addMessage(`indexing state: ${indexingState}`);
    }

    /**
     * Performs a query against the iCloud Photos Service, following the continuation marker until all results are fetched
     * @param zone - Defines the zone to be used
     * @param recordType - The requested record type
     * @param filterBy - An array of filter instructions
     * @param resultsLimit - The number of records requested per page, iCloud returns at most 200 records per request
     * @param desiredKeys - The fields requested from the backend
     * @returns An array of records as returned by the backend
     * @throws An iCPSError, if the request was rejected (containing the CloudKit error details) or the response is invalid - an HttpError, if no response was received
     */
    async performQuery(zone: QueryBuilder.Zones, recordType: string, filterBy?: any[], resultsLimit?: number, desiredKeys?: string[]): Promise<any[]> {
        const records: any[] = [];
        let continuationMarker: string | undefined;
        do {
            const page = await this.performQueryPage(zone, recordType, filterBy, resultsLimit, desiredKeys, continuationMarker);
            records.push(...page.records);
            // An empty page or a repeated marker would never finish the query
            continuationMarker = page.records.length > 0 && page.continuationMarker !== continuationMarker
                ? page.continuationMarker
                : undefined;
        } while (continuationMarker);

        return records;
    }

    /**
     * Performs a single query request against the iCloud Photos Service
     * @param zone - Defines the zone to be used
     * @param recordType - The requested record type
     * @param filterBy - An array of filter instructions
     * @param resultsLimit - The number of records requested, iCloud returns at most 200 records per request
     * @param desiredKeys - The fields requested from the backend
     * @param continuationMarker - The marker returned by the previous page of the same query, in order to request the next page
     * @returns The records as returned by the backend, as well as the marker for the next page if more results are available
     * @throws An iCPSError, if the request was rejected (containing the CloudKit error details) or the response is invalid - an HttpError, if no response was received
     */
    async performQueryPage(zone: QueryBuilder.Zones, recordType: string, filterBy?: any[], resultsLimit?: number, desiredKeys?: string[], continuationMarker?: string): Promise<QueryPage> {
        const config: HttpRequestConfig = {
            params: {
                remapEnums: `True`,
            },
        };

        const zoneId = QueryBuilder.getZoneID(zone)

        const data: any = {
            query: {
                recordType: `${recordType}`,
            },
            zoneID: {
                zoneName: zoneId.zoneName,
                zoneType: zoneId.zoneType,
                ownerRecordName: zoneId.ownerRecordName,
            }
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

        if (continuationMarker) {
            data.continuationMarker = continuationMarker;
        }

        try {
            // Only the response format is schema validated, the records are parsed defensively
            const queryResponse = await Resources.network().post(ENDPOINTS.PHOTOS.AREAS[zoneId.area] + ENDPOINTS.PHOTOS.PATH.QUERY, data, Resources.validator().response.query, config);
            return {
                records: queryResponse.data.records,
                continuationMarker: queryResponse.data.continuationMarker,
            };
        } catch (err) {
            throw this.wrapRequestError(err, `${recordType} query`);
        }
    }

    /**
     * Performs a single operation with the iCloud Backend
     * @param zone - Defines the zone to be used
     * @param operationType - The type of operation, that should be performed
     * @param recordNames - The list of recordNames of the asset the operation should be performed on
     * @param fields - The fields to be altered
     * @returns An array of records that have been altered
     * @throws An iCPSError, if the request was rejected (containing the CloudKit error details) or the response is invalid - an HttpError, if no response was received
     */
    async performOperation(zone: QueryBuilder.Zones, operationType: string, fields: any, recordNames: string[]): Promise<any[]> {
        const config: HttpRequestConfig = {
            params: {
                remapEnums: `True`,
            },
        };

        const zoneId = QueryBuilder.getZoneID(zone)

        const data: any = {
            operations: [],
            zoneID: {
                zoneName: zoneId.zoneName,
                zoneType: zoneId.zoneType,
                ownerRecordName: zoneId.ownerRecordName,
            },
            atomic: true,
        };

        data.operations = recordNames.map(recordName => ({
            operationType: `${operationType}`,
            record: {
                recordName: `${recordName}`,
                recordType: `CPLAsset`,
                recordChangeTag: RECORD_CHANGE_TAG,
                fields,
            },
        }));

        try {
            // Only the response format is schema validated, the records are parsed defensively
            const operationResponse = await Resources.network().post(ENDPOINTS.PHOTOS.AREAS[zoneId.area] + ENDPOINTS.PHOTOS.PATH.MODIFY, data, Resources.validator().response.operation, config);
            return operationResponse.data.records;
        } catch (err) {
            throw this.wrapRequestError(err, `${operationType} operation`);
        }
    }

    /**
     * Attaches the error details provided by CloudKit to a failed request, since the HTTP status alone does not explain the failure
     * @param err - The error thrown by the request
     * @param request - A description of the failed request
     * @returns An iCPSError containing the CloudKit error details, if the request received a response - the provided error otherwise
     */
    wrapRequestError(err: unknown, request: string): unknown {
        if (!isHttpError(err) || err.response === undefined) {
            return err;
        }

        const {status, headers, data, text} = err.response;
        const wrappedError = new iCPSError(ICLOUD_PHOTOS_ERR.REQUEST_FAILED)
            .addMessage(request)
            .addMessage(`status ${status}`)
            .addCause(err);

        if (typeof data === `object` && data !== null) {
            if (data.serverErrorCode !== undefined || data.reason !== undefined) {
                wrappedError.addMessage(`${data.serverErrorCode ?? `unknown error`}: ${data.reason ?? `no reason provided`}`);
            }

            if (data.retryAfter !== undefined) {
                wrappedError.addMessage(`retry after ${data.retryAfter}s`);
            }
        } else if (text.trim().length > 0) {
            wrappedError.addMessage(`response: ${text.replace(/\s+/g, ` `).trim().slice(0, MAX_ERROR_BODY_LENGTH)}`);
        }

        if (headers[`retry-after`] !== undefined) {
            wrappedError.addMessage(`retry-after header ${headers[`retry-after`]}`);
        }

        return wrappedError.addContext(`responseBody`, text.slice(0, 10 * MAX_ERROR_BODY_LENGTH));
    }

    /**
     * Fetches all album records, traversing the directory tree
     * @remarks Since the shared library currently does not support it's own directory tree / WebUI does not show pictures in folders we only do this for the primary zone
     *          Since we are requesting them based on parent folder and are starting from the root folder the results array should yield: If folder A is closer to the root than folder B, the index of A is smaller than the index of B
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
                // Getting next item in the queue - queue is not empty, as checked by the loop condition
                for (const nextAlbum of await queue.shift()!) {
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
     * @param folderId- The record name of the folder. If parent is undefined, all albums without parent will be returned.
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
                Resources.logger(this).info(`Error processing CPLAlbum: ${jsonc.stringify(album)}: ${errorMessage(err)}`);
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
     * This function will split the album into ranges of positions, based on the expected size of the album, in order to fetch them in parallel.
     * @param zone - Defines the zone to be used
     * @param expectedNumberOfRecords - The amount of records expected within the given album
     * @param albumId - The record name of the album, if undefined all pictures will be returned
     * @returns An array of Promises, that will resolve to arrays of picture records
     */
    buildPictureRecordsRequestsForZone(zone: QueryBuilder.Zones, expectedNumberOfRecords: number, albumId?: string): Promise<any[]>[] {
        // On all pictures two records per photo are returned (CPLMaster & CPLAsset), on albums three (CPLMaster, CPLAsset & CPLContainerRelation) - all of them are counted against the limit
        const positionsPerRequest = albumId === undefined
            ? Math.floor(MAX_RECORDS_LIMIT / 2)
            : Math.floor(MAX_RECORDS_LIMIT / 3);
        const numberOfRequests = Math.ceil(expectedNumberOfRecords / positionsPerRequest);

        Resources.logger(this).debug(`Expecting ${expectedNumberOfRecords} records for album ${albumId === undefined ? `All photos` : albumId} in ${zone} library, executing ${numberOfRequests} queries`);

        // Collecting all promise queries for parallel execution
        const pictureRecordsRequests: Promise<any[]>[] = [];
        for (let index = 0; index < numberOfRequests; index++) {
            const startRank = index * positionsPerRequest;
            const endRank = Math.min(startRank + positionsPerRequest, expectedNumberOfRecords);
            pictureRecordsRequests.push(this.fetchPictureRecordsRange(zone, startRank, endRank, albumId));
        }

        return pictureRecordsRequests;
    }

    /**
     * Fetches the picture records within a range of positions of an album.
     * If iCloud returns fewer records than requested (e.g. because it lowered its record limit), the remaining positions are requested again:
     * Following the continuation marker if one was provided, otherwise starting the query at the first position that was not yet received.
     * @param zone - Defines the zone to be used
     * @param startRank - The first position of the range
     * @param endRank - The position after the last position of the range
     * @param albumId - The record name of the album, if undefined all pictures will be returned
     * @returns The picture records within the range, as returned by the backend - might include records of re-requested positions or positions beyond the range
     * @throws An iCPSError, if a query fails
     */
    async fetchPictureRecordsRange(zone: QueryBuilder.Zones, startRank: number, endRank: number, albumId?: string): Promise<any[]> {
        const records: any[] = [];

        // The continuation marker is only valid for the query it was returned by, therefore the start rank of that query is retained while following it
        let queryRank = startRank;
        let receivedRank = startRank;
        let continuationMarker: string | undefined;
        while (receivedRank < endRank) {
            Resources.logger(this).debug(`Building query for records of album ${albumId === undefined ? `All photos` : albumId} in ${zone} library at index ${receivedRank}${continuationMarker ? ` (continuing query at index ${queryRank})` : ``}`);
            const filters = [QueryBuilder.getStartRankFilterForStartRank(queryRank), QueryBuilder.getDirectionFilterForDirection()];
            if (albumId !== undefined) {
                filters.push(QueryBuilder.getParentFilterForParentId(albumId));
            }

            const page = await this.performQueryPage(
                zone,
                albumId === undefined ? QueryBuilder.RECORD_TYPES.ALL_PHOTOS : QueryBuilder.RECORD_TYPES.PHOTO_RECORDS,
                filters,
                MAX_RECORDS_LIMIT,
                QueryBuilder.QUERY_KEYS,
                continuationMarker,
            );

            const receivedPositions = this.countReceivedPositions(page.records);
            if (receivedPositions === 0) {
                // No more records available, the count mismatch will be reported once all records are processed
                break;
            }

            records.push(...page.records);
            receivedRank += receivedPositions;
            if (page.continuationMarker && page.continuationMarker !== continuationMarker) {
                continuationMarker = page.continuationMarker;
            } else {
                continuationMarker = undefined;
                queryRank = receivedRank;
            }
        }

        return records;
    }

    /**
     * Counts the positions (photos) a page of picture records covers.
     * A position is only counted as received, if its CPLAsset and CPLMaster are part of the page - in case the page cut a position in half, it is requested again.
     * @param records - The records of the page, as returned by the backend
     * @returns The number of positions covered by the page
     */
    countReceivedPositions(records: any[]): number {
        const assets = records.filter(record => record?.recordType === QueryBuilder.RECORD_TYPES.PHOTO_ASSET_RECORD);
        const masterNames = new Set(records
            .filter(record => record?.recordType === QueryBuilder.RECORD_TYPES.PHOTO_MASTER_RECORD)
            .map(record => record.recordName));
        const completePositions = assets.filter(asset => masterNames.has(asset.fields?.masterRef?.value?.recordName)).length;

        // Positions without a matching master would otherwise be requested indefinitely
        return completePositions > 0 ? completePositions : assets.length;
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
        const pictureRecordsRequests = this.buildPictureRecordsRequestsForZone(zone, expectedNumberOfRecords, parentId);

        // Merging arrays of arrays and waiting for all promises to settle
        const allRecords: any[] = [];
        // Ranges might overlap, in case positions were re-requested
        const seen = new Set<string>();

        (await Promise.all(pictureRecordsRequests)).forEach(records => {
            for (const record of records) {
                const recordKey = `${record?.recordType}/${record?.recordName}`;
                if (typeof record?.recordName === `string` && seen.has(recordKey)) {
                    continue;
                }

                seen.add(recordKey);
                allRecords.push(record);
            }
        });

        return [allRecords, expectedNumberOfRecords];
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

        const cplMasters: CPLMaster[] = [];
        const cplAssets: CPLAsset[] = [];
        let allRecords: any[];
        let expectedNumberOfRecords: number;
        try {
            [allRecords, expectedNumberOfRecords] = await this.fetchAllPictureRecordsForZone(QueryBuilder.Zones.Primary, parentId);

            // Merging assets of shared library, if available
            if (Resources.manager().sharedZoneAvailable && typeof parentId === `undefined`) { // Only fetch shared album records if no parentId is specified, since icloud api does not yet support shared records in albums
                Resources.logger(this).debug(`Fetching all picture records for album All photos for shared zone`);
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
        if (!asset.downloadURL) {
            throw new iCPSError(ICLOUD_PHOTOS_ERR.MISSING_DOWNLOAD_URL)
                .addContext(`asset`, asset);
        }

        await Resources.network().downloadData(asset.downloadURL, asset.getAssetFilePath(), asset.modified);
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
        await this.performOperation(QueryBuilder.Zones.Primary, `update`, QueryBuilder.getIsDeletedField(), recordNames);
    }
}