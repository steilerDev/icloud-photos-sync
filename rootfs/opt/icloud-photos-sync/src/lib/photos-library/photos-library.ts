import log from 'loglevel';
import * as path from 'path';
import * as PHOTOS_LIBRARY from './constants.js';
import {Album, AlbumType} from './model/album.js';
import {EventEmitter} from 'events';
import * as fs from 'fs/promises';
import * as fssync from 'fs';
import {OptionValues} from 'commander';
import {Asset} from './model/asset.js';
import {CPLAlbum, CPLAsset, CPLMaster, cpl2Assets, cplArray2Assets} from '../icloud/icloud-photos/query-parser.js';
import {ProcessingAlbumQueue, ProcessingDataQueue} from '../sync-engine/sync-engine.js';

type LibraryAlbums = {
    [key: string]: Album // Keyed by getUUID
}

type LibraryAssets = {
    [key: string]: Asset // Keyed by getUUID
}

type Library = {
    albums: LibraryAlbums,
    assets: LibraryAssets
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
            albums: {},
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

        return Promise.all([
            this.loadAssets(),
            this.loadAlbums(),
        ]).then(loadedLibrary => {
            this.lib.assets = loadedLibrary[0];
            this.lib.albums = loadedLibrary[1];
        }).then(() => {
            this.emit(PHOTOS_LIBRARY.EVENTS.READY);
        });
    }

    private async loadAssets(): Promise<LibraryAssets> {
        const libAssets: LibraryAssets = {};
        (await fs.readdir(this.assetDir))
            .forEach(fileName => {
                const fileStat = fssync.statSync(path.format({
                    dir: this.assetDir,
                    base: fileName,
                }));
                const asset = Asset.fromFile(fileName, fileStat);
                this.logger.debug(`Loaded asset ${asset.getDisplayName()}`);
                libAssets[asset.getUUID()] = asset;
            });
        return libAssets;
    }

    private async loadAlbums(): Promise<LibraryAlbums> {
        // Loading folders
        const libAlbums: LibraryAlbums = {};
        (await this.loadAlbum(Album.getRootAlbum(this.photoDataDir)))
            .forEach(album => {
                libAlbums[album.getUUID()] = album;
            });
        return libAlbums;
    }

    /**
     * Loads the content of a given album from disc
     * @param album - The album that needs to be loaded, containing a filepath
     * @returns An array of loaded albums, including the provided one and all its child items
     */
    async loadAlbum(album: Album): Promise<Album[]> {
        const albums: Album[] = [];

        // Ignoring dummy album
        if (album.getUUID().length > 0) {
            albums.push(album);
        } 

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
                // Ignoring assets on archived folders
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

    isEmpty(): boolean {
        return this.getAlbumCount() === 0 && this.getAssetCount() === 0;
    }

    getAlbumCount(): number {
        return Object.keys(this.lib.albums).length;
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
    async diffLibraryData(cplAssets: CPLAsset[], cplMasters: CPLMaster[]): Promise<ProcessingDataQueue> {
        // List all files in fs using name instead of currentLibraryRecords
        // fssync.readdirSync()
        this.logger.debug(`Diffing library data with remote data`);

        // 'loading' local library
        const toBeDeleted: Asset[] = [];
        const toBeAdded: Asset[] = [];

        const remoteAssets = cplArray2Assets(cplAssets, cplMasters);

        remoteAssets.forEach(remoteAsset => {
            const localAsset = this.lib.assets[remoteAsset.getUUID()];
            const assetDiff = Asset.getAssetDiff(localAsset, remoteAsset);
            if (!assetDiff[0] && !assetDiff[1]) {
                // Local asset matches remote asset, therefore no diff
                delete this.lib.assets[remoteAsset.getUUID()];
            } else {
                if (assetDiff[0]) { // Needs to be deleted
                    this.logger.debug(`Deleting asset ${assetDiff[0].getUUID()}`);
                    toBeDeleted.push(assetDiff[0]);
                    delete this.lib.assets[assetDiff[0].getUUID()];
                }

                if (assetDiff[1]) { // Needs to be added
                    this.logger.debug(`Adding asset ${assetDiff[1].getUUID()}`);
                    toBeAdded.push(assetDiff[1]);
                }
            }
        });

        // The original library should only hold those records, that have not been referenced by the remote state, removing them
        Object.values(this.lib.assets).forEach(staleAsset => {
            this.logger.debug(`Found stale asset ${staleAsset.getUUID()}`);
            toBeDeleted.push(staleAsset);
        });

        return [toBeDeleted, toBeAdded];
    }

    async diffLibraryStructure(cplAlbums: CPLAlbum[]): Promise<ProcessingAlbumQueue> {
        this.logger.info(`Diffing library structure!`);
        // Match albums & diff
        // Go to current root album
        // List content
        // Filter cplAlbums by parentId ===
        const albums: Album[] = [];

        // Saving updated state and queue
        // this.lib.albums = albums;
        return [undefined, undefined, albums];
    }
}