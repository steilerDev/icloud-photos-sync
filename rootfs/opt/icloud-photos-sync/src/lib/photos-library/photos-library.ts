import * as path from 'path';
import * as PHOTOS_LIBRARY from './constants.js';
import {Album, AlbumType} from './model/album.js';
import fs from 'fs';
import {OptionValues} from 'commander';
import {Asset} from './model/asset.js';
import {PLibraryEntities} from './model/photos-entity.js';
import {getLogger} from '../logger.js';
import {AxiosResponse} from 'axios';
import {pEvent} from 'p-event';

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
        if (!fs.existsSync(this.photoDataDir)) {
            this.logger.debug(`${this.photoDataDir} does not exist, creating`);
            fs.mkdirSync(this.photoDataDir, {recursive: true});
        }

        this.assetDir = path.join(this.photoDataDir, PHOTOS_LIBRARY.ASSET_DIR);
        if (!fs.existsSync(this.assetDir)) {
            this.logger.debug(`${this.assetDir} does not exist, creating`);
            fs.mkdirSync(this.assetDir, {recursive: true});
        }
    }

    /**
     * Loads all assets from disk
     * @returns A structured list of assets, as they are currently present on disk
     */
    async loadAssets(): Promise<PLibraryEntities<Asset>> {
        const libAssets: PLibraryEntities<Asset> = {};
        (await fs.promises.readdir(this.assetDir))
            .forEach(fileName => {
                try {
                    const fileStat = fs.statSync(path.format({
                        dir: this.assetDir,
                        base: fileName,
                    }));
                    const asset = Asset.fromFile(fileName, fileStat);
                    libAssets[asset.getUUID()] = asset;
                    this.logger.debug(`Loaded asset ${asset.getDisplayName()}`);
                } catch(err) {
                    this.logger.warn(`Ignoring invalid file: ${fileName} (${err.message})`)
                }
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

        const symbolicLinks = (await fs.promises.readdir(album.albumPath, {
            withFileTypes: true,
        })).filter(file => file.isSymbolicLink());

        this.logger.debug(`Found ${symbolicLinks.length} symbolic links in ${album.getDisplayName()}`);

        for (const link of symbolicLinks) {
            // The target's basename contains the UUID
            const target = await fs.promises.readlink(path.join(album.albumPath, link.name));

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
        const directoryPresent = (await fs.promises.readdir(path, {
            withFileTypes: true,
        })).some(file => file.isDirectory());

        // If there are files in the folders, the folder is treated as archived
        const filePresent = (await fs.promises.readdir(path, {
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

    async writeAsset(asset: Asset, response: AxiosResponse<any, any>): Promise<void> {
        this.logger.debug(`Writing asset ${asset.getDisplayName()}`);
        const location = asset.getAssetFilePath(this.assetDir);
        const writeStream = fs.createWriteStream(location);
        response.data.pipe(writeStream);
        return pEvent(writeStream, `close`)
            .then(() => fs.promises.utimes(asset.getAssetFilePath(this.assetDir), asset.modified, asset.modified)) // Setting modified date on file
            .then(() => {
                if (!this.verifyAsset(asset)) {
                    throw new Error(`Unable to verify asset ${asset.getDisplayName()}`);
                }

                this.logger.debug(`Asset ${asset.getDisplayName()} sucesfully downloaded`);
            });
    }

    async deleteAsset(asset: Asset): Promise<void> {
        this.logger.info(`Deleting asset ${asset.getDisplayName()}`);
        return fs.promises.rm(asset.getAssetFilePath(this.assetDir), {force: true});
    }

    /**
     * Verifies if a given Asset object is present on disk
     * @param asset - The asset to verify
     * @returns True, if the Asset object is present on disk
     */
    verifyAsset(asset: Asset): boolean {
        this.logger.debug(`Verifying asset ${asset.getDisplayName()}`);
        const location = asset.getAssetFilePath(this.assetDir);
        return fs.existsSync(location)
            && asset.verify(fs.readFileSync(location));
    }
}