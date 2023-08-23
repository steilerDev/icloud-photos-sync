import {iCloud} from '../icloud/icloud.js';
import {PhotosLibrary} from '../photos-library/photos-library.js';
import {Asset} from '../photos-library/model/asset.js';
import {Album, AlbumType} from '../photos-library/model/album.js';
import {PLibraryEntities, PLibraryProcessingQueues} from '../photos-library/model/photos-entity.js';

import {iCPSError} from '../../app/error/error.js';
import {SYNC_ERR} from '../../app/error/error-codes.js';
import {Resources} from '../resources/main.js';
import {SyncEngineHelper} from './helper.js';
import {iCPSEventError, iCPSEventSyncEngine} from '../resources/events-types.js';
import {AxiosError} from 'axios';

/**
 * This class handles the photos sync
 */
export class SyncEngine {
    /**
     * The iCloud connection
     */
    icloud: iCloud;

    /**
     * The local PhotosLibrary
     */
    photosLibrary: PhotosLibrary;

    /**
     * Creates a new sync engine from the previously created objects and CLI options
     * @param icloud - The iCloud object
     * @param photosLibrary - The photos library object
     */
    constructor(icloud: iCloud, photosLibrary: PhotosLibrary) {
        this.icloud = icloud;
        this.photosLibrary = photosLibrary;
    }

    /**
     * Performs the sync and handles all connections
     * @returns A list of assets as fetched from the remote state. It can be assumed that this reflects the local state (given a warning free execution of the sync)
     */
    async sync(): Promise<[Asset[], Album[]]> {
        Resources.logger(this).info(`Starting sync`);
        Resources.emit(iCPSEventSyncEngine.START);
        let retryCount = 1;
        while (Resources.manager().maxRetries >= retryCount) {
            Resources.logger(this).info(`Performing sync, try #${retryCount}`);

            try {
                const [remoteAssets, remoteAlbums, localAssets, localAlbums] = await this.fetchAndLoadState();
                const [assetQueue, albumQueue] = await this.diffState(remoteAssets, remoteAlbums, localAssets, localAlbums);
                await this.writeState(assetQueue, albumQueue);
                Resources.logger(this).info(`Completed sync!`);
                Resources.emit(iCPSEventSyncEngine.DONE);
                return [remoteAssets, remoteAlbums];
            } catch (err) {
                if (err instanceof AxiosError) {
                    Resources.emit(iCPSEventError.HANDLER_EVENT, new iCPSError(SYNC_ERR.NETWORK).addCause(err));
                } else {
                    Resources.emit(iCPSEventError.HANDLER_EVENT, new iCPSError(SYNC_ERR.UNKNOWN).addCause(err));
                }

                await Resources.network().settleCCYLimiter();
                Resources.logger(this).debug(`Refreshing iCloud cookies...`);
                await this.icloud.setupAccount();

                retryCount++;
                Resources.emit(iCPSEventSyncEngine.RETRY, retryCount);
            }
        }

        // We'll only reach this, if we exceeded retryCount
        throw new iCPSError(SYNC_ERR.MAX_RETRY)
            .addMessage(`${retryCount}`);
    }

    /**
     * This function fetches the remote state and loads the local state from disk
     * @returns A promise that resolve once the fetch was completed, containing the remote & local state - remote album state is in order
     */
    async fetchAndLoadState(): Promise<[Asset[], Album[], PLibraryEntities<Asset>, PLibraryEntities<Album>]> {
        Resources.emit(iCPSEventSyncEngine.FETCH_N_LOAD);
        const [remoteAssets, remoteAlbums, localAssets, localAlbums] = await Promise.all([
            this.icloud.photos.fetchAllCPLAssetsMasters()
                .then(([cplAssets, cplMasters]) => SyncEngineHelper.convertCPLAssets(cplAssets, cplMasters)),
            this.icloud.photos.fetchAllCPLAlbums()
                .then(cplAlbums => SyncEngineHelper.convertCPLAlbums(cplAlbums)),
            this.photosLibrary.loadAssets(),
            this.photosLibrary.loadAlbums(),
        ]);

        Resources.emit(iCPSEventSyncEngine.FETCH_N_LOAD_COMPLETED, remoteAssets.length, remoteAlbums.length, Object.keys(localAssets).length, Object.keys(localAlbums).length);
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
        Resources.emit(iCPSEventSyncEngine.DIFF);
        Resources.logger(this).info(`Diffing state`);
        const [assetQueue, albumQueue] = await Promise.all([
            SyncEngineHelper.getProcessingQueues(remoteAssets, localAssets),
            SyncEngineHelper.getProcessingQueues(remoteAlbums, localAlbums),
        ]);
        const resolvedAlbumQueue = SyncEngineHelper.resolveHierarchicalDependencies(albumQueue, localAlbums);
        Resources.emit(iCPSEventSyncEngine.DIFF_COMPLETED);
        return [assetQueue, resolvedAlbumQueue];
    }

    /**
     * Takes the processing queues and performs the necessary actions to write them to disk
     * @param assetQueue - The queue containing assets that need to be written to, or deleted from disk
     * @param albumQueue - The queue containing albums that need to be written to, or deleted from disk
     * @returns A promise that will settle, once the state has been written to disk
     */
    async writeState(assetQueue: PLibraryProcessingQueues<Asset>, albumQueue: PLibraryProcessingQueues<Album>) {
        Resources.emit(iCPSEventSyncEngine.WRITE);
        Resources.logger(this).info(`Writing state`);

        Resources.emit(iCPSEventSyncEngine.WRITE_ASSETS, assetQueue[0].length, assetQueue[1].length, assetQueue[2].length);
        await this.writeAssets(assetQueue);
        Resources.emit(iCPSEventSyncEngine.WRITE_ASSETS_COMPLETED);

        Resources.emit(iCPSEventSyncEngine.WRITE_ALBUMS, albumQueue[0].length, albumQueue[1].length, albumQueue[2].length);
        await this.writeAlbums(albumQueue);
        Resources.emit(iCPSEventSyncEngine.WRITE_ALBUMS_COMPLETED);

        Resources.emit(iCPSEventSyncEngine.WRITE_COMPLETED);
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

        Resources.logger(this).debug(`Writing data by deleting ${toBeDeleted.length} assets and adding ${toBeAdded.length} assets`);

        // Deleting before downloading, in order to ensure no conflicts
        await Promise.all(toBeDeleted.map(asset => this.photosLibrary.deleteAsset(asset)));
        await Promise.all(toBeAdded.map(asset => this.addAsset(asset)));
    }

    /**
     * Downloads and stores a given asset, unless file is already present on disk
     * @param asset - The asset that needs to be downloaded
     * @returns A promise that resolves, once the file has been successfully written to disk
     */
    async addAsset(asset: Asset) {
        Resources.logger(this).debug(`Adding asset ${asset.getDisplayName()}`);
        try {
            await this.icloud.photos.downloadAsset(asset);
        } catch (err) {
            Resources.logger(this).info(`Error while downloading asset ${asset.getDisplayName()}: ${err.message}`);
            Resources.emit(iCPSEventSyncEngine.WRITE_ASSET_ERROR, asset.getDisplayName());
            return;
        }

        Resources.emit(iCPSEventSyncEngine.WRITE_ASSET_COMPLETED, asset.getDisplayName());
    }

    /**
     * Writes the album changes defined in the processing queue to to disk
     * @param processingQueue - The album processing queue, expected to have resolved all hierarchical dependencies
     * @returns A promise that settles, once all album changes have been written to disk
     */
    async writeAlbums(processingQueue: PLibraryProcessingQueues<Album>) {
        Resources.logger(this).info(`Writing lib structure!`);

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
        Resources.logger(this).debug(`Creating album ${album.getDisplayName()} with parent ${album.parentAlbumUUID}`);

        if (album.albumType === AlbumType.ARCHIVED) {
            try {
                this.photosLibrary.retrieveStashedAlbum(album);
            } catch (err) {
                Resources.emit(iCPSEventError.HANDLER_EVENT,
                    new iCPSError(SYNC_ERR.STASH_RETRIEVE)
                        .addMessage(album.getDisplayName())
                        .addCause(err),
                );
            }

            return;
        }

        try {
            this.photosLibrary.writeAlbum(album);
        } catch (err) {
            Resources.emit(iCPSEventError.HANDLER_EVENT,
                new iCPSError(SYNC_ERR.ADD_ALBUM)
                    .addMessage(album.getDisplayName())
                    .addCause(err)
                    .setWarning(),
            );
        }
    }

    /**
     * This will delete an album from disk and remove all associated symlinks
     * Deletion will only happen if the album is 'empty'. This means it only contains symlinks or 'safe' files. Any other folder or file will result in the folder not being deleted.
     * @param album - The album that needs to be deleted
     */
    removeAlbum(album: Album) {
        Resources.logger(this).debug(`Removing album ${album.getDisplayName()}`);

        if (album.albumType === AlbumType.ARCHIVED) {
            try {
                this.photosLibrary.stashArchivedAlbum(album);
            } catch (err) {
                Resources.emit(iCPSEventError.HANDLER_EVENT,
                    new iCPSError(SYNC_ERR.STASH)
                        .addMessage(album.getDisplayName())
                        .addCause(err),
                );
            }

            return;
        }

        try {
            this.photosLibrary.deleteAlbum(album);
        } catch (err) {
            Resources.emit(iCPSEventError.HANDLER_EVENT,
                new iCPSError(SYNC_ERR.DELETE_ALBUM)
                    .addMessage(album.getDisplayName())
                    .addCause(err),
            );
        }
    }
}