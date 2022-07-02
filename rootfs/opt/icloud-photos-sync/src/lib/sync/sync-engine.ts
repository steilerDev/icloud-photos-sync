import log from 'loglevel';
import {EventEmitter} from 'events';
import {iCloud} from '../icloud/icloud.js';
import {PhotosLibrary} from '../photos-library/photos-library.js';
import {OptionValues} from 'commander';
import * as SYNC_ENGINE from './sync-engine.constants.js';
import {RecordState} from '../photos-library/photos-library.constants.js';
import {CPLAlbum, CPLAsset, CPLMaster} from '../icloud/photos/query-parser.js';

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
            .then(([remoteData, remoteStructure]) => this.updateLibrary(remoteData, remoteStructure))
            .then(this.writeLibraryData)
            .then(this.writeLibraryStructure)
            .then(this.photosLibrary.save) // Save state to db only once completed
    }

    async fetchState(): Promise<[[CPLAsset[], CPLMaster[]], CPLAlbum[]]> {
        this.emit(SYNC_ENGINE.EVENTS.FETCH);
        this.logger.info(`Fetching remote iCloud state`);
        return Promise.all([
            this.iCloud.photos.fetchAllPictureRecords(),
            this.iCloud.photos.fetchAllAlbumRecords(),
        ]);
    }

    async updateLibrary(data: [CPLAsset[], CPLMaster[]], structure: CPLAlbum[]): Promise<[void, void]> {
        this.emit(SYNC_ENGINE.EVENTS.DIFF);
        this.logger.info(`Updating local library and diffing state`);
        return Promise.all([
            this.photosLibrary.updateLibraryData(data[0], data[1]),
            this.photosLibrary.updateLibraryStructure(structure),
        ]);
    }

    async writeLibraryData() {
        // Todo: Keep track of what is left to do & what has been done by writing out pending assets 
        const pendingAssets = this.photosLibrary.getPendingAssets();
        pendingAssets.forEach((asset, index) => {
            if (asset.recordState === RecordState.STALE || asset.recordState === RecordState.CHANGED) {
                // Delete asset
            }

            if (asset.recordState === RecordState.ARCHIVED || asset.recordState === RecordState.SYNCED) {
                // Leave alone

            }

            // Download asset & write to data dir
        });
    }

    async writeLibraryStructure() {
        // Get root folder & local root folder
        // compare content
        // repeate for every other folder
        // optionally: move data to
    }
/**
    WriteRecords(): Promise<PromiseSettledResult<void>[]> {
        this.emit(SYNC_ENGINE.EVENTS.DOWNLOAD, this.db.library.mediaRecords.length);

        if (!fs.existsSync(this.photoDataDir)) {
            this.logger.debug(`Creating directory ${this.photoDataDir}`);
            fs.mkdirSync(this.photoDataDir);
        }

        this.logger.debug(`Fetching ${this.db.library.mediaRecords.length} records`);
        const writePromises: Promise<void>[] = [];
        const limit = pLimit(10);
        Object.values(this.db.library.mediaRecords).forEach(element => {
            this.logger.debug(`Queuing element ${element.recordName}`);
            this.emit(SYNC_ENGINE.EVENTS.RECORD_STARTED, element.recordName);
            writePromises.push(
                this.iCloud.photos.downloadRecordRessources(element, this.photoDataDir, limit)
                    .then(() => {
                        this.emit(SYNC_ENGINE.EVENTS.RECORD_COMPLETED, element.recordName);
                    }),
            );
        });
        return Promise.allSettled(writePromises);
    } */
}