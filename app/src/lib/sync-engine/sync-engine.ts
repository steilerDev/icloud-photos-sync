import {EventEmitter} from 'events';
import {iCloud} from '../icloud/icloud.js';
import {PhotosLibrary} from '../photos-library/photos-library.js';
import {OptionValues} from 'commander';
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
import {addAlbum, removeAlbum, queueIsSorted, sortQueue, writeAlbums} from './helpers/write-albums-helper.js';

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
    iCloud: iCloud;

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
     * @param iCloud - The authenticated and 'ready' iCloud connection
     * @param photosLibrary - The PhotosLibrary
     * @param cliOpts - The CLI options
     */
    constructor(cliOpts: OptionValues, iCloud: iCloud, photosLibrary: PhotosLibrary) {
        super();
        this.iCloud = iCloud;
        this.photosLibrary = photosLibrary;
        this.downloadCCY = cliOpts.downloadThreads;
        this.maxRetry = cliOpts.maxRetries;
    }

    /**
     * Performs the sync and handles all connections
     * @returns A list of assets as fetched from the remote state. It can be assumed that this reflects the local state (given a warning free execution of the sync)
     */
    async sync(): Promise<[Asset[], Album[]]> {
        try {
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
                    this.logger.warn(`Error while writing state: ${err.message}`);
                    // Checking if we should retry
                    if (this.checkFatalError(err)) {
                        throw err;
                    }

                    this.emit(SYNC_ENGINE.EVENTS.RETRY, retryCount);
                    await this.prepareRetry();
                }
            }

            // We'll only reach this, if we exceeded retryCount
            throw new Error(`Sync did not complete succesfull within ${retryCount} tries`);
        } catch (err) {
            this.logger.warn(`Unrecoverable sync error: ${err.message}`);
            this.emit(SYNC_ENGINE.EVENTS.ERROR, err.message);
        }
    }

    /**
     * Checks if a retry should happen
     * @param err - An error that was thrown during 'writeState()'
     * @returns - True if a fatal error occured that should NOT be retried
     */
    private checkFatalError(err: any): boolean {
        if (err.name !== `AxiosError`) {
            this.logger.warn(`Unknown error (${JSON.stringify(err)}), aborting!`);
            return true;
        }

        this.logger.debug(`Detected Axios error`);

        if (err.code !== `ERR_BAD_REQUEST` && err.code !== `ERR_BAD_RESPONSE`) {
            this.logger.warn(`Unknown Axios error (${JSON.stringify(err)}), aborting!`);
            return true;
        }

        if (err.code === `ERR_BAD_RESPONSE`) {
            this.logger.debug(`Bad server response (${err.response?.status}), retrying...`);
            return false;
        }

        this.logger.debug(`Error was due to a bad request`);
        if (err.response?.status === 410 || err.response?.status === 421) {
            this.logger.debug(`Remote ressources have changed location, updating URLs by retrying...`);
            // This seems to happen ever 60mins
            return false;
        }

        this.logger.warn(`Unknown bad request (${JSON.stringify(err)}), aborting!`);
        return true;
    }

    /**
     * Prepares the sync engine for a retry, by emptying the queue and refreshing iCloud cookies
     */
    private async prepareRetry(): Promise<void> {
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
        const iCloudReady = this.iCloud.getReady();
        this.iCloud.getiCloudCookies();
        return iCloudReady;
    }

    /**
     * This function fetches the remote state and loads the local state from disk
     * @returns A promise that resolve once the fetch was completed, containing the remote & local state - remote album state is in order
     */
    private async fetchAndLoadState(): Promise<[Asset[], Album[], PLibraryEntities<Asset>, PLibraryEntities<Album>]> {
        this.emit(SYNC_ENGINE.EVENTS.FETCH_N_LOAD);
        return Promise.all([
            this.iCloud.photos.fetchAllPictureRecords()
                .then(([cplAssets, cplMasters]) => SyncEngine.convertCPLAssets(cplAssets, cplMasters)),
            this.iCloud.photos.fetchAllAlbumRecords()
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
    private async diffState(remoteAssets: Asset[], remoteAlbums: Album[], localAssets: PLibraryEntities<Asset>, localAlbums: PLibraryEntities<Album>): Promise<[PLibraryProcessingQueues<Asset>, PLibraryProcessingQueues<Album>]> {
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
    private resolveHierarchicalDependencies = resolveHierarchicalDependencies;
    private getProcessingQueues = getProcessingQueues;

    /**
     * Takes the processing queues and performs the necessary actions to write them to disk
     * @param assetQueue - The queue containing assets that need to be written to, or deleted from disk
     * @param albumQueue - The queue containing albums that need to be written to, or deleted from disk
     * @returns A promise that will settle, once the state has been written to disk
     */
    private async writeState(assetQueue: PLibraryProcessingQueues<Asset>, albumQueue: PLibraryProcessingQueues<Album>) {
        this.emit(SYNC_ENGINE.EVENTS.WRITE);
        this.logger.info(`Writing state`);
        this.emit(SYNC_ENGINE.EVENTS.WRITE_ASSETS, assetQueue[0].length, assetQueue[1].length, assetQueue[2].length);
        return this.writeAssets(assetQueue)
            .then(() => this.emit(SYNC_ENGINE.EVENTS.WRITE_ASSETS_COMPLETED))
            .then(() => {
                this.emit(SYNC_ENGINE.EVENTS.WRITE_ALBUMS, albumQueue[0].length, albumQueue[1].length, albumQueue[2].length);
                return this.writeAlbums(albumQueue);
            })
            .then(() => this.emit(SYNC_ENGINE.EVENTS.WRITE_ALBUMS_COMPLETED))
            .then(() => this.emit(SYNC_ENGINE.EVENTS.WRITE_COMPLETED));
    }

    // From ./helpers/write-assets-helpers.ts
    private writeAssets = writeAssets;
    protected addAsset = addAsset;
    protected removeAsset = removeAsset;

    // From ./helpers/write-albums-helpers.ts
    private writeAlbums = writeAlbums;
    protected queueIsSorted = queueIsSorted;
    protected sortQueue = sortQueue;
    protected addAlbum = addAlbum;
    protected removeAlbum = removeAlbum;
}