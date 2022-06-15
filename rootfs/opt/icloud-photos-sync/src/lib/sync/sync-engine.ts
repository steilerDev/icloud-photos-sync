import log from 'loglevel';
import {EventEmitter} from 'events';
import {iCloud} from '../icloud/icloud.js';
import {PhotosLibrary, Library} from '../photos-library/photos-library.js';
import {Album, AlbumType} from '../photos-library/model/album.js';
import {MediaRecord} from '../photos-library/model/media-record.js';
import {OptionValues} from 'commander';
import * as SYNC_ENGINE from './sync-engine.constants.js';

/**
 * This class handles the photos sync
 */
export class SyncEngine extends EventEmitter {
    /**
     * Default logger for the class
     */
    logger: log.Logger = log.getLogger(`Sync-Engine`);

    iCloud: iCloud;

    db: PhotosLibrary;

    photoDataDir: string;

    downloadThreads: number;

    constructor(iCloud: iCloud, db: PhotosLibrary, cliOpts: OptionValues) {
        super();
        this.iCloud = iCloud;
        this.db = db;
        this.photoDataDir = cliOpts.photo_data_dir;
        this.downloadThreads = cliOpts.download_threads;
    }

    async sync() {
        try {
            this.logger.info(`Starting sync`);
            const remoteState = await this.fetchState();
            await this.diffState(remoteState);
            await this.writeState();
            this.logger.info(`Sync completed`);
        } catch (err) {
            throw new Error(`Sync failed: ${err.message}`);
        }
    }

    async diffState(remoteLibrary: Library) {
        this.emit(SYNC_ENGINE.EVENTS.DIFF);
        if (this.db.isEmpty) {
            this.logger.info(`Local database is empy, setting remote state to local state`);
            this.db.library = remoteLibrary;
        } else {
            throw new Error(`Diff not implemented`);
        }

        return this.db.save();
    }

    async writeState() {
        this.emit(SYNC_ENGINE.EVENTS.DOWNLOAD, this.db.library.mediaRecords.length);
        this.logger.debug(`Fetching ${this.db.library.mediaRecords.length} records`);
        Object.values(this.db.library.mediaRecords).forEach(element => {
            this.logger.debug(`Downloding element ${element.recordName}`);
            this.emit(SYNC_ENGINE.EVENTS.RECORD_STARTED, element.recordName);

            this.emit(SYNC_ENGINE.EVENTS.RECORD_COMPLETED, element.recordName);
        });
    }

    async fetchState(): Promise<Library> {
        this.emit(SYNC_ENGINE.EVENTS.FETCH);
        this.logger.info(`Fetching remote iCloud state`);
        return Promise.all([this.fetchFolderStructure(), this.fetchAllPictures()])
            .then(result => {
                this.logger.debug(`Indexing remote state`);
                const library: Library = {
                    albums: result[0],
                    mediaRecords: {},
                    lastSync: new Date().getTime(),
                };
                result[1].forEach(mediaRecord => {
                    library.mediaRecords[mediaRecord.recordName] = mediaRecord;
                });
                return library;
            });
    }

    /**
     * Fetching folder structure from iCloud
     * @returns Current iCloud folder structure
     */
    async fetchFolderStructure(): Promise<Album[]> {
        this.logger.debug(`Fetching remote folder structure`);
        // Albums are stored here
        const parsedFolders: Album[] = [];
        try {
            // Getting root folders
            const folders = await this.iCloud.photos.fetchAllAlbumRecords();
            // Storing picture sync requests for asynchronous completion
            const picturePromises: Promise<void | string[]>[] = [];
            while (folders.length > 0) {
                try {
                    const parsedFolder: Album = Album.parseAlbumFromQuery(folders.shift());
                    this.logger.debug(`Parsed folder: ${parsedFolder.albumName} (type ${parsedFolder.albumType})`);
                    parsedFolders.push(parsedFolder);

                    // If album is a folder, there is stuff in there, adding it to the queue
                    if (parsedFolder.albumType === AlbumType.FOLDER) {
                        this.logger.debug(`Adding child folders of ${parsedFolder.albumName} to the processing queue`);
                        const nestedFolders = await this.iCloud.photos.fetchAllAlbumRecordsByParentId(parsedFolder.recordName);
                        folders.push(...nestedFolders);
                    } else if (parsedFolder.albumType === AlbumType.ALBUM) {
                        this.logger.debug(`Adding pictures to folder ${parsedFolder.albumName}`);
                        picturePromises.push(
                            this.fetchPicturesForAlbum(parsedFolder.recordName)
                                .then(pictures => {
                                    parsedFolder.mediaRecords = pictures;
                                }),
                        );
                    }
                } catch (err) {
                    this.logger.warn(err.message);
                }
            }

            this.logger.debug(`Folder sync completed, waiting for picture sync to complete`);
            await Promise.all([...picturePromises]);
        } catch (err) {
            throw new Error(`Unable to fetch folder structure: ${err}`);
        }

        return parsedFolders;
    }

    async fetchPicturesForAlbum(parentId: string): Promise<string[]> {
        try {
            const pictureRecords = await this.iCloud.photos.fetchAllPictureRecords(parentId);
            const pictureRecordNames = pictureRecords.map(picture => picture.recordName);
            this.logger.debug(`Got ${pictureRecordNames.length} picture records for ${parentId}`);
            return pictureRecordNames;
        } catch (err) {
            throw new Error(`Unable to get photos for album (${parentId}): ${err.message}`);
        }
    }

    async fetchAllPictures(): Promise<MediaRecord[]> {
        try {
            const pictureRecords = await this.iCloud.photos.fetchAllPictureRecords();
            return pictureRecords.map(record => {
                try {
                    return MediaRecord.parseMediaRecordFromQuery(record);
                } catch (err) {
                    this.logger.debug(`Unable to parse media record from query: ${err.message}`);
                    return undefined;
                }
            });
        } catch (err) {
            throw new Error(`Unable to get all photos: ${err.message}`);
        }
    }
}