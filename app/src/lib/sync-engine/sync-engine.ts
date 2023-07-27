import {EventEmitter} from 'events';
import {iCloud} from '../icloud/icloud.js';
import {PhotosLibrary} from '../photos-library/photos-library.js';
import * as SYNC_ENGINE from './constants.js';
import {Asset} from '../photos-library/model/asset.js';
import {Album, AlbumType} from '../photos-library/model/album.js';
import PQueue from 'p-queue';
import {PLibraryEntities, PLibraryProcessingQueues} from '../photos-library/model/photos-entity.js';
import {getLogger} from '../logger.js';

import {iCPSError} from '../../app/error/error.js';
import {SYNC_ERR} from '../../app/error/error-codes.js';
import {ResourceManager} from '../resource-manager/resource-manager.js';
import {SyncEngineHelper} from './helper.js';
import {HANDLER_EVENT} from '../../app/event/error-handler.js';

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
     * Creates a new sync engine from the previously created objects and CLI options
     * @param icloud - The iCloud object
     * @param photosLibrary - The photos library object
     */
    constructor(icloud: iCloud, photosLibrary: PhotosLibrary) {
        super();
        this.icloud = icloud;
        this.photosLibrary = photosLibrary;
    }

    /**
     * Performs the sync and handles all connections
     * @returns A list of assets as fetched from the remote state. It can be assumed that this reflects the local state (given a warning free execution of the sync)
     */
    async sync(): Promise<[Asset[], Album[]]> {
        this.logger.info(`Starting sync`);
        this.emit(SYNC_ENGINE.EVENTS.START);
        let retryCount = 0;
        while (ResourceManager.maxRetries > retryCount) {
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
                // Checking if we should retry
                this.checkFatalError(err);

                this.logger.info(`Detected recoverable error: ${err.message}`);

                this.emit(SYNC_ENGINE.EVENTS.RETRY, retryCount);
                await this.prepareRetry();
            }
        }

        // We'll only reach this, if we exceeded retryCount
        throw new iCPSError(SYNC_ERR.MAX_RETRY)
            .addMessage(`${retryCount}`);
    }

    /**
     * Checks if a given AxiosError can be seen as 'fatal' in the context of a sync
     * @param err - An error that was thrown during 'writeState()'
     * @throws If a fatal error occurred that should NOT be retried
     */
    checkFatalError(err: any): boolean {
        if (err.code === `ERR_BAD_RESPONSE`) {
            this.logger.debug(`Bad server response (${err.response?.status}), refreshing session...`);
            return false;
        }

        if (err.code === `ERR_BAD_REQUEST`) {
            this.logger.debug(`Bad request ${err.response?.status}, refreshing session...`);
            return false;
        }

        if (err.code === `EAI_AGAIN`) {
            this.logger.debug(`iCloud DNS record expired, refreshing session...`);
            return false;
        }

        throw new iCPSError(SYNC_ERR.UNKNOWN_SYNC)
            .addCause(err);
    }

    /**
     * Prepares the sync engine for a retry, by emptying the queue and refreshing iCloud cookies
     */
    async prepareRetry() {
        this.logger.debug(`Preparing retry...`);
        if (this.downloadQueue) {
            if (this.downloadQueue.size > 0) {
                this.logger.info(`Error occurred with ${this.downloadQueue.size} asset(s) left in the download queue, clearing queue...`);
                this.downloadQueue.clear();
            }

            if (this.downloadQueue.pending > 0) {
                this.logger.info(`Error occurred with ${this.downloadQueue.pending} pending job(s), waiting for queue to settle...`);
                await this.downloadQueue.onIdle();
                this.logger.debug(`Queue has settled!`);
            }
        }

        this.logger.debug(`Refreshing iCloud connection`);
        const iCloudReady = this.icloud.getReady();
        this.icloud.setupAccount();
        await iCloudReady;
    }

    /**
     * This function fetches the remote state and loads the local state from disk
     * @returns A promise that resolve once the fetch was completed, containing the remote & local state - remote album state is in order
     */
    async fetchAndLoadState(): Promise<[Asset[], Album[], PLibraryEntities<Asset>, PLibraryEntities<Album>]> {
        this.emit(SYNC_ENGINE.EVENTS.FETCH_N_LOAD);
        const [remoteAssets, remoteAlbums, localAssets, localAlbums] = await Promise.all([
            this.icloud.photos.fetchAllCPLAssetsMasters()
                .then(([cplAssets, cplMasters]) => SyncEngineHelper.convertCPLAssets(cplAssets, cplMasters)),
            this.icloud.photos.fetchAllCPLAlbums()
                .then(cplAlbums => SyncEngineHelper.convertCPLAlbums(cplAlbums)),
            this.photosLibrary.loadAssets(),
            this.photosLibrary.loadAlbums(),
        ]);

        this.emit(SYNC_ENGINE.EVENTS.FETCH_N_LOAD_COMPLETED, remoteAssets.length, remoteAlbums.length, Object.keys(localAssets).length, Object.keys(localAlbums).length);
        return [remoteAssets, remoteAlbums, localAssets, localAlbums];
    }

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
        const [assetQueue, albumQueue] = await Promise.all([
            SyncEngineHelper.getProcessingQueues(remoteAssets, localAssets),
            SyncEngineHelper.getProcessingQueues(remoteAlbums, localAlbums),
        ]);
        const resolvedAlbumQueue = SyncEngineHelper.resolveHierarchicalDependencies(albumQueue, localAlbums);
        this.emit(SYNC_ENGINE.EVENTS.DIFF_COMPLETED);
        return [assetQueue, resolvedAlbumQueue];
    }

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
        await this.writeAssets(assetQueue);
        this.emit(SYNC_ENGINE.EVENTS.WRITE_ASSETS_COMPLETED);

        this.emit(SYNC_ENGINE.EVENTS.WRITE_ALBUMS, albumQueue[0].length, albumQueue[1].length, albumQueue[2].length);
        await this.writeAlbums(albumQueue);
        this.emit(SYNC_ENGINE.EVENTS.WRITE_ALBUMS_COMPLETED);

        this.emit(SYNC_ENGINE.EVENTS.WRITE_COMPLETED);
    }

    /**
     * Writes the asset changes defined in the processing queue to to disk (by downloading the asset or deleting it)
     * @param processingQueue - The asset processing queue
     * @returns A promise that settles, once all asset changes have been written to disk
     */
    async writeAssets(processingQueue: PLibraryProcessingQueues<Asset>) {
        const toBeDeleted = processingQueue[0];
        const toBeAdded = processingQueue[1];
        // Initializing sync queue
        this.downloadQueue = new PQueue({concurrency: ResourceManager.downloadThreads});

        this.logger.debug(`Writing data by deleting ${toBeDeleted.length} assets and adding ${toBeAdded.length} assets`);

        // Deleting before downloading, in order to ensure no conflicts
        await Promise.all(toBeDeleted.map(asset => this.photosLibrary.deleteAsset(asset)));
        await Promise.all(toBeAdded.map(asset => this.downloadQueue.add(() => this.addAsset(asset))));
    }

    /**
     * Downloads and stores a given asset, unless file is already present on disk
     * @param asset - The asset that needs to be downloaded
     * @returns A promise that resolves, once the file has been successfully written to disk
     */
    async addAsset(asset: Asset) {
        this.logger.info(`Adding asset ${asset.getDisplayName()}`);

        try {
            await this.photosLibrary.verifyAsset(asset);
            this.logger.debug(`Asset ${asset.getDisplayName()} already downloaded`);
        } catch (err) {
            const data = await this.icloud.photos.downloadAsset(asset);
            await this.photosLibrary.writeAsset(asset, data);
        }

        this.emit(SYNC_ENGINE.EVENTS.WRITE_ASSET_COMPLETED, asset.getDisplayName());
    }

    /**
     * Writes the album changes defined in the processing queue to to disk
     * @param processingQueue - The album processing queue, expected to have resolved all hierarchical dependencies
     * @returns A promise that settles, once all album changes have been written to disk
     */
    async writeAlbums(processingQueue: PLibraryProcessingQueues<Album>) {
        this.logger.info(`Writing lib structure!`);

        // Making sure our queues are sorted
        const toBeDeleted: Album[] = SyncEngineHelper.sortQueue(processingQueue[0]);
        const toBeAdded: Album[] = SyncEngineHelper.sortQueue(processingQueue[1]);

        // Deletion before addition, in order to avoid duplicate folders
        // Reversing processing order, since we need to remove nested folders first
        toBeDeleted.reverse().forEach(album => {
            this.removeAlbum(album);
        });

        toBeAdded.forEach(album => {
            this.addAlbum(album);
        });

        await this.photosLibrary.cleanArchivedOrphans();
    }

    /**
     * Writes the data structure of an album to disk. This includes:
     *   * Create a hidden folder containing the UUID
     *   * Create a link to the hidden folder, containing the real name of the album
     *   * (If possible) link correct pictures from the assetFolder to the newly created album
     * @param album - The album, that should be written to disk
     */
    addAlbum(album: Album) {
        // If albumType == Archive -> Check in 'archivedFolder' and move
        this.logger.debug(`Creating album ${album.getDisplayName()} with parent ${album.parentAlbumUUID}`);

        if (album.albumType === AlbumType.ARCHIVED) {
            try {
                this.photosLibrary.retrieveStashedAlbum(album);
            } catch (err) {
                this.emit(HANDLER_EVENT, new iCPSError(SYNC_ERR.STASH_RETRIEVE)
                    .addMessage(album.getDisplayName())
                    .addCause(err));
            }

            return;
        }

        try {
            this.photosLibrary.writeAlbum(album);
        } catch (err) {
            this.emit(HANDLER_EVENT, new iCPSError(SYNC_ERR.ADD_ALBUM)
                .addMessage(album.getDisplayName())
                .addCause(err)
                .setWarning());
        }
    }

    /**
     * This will delete an album from disk and remove all associated symlinks
     * Deletion will only happen if the album is 'empty'. This means it only contains symlinks or 'safe' files. Any other folder or file will result in the folder not being deleted.
     * @param album - The album that needs to be deleted
     */
    removeAlbum(album: Album) {
        this.logger.debug(`Removing album ${album.getDisplayName()}`);

        if (album.albumType === AlbumType.ARCHIVED) {
            try {
                this.photosLibrary.stashArchivedAlbum(album);
            } catch (err) {
                this.emit(HANDLER_EVENT, new iCPSError(SYNC_ERR.STASH)
                    .addMessage(album.getDisplayName())
                    .addCause(err));
            }

            return;
        }

        try {
            this.photosLibrary.deleteAlbum(album);
        } catch (err) {
            this.emit(HANDLER_EVENT, new iCPSError(SYNC_ERR.DELETE_ALBUM)
                .addMessage(album.getDisplayName())
                .addCause(err));
        }
    }
}