import log from 'loglevel';
import * as path from 'path';
import * as PHOTOS_LIBRARY from './photos-library.constants.js';
import {Album} from './model/album.js';
import {MediaRecord} from './model/media-record.js';
import {EventEmitter} from 'events';
import * as fs from 'fs/promises';
import * as fssync from 'fs';
import {OptionValues} from 'commander';

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

export enum RecordState {
    STALE = 0,
    NEW = 1,
    CHANGED = 2,
    EXPIRED = 3,
    LOCKED = 4
}

/**
 * This class holds the local data structure
 */
export class PhotosLibrary extends EventEmitter {
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

        this.on(PHOTOS_LIBRARY.EVENTS.READY, () => {
            this.logger.info(`Photo library ready, loaded ${this.library.albums.length} albums and ${Object.keys(this.library.mediaRecords).length} records`);
        });

        this.on(PHOTOS_LIBRARY.EVENTS.ERROR, (msg: string) => {
            this.logger.error(`Error ocurred: ${msg}`);
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
                                    this.logger.debug(`Adding media record '${newRecord.recordName}'`);
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
                fs.rename(tempFileName, this.libraryFile);
                this.emit(PHOTOS_LIBRARY.EVENTS.SAVED);
            })
            .catch(err => {
                this.emit(PHOTOS_LIBRARY.EVENTS.ERROR, `Unable to write database: ${err}`);
            });
    }

    isEmpty(): boolean {
        return this.library.albums.length === 0 && Object.keys(this.library.mediaRecords).length === 0;
    }
}