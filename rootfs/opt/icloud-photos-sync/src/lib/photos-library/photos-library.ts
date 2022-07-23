import log from 'loglevel';
import * as path from 'path';
import * as PHOTOS_LIBRARY from './constants.js';
import {Album, AlbumType} from './model/album.js';
import {EventEmitter} from 'events';
import * as fs from 'fs/promises';
import * as fssync from 'fs';
import {OptionValues} from 'commander';
import {Asset} from './model/asset.js';
import {CPLAlbum, CPLAsset, CPLMaster, cpl2Assets} from '../icloud/icloud-photos/query-parser.js';

type Library = {
    albums: Album[],
    assets: {
        [key: string]: Asset // Keyed by filename
    },
}

/**
 * This class holds the local data structure
 */
export class PhotosLibrary extends EventEmitter {
    /**
     * Local data structure
     */
    private lib: Library;

    /**
     * Default logger for the class
     */
    private logger: log.Logger = log.getLogger(`Photos-Library`);

    photoDataDir: string;
    assetDir: string;

    /**
     * A promise that will resolve, once the object is ready or reject, in case there is an error
     */
    ready: Promise<void>;

    constructor(cliOpts: OptionValues) {
        super();
        this.lib = {
            albums: [],
            assets: {},
        };

        this.photoDataDir = cliOpts.photo_data_dir;
        if (!fssync.existsSync(this.photoDataDir)) {
            this.logger.debug(`${this.photoDataDir} does not exist, creating`);
            fssync.mkdirSync(this.photoDataDir);
        }

        this.assetDir = path.join(this.photoDataDir, PHOTOS_LIBRARY.ASSET_DIR);
        if (!fssync.existsSync(this.assetDir)) {
            this.logger.debug(`${this.assetDir} does not exist, creating`);
            fssync.mkdirSync(this.assetDir);
        }

        this.ready = new Promise<void>((resolve, reject) => {
            this.on(PHOTOS_LIBRARY.EVENTS.READY, resolve);
            this.on(PHOTOS_LIBRARY.EVENTS.ERROR, reject);
        });
    }

    async load() {
        this.logger.debug(`Loading library from disc`);

        // Loading Assets
        this.lib.assets = {};
        (await fs.readdir(this.assetDir))
            .forEach(fileName => {
                const fileStat = fssync.statSync(path.format({
                    dir: this.assetDir,
                    base: fileName,
                }));
                const asset = Asset.fromFile(fileName, fileStat);
                this.lib.assets[asset.getUUID()] = asset;
            });

        // Loading folders
        const rootAlbum = new Album(``, AlbumType.FOLDER, `All`, ``, this.photoDataDir);
        this.lib.albums = await this.loadAlbum(rootAlbum);

        this.emit(PHOTOS_LIBRARY.EVENTS.READY);
    }

    async loadAlbum(album: Album): Promise<Album[]> {
        const albums: Album[] = [album];
        this.logger.info(`Loading album ${album.getDisplayName()}`);

        const symbolicLinks = (await fs.readdir(album.albumPath, {
            withFileTypes: true,
        })).filter(file => file.isSymbolicLink());

        this.logger.debug(`Found ${symbolicLinks.length} symbolic links in ${album.getDisplayName()}`);

        for (const link of symbolicLinks) {
            // The target's basename contains the UUID
            const target = await fs.readlink(path.join(album.albumPath, link.name));

            if (album.albumType === AlbumType.FOLDER) {
                const uuid = path.basename(target).substring(1); // Removing leading '.'
                const fullPath = path.join(album.albumPath, target);
                const folderType = await this.readAlbumTypeFromPath(fullPath);

                const loadedAlbum = new Album(uuid, folderType, link.name, album.getUUID(), fullPath);
                albums.push(...await this.loadAlbum(loadedAlbum));
            } else if (album.albumType === AlbumType.ALBUM) {
                const uuid = path.parse(target).name;
                albums[0].assets[uuid] = link.name;
            } else if (album.albumType === AlbumType.ARCHIVED) {
                this.logger.info(`Treating ${album.albumType} as archived`);
            }
        }
        return albums;
    }

    async readAlbumTypeFromPath(path: string): Promise<AlbumType> {
        // If the folder contains other folders, it will be of AlbumType.Folder
        const directoryPresent = (await fs.readdir(path, {
            withFileTypes: true,
        })).some(file => file.isDirectory());

        // If there are files in the folders, the folder is treated as archived
        const filePresent = (await fs.readdir(path, {
            withFileTypes: true,
        })).some(file => file.isFile());

        if (directoryPresent) {
            // AlbumType.Folder cannot be archived!
            if (filePresent) {
                this.logger.warn(`Extranous file found in folder ${path}`);
            }

            return AlbumType.FOLDER;
        }

        if (filePresent) {
            return AlbumType.ARCHIVED;
        }

        return AlbumType.ALBUM;
    }

    /**
        Return this.db.read()
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

            })
            .catch(err => {
                this.logger.error(`Unable to load database: ${err.message}`);
                this.emit(PHOTOS_LIBRARY.EVENTS.ERROR);
            });
            */

    isEmpty(): boolean {
        return this.getAlbumCount() === 0 && this.getAssetCount() === 0;
    }

    getAlbumCount(): number {
        return this.lib.albums.length;
    }

    getAssetCount(): number {
        return Object.keys(this.lib.assets).length;
    }

    /**
     * This function will update the local library data (mediaRecords) and provide a list instructions, on how to achieve the remote state in the local file system
     * @param cplAssets - The remote CPLAsset records
     * @param cplMasters - The remote CPLMaster recrods
     * @returns A touple consisting of: An array that includes all local assets that need to be deleted | An array that includes all remote assets that need to be downloaded
     */
    async diffLibraryData(cplAssets: CPLAsset[], cplMasters: CPLMaster[]): Promise<[Asset[], Asset[]]> {
        // List all files in fs using name instead of currentLibraryRecords
        // fssync.readdirSync()
        this.logger.debug(`Diffing library data with remote data`);
        // Indexing master records for easier retrieval later
        const cplMasterRecords = {};
        cplMasters.forEach(masterRecord => {
            cplMasterRecords[masterRecord.recordName] = masterRecord;
        });

        // 'loading' local library
        const toBeDeleted: Asset[] = [];
        const toBeAdded: Asset[] = [];

        // Going over remote state and diffing
        cplAssets.forEach(cplAsset => {
            // Get CPLMaster for CPLAsset (if possible)
            const remoteAssets = cpl2Assets(cplAsset, cplMasterRecords[cplAsset.masterRef]);

            let message = `Processing remote asset ${cplAsset.recordName} (CPLMaster: ${cplAsset.masterRef}): `;
            remoteAssets.forEach(remoteAsset => {
                const localAsset = this.lib.assets[remoteAsset.getUUID()];
                const assetDiff = Asset.getAssetDiff(localAsset, remoteAsset);
                if (!assetDiff[0] && !assetDiff[1]) {
                    // Local asset matches remote asset, therefore no diff
                    delete this.lib.assets[remoteAsset.getUUID()];
                } else {
                    if (assetDiff[0]) { // Needs to be deleted
                        message += `Deleting asset ${assetDiff[0].getUUID()}`;
                        toBeDeleted.push(assetDiff[0]);
                        delete this.lib.assets[assetDiff[0].getUUID()];
                    }

                    if (assetDiff[1]) { // Needs to be added
                        message += `Adding asset ${assetDiff[1].getUUID()}`;
                        toBeAdded.push(assetDiff[1]);
                    }
                }
            });
            this.logger.debug(message);
        });

        // The original library should only hold those records, that have not been referenced by the remote state, removing them
        Object.values(this.lib.assets).forEach(staleAsset => {
            this.logger.debug(`Found stale asset ${staleAsset.getUUID()}`);
            toBeDeleted.push(staleAsset);
        });

        return [toBeDeleted, toBeAdded];
    }

    async diffLibraryStructure(cplAlbums: CPLAlbum[]): Promise<Album[]> {
        this.logger.info(`Diffing library structure!`);
        // Go to current root album
        // List content
        // Filter cplAlbums by parentId ===
        const albums: Album[] = [];

        // Saving updated state and queue
        this.lib.albums = albums;
        return albums;
    }
}