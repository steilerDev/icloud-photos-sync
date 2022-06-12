import log from 'loglevel';
import {EventEmitter} from 'events';
import {iCloud} from '../icloud/icloud.js';
import {PhotosLibrary} from '../photos-library/photos-library.js';
import {Album, AlbumType} from '../photos-library/model/album.js';
import {MediaRecord} from '../photos-library/model/media-record.js';

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

    constructor(iCloud: iCloud, db: PhotosLibrary) {
        super();
        this.iCloud = iCloud;
        this.db = db;
    }

    async fetchState() {
        this.logger.debug(`Fetching remote iCloud state`);
        const library = await Promise.all([this.fetchAllPictures(), this.fetchFolderStructure()]);
        console.log(`Succesfully fetched state!`);
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