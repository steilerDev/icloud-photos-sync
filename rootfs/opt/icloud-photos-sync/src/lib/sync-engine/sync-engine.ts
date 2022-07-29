import log from 'loglevel';
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

/**
 * This class handles the photos sync
 */
export class SyncEngine extends EventEmitter {
    /**
     * Default logger for the class
     */
    logger: log.Logger = log.getLogger(`Sync-Engine`);

    iCloud: iCloud;

    photosLibrary: PhotosLibrary;

    // Initialized in writeAssets()
    syncQueue: PQueue;
    syncQueueCCY: number;

    maxRetry: number;

    constructor(iCloud: iCloud, photosLibrary: PhotosLibrary, cliOpts: OptionValues) {
        super();
        this.iCloud = iCloud;
        this.photosLibrary = photosLibrary;
        this.syncQueueCCY = cliOpts.download_threads;

        this.maxRetry = cliOpts.max_retries;
    }

    async sync() {
        this.logger.info(`Starting sync`);
        let syncInProgress = true;
        let retryCount = 0;
        while (syncInProgress) {
            syncInProgress = false;
            retryCount++;
            this.logger.info(`Performing sync, try #${retryCount}`);

            const [remoteAssets, remoteAlbums] = await this.fetchState();
            const [assetQueue, albumQueue] = await this.diffState(remoteAssets, remoteAlbums);
            try {
                await this.writeState(assetQueue, albumQueue);
            } catch (err) {
                this.emit(SYNC_ENGINE.EVENTS.ERROR, err.message)
                this.logger.warn(`Error while writing state: ${err.message}`);
                if (this.syncQueue && this.syncQueue.size > 0) {
                    this.logger.debug(`Error occured with ${this.syncQueue.size} out of ${assetQueue[1].length} assets in download queue`);
                    this.syncQueue.clear();
                }

                syncInProgress = this.checkError(err);
                if (!syncInProgress) {
                    throw err;
                }

                if (this.maxRetry !== -1 && this.maxRetry <= retryCount) {
                    throw new Error(`Maximum amount of re-tries reached (${this.maxRetry}), aborting!`);
                }
            }
        }
        this.logger.info(`Completed sync!`)
        this.emit(SYNC_ENGINE.EVENTS.DONE)
    }

    /**
     * Checks if a retry should happen
     * @param err - An error that was thrown during 'writeState()'
     * @returns - True if a retry should happen
     */
    checkError(err: any): boolean {
        if (err.name === `AxiosError`) {
            this.logger.debug(`Detected Axios error`)

            if(err.code === `ERR_BAD_RESPONSE`) {
                this.logger.debug(`Bad server response, retrying...`);
                return true
            } else {
                this.logger.warn(`Unknown Axios error (${err.code}), aborting!`)
                return false
            }
        } else {
            this.logger.warn(`Unknown error (${JSON.stringify(err)}), aborting!`)
            return false
        }
    }

    async fetchState(): Promise<[Asset[], Album[], void]> {
        this.emit(SYNC_ENGINE.EVENTS.FETCH);
        this.logger.info(`Fetching remote iCloud state`);
        return Promise.all([
            this.iCloud.photos.fetchAllPictureRecords()
                .then(([cplAssets, cplMasters]) => SyncEngine.convertCPLAssets(cplAssets, cplMasters)),
            this.iCloud.photos.fetchAllAlbumRecords()
                .then(cplAlbums => SyncEngine.convertCPLAlbums(cplAlbums)),
            this.photosLibrary.load(),
        ]);
    }

    async diffState(remoteAssets: Asset[], remoteAlbums: Album[]): Promise<[PLibraryProcessingQueues<Asset>, PLibraryProcessingQueues<Album>]> {
        this.emit(SYNC_ENGINE.EVENTS.DIFF);
        this.logger.info(`Diffing state`);
        return Promise.all([
            this.photosLibrary.getProcessingQueues(remoteAssets, this.photosLibrary.lib.assets),
            this.photosLibrary.getProcessingQueues(remoteAlbums, this.photosLibrary.lib.albums),
        ]);
    }

    /**
     * Transforms a matching CPLAsset/CPLMaster pair to an array of associated assets
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

    async writeState(assetQueue: PLibraryProcessingQueues<Asset>, albumQueue: PLibraryProcessingQueues<Album>) {
        this.emit(SYNC_ENGINE.EVENTS.WRITE, assetQueue[1].length);
        this.logger.info(`Writing state`);
        return this.writeAssets(assetQueue)
            .then(() => this.writeAlbums(albumQueue));
    }

    async writeAssets(processingQueue: PLibraryProcessingQueues<Asset>) {
        const toBeDeleted = processingQueue[0];
        const toBeAdded = processingQueue[1];
        // Initializing sync queue
        this.syncQueue = new PQueue({concurrency: this.syncQueueCCY});
        this.logger.debug(`Writing data by deleting ${toBeDeleted.length} assets and adding ${toBeAdded.length} assets`);

        // Deleting before downloading, in order to ensure no conflicts
        return Promise.all(toBeDeleted.map(asset => this.deleteAsset(asset)))
            .then(() => Promise.all(toBeAdded.map(asset => this.syncQueue.add(() => this.addAsset(asset)))));
    }

    /**
     * This function downloads and stores a given asset, unless file is already present on disc
     * @param asset - The asset that needs to be downloaded
     * @returns A promise that resolves, once the file has been sucesfully written to disc
     */
    async addAsset(asset: Asset): Promise<void> {
        if (this.verifyAsset(asset)) {
            this.logger.info(`Asset ${asset.getDisplayName()} already downloaded`);
        } else {
            this.logger.debug(`Downloading asset ${asset.getDisplayName()}`);
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
                        this.emit(SYNC_ENGINE.EVENTS.RECORD_COMPLETED, asset.getDisplayName())
                    }
                });
        }
    }

    async deleteAsset(asset: Asset): Promise<void> {
        this.logger.debug(`Deleting asset ${asset.getDisplayName()}`);
        const location = asset.getAssetFilePath(this.photosLibrary.assetDir);
        return fsPromise.rm(location, {force: true});
    }

    verifyAsset(asset: Asset): boolean {
        this.logger.debug(`Verifying asset ${asset.getDisplayName()}`);
        const location = asset.getAssetFilePath(this.photosLibrary.assetDir);
        return fs.existsSync(location)
            && asset.verify(fs.readFileSync(location));
    }

    async writeAlbums(processingQueue: PLibraryProcessingQueues<Album>) {
        this.logger.info(`Writing lib structure!`);
        this.emit(SYNC_ENGINE.EVENTS.APPLY_STRUCTURE);
        // Get root folder & local root folder
        // compare content
        // repeate for every other folder
        // optionally: move data to
    }

    addAlbum(album: Album) {
        // Find parent
    }

    deleteAlbum(album: Album) {
        // Only delete albums that have only symlinks in them
        // if they have files -> ignore!
        // if they have folders -> check if those folders will also be removed
    }
}