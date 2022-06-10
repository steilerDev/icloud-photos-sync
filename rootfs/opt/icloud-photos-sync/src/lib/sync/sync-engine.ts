import log from 'loglevel';
import {EventEmitter} from 'events';
import {iCloud} from '../icloud/icloud.js';
import {PhotosLibraryDB} from '../db/photos-library-db.js';
import {Album, AlbumType} from '../db/model/album.js';

/**
 * This class handles the photos sync
 */
export class SyncEngine extends EventEmitter {
    /**
     * Default logger for the class
     */
    logger: log.Logger = log.getLogger(`Sync-Engine`);

    iCloud: iCloud;

    db: PhotosLibraryDB;

    constructor(iCloud: iCloud, db: PhotosLibraryDB) {
        super();
        this.iCloud = iCloud;
        this.db = db;
    }

    async sync() {
        this.logger.debug(`Starting sync`);
        await this.syncFolderStructure();
    }

    async syncFolderStructure() {
        this.logger.debug(`Syncing folder structure`);
        const iCloudFolderStructure = await this.fetchFolderStructure();
        this.logger.debug(`Fetched folder structure from iCloud`);
    }

    async fetchFolderStructure(): Promise<Album[]> {
        // Albums are stored here
        const parsedFolders: Album[] = [];
        try {
            // Getting root folders
            const folders = (await this.iCloud.photos.queryAllAlbums()).data.records;
            while (folders.length > 0) {
                try {
                    const parsedFolder: Album = Album.parseAlbumFromRequest(folders.shift());
                    this.logger.debug(`Parsed folder: ${parsedFolder.albumName} (type ${parsedFolder.albumType})`);
                    parsedFolders.push(parsedFolder);

                    // If album is a folder, there is stuff in there, adding it to the queue
                    if (parsedFolder.albumType === AlbumType.FOLDER) {
                        this.logger.debug(`Adding child folders of ${parsedFolder.albumName} to the processing queue`);
                        const nestedFolders = (await this.iCloud.photos.queryAllAlbumsByParentId(parsedFolder.recordName)).data.records;
                        if (nestedFolders && Array.isArray(nestedFolders)) {
                            folders.push(...nestedFolders);
                        }
                    }
                } catch (err) {
                    this.logger.warn(err.message);
                }
            }
        } catch (err) {
            throw new Error(`Unable to fetch folder structure: ${err}`);
        }
        return parsedFolders;
    }
}