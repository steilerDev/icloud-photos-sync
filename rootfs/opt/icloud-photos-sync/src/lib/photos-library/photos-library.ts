import * as path from 'path';
import * as PHOTOS_LIBRARY from './constants.js';
import {Album, AlbumType} from './model/album.js';
import * as fs from 'fs/promises';
import * as fssync from 'fs';
import {OptionValues} from 'commander';
import {Asset} from './model/asset.js';
import {PLibraryEntities} from './model/photos-entity.js';
import {getLogger} from '../logger.js';

/**
 * This class holds the local data structure
 */
export class PhotosLibrary {
    /**
     * Default logger for the class
     */
    private logger = getLogger(this);

    /**
     * The full path to the data dir, where all information & data is persisted
     */
    photoDataDir: string;

    /**
     * The full path to the sub-dir within 'photoDataDir', containing all assets
     */
    assetDir: string;

    /**
     * Creates the local PhotoLibrary, based on the provided CLI options
     * @param cliOpts - The read CLI options
     */
    constructor(cliOpts: OptionValues) {
        this.photoDataDir = cliOpts.dataDir;
        if (!fssync.existsSync(this.photoDataDir)) {
            this.logger.debug(`${this.photoDataDir} does not exist, creating`);
            fssync.mkdirSync(this.photoDataDir);
        }

        this.assetDir = path.join(this.photoDataDir, PHOTOS_LIBRARY.ASSET_DIR);
        if (!fssync.existsSync(this.assetDir)) {
            this.logger.debug(`${this.assetDir} does not exist, creating`);
            fssync.mkdirSync(this.assetDir);
        }
    }

    /**
     * Loads all assets from disk
     * @returns A structured list of assets, as they are currently present on disk
     */
    async loadAssets(): Promise<PLibraryEntities<Asset>> {
        const libAssets: PLibraryEntities<Asset> = {};
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

    /**
     * Recursively loads all albums from disk
     * @returns A structured list of albums, as they are currently present on disk
     */
    async loadAlbums(): Promise<PLibraryEntities<Album>> {
        // Loading folders
        const libAlbums: PLibraryEntities<Album> = {};
        (await this.loadAlbum(Album.getRootAlbum(this.photoDataDir)))
            .forEach(album => {
                libAlbums[album.getUUID()] = album;
            });
        return libAlbums;
    }

    /**
     * Loads the content of a given album from disc (and recursively does that for all child items)
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

                if (folderType === AlbumType.ARCHIVED) {
                    this.logger.warn(`Ignoring archived folder ${uuid}`);
                } else {
                    const loadedAlbum = new Album(uuid, folderType, link.name, album.getUUID(), fullPath);
                    albums.push(...await this.loadAlbum(loadedAlbum));
                }
            } else if (album.albumType === AlbumType.ALBUM) {
                const uuidFile = path.parse(target).base;
                albums[0].assets[uuidFile] = link.name;
            } else if (album.albumType === AlbumType.ARCHIVED) {
                this.logger.info(`Treating ${album.albumType} as archived`);
                // Ignoring assets on archived folders
            }
        }

        return albums;
    }

    /**
     * Derives the album type of a given folder, based on its content
     * @param path - The path to the folder on disk
     * @returns The album type of the folder
     */
    async readAlbumTypeFromPath(path: string): Promise<AlbumType> {
        // If the folder contains other folders, it will be of AlbumType.Folder
        const directoryPresent = (await fs.readdir(path, {
            withFileTypes: true,
        })).some(file => file.isDirectory());

        // If there are files in the folders, the folder is treated as archived
        const filePresent = (await fs.readdir(path, {
            withFileTypes: true,
        })).filter(file => !PHOTOS_LIBRARY.SAFE_FILES.includes(file.name)) // Filter out files that are safe to ignore
            .some(file => file.isFile());

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
}