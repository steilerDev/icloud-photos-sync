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

type RemoteData = [CPLAsset[], CPLMaster[]]
type RemoteAlbums = CPLAlbum[]

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

    downloadThreads: number;

    constructor(iCloud: iCloud, photosLibrary: PhotosLibrary, cliOpts: OptionValues) {
        super();
        this.iCloud = iCloud;
        this.photosLibrary = photosLibrary;
        this.photoDataDir = cliOpts.photo_data_dir;
        this.downloadThreads = cliOpts.download_threads;
    }

    async sync() {
        this.logger.info(`Starting sync`);
        return this.fetchState()
            .then(([remoteData, remoteStructure]) => Promise.all([
                this.photosLibrary.updateLibraryData(remoteData[0], remoteData[1])
                    .then(([toBeDeleted, toBeAdded]) => this.writeLibraryData(toBeDeleted, toBeAdded)),
                this.photosLibrary.updateLibraryStructure(remoteStructure)
                    .then(newAlbums => this.writeLibraryStructure(newAlbums)),
            ]))
            .then(() => this.photosLibrary.save()); // Save state to db only once completed
    }

    async fetchState(): Promise<[RemoteData, RemoteAlbums]> {
        this.emit(SYNC_ENGINE.EVENTS.FETCH);
        this.logger.info(`Fetching remote iCloud state`);
        return Promise.all([
            this.iCloud.photos.fetchAllPictureRecords(),
            this.iCloud.photos.fetchAllAlbumRecords(),
        ]);
    }

    async writeLibraryData(toBeDeleted: Asset[], toBeAdded: Asset[]) {
        const test: Asset[] = toBeAdded.slice(0, 10);
        return Promise.all([
            ...test.map(asset => this.addAsset(asset)),
            // ...toBeAdded.map(this.addAsset),
            // ...toBeDeleted.map(this.deleteAsset),
        ]);
    }

    /**
     * This function downloads and stores a given asset
     * @param asset - The asset that needs to be downloaded
     * @returns A promise that resolves, once the file has been sucesfully written to disc
     */
    async addAsset(asset: Asset): Promise<void> {
        this.logger.debug(`Downloading asset ${asset.fileChecksum}`);
        const location = asset.getAssetFilePath(this.photoDataDir);
        return this.iCloud.photos.downloadAsset(asset)
            .then(data => {
                this.logger.debug(`Writing asset ${asset.fileChecksum}`);
                const writeStream = fs.createWriteStream(location);
                data.pipe(writeStream);
                return pEvent(writeStream, `close`);
            })
            .then(() => {
                this.logger.debug(`Verifying asset ${asset.fileChecksum}`);
                if (fs.existsSync(location)) {
                    const data = fs.readFileSync(location);
                    if (!asset.verifySize(data)) {
                        throw new Error(`Unable to verify size of asset ${asset.fileChecksum}`);
                    }

                    if (!asset.verifyChecksum(data)) {
                        throw new Error(`Unable to verify checksum of asset ${asset.fileChecksum}`);
                    }

                    this.logger.debug(`Asset ${asset.fileChecksum} sucesfully verified!`);
                } else {
                    throw new Error(`Unable to find asset ${asset.fileChecksum}`);
                }
            });
    }

    async deleteAsset(asset: Asset) {

    }

    async writeLibraryStructure(newAlbums: Album[]) {
        this.logger.info(`Writing lib structure!`);
        // Get root folder & local root folder
        // compare content
        // repeate for every other folder
        // optionally: move data to
    }
}