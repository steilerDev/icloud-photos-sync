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
import {Low, JSONFile} from 'lowdb';
import {ProcessingDataQueue, ProcessingAlbumQueue} from '../sync-engine/sync-engine.js';

type Library = {
    albums: Album[],
    mediaRecords: {
        [key: string]: MediaRecord
    },
}

type Data = {
    lib: Library,
    processingQueues: {
        data: ProcessingDataQueue,
        album: ProcessingAlbumQueue
    }
}

/**
 * This class holds the local data structure
 */
export class PhotosLibrary extends EventEmitter {
    /**
     * Local data structure
     */
    private db: Low<Data>;

    private dbAdapter: JSONFile<Data>;

    /**
     * Default logger for the class
     */
    private logger: log.Logger = log.getLogger(`Photos-Library`);

    photoDataDir: string;

    /**
     * A promise that will resolve, once the object is ready or reject, in case there is an error
     */
    ready: Promise<void>;

    constructor(cliOpts: OptionValues) {
        super();
        this.dbAdapter = new JSONFile<Data>(path.format({
            dir: cliOpts.app_data_dir,
            base: PHOTOS_LIBRARY.FILE_NAME,
        }));

        this.ready = new Promise<void>((resolve, reject) => {
            this.on(PHOTOS_LIBRARY.EVENTS.READY, resolve);
            this.on(PHOTOS_LIBRARY.EVENTS.ERROR, reject);
        });
    }

    async load(): Promise<void> {
        this.logger.debug(`Opening database`);
        this.db = new Low(this.dbAdapter);

        return this.db.read()
            .then(() => {
                if (!this.db.data) {
                    this.logger.warn(`Database is empty, creating fresh`);
                    this.db.data = {
                        lib: {
                            albums: [],
                            mediaRecords: {},
                        },
                        processingQueues: {
                            album: null,
                            data: null,
                        },
                    };
                } else { // Data structure is loaded as json only, no instance functions are available. Recreating instances below
                    if (!this.db.data.lib) {
                        this.logger.warn(`Library is empty, creating fresh`);
                        this.db.data.lib = {
                            albums: [],
                            mediaRecords: {},
                        };
                    } else {
                        this.logger.debug(`Mapping library structure to object instances`);
                        // For now
                        this.db.data.lib.albums = this.db.data.lib.albums.map(album => new Album(album.uuid, album.albumType, album.albumName, album.deleted, album.mediaRecords, album.parentRecordName));

                        const mediaRecordInstances = {};
                        Object.keys(this.db.data.lib.mediaRecords).forEach(key => {
                            let original: Asset;
                            if (this.db.data.lib.mediaRecords[key].original) {
                                original = new Asset(
                                    this.db.data.lib.mediaRecords[key].original.fileChecksum,
                                    this.db.data.lib.mediaRecords[key].original.size,
                                    this.db.data.lib.mediaRecords[key].original.wrappingKey,
                                    this.db.data.lib.mediaRecords[key].original.referenceChecksum,
                                    this.db.data.lib.mediaRecords[key].original.downloadURL,
                                    this.db.data.lib.mediaRecords[key].original.fileType.toString(),
                                    0,
                                );
                            }

                            const current: Asset = undefined;
                            if (this.db.data.lib.mediaRecords[key].current) {
                                original = new Asset(
                                    this.db.data.lib.mediaRecords[key].current.fileChecksum,
                                    this.db.data.lib.mediaRecords[key].current.size,
                                    this.db.data.lib.mediaRecords[key].current.wrappingKey,
                                    this.db.data.lib.mediaRecords[key].current.referenceChecksum,
                                    this.db.data.lib.mediaRecords[key].current.downloadURL,
                                    this.db.data.lib.mediaRecords[key].current.fileType.toString(),
                                    0,
                                );
                            }

                            mediaRecordInstances[key] = new MediaRecord(
                                this.db.data.lib.mediaRecords[key].uuid,
                                this.db.data.lib.mediaRecords[key].fileName,
                                this.db.data.lib.mediaRecords[key].favorite,
                                original,
                                current,
                            );
                        });
                        this.db.data.lib.mediaRecords = mediaRecordInstances;
                    }

                    if (!this.db.data.processingQueues) {
                        this.logger.info(`Processing queues are empty`);
                        this.db.data.processingQueues = {
                            album: null,
                            data: null,
                        };
                    } else {
                        this.logger.debug(`Mapping processing queue structure to object instances`);
                        if (this.db.data.processingQueues.data !== null) {
                            this.db.data.processingQueues.data[0] = this.db.data.processingQueues.data[0].map(asset => new Asset(
                                asset.fileChecksum,
                                asset.size,
                                asset.wrappingKey,
                                asset.referenceChecksum,
                                asset.downloadURL,
                                asset.fileType.toString(),
                                0,
                            ));
                            this.db.data.processingQueues.data[1] = this.db.data.processingQueues.data[1].map(asset => new Asset(
                                asset.fileChecksum,
                                asset.size,
                                asset.wrappingKey,
                                asset.referenceChecksum,
                                asset.downloadURL,
                                asset.fileType.toString(),
                                0,
                            ));
                        }

                        if (this.db.data.processingQueues.album !== null) {
                            // For now
                            this.db.data.processingQueues.album = this.db.data.processingQueues.album.map(album => new Album(
                                album.uuid,
                                album.albumType,
                                album.albumName,
                                album.deleted,
                                album.mediaRecords,
                                album.parentRecordName,
                            ));
                        }
                    }
                }

                this.emit(PHOTOS_LIBRARY.EVENTS.READY);
            })
            .catch(err => {
                this.logger.error(`Unable to load database: ${err.message}`);
                this.emit(PHOTOS_LIBRARY.EVENTS.ERROR);
            });
    }

    async save(): Promise<void> {
        this.logger.debug(`Writing database...`);
        return this.db.write()
            .then(() => {
                this.logger.debug(`Database written succesfully`);
                this.emit(PHOTOS_LIBRARY.EVENTS.SAVED);
            })
            .catch(err => {
                this.emit(PHOTOS_LIBRARY.EVENTS.ERROR, `Unable to write database: ${err.message}`);
            });
    }

    async completeSync() {
        this.logger.debug(`Clearing processing queues`);
        this.db.data.processingQueues.album = null;
        this.db.data.processingQueues.data = null;
        return this.save();
    }

    isEmpty(): boolean {
        return this.getAlbumCount() === 0 && this.getMediaRecordCount() === 0;
    }

    getAlbumCount(): number {
        return this.db.data.lib.albums.length;
    }

    getMediaRecordCount(): number {
        return Object.keys(this.db.data.lib.mediaRecords).length;
    }

    ongoingSync(): boolean {
        return this.db.data.processingQueues.data !== null
                    && this.db.data.processingQueues.album !== null;
    }

    getProcessingQueues(): [ProcessingDataQueue, ProcessingAlbumQueue] {
        return [this.db.data.processingQueues.data, this.db.data.processingQueues.album];
    }

    /**
     * This function will update the local library data (mediaRecords) and provide a list instructions, on how to achieve the remote state in the local file system
     * @param cplAssets - The remote CPLAsset records
     * @param cplMasters - The remote CPLMaster recrods
     * @returns A touple consisting of: An array that includes all local assets that need to be deleted | An array that includes all remote assets that need to be downloaded
     */
    async updateLibraryData(cplAssets: CPLAsset[], cplMasters: CPLMaster[]): Promise<[Asset[], Asset[]]> {
        // List all files in fs using name instead of currentLibraryRecords
        // fssync.readdirSync()

        this.logger.debug(`Indexing ${cplMasters.length} CPLMaster records`);
        const masterRecords = {};
        cplMasters.forEach(masterRecord => {
            masterRecords[masterRecord.recordName] = masterRecord;
        });

        // Creating new data structures / making existing easily accessible
        const currentLibraryRecords = this.db.data.lib.mediaRecords;
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

        // Saving updated state and queue
        this.db.data.lib.mediaRecords = nextLibraryRecords;
        this.db.data.processingQueues.data = [toBeDeleted, toBeAdded];
        return [toBeDeleted, toBeAdded];
    }

    async updateLibraryStructure(cplAlbums: CPLAlbum[]): Promise<Album[]> {
        this.logger.info(`Updating library structure!`);
        // Go to current root album
        // List content
        // Filter cplAlbums by parentId ===
        const albums: Album[] = [];

        // Saving updated state and queue
        this.db.data.lib.albums = albums;
        this.db.data.processingQueues.album = albums;
        return albums;
    }
}