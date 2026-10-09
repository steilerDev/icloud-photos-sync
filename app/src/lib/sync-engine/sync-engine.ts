import {iCloud} from '../icloud/icloud.js';
import {PhotosLibrary} from '../photos-library/photos-library.js';
import {Asset} from '../photos-library/model/asset.js';
import {Album, AlbumType} from '../photos-library/model/album.js';
import {PLibraryEntities, PLibraryProcessingQueues} from '../photos-library/model/photos-entity.js';
import {iCPSError} from '../../app/error/error.js';
import {SYNC_ERR} from '../../app/error/error-codes.js';
import {isHttpError} from '../resources/http-client.js';
import {Resources} from '../resources/main.js';
import {SyncEngineHelper} from './helper.js';
import {iCPSEventRuntimeWarning, iCPSEventSyncEngine} from '../resources/events-types.js';

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
     * The number of assets written to disk since the remote state was last fetched
     */
    _writtenAssets: number = 0;

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
     * Performs the sync and handles all connections and retries
     * @returns A tuple consisting of assets and albums as fetched from the remote state. It can be assumed that this reflects the local state (given a warning free execution of the sync)
     * @throws An iCPSError, in case the sync could not be completed within the amount of allowed retries
     * @emits iCPSEventSyncEngine.START - When the sync starts
     * @emits iCPSEventSyncEngine.DONE - When the sync is done
     * @emits iCPSEventSyncEngine.RETRY - When the sync is retried - The first argument is the retry count, the second argument is the error that caused the retry
     * @emits iCPSEventSyncEngine.REFRESH - When the download URLs expired after assets were written, the remote state is refreshed without counting as a retry - The first argument is the number of assets written since the last refresh
     *
     */
    async sync(): Promise<[Asset[], Album[]]> {
        Resources.logger(this).info(`Starting sync`);
        Resources.emit(iCPSEventSyncEngine.START);
        let retryCount = 1;

        // Keeping track of all previous errors in case we reach retry limit
        const retryError = new iCPSError(SYNC_ERR.MAX_RETRY);

        while (Resources.manager().maxRetries >= retryCount) {
            Resources.logger(this).info(`Performing sync, try #${retryCount}`);
            this._writtenAssets = 0;
            try {
                const [remoteAssets, remoteAlbums, localAssets, localAlbums] = await this.fetchAndLoadState();
                const [assetQueue, albumQueue] = await this.diffState(remoteAssets, remoteAlbums, localAssets, localAlbums);
                await this.writeState(assetQueue, albumQueue);
                Resources.logger(this).info(`Completed sync!`);
                Resources.emit(iCPSEventSyncEngine.DONE);
                return [remoteAssets, remoteAlbums];
            } catch (err) {
                // Download URLs are only valid for a limited amount of time (~15 minutes), large libraries need multiple passes - as long as each pass makes progress, this is not counted as a retry
                const urlExpired = err instanceof iCPSError && err.code === SYNC_ERR.DOWNLOAD_URL_EXPIRED.code;
                if (urlExpired && this._writtenAssets > 0) {
                    Resources.logger(this).info(`Download URLs expired after writing ${this._writtenAssets} assets, refreshing remote state`);
                    Resources.emit(iCPSEventSyncEngine.REFRESH, this._writtenAssets);
                    await Resources.network().settleCCYLimiter();
                    continue;
                }

                retryError.addContext(`error-try-${retryCount}`, err);
                retryCount++;

                Resources.emit(iCPSEventSyncEngine.RETRY, retryCount, isHttpError(err) || urlExpired
                    ? new iCPSError(SYNC_ERR.NETWORK).addCause(err)
                    : new iCPSError(SYNC_ERR.UNKNOWN).addCause(err));

                await Resources.network().settleCCYLimiter();

                Resources.logger(this).debug(`Refreshing iCloud connection...`);
                const iCloudReady = this.icloud.getReady();
                this.icloud.setupAccount();
                if (!await iCloudReady) {
                    return [[], []];
                }
            }
        }

        // We'll only reach this, if we exceeded retryCount
        throw retryError.addMessage(`${retryCount}`);
    }

    /**
     * This function fetches the remote state and loads the local state from disk
     * @returns A promise that resolve once the fetch was completed, containing the remote & local state - remote album state is in order
     * @emits iCPSEventSyncEngine.FETCH_N_LOAD - When the fetch & load starts
     * @emits iCPSEventSyncEngine.FETCH_N_LOAD_COMPLETED - When the fetch & load is done - The first argument is the amount of remote assets, the second argument is the amount of remote albums, the third argument is the amount of local assets, the fourth argument is the amount of local albums
     */
    async fetchAndLoadState(): Promise<[Asset[], Album[], PLibraryEntities<Asset>, PLibraryEntities<Album>]> {
        Resources.emit(iCPSEventSyncEngine.FETCH_N_LOAD);
        // Waiting for all fetches to settle, so no requests outlive a failed attempt (and e.g. hit a reset session)
        const [remoteAssets, remoteAlbums, localAssets, localAlbums] = await SyncEngineHelper.settleAll([
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
     * @emits iCPSEventSyncEngine.DIFF - When the diff starts
     * @emits iCPSEventSyncEngine.DIFF_COMPLETED - When the diff is done
     */
    async diffState(remoteAssets: Asset[], remoteAlbums: Album[], localAssets: PLibraryEntities<Asset>, localAlbums: PLibraryEntities<Album>): Promise<[PLibraryProcessingQueues<Asset>, PLibraryProcessingQueues<Album>]> {
        Resources.emit(iCPSEventSyncEngine.DIFF);
        Resources.logger(this).info(`Diffing state`);
        const [assetQueue, albumQueue] = await Promise.all([
            SyncEngineHelper.getProcessingQueues(remoteAssets, localAssets),
            SyncEngineHelper.getProcessingQueues(remoteAlbums, localAlbums),
        ]);
        const uniqueAssetQueue = SyncEngineHelper.removeDuplicateAssets(assetQueue);
        const resolvedAlbumQueue = SyncEngineHelper.resolveHierarchicalDependencies(albumQueue, localAlbums);
        Resources.emit(iCPSEventSyncEngine.DIFF_COMPLETED);
        return [uniqueAssetQueue, resolvedAlbumQueue];
    }

    /**
     * Takes the processing queues and performs the necessary actions to write them to disk
     * @param assetQueue - The queue containing assets that need to be written to, or deleted from disk
     * @param albumQueue - The queue containing albums that need to be written to, or deleted from disk
     * @returns A promise that will settle, once the state has been written to disk
     * @emits iCPSEventSyncEngine.WRITE - When the write starts
     * @emits iCPSEventSyncEngine.WRITE_ASSETS - When the write of assets starts - The first argument is the amount of assets that need to be delete, the second argument is the amount of assets that need to be added, the third argument is the amount of assets that will be kept
     * @emits iCPSEventSyncEngine.WRITE_ASSETS_COMPLETED - When the write of assets is done
     * @emits iCPSEventSyncEngine.WRITE_ALBUMS - When the write of albums starts - The first argument is the amount of albums that need to be delete, the second argument is the amount of albums that need to be added, the third argument is the amount of albums that will be kept
     * @emits iCPSEventSyncEngine.WRITE_ALBUMS_COMPLETED - When the write of albums is done
     * @emits iCPSEventSyncEngine.WRITE_COMPLETED - When the write is done
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

        // Assets that are added again are only replaced (e.g. because their modification date changed) - those are deleted permanently, instead of being moved to the trash
        const replacedAssets = new Set(toBeAdded.map(asset => asset.getUUID()));

        // Deleting before downloading, in order to ensure no conflicts
        await Promise.all(toBeDeleted.map(asset => this.photosLibrary.deleteAsset(asset, replacedAssets.has(asset.getUUID()))));
        await Promise.all(toBeAdded.map(asset => this.addAsset(asset)));
    }

    /**
     * Downloads and stores a given asset, unless file is already present on disk
     * A failed download (network or HTTP error) or verification only affects this asset - it will be picked up again by the next sync
     * @param asset - The asset that needs to be downloaded
     * @returns A promise that resolves, once the file has been successfully written to disk, or the error has been reported
     * @throws An iCPSError, if the download URL expired - since all URLs of a fetch expire at the same time, the remote state needs to be refreshed
     * @throws The original error, if writing to disk failed (e.g. no space left) - since this affects all assets, the sync cannot continue
     * @emits iCPSEventSyncEngine.WRITE_ASSET_COMPLETED - When the asset has been written to disk - The first argument is the name of the asset
     * @emits iCPSEventRuntimeWarning.WRITE_ASSET_ERROR - When an error occurs while writing the asset to disk - The first argument is the error, the second argument is the asset
     */
    async addAsset(asset: Asset) {
        try {
            await this.icloud.photos.downloadAsset(asset);
            await asset.verify();
        } catch (err) {
            if (isHttpError(err) && err.response?.status === 410) {
                throw new iCPSError(SYNC_ERR.DOWNLOAD_URL_EXPIRED)
                    .addMessage(asset.getDisplayName())
                    .addCause(err);
            }

            // Only network/HTTP errors and asset specific errors (e.g. a missing download URL or failed verification) are limited to this asset - file system errors are not
            if (!isHttpError(err) && !(err instanceof iCPSError)) {
                throw err;
            }

            Resources.emit(iCPSEventRuntimeWarning.WRITE_ASSET_ERROR, err, asset);
            return;
        }

        this._writtenAssets++;
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
     * @throws An iCPSError, if an archived album could not be retrieved from the stash
     * @emits iCPSEventRuntimeWarning.WRITE_ALBUM_ERROR - When an error occurs while writing the album to disk - The first argument is the iCPSError, the second argument is the album
     */
    addAlbum(album: Album) {
        // If albumType == Archive -> Check in 'archivedFolder' and move
        Resources.logger(this).debug(`Creating album ${album.getDisplayName()} with parent ${album.parentAlbumUUID}`);

        if (album.albumType === AlbumType.ARCHIVED) {
            try {
                this.photosLibrary.retrieveStashedAlbum(album);
            } catch (err) {
                throw new iCPSError(SYNC_ERR.STASH_RETRIEVE)
                    .addMessage(album.getDisplayName())
                    .addCause(err);
            }

            return;
        }

        try {
            this.photosLibrary.writeAlbum(album);
        } catch (err) {
            Resources.emit(iCPSEventRuntimeWarning.WRITE_ALBUM_ERROR, new iCPSError(SYNC_ERR.ADD_ALBUM).addCause(err), album);
        }
    }

    /**
     * This will delete an album from disk and remove all associated symlinks
     * Deletion will only happen if the album is 'empty'. This means it only contains symlinks or 'safe' files. Any other folder or file will result in the folder not being deleted.
     * @param album - The album that needs to be deleted
     * @throws An iCPSError, if an archived album could not be stashed
     * @emits iCPSEventRuntimeWarning.WRITE_ALBUM_ERROR - When an error occurs while writing the album to disk - The first argument is the iCPSError, the second argument is the album
     */
    removeAlbum(album: Album) {
        Resources.logger(this).debug(`Removing album ${album.getDisplayName()}`);

        if (album.albumType === AlbumType.ARCHIVED) {
            try {
                this.photosLibrary.stashArchivedAlbum(album);
            } catch (err) {
                throw new iCPSError(SYNC_ERR.STASH)
                    .addMessage(album.getDisplayName())
                    .addCause(err);
            }

            return;
        }

        try {
            this.photosLibrary.deleteAlbum(album);
        } catch (err) {
            Resources.emit(iCPSEventRuntimeWarning.WRITE_ALBUM_ERROR, new iCPSError(SYNC_ERR.DELETE_ALBUM).addCause(err), album);
        }
    }
}