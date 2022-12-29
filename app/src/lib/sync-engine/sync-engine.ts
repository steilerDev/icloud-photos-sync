import {EventEmitter} from 'events';
import {iCloud} from '../icloud/icloud.js';
import {PhotosLibrary} from '../photos-library/photos-library.js';
import * as SYNC_ENGINE from './constants.js';
import {Asset} from '../photos-library/model/asset.js';
import {Album} from '../photos-library/model/album.js';
import PQueue from 'p-queue';
import {PLibraryEntities, PLibraryProcessingQueues} from '../photos-library/model/photos-entity.js';
import {getLogger} from '../logger.js';

// Helpers extending this class
import {getProcessingQueues, resolveHierarchicalDependencies} from './helpers/diff-helpers.js';
import {convertCPLAssets, convertCPLAlbums} from './helpers/fetchAndLoad-helpers.js';
import {addAsset, removeAsset, writeAssets} from './helpers/write-assets-helpers.js';
import {addAlbum, compareQueueElements, removeAlbum, sortQueue, writeAlbums} from './helpers/write-albums-helper.js';
import {SyncApp} from '../../app/icloud-app.js';
import { HANDLER_EVENT } from '../../app/error/handler.js';
import { SyncError } from '../../app/error/types.js';

/**
 * This class handles the photos sync
 */
export class SyncEngine extends EventEmitter {
    /**
     * Default logger for the class
     */
    protected logger = getLogger(this);

    /**
     * The iCloud connection
     */
    icloud: iCloud;

    /**
     * The local PhotosLibrary
     */
    photosLibrary: PhotosLibrary;

    /**
     * A queue containing all pending asset downloads, in order to limit download threads
     * Initialized in writeAssets()
     */
    downloadQueue: PQueue;
    /**
     * The number of concurent download threads
     */
    downloadCCY: number;

    /**
     * If the sync experiences an expected / recoverable error (e.g. after 1hr the cookies need to be refreshed), how often should the tool retry
     * Set this to -1 if retry should happen infinitely
     */
    maxRetry: number;

    /**
     * Creates a new sync engine from the previously created objects and CLI options
     * @param app - The application object, holding references to the iCloud object, the Photos Library object and CLI options
     */
    constructor(app: SyncApp) {
        super();
        this.icloud = app.icloud;
        this.photosLibrary = app.photosLibrary;
        this.downloadCCY = app.options.downloadThreads;
        this.maxRetry = app.options.maxRetries;
    }

    /**
     * Performs the sync and handles all connections
     * @returns A list of assets as fetched from the remote state. It can be assumed that this reflects the local state (given a warning free execution of the sync)
     */
    async sync(): Promise<[Asset[], Album[]]> {
        this.logger.info(`Starting sync`);
        this.emit(SYNC_ENGINE.EVENTS.START);
        let retryCount = 0;
        while (this.maxRetry === -1 || this.maxRetry > retryCount) {
            retryCount++;
            this.logger.info(`Performing sync, try #${retryCount}`);

            const [remoteAssets, remoteAlbums, localAssets, localAlbums] = await this.fetchAndLoadState();
            const [assetQueue, albumQueue] = await this.diffState(remoteAssets, remoteAlbums, localAssets, localAlbums);

            try {
                await this.writeState(assetQueue, albumQueue);
                this.logger.info(`Completed sync!`);
                this.emit(SYNC_ENGINE.EVENTS.DONE);
                return [remoteAssets, remoteAlbums];
            } catch (err) {
                this.emit(HANDLER_EVENT, new SyncError(`Error while writing state`, "WARN").addCause(err))
                // Checking if we should retry
               this.checkFatalError(err)

                this.emit(SYNC_ENGINE.EVENTS.RETRY, retryCount);
                await this.prepareRetry();
            }
        }

        // We'll only reach this, if we exceeded retryCount
        throw new SyncError(`Sync did not complete succesfull within ${retryCount} tries`, "FATAL");
    }

    /**
     * Checks if a given AxiosError can be seen as 'fatal' in the context of a sync
     * @param err - An error that was thrown during 'writeState()'
     * @throws If a fatal error occured that should NOT be retried
     */
    checkFatalError(err: any): boolean {
        if (err.name !== `AxiosError`) {
            throw new SyncError(`Unknown error, aborting!`, "FATAL")
                .addCause(err);
        }

        this.logger.debug(`Detected Axios error`);

        if (err.code === `ERR_BAD_RESPONSE`) {
            this.logger.debug(`Bad server response (${err.response?.status}), retrying...`);
            return false;
        }

        if (err.code === `ERR_BAD_REQUEST`) {
            this.logger.debug(`Bad request ${err.response?.status ?? err.status}, refreshing session...`);
            return false;
        }

        throw new SyncError(`Unknown error code, aborting!`, "FATAL")
            .addCause(err);
    }

    /**
     * Prepares the sync engine for a retry, by emptying the queue and refreshing iCloud cookies
     */
    async prepareRetry(): Promise<void> {
        this.logger.debug(`Preparing retry...`);
        if (this.downloadQueue) {
            if (this.downloadQueue.size > 0) {
                this.logger.info(`Error occured with ${this.downloadQueue.size} asset(s) left in the download queue, clearing queue...`);
                this.downloadQueue.clear();
            }

            if (this.downloadQueue.pending > 0) {
                this.logger.info(`Error occured with ${this.downloadQueue.pending} pending job(s), waiting for queue to settle...`);
                await this.downloadQueue.onIdle();
                this.logger.debug(`Queue has settled!`);
            }
        }

        this.logger.debug(`Refreshing iCloud connection`);
        const iCloudReady = this.icloud.getReady();
        this.icloud.getiCloudCookies();
        return iCloudReady;
    }

    /**
     * This function fetches the remote state and loads the local state from disk
     * @returns A promise that resolve once the fetch was completed, containing the remote & local state - remote album state is in order
     */
    async fetchAndLoadState(): Promise<[Asset[], Album[], PLibraryEntities<Asset>, PLibraryEntities<Album>]> {
        this.emit(SYNC_ENGINE.EVENTS.FETCH_N_LOAD);
        return Promise.all([
            this.icloud.photos.fetchAllPictureRecords()
                .then(([cplAssets, cplMasters]) => SyncEngine.convertCPLAssets(cplAssets, cplMasters)),
            this.icloud.photos.fetchAllAlbumRecords()
                .then(cplAlbums => SyncEngine.convertCPLAlbums(cplAlbums)),
            this.photosLibrary.loadAssets(),
            this.photosLibrary.loadAlbums(),
        ]).then(result => {
            const remoteAssetCount = result[0].length;
            const remoteAlbumCount = result[1].length;
            const localAssetCount = Object.keys(result[2]).length;
            const localAlbumCount = Object.keys(result[3]).length;
            this.emit(SYNC_ENGINE.EVENTS.FETCH_N_LOAD_COMPLETED, remoteAssetCount, remoteAlbumCount, localAssetCount, localAlbumCount);
            return result;
        });
    }

    // From ./helpers/fetchAndLoad-helpters.ts
    static convertCPLAlbums = convertCPLAlbums;
    static convertCPLAssets = convertCPLAssets;

    /**
     * This function diffs the provided local state with the given remote state
     * @param remoteAssets - An array of all remote assets
     * @param remoteAlbums - An array of all remote albums
     * @param localAssets - A list of local assets
     * @param localAlbums - A list of local albums
     * @returns A promise that, once resolved, will contain processing queues that can be used in order to sync the remote state.
     */
    async diffState(remoteAssets: Asset[], remoteAlbums: Album[], localAssets: PLibraryEntities<Asset>, localAlbums: PLibraryEntities<Album>): Promise<[PLibraryProcessingQueues<Asset>, PLibraryProcessingQueues<Album>]> {
        this.emit(SYNC_ENGINE.EVENTS.DIFF);
        this.logger.info(`Diffing state`);
        return Promise.all([
            this.getProcessingQueues(remoteAssets, localAssets),
            this.getProcessingQueues(remoteAlbums, localAlbums),
        ]).then(([assetQueue, albumQueue]) => {
            const resolvedAlbumQueue = this.resolveHierarchicalDependencies(albumQueue, localAlbums);
            this.emit(SYNC_ENGINE.EVENTS.DIFF_COMPLETED);
            return [assetQueue, resolvedAlbumQueue];
        });
    }

    // From ./helpers/diff-helpers.ts
    resolveHierarchicalDependencies = resolveHierarchicalDependencies;
    getProcessingQueues = getProcessingQueues;

    /**
     * Takes the processing queues and performs the necessary actions to write them to disk
     * @param assetQueue - The queue containing assets that need to be written to, or deleted from disk
     * @param albumQueue - The queue containing albums that need to be written to, or deleted from disk
     * @returns A promise that will settle, once the state has been written to disk
     */
    async writeState(assetQueue: PLibraryProcessingQueues<Asset>, albumQueue: PLibraryProcessingQueues<Album>) {
        this.emit(SYNC_ENGINE.EVENTS.WRITE);
        this.logger.info(`Writing state`);
        this.emit(SYNC_ENGINE.EVENTS.WRITE_ASSETS, assetQueue[0].length, assetQueue[1].length, assetQueue[2].length);
        return this.writeAssets(assetQueue)
            .catch((err) => {
                this.emit(SYNC_ENGINE.EVENTS.WRITE_ASSETS_ABORTED, err.message)
                throw err
            })
            .then(() => this.emit(SYNC_ENGINE.EVENTS.WRITE_ASSETS_COMPLETED))
            .then(() => {
                this.emit(SYNC_ENGINE.EVENTS.WRITE_ALBUMS, albumQueue[0].length, albumQueue[1].length, albumQueue[2].length);
                return this.writeAlbums(albumQueue);
            })
            .then(() => this.emit(SYNC_ENGINE.EVENTS.WRITE_ALBUMS_COMPLETED))
            .then(() => this.emit(SYNC_ENGINE.EVENTS.WRITE_COMPLETED));
    }

    // From ./helpers/write-assets-helpers.ts
    writeAssets = writeAssets;
    addAsset = addAsset;
    removeAsset = removeAsset;

    // From ./helpers/write-albums-helpers.ts
    writeAlbums = writeAlbums;
    sortQueue = sortQueue;
    static compareQueueElements = compareQueueElements;
    addAlbum = addAlbum;
    removeAlbum = removeAlbum;
}