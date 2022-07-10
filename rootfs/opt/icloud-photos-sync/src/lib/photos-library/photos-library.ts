import log from 'loglevel';
import * as path from 'path';
import * as PHOTOS_LIBRARY from './constants.js';
import {Album} from './model/album.js';
import {MediaRecord} from './model/media-record.js';
import {EventEmitter} from 'events';
import * as fs from 'fs/promises';
import * as fssync from 'fs';
import {OptionValues} from 'commander';
import {Asset} from './model/asset.js';
import {CPLAlbum, CPLAsset, CPLMaster} from '../icloud/icloud-photos/query-parser.js';

interface Library {
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
                                    const newAlbum = Album.parseFromJson(albumData);
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
                                    const newRecord = MediaRecord.parseFromJson(jsonData.mediaRecords[recordKey]);
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

    /**
     * This function will update the local library data (mediaRecords) and provide a list instructions, on how to achieve the remote state in the local file system
     * @param cplAssets - The remote CPLAsset records
     * @param cplMasters - The remote CPLMaster recrods
     * @returns A touple consisting of: An array that includes all local assets that need to be deleted | An array that includes all remote assets that need to be downloaded
     */
    async updateLibraryData(cplAssets: CPLAsset[], cplMasters: CPLMaster[]): Promise<[Asset[], Asset[]]> {
        this.logger.debug(`Indexing ${cplMasters.length} CPLMaster records`);
        const masterRecords = {};
        cplMasters.forEach(masterRecord => {
            masterRecords[masterRecord.recordName] = masterRecord;
        });

        // Creating new data structures / making existing easily accessible
        const currentLibraryRecords = this.library.mediaRecords;
        const nextLibraryRecords = {};

        const toBeDeleted: Asset[] = [];
        const toBeAdded: Asset[] = [];

        // Going over remote state and diffing
        cplAssets.forEach(cplAsset => {
            // Remote CPLAsset in local db?
            const localRecord = currentLibraryRecords[cplAsset.recordName];

            // Get CPLMaster for CPLAsset (if possible)
            const cplMaster = cplAsset.masterRef ? masterRecords[cplAsset.masterRef] : undefined;

            let message = `Processed remote asset ${cplAsset.recordName} (CPLMaster: ${cplMaster?.recordName}): `;

            if (localRecord) { // Remote record is already in local db
                // Diff remote with local state
                const recordDiff = localRecord.getDiff(cplAsset, cplMaster);

                // Store diffed assets
                toBeDeleted.push(...recordDiff[0]);
                toBeAdded.push(...recordDiff[1]);
                // Store updated MediaRecord
                nextLibraryRecords[recordDiff[2].uuid] = recordDiff[2];
                // Delete processed local record
                delete currentLibraryRecords[localRecord.uuid];

                message += `Diffed with existing record ${localRecord.uuid}\n\t-> Deleting ${recordDiff[0].length} and adding ${recordDiff[1].length} assets`;
            } else {
                // Record is brand new
                const newRecord = MediaRecord.fromCPL(cplAsset, cplMaster);
                toBeAdded.push(...newRecord.getAllAssets());

                nextLibraryRecords[newRecord.uuid] = newRecord;
                message += `Creating new record ${newRecord.uuid}\n\t-> Adding ${newRecord.getAssetCount()} assets`;
            }

            this.logger.debug(message);
        });

        // The original library should only hold those records, that have not been referenced by the remote state, removing them
        Object.values(currentLibraryRecords).forEach(staleRecord => {
            toBeDeleted.push(...staleRecord.getAllAssets());
            this.logger.debug(`Found stale record ${staleRecord.uuid}\n\t-> Deleting ${staleRecord.getAssetCount()} assets`);
        });

        // Locally saving updated state
        this.library.mediaRecords = nextLibraryRecords;
        return [toBeDeleted, toBeAdded];
    }

    async updateLibraryStructure(cplAlbums: CPLAlbum[]): Promise<Album[]> {
        this.logger.info(`Updating library structure!`);
        // Go to current root album
        // List content
        // Filter cplAlbums by parentId ===
        const albums: Album[] = [];
        return albums;
    }
}