import log from 'loglevel';
import * as path from 'path';
import * as PHOTOS_LIBRARY from './photos-library.constants.js';
import {Album} from './model/album.js';
import {MediaRecord} from './model/media-record.js';
import {EventEmitter} from 'events';
import * as fs from 'fs/promises';
import * as fssync from 'fs';

interface Library {
    albums: Album[]
    mediaRecords: MediaRecord[]
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
    logger: log.Logger = log.getLogger(`Photos-Library-DB`);

    /**
     * Is the object ready?
     */
    ready: boolean = false;

    /**
      * Has the object experienced an error?
      */
    errored: boolean = false;

    constructor(appDataDir: string) {
        super();

        this.library = {
            albums: [],
            mediaRecords: [],
        };

        this.libraryFile = path.format({
            dir: appDataDir,
            base: PHOTOS_LIBRARY.FILE_NAME,
        });

        this.on(PHOTOS_LIBRARY.EVENTS.READY, () => {
            this.ready = true;
            this.errored = false;
            this.logger.info(`Photo library ready!`);
        });

        this.on(PHOTOS_LIBRARY.EVENTS.ERROR, (msg: string) => {
            this.errored = true;
            this.ready = false;
            this.logger.error(`Error ocurred: ${msg}`);
        });
    }

    getReadyPromise() {
        return new Promise<void>((resolve, reject) => {
            if (this.ready) {
                resolve();
            } else if (this.errored) {
                reject();
            } else {
                this.on(PHOTOS_LIBRARY.EVENTS.READY, resolve);
                this.on(PHOTOS_LIBRARY.EVENTS.ERROR, reject);
            }
        });
    }

    load() {
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
                                    this.logger.warn(`Unable to read album from JSON: ${err}`);
                                }
                            });
                        }

                        // Also load media records

                        this.emit(PHOTOS_LIBRARY.EVENTS.READY);
                    } catch (err) {
                        this.emit(PHOTOS_LIBRARY.EVENTS.ERROR, `Unable to read JSON: ${err}`);
                    }
                })
                .catch(err => {
                    this.emit(PHOTOS_LIBRARY.EVENTS.ERROR, `Unable to read database: ${err}`);
                });
        } else {
            this.logger.warn(`DB file does not exist, starting new`);
            this.emit(PHOTOS_LIBRARY.EVENTS.READY);
        }
    }

    save() {
        this.logger.debug(`Writing database...`);

        const tempFileName = `${this.libraryFile}-updated`;
        fs.writeFile(tempFileName, JSON.stringify(this.library))
            .then(() => {
                this.logger.debug(`Database written succesfully, removing lock`);
                fs.rename(tempFileName, this.libraryFile);
                this.emit(PHOTOS_LIBRARY.EVENTS.CLOSED);
            })
            .catch(err => {
                this.emit(PHOTOS_LIBRARY.EVENTS.ERROR, `Unable to write database: ${err}`);
            });
    }

    isEmpty(): boolean {
        return this.library.albums.length === 0 && this.library.mediaRecords.length === 0;
    }
}