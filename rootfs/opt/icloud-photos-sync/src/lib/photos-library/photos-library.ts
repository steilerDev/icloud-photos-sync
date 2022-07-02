import log from 'loglevel';
import * as path from 'path';
import * as PHOTOS_LIBRARY from './photos-library.constants.js';
import {Album} from './model/album.js';
import {MediaRecord} from './model/media-record.js';
import {EventEmitter} from 'events';
import * as fs from 'fs/promises';
import * as fssync from 'fs';
import {OptionValues} from 'commander';
import {Asset} from './model/asset.js';
import {CPLAlbum, CPLAsset, CPLMaster} from '../icloud/photos/query-parser.js';

export interface Library {
    albums: Album[],
    mediaRecords: {
        [key: string]: MediaRecord
    },
    /**
     * Last sync timestamp in milli seconds since epoch
     */
    lastSync: number
}

/**
 * This class holds the local data structure
 */
export class PhotosLibrary extends EventEmitter {
    /**
     * Local data structure
     */
    library: Library;

    /**
     * File path to the sqlite db file
     */
    libraryFile: string;

    /**
     * Default logger for the class
     */
    logger: log.Logger = log.getLogger(`Photos-Library`);

    /**
     * A promise that will resolve, once the object is ready or reject, in case there is an error
     */
    ready: Promise<void>;

    constructor(cliOpts: OptionValues) {
        super();

        this.library = {
            albums: [],
            mediaRecords: {},
            lastSync: 0,
        };

        this.libraryFile = path.format({
            dir: cliOpts.app_data_dir,
            base: PHOTOS_LIBRARY.FILE_NAME,
        });

        this.ready = new Promise<void>((resolve, reject) => {
            this.on(PHOTOS_LIBRARY.EVENTS.READY, resolve);
            this.on(PHOTOS_LIBRARY.EVENTS.ERROR, reject);
        });
    }

    async load(): Promise<void> {
        this.logger.debug(`Opening database`);
        if (fssync.existsSync(this.libraryFile)) {
            fs.readFile(this.libraryFile, {encoding: `utf8`})
                .then(data => {
                    this.logger.debug(`Loaded database file, parsing content...`);
                    try {
                        const jsonData = JSON.parse(data);
                        if (jsonData.albums && Array.isArray(jsonData.albums)) {
                            jsonData.albums.forEach(albumData => {
                                try {
                                    const newAlbum = Album.parseAlbumFromJson(albumData);
                                    this.logger.debug(`Adding album '${newAlbum.albumName}'`);
                                    this.library.albums.push(newAlbum);
                                } catch (err) {
                                    throw new Error(`Unable to read album from JSON file: ${err.message}`);
                                }
                            });
                        }

                        if (jsonData.mediaRecords) {
                            Object.keys(jsonData.mediaRecords).forEach(recordKey => {
                                try {
                                    const newRecord = MediaRecord.parseMediaRecordFromJson(jsonData.mediaRecords[recordKey]);
                                    this.logger.debug(`Adding media record '${newRecord.uuid}'`);
                                    this.library.mediaRecords[recordKey] = newRecord;
                                } catch (err) {
                                    throw new Error(`Unable to read media record from JSON file: ${err.message}`);
                                }
                            });
                        }

                        this.emit(PHOTOS_LIBRARY.EVENTS.READY);
                    } catch (err) {
                        this.emit(PHOTOS_LIBRARY.EVENTS.ERROR, `Unable to read JSON: ${err.message}`);
                    }
                })
                .catch(err => {
                    this.emit(PHOTOS_LIBRARY.EVENTS.ERROR, `Unable to read database: ${err.message}`);
                });
        } else {
            this.logger.warn(`DB file does not exist, starting new`);
            this.emit(PHOTOS_LIBRARY.EVENTS.READY);
        }

        return this.ready;
    }

    async save(): Promise<void> {
        this.logger.debug(`Writing database...`);

        const tempFileName = `${this.libraryFile}-updated`;
        return fs.writeFile(tempFileName, JSON.stringify(this.library))
            .then(() => {
                this.logger.debug(`Database written succesfully, removing lock`);
                this.emit(PHOTOS_LIBRARY.EVENTS.SAVED);
                return fs.rename(tempFileName, this.libraryFile);
            })
            .catch(err => {
                this.emit(PHOTOS_LIBRARY.EVENTS.ERROR, `Unable to write database: ${err}`);
            });
    }

    isEmpty(): boolean {
        return this.library.albums.length === 0 && Object.keys(this.library.mediaRecords).length === 0;
    }

    updateLibraryData(cplAssets: CPLAsset[], cplMasters: CPLMaster[]) {
        // Mark current library STALE, unless marked as archived
        // index cplMasters for later (quick lockup)
        // For each CPLAsset -> .name in db?
        //  No -> Find Master & create NEW
        //  Yes -> Check 'modified' date && diff original asset (should not have changed, otherwise warn!)
        //          Same/Older -> set SYNCED
        //          Newer -> Set CHANGED & Update edited asset
    }
    // If SYNCED -> Do nothing
    // If CHANGED -> Delete old
    // If NEW -> Create

    updateLibraryStructure(cplAlbums: CPLAlbum[]) {
        // Go to current root album
        // List content
        // Filter cplAlbums by parentId === 
    }

    /**
     *
     * @returns All assets that needs to be downloaded or deleted (asset URL empty)
     */
    getPendingAssets(): Asset[] {
        const pendingAssets: Asset[] = [];
        // Go through db and check for CHANGED / NEW / DELETE
        return pendingAssets;
    }
}