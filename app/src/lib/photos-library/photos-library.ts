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
     * The full path to the sub-dir within 'photoDataDir', containing all archived folders, who have been deleted on the backend
     */
    archiveDir: string;

    /**
     * Creates the local PhotoLibrary, based on the provided CLI options
     * @param cliOpts - The read CLI options
     */
    constructor(cliOpts: OptionValues) {
        this.photoDataDir = this.getFullPathAndCreate(cliOpts.dataDir);
        this.assetDir = this.getFullPathAndCreate(PHOTOS_LIBRARY.ASSET_DIR);
        this.archiveDir = this.getFullPathAndCreate(PHOTOS_LIBRARY.ARCHIVE_DIR);
    }

    getFullPathAndCreate(subpath: string) {
        const thisDir = this.photoDataDir ? path.join(this.photoDataDir, subpath) : subpath;
        if (!fs.existsSync(thisDir)) {
            this.logger.debug(`${thisDir} does not exist, creating`);
            fs.mkdirSync(thisDir, {"recursive": true});
        }

        return thisDir;
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
                        "dir": this.assetDir,
                        "base": fileName,
                    }));
                    const asset = Asset.fromFile(fileName, fileStat);
                    libAssets[asset.getUUID()] = asset;
                    this.logger.debug(`Loaded asset ${asset.getDisplayName()}`);
                } catch (err) {
                    this.logger.warn(`Ignoring invalid file: ${fileName} (${err.message})`);
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
        // If we are loading an archived folder, we can ignore the content and add it to the queue
        if (album.albumType === AlbumType.ARCHIVED) {
            return [album];
        }

        const albums: Album[] = [];

        // Not adding dummy album
        if (album.getUUID().length > 0) {
            albums.push(album);
        }

        this.logger.info(`Loading album ${album.getDisplayName()}`);

        const symbolicLinks = (await fs.promises.readdir(album.albumPath, {
            "withFileTypes": true,
        })).filter(file => file.isSymbolicLink());

        this.logger.debug(`Found ${symbolicLinks.length} symbolic links in ${album.getDisplayName()}`);

        for (const link of symbolicLinks) {
            // The target's basename contains the UUID
            const target = await fs.promises.readlink(path.join(album.albumPath, link.name));

            if (album.albumType === AlbumType.FOLDER) {
                const uuid = path.basename(target).substring(1); // Removing leading '.'
                const fullPath = path.join(album.albumPath, target);
                const folderType = await this.readAlbumTypeFromPath(fullPath);
                const folderName = link.name;
                const parentFolderUUID = album.getUUID();

                const loadedAlbum = new Album(uuid, folderType, folderName, parentFolderUUID, fullPath);
                albums.push(...await this.loadAlbum(loadedAlbum));
            } else if (album.albumType === AlbumType.ALBUM) {
                const uuidFile = path.parse(target).base;
                albums[0].assets[uuidFile] = link.name;
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
            "withFileTypes": true,
        })).some(file => file.isDirectory());

        // If there are files in the folders, the folder is treated as archived
        const filePresent = (await fs.promises.readdir(path, {
            "withFileTypes": true,
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

    /**
     * Writes the contents of the Axios response (as stream) to the filesystem, based on the associated Asset
     * @param asset - The asset associated to the request
     * @param response - The response -as a stream- containing the data of the asset
     * @returns A promise, that resolves once this asset was written to disk and verified
     */
    async writeAsset(asset: Asset, response: AxiosResponse<any, any>): Promise<void> {
        this.logger.debug(`Writing asset ${asset.getDisplayName()}`);
        const location = asset.getAssetFilePath(this.assetDir);
        const writeStream = fs.createWriteStream(location);
        response.data.pipe(writeStream);
        return pEvent(writeStream, `close`)
            .then(() => fs.promises.utimes(asset.getAssetFilePath(this.assetDir), new Date(asset.modified), new Date(asset.modified))) // Setting modified date on file
            .then(() => {
                if (!this.verifyAsset(asset)) {
                    throw new Error(`Unable to verify asset ${asset.getDisplayName()}`);
                }

                this.logger.debug(`Asset ${asset.getDisplayName()} sucesfully downloaded`);
            });
    }

    /**
     * Deletes the specified asset from disk
     * @param asset - The asset that needs to be removed
     * @returns A promise, that resolves once the asset was deleted from disk
     */
    async deleteAsset(asset: Asset): Promise<void> {
        this.logger.info(`Deleting asset ${asset.getDisplayName()}`);
        return fs.promises.rm(asset.getAssetFilePath(this.assetDir), {"force": true});
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
            && asset.verify(fs.readFileSync(location), fs.statSync(location));
    }

    /**
     * Finds the full path of the parent of a given albumj
     * @param album - The album
     * @returns The full path to the parent album
     * @throws An error if the folder could not be found
     */
    findParentPath(album: Album): string {
        if (!album.parentAlbumUUID) {
            return this.photoDataDir;
        }

        return this.findAlbumByUUID(album.parentAlbumUUID);
    }

    /**
     * Finds a given album within the photosDataDir
     * @param album - The album
     * @returns The full path to the album
     * @throws An error if the folder could not be found
     */
    findAlbum(album: Album): string {
        return this.findAlbumByUUID(album.getUUID());
    }

    /**
     * Finds a given album within the photoDataDir
     * @param albumUUID - The UUID of the album
     * @returns The full path to the album
     * @throws An error if the folder could not be found
     */
    findAlbumByUUID(albumUUID: string): string {
        const relativeFolderPath = this.findAlbumByUUIDInPath(albumUUID, this.photoDataDir);
        if (relativeFolderPath.length === 0) {
            throw new Error(`Unable to find album ${albumUUID}`);
        }

        return path.join(this.photoDataDir, relativeFolderPath);
    }

    /**
     * Finds a given album in a given path (as long as it is within the directory tree)
     * @param albumUUID - The UUID of the album
     * @param rootPath  - The path in which the album should be searched
     * @returns The path to the album, relative to the provided path, or the empty string if the album could not be found, or the full path including photoDataDir, if _rootPath was undefined
     */
    findAlbumByUUIDInPath(albumUUID: string, rootPath: string): string {
        this.logger.trace(`Checking ${rootPath} for folder ${albumUUID}`);
        // Get all folders in the path
        const foldersInPath = fs.readdirSync(rootPath, {"withFileTypes": true}).filter(dirent => dirent.isDirectory());

        // See if the searched folder is in the path
        const filteredFolder = foldersInPath.filter(folder => folder.name === `.${albumUUID}`); // Since the folder is hidden, a dot is prefacing it
        if (filteredFolder.length === 1) {
            return filteredFolder[0].name;
        }
        // No luck in the current folder. Looking in all child folders

        // This will contain either empty strings or the path to the searched album
        const searchResult = foldersInPath.map(folder => {
            // Look into each folder and see if the album can be found there
            const result = this.findAlbumByUUIDInPath(albumUUID, path.join(rootPath, folder.name));
            if (result !== ``) { // We've got a match and it should have returned
                return path.join(folder.name, result);
            }

            // No luck in this directory tree
            return ``;
        }).filter(result => result !== ``); // Removing non-matches

        if (searchResult.length === 1) {
            this.logger.debug(`Found folder ${albumUUID} in ${rootPath}`);
            return searchResult[0];
        }

        if (searchResult.length > 1) {
            throw new Error(`Unable to find album ${albumUUID} in path ${rootPath}: Multiple matches: ${JSON.stringify(searchResult)}`);
        }

        // No match in this folder hierachy
        return ``;
    }

    /**
     * Writes a given album to disk & links the necessary assets
     * @param album - The album to be written to disk
     */
    writeAlbum(album: Album) {
        // Directory path of the parent folder
        const parentPath = this.findParentPath(album);
        // LinkedAlbum will be the visible album, with the correct name
        const linkedAlbum = path.join(parentPath, album.getSanitizedFilename());
        // AlbumPath will be the actual directory, having the UUID as foldername
        const albumPath = path.join(parentPath, `.${album.getUUID()}`);
        // Relative album path is relative to parent, not linkedAlbum
        const relativeAlbumPath = path.relative(parentPath, albumPath);

        if (fs.existsSync(linkedAlbum) || fs.existsSync(albumPath)) {
            throw new Error(`Unable to create album ${album.getDisplayName()}: ${linkedAlbum} or ${albumPath} already exists!`);
        }

        // Creating album
        this.logger.debug(`Creating folder ${albumPath}`);
        fs.mkdirSync(albumPath, {"recursive": true});
        // Symlinking to correctly named album
        this.logger.debug(`Linking ${relativeAlbumPath} to ${linkedAlbum}`);
        fs.symlinkSync(relativeAlbumPath, linkedAlbum);

        if (album.albumType === AlbumType.ALBUM) {
            this.linkAlbumAssets(album, albumPath);
        }
    }

    /**
     * Links the assets for the given album
     * @param album - Album holding information about the linked assets
     * @param albumPath - Album path to link assets to
     */
    linkAlbumAssets(album: Album, albumPath: string) {
        Object.keys(album.assets).forEach(assetUUID => {
            const linkedAsset = path.format({
                "dir": albumPath,
                "base": album.assets[assetUUID],
            });
            const assetPath = path.format({
                "dir": this.assetDir,
                "base": assetUUID,
            });
            // Getting asset time, in order to update link as well
            const assetTime = fs.statSync(assetPath).mtime;
            // Relative asset path is relativ to album, not the linkedAsset
            const relativeAssetPath = path.relative(albumPath, assetPath);
            this.logger.debug(`Linking ${relativeAssetPath} to ${linkedAsset}`);
            try {
                fs.symlinkSync(relativeAssetPath, linkedAsset);
                fs.lutimesSync(linkedAsset, assetTime, assetTime);
            } catch (err) {
                this.logger.warn(`Not linking ${relativeAssetPath} to ${linkedAsset} in album ${album.getDisplayName()}: ${err.message}`);
            }
        });
    }

    /**
     * Deletes the given album. The folder will only be deleted, if it contains no 'real' files
     * @param album - The album that needs to be removed
     */
    deleteAlbum(album: Album) {
        // If albumType == Archived -> Move folder to archived folder
        this.logger.debug(`Deleting folder ${album.getDisplayName()}`);
        // Path to album
        const albumPath = this.findAlbum(album);
        // Path to linked album
        const linkedPath = path.normalize(path.join(albumPath, `..`, album.getSanitizedFilename())); // The linked folder is one layer below
        const pathContent = fs.readdirSync(albumPath, {"withFileTypes": true})
            .filter(item => !(item.isSymbolicLink() || PHOTOS_LIBRARY.SAFE_FILES.includes(item.name))); // Filter out symbolic links, we are fine with deleting those as well as the 'safe' files

        if (pathContent.length > 0) {
            throw new Error(`Album in path ${albumPath} not empty (${JSON.stringify(pathContent.map(item => item.name))})`);
        }

        if (!fs.existsSync(linkedPath)) {
            throw new Error(`Unable to find linked path, expected ${linkedPath}`);
        }

        fs.rmSync(albumPath, {"recursive": true});
        fs.unlinkSync(linkedPath);
        this.logger.debug(`Sucesfully deleted album ${album.getDisplayName()} at ${albumPath} & ${linkedPath}`);
    }

    /**
     * Stashes an archived album in case it was deleted/moved in the remote library
     * @param album - The album that needs to be stashed
     */
    stashArchivedAlbum(album: Album) {

    }

    /**
     * Tries to retrieve a previously stashed archived album
     * @param album - The album that needs to be retrieved
     */
    retrieveArchivedAlbum(album: Album) {

    }
}