import {EventEmitter} from 'events';
import {iCloud} from '../icloud/icloud.js';
import {PhotosLibrary} from '../photos-library/photos-library.js';
import {OptionValues} from 'commander';
import * as SYNC_ENGINE from './constants.js';
import {CPLAlbum, CPLAsset, CPLMaster} from '../icloud/icloud-photos/query-parser.js';
import {Asset} from '../photos-library/model/asset.js';
import {Album} from '../photos-library/model/album.js';
import fs from 'fs';
import * as fsPromise from 'fs/promises';
import {pEvent} from 'p-event';
import PQueue from 'p-queue';
import {PLibraryProcessingQueues} from '../photos-library/model/photos-entity.js';
import {getLogger} from '../logger.js';

/**
 * This class handles the photos sync
 */
export class SyncEngine extends EventEmitter {
    /**
     * Default logger for the class
     */
    private logger = getLogger(this);

    iCloud: iCloud;

    photosLibrary: PhotosLibrary;

    // Initialized in writeAssets()
    downloadQueue: PQueue;
    downloadCCY: number;

    maxRetry: number;

    constructor(iCloud: iCloud, photosLibrary: PhotosLibrary, cliOpts: OptionValues) {
        super();
        this.iCloud = iCloud;
        this.photosLibrary = photosLibrary;
        this.downloadCCY = cliOpts.download_threads;

        this.maxRetry = cliOpts.max_retries;
    }

    async sync() {
        try {
            this.logger.info(`Starting sync`);
            let syncFinished = false;
            let retryCount = 0;
            while (!syncFinished && (this.maxRetry === -1 || this.maxRetry > retryCount)) {
                retryCount++;
                this.logger.info(`Performing sync, try #${retryCount}`);

                const [remoteAssets, remoteAlbums] = await this.fetchAndLoadState();
                const [assetQueue, albumQueue] = await this.diffState(remoteAssets, remoteAlbums);

                try {
                    await this.writeState(assetQueue, albumQueue);
                    syncFinished = true;
                } catch (err) {
                    this.logger.warn(`Error while writing state: ${err.message}`);
                    // Checking if we should retry
                    if (this.checkFatalError(err)) {
                        throw err;
                    } else {
                        await this.prepareRetry()
                        this.emit(SYNC_ENGINE.EVENTS.RETRY, retryCount);
                    }
                }
            }

            if (!syncFinished) { //if sync is not set to true
                throw new Error(`Sync did not complete succesfull within ${retryCount} tries`);
            }

            this.logger.info(`Completed sync!`);
            this.emit(SYNC_ENGINE.EVENTS.DONE);
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
        if (err.name === `AxiosError`) {
            this.logger.debug(`Detected Axios error`);

            if (err.code === `ERR_BAD_RESPONSE`) {
                this.logger.debug(`Bad server response (${err.response?.status}), retrying...`);
                return false;
            }

            if (err.code === `ERR_BAD_REQUEST`) {
                if (err.response?.status === 410 || err.response?.status === 421) {
                    this.logger.debug(`Remote ressources have changed location, updating URLs by retrying...`);
                    return false;
                }

                this.logger.warn(`Unknown bad request (${JSON.stringify(err)}), aborting!`);
                return true;
            }

            this.logger.warn(`Unknown Axios error (${JSON.stringify(err)}), aborting!`);
            return true;
        }

        this.logger.warn(`Unknown error (${JSON.stringify(err)}), aborting!`);
        return true;
    }

    /**
     * Prepares the sync engine for a retry
     */
    private async prepareRetry() {
        this.logger.debug(`Preparing retry...`)
        if (this.downloadQueue) {
            if(this.downloadQueue.size > 0) {
                this.logger.info(`Error occured with ${this.downloadQueue.size} asset(s) left in the download queue, clearing queue...`);
                this.downloadQueue.clear();
            }
            if(this.downloadQueue.pending > 0) {
                this.logger.info(`Error occured with ${this.downloadQueue.pending} pending job(s), waiting for queue to settle...`)
                await this.downloadQueue.onIdle()
                this.logger.debug(`Queue has settled!`)
            }
        }
    }

    /**
     * This function fetches the remote state and updates the local state
     * @returns A promise that resolve once the fetch was completed, containing the remote state
     */
    private async fetchAndLoadState(): Promise<[Asset[], Album[], void]> {
        this.emit(SYNC_ENGINE.EVENTS.FETCH_N_LOAD);
        return Promise.all([
            this.iCloud.photos.fetchAllPictureRecords()
                .then(([cplAssets, cplMasters]) => SyncEngine.convertCPLAssets(cplAssets, cplMasters)),
            this.iCloud.photos.fetchAllAlbumRecords()
                .then(cplAlbums => SyncEngine.convertCPLAlbums(cplAlbums)),
            this.photosLibrary.load(),
        ]).then(result => {
            this.emit(SYNC_ENGINE.EVENTS.FETCH_N_LOAD_COMPLETED, this.photosLibrary.getAssetCount(), this.photosLibrary.getAlbumCount(), result[0].length, result[1].length);
            return result;
        });
    }

    /**
     * This function diffes the local state (stored in the local Photos Library) with the given remote state
     * @param remoteAssets - An array of all remote assets
     * @param remoteAlbums - An array of all remote albums
     * @returns A promise that, once resolved, will contain processing queues that can be used in order to sync the remote state.
     */
    private async diffState(remoteAssets: Asset[], remoteAlbums: Album[]): Promise<[PLibraryProcessingQueues<Asset>, PLibraryProcessingQueues<Album>]> {
        this.emit(SYNC_ENGINE.EVENTS.DIFF);
        this.logger.info(`Diffing state`);
        return Promise.all([
            this.photosLibrary.getProcessingQueues(remoteAssets, this.photosLibrary.lib.assets),
            this.photosLibrary.getProcessingQueues(remoteAlbums, this.photosLibrary.lib.albums),
        ]).then(result => {
            this.emit(SYNC_ENGINE.EVENTS.DIFF_COMPLETED);
            return result;
        });
    }

    /**
     * Matches CPLAsset/CPLMaster pairs and parses their associated Asset(s)
     * @param asset - The given asset
     * @param master - The given master
     * @returns An array of all containing assets
     */
    static convertCPLAssets(cplAssets: CPLAsset[], cplMasters: CPLMaster[]): Asset[] {
        const cplMasterRecords = {};
        cplMasters.forEach(masterRecord => {
            cplMasterRecords[masterRecord.recordName] = masterRecord;
        });
        const remoteAssets: Asset[] = [];
        cplAssets.forEach(asset => {
            const master = cplMasterRecords[asset.masterRef];
            if (master?.resource && master?.resourceType) {
                remoteAssets.push(Asset.fromCPL(master.resource, master.resourceType, master.modified));
            }

            if (asset?.resource && asset?.resourceType) {
                remoteAssets.push(Asset.fromCPL(asset.resource, asset.resourceType, asset.modified));
            }
        });
        return remoteAssets;
    }

    /**
     * Transforms a CPLAlbum into an array of Albums
     * @param cplAlbums - The given CPL Album
     * @returns Once settled, a completely populated Album array
     */
    static async convertCPLAlbums(cplAlbums: CPLAlbum[]) : Promise<Album[]> {
        const remoteAlbums: Album[] = [];
        for (const cplAlbum of cplAlbums) {
            remoteAlbums.push(await Album.fromCPL(cplAlbum));
        }

        return remoteAlbums;
    }

    private async writeState(assetQueue: PLibraryProcessingQueues<Asset>, albumQueue: PLibraryProcessingQueues<Album>) {
        this.emit(SYNC_ENGINE.EVENTS.WRITE);
        this.logger.info(`Writing state`);
        return this.writeAssets(assetQueue)
            .then(() => this.writeAlbums(albumQueue))
            .then(() => this.emit(SYNC_ENGINE.EVENTS.WRITE_COMPLETED));
    }

    private async writeAssets(processingQueue: PLibraryProcessingQueues<Asset>) {
        const toBeDeleted = processingQueue[0];
        const toBeAdded = processingQueue[1];
        // Initializing sync queue
        this.downloadQueue = new PQueue({concurrency: this.downloadCCY});

        this.logger.debug(`Writing data by deleting ${toBeDeleted.length} assets and adding ${toBeAdded.length} assets`);
        this.emit(SYNC_ENGINE.EVENTS.WRITE_ASSETS, toBeDeleted.length, toBeAdded.length);

        // Deleting before downloading, in order to ensure no conflicts
        return Promise.all(toBeDeleted.map(asset => this.deleteAsset(asset)))
            .then(() => Promise.all(toBeAdded.map(asset => this.downloadQueue.add(() => this.addAsset(asset)))))
            .then(() => this.emit(SYNC_ENGINE.EVENTS.WRITE_ASSETS_COMPLETED));
    }

    /**
     * This function downloads and stores a given asset, unless file is already present on disc
     * @param asset - The asset that needs to be downloaded
     * @returns A promise that resolves, once the file has been sucesfully written to disc
     */
    private async addAsset(asset: Asset): Promise<void> {
        if (this.verifyAsset(asset)) {
            this.logger.info(`Asset ${asset.getDisplayName()} already downloaded`);
        } else {
            return this.iCloud.photos.downloadAsset(asset)
                .then(response => {
                    this.logger.debug(`Writing asset ${asset.getDisplayName()}`);
                    const location = asset.getAssetFilePath(this.photosLibrary.assetDir);
                    const writeStream = fs.createWriteStream(location);
                    response.data.pipe(writeStream);
                    return pEvent(writeStream, `close`);
                })
                .then(() => fsPromise.utimes(asset.getAssetFilePath(this.photosLibrary.assetDir), asset.modified, asset.modified)) // Setting modified date on file
                .then(() => {
                    if (!this.verifyAsset(asset)) {
                        throw new Error(`Unable to verify asset ${asset.getDisplayName()}`);
                    } else {
                        this.logger.debug(`Asset ${asset.getDisplayName()} sucesfully downloaded`);
                        this.emit(SYNC_ENGINE.EVENTS.WRITE_ASSET_COMPLETED, asset.getDisplayName());
                    }
                });
        }
    }

    private async deleteAsset(asset: Asset): Promise<void> {
        this.logger.debug(`Deleting asset ${asset.getDisplayName()}`);
        const location = asset.getAssetFilePath(this.photosLibrary.assetDir);
        return fsPromise.rm(location, {force: true});
    }

    private verifyAsset(asset: Asset): boolean {
        this.logger.debug(`Verifying asset ${asset.getDisplayName()}`);
        const location = asset.getAssetFilePath(this.photosLibrary.assetDir);
        return fs.existsSync(location)
            && asset.verify(fs.readFileSync(location));
    }

    private async writeAlbums(processingQueue: PLibraryProcessingQueues<Album>) {
        const toBeDeleted = processingQueue[0];
        const toBeAdded = processingQueue[1];

        this.logger.info(`Writing lib structure!`);
        this.emit(SYNC_ENGINE.EVENTS.WRITE_ALBUMS, toBeDeleted.length, toBeAdded.length);
        // Get root folder & local root folder
        // compare content
        // repeate for every other folder
        // optionally: move data to
        this.emit(SYNC_ENGINE.EVENTS.WRITE_ALBUMS_COMPLETED);
    }

    private addAlbum(album: Album) {
        // Find parent
    }

    private deleteAlbum(album: Album) {
        // Only delete albums that have only symlinks in them
        // if they have files -> ignore!
        // if they have folders -> check if those folders will also be removed
    }
}