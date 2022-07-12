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
import {pEvent} from 'p-event';
import PQueue from 'p-queue';

type RemoteData = [CPLAsset[], CPLMaster[]]
type RemoteAlbums = CPLAlbum[]
/**
 * [ToBeDeleted, ToBeAdded]
 */
export type ProcessingDataQueue = [Asset[], Asset[]]
export type ProcessingAlbumQueue = Album[]

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

    photoDataDir: string;

    syncQueue: PQueue;

    constructor(iCloud: iCloud, photosLibrary: PhotosLibrary, cliOpts: OptionValues) {
        super();
        this.iCloud = iCloud;
        this.photosLibrary = photosLibrary;
        this.photoDataDir = cliOpts.photo_data_dir;
        this.syncQueue = new PQueue({concurrency: cliOpts.download_threads});
    }

    async sync() {
        this.logger.info(`Starting sync`);

        let processingQueues: [ProcessingDataQueue, ProcessingAlbumQueue];

        if (this.photosLibrary.ongoingSync()) {
            this.logger.info(`Recovering previously incompleted sync`);
            processingQueues = this.photosLibrary.getProcessingQueues();
        } else {
            processingQueues = await this.fetchState()
                .then(([remoteData, remoteStructure]) => this.diffState(remoteData, remoteStructure));
            this.logger.debug(`Storing temp state, in order to recover future failures`);
            await this.photosLibrary.save();
        }

        let tries = 0;
        const maxTry = 5;
        while (this.photosLibrary.ongoingSync()) {
            if (tries < 5) {
                try {
                    await this.writeState(processingQueues[0], processingQueues[1]);
                    return this.photosLibrary.completeSync();
                } catch (err) {
                    this.logger.warn(`Error while writing state (try ${tries} / ${maxTry}): ${err.message}`);
                    tries++;
                }
            } else {
                throw new Error(`Unable to complete sync after ${maxTry} tries`);
            }
        }
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
            this.photosLibrary.updateLibraryData(remoteData[0], remoteData[1]),
            this.photosLibrary.updateLibraryStructure(remoteAlbums),
        ]);
    }

    async writeState(dataQueue: ProcessingDataQueue, albumQueue: ProcessingAlbumQueue) {
        this.emit(SYNC_ENGINE.EVENTS.WRITE);
        this.logger.info(`Writing state`);
        await this.writeLibraryData(dataQueue[0], dataQueue[1])
        return this.writeLibraryStructure(albumQueue);
    }

    async writeLibraryData(toBeDeleted: Asset[], toBeAdded: Asset[]) {
        this.syncQueue.on(`error`, err => {
            this.logger.error(`${typeof err}`)
            this.logger.error(`Processing queue experienced error (size: ${this.syncQueue.size} / pending: ${this.syncQueue.pending}): ${err.message}`);
            this.syncQueue.clear();
            this.logger.warn(`Cleared sync queue (size: ${this.syncQueue.size} / pending: ${this.syncQueue.pending})`);
        });
        return Promise.all([
            ...toBeAdded.map(asset => this.syncQueue.add(() => this.addAsset(asset))),
            ...toBeDeleted.map(asset => this.syncQueue.add(() => this.deleteAsset(asset))),
        ]);
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
                    const location = asset.getAssetFilePath(this.photoDataDir);
                    const writeStream = fs.createWriteStream(location);
                    response.data.pipe(writeStream);
                    return pEvent(writeStream, `close`);
                })
                .then(() => {
                    if (!this.verifyAsset(asset)) {
                        throw new Error(`Unable to verify asset ${asset.getDisplayName()}`);
                    } else {
                        this.logger.debug(`Asset ${asset.getDisplayName()} sucesfully downloaded`);
                    }
                });
            // .catch(err => {
            //    this.logger.error(err.message);
            // Assets are not available very long :(
            // asset resync neccesary
            // });
        }
    }

    async deleteAsset(asset: Asset): Promise<void> {
        this.logger.debug(`Deleting asset ${asset.getDisplayName()}`);
        const location = asset.getAssetFilePath(this.photoDataDir);
        return fs.promises.rm(location, {force: true});
    }

    verifyAsset(asset: Asset): boolean {
        this.logger.debug(`Verifying asset ${asset.getDisplayName()}`);
        const location = asset.getAssetFilePath(this.photoDataDir);
        if (fs.existsSync(location)) {
            const data = fs.readFileSync(location);
            const sizeVerfied = asset.verifySize(data);
            const checksumVerified = asset.verifyChecksum(data);
            return sizeVerfied && checksumVerified;
        }

        return false;
    }

    async writeLibraryStructure(newAlbums: Album[]) {
        this.logger.info(`Writing lib structure!`);
        // Get root folder & local root folder
        // compare content
        // repeate for every other folder
        // optionally: move data to
    }
}