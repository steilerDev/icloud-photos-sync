import PQueue from "p-queue";
import {Asset} from "../../photos-library/model/asset.js";
import {PLibraryProcessingQueues} from "../../photos-library/model/photos-entity.js";
import fs from 'fs';
import * as fsPromise from 'fs/promises';
import {pEvent} from "p-event";
import {SyncEngine} from "../sync-engine.js";
import * as SYNC_ENGINE from '../constants.js';

/**
 * Writes the asset changes defined in the processing queue to to disk (by downloading the asset or deleting it)
 * @param processingQueue - The asset processing queue
 * @returns A promise that settles, once all asset changes have been written to disk
 */
export async function writeAssets(this: SyncEngine, processingQueue: PLibraryProcessingQueues<Asset>) {
    const toBeDeleted = processingQueue[0];
    const toBeAdded = processingQueue[1];
    // Initializing sync queue
    this.downloadQueue = new PQueue({concurrency: this.downloadCCY});

    this.logger.debug(`Writing data by deleting ${toBeDeleted.length} assets and adding ${toBeAdded.length} assets`);

    // Deleting before downloading, in order to ensure no conflicts
    return Promise.all(toBeDeleted.map(asset => this.deleteAsset(asset)))
        .then(() => Promise.all(toBeAdded.map(asset => this.downloadQueue.add(() => this.addAsset(asset)))));
}

/**
 * Downloads and stores a given asset, unless file is already present on disk
 * @param asset - The asset that needs to be downloaded
 * @returns A promise that resolves, once the file has been sucesfully written to disk
 */
export async function addAsset(this: SyncEngine, asset: Asset): Promise<void> {
    this.logger.info(`Adding asset ${asset.getDisplayName()}`);
    if (this.verifyAsset(asset)) {
        this.logger.debug(`Asset ${asset.getDisplayName()} already downloaded`);
    } else if (this.dryRun) {
        this.emit(SYNC_ENGINE.EVENTS.DRY_RUN, `Adding asset ${asset.getDisplayName()} from ${asset.downloadURL}`);
        this.emit(SYNC_ENGINE.EVENTS.WRITE_ASSET_COMPLETED, asset.getDisplayName());
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

/**
 * Deletes a given asset
 * @param asset - The asset that needs to be deleted
 * @returns A promise that resolves, once the file has been deleted
 */
export async function deleteAsset(this: SyncEngine, asset: Asset): Promise<void> {
    this.logger.info(`Deleting asset ${asset.getDisplayName()}`);
    const location = asset.getAssetFilePath(this.photosLibrary.assetDir);
    if (this.dryRun) {
        this.emit(SYNC_ENGINE.EVENTS.DRY_RUN, `Deleting asset ${asset.getDisplayName()} from ${location}`);
    } else {
        return fsPromise.rm(location, {force: true});
    }
}

/**
 * Verifies if a given Asset object is present on disk
 * @param asset - The asset to verify
 * @returns True, if the Asset object is present on disk
 */
export function verifyAsset(this: SyncEngine, asset: Asset): boolean {
    this.logger.debug(`Verifying asset ${asset.getDisplayName()}`);
    const location = asset.getAssetFilePath(this.photosLibrary.assetDir);
    return fs.existsSync(location)
        && asset.verify(fs.readFileSync(location));
}