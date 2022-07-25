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

type RemoteData = [CPLAsset[], CPLMaster[]]
type RemoteAlbums = CPLAlbum[]

export type ProcessingDataQueue = [toBeDeleted: Asset[], toBeAdded: Asset[]]
export type ProcessingAlbumQueue = [toBeDeleted: Album[], toBeMoved: Album[], toBeAdded: Album[]]

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

    syncQueue: PQueue;

    constructor(iCloud: iCloud, photosLibrary: PhotosLibrary, cliOpts: OptionValues) {
        super();
        this.iCloud = iCloud;
        this.photosLibrary = photosLibrary;
        this.syncQueue = new PQueue({concurrency: cliOpts.download_threads});
    }

    async sync() {
        this.logger.info(`Starting sync`);

        return this.fetchState()
            .then(([remoteData, remoteStructure]) => this.diffState(remoteData, remoteStructure))
            .then(([dataQueue, albumQueue]) => this.writeState(dataQueue, albumQueue));
    }

    async fetchState(): Promise<[RemoteData, RemoteAlbums]> {
        this.emit(SYNC_ENGINE.EVENTS.FETCH);
        this.logger.info(`Fetching remote iCloud state`);
        return Promise.all([
            this.iCloud.photos.fetchAllPictureRecords(),
            this.iCloud.photos.fetchAllAlbumRecords(),
        ]);
    }

    async diffState(remoteData: RemoteData, remoteAlbums: RemoteAlbums): Promise<[ProcessingDataQueue, ProcessingAlbumQueue]> {
        this.emit(SYNC_ENGINE.EVENTS.DIFF);
        this.logger.info(`Diffing state`);
        return Promise.all([
            this.photosLibrary.diffLibraryData(remoteData[0], remoteData[1]),
            this.photosLibrary.diffLibraryStructure(remoteAlbums),
        ]);
    }

    async writeState(dataQueue: ProcessingDataQueue, albumQueue: ProcessingAlbumQueue) {
        this.emit(SYNC_ENGINE.EVENTS.WRITE);
        this.logger.info(`Writing state`);
        return this.writeLibraryData(dataQueue)
            .then(() => this.writeLibraryStructure(albumQueue));
    }

    async writeLibraryData(processingQueue: ProcessingDataQueue) {
        const toBeDeleted = processingQueue[0];
        const toBeAdded = processingQueue[1];
        this.logger.debug(`Writing data by deleting ${toBeDeleted.length} assets and adding ${toBeAdded.length} assets`);
        this.syncQueue.on(`error`, err => {
            this.logger.error(`${typeof err}`);
            this.logger.error(`Processing queue experienced error (size: ${this.syncQueue.size} / pending: ${this.syncQueue.pending}): ${err.message}`);
            this.syncQueue.clear();
            this.logger.warn(`Cleared sync queue (size: ${this.syncQueue.size} / pending: ${this.syncQueue.pending})`);
        });
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
        if (fs.existsSync(location)) {
            const data = fs.readFileSync(location);
            const sizeVerfied = asset.verifySize(data);
            const checksumVerified = asset.verifyChecksum(data);
            return sizeVerfied && checksumVerified;
        }

        return false;
    }

    async writeLibraryStructure(processingQueue: ProcessingAlbumQueue) {
        this.logger.info(`Writing lib structure!`);
        // Get root folder & local root folder
        // compare content
        // repeate for every other folder
        // optionally: move data to
    }
}