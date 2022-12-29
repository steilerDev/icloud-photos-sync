import * as path from 'path';
import * as PHOTOS_LIBRARY from './constants.js';
import {Album, AlbumType} from './model/album.js';
import fs from 'fs';
import {Asset} from './model/asset.js';
import {PLibraryEntities} from './model/photos-entity.js';
import {getLogger} from '../logger.js';
import {AxiosResponse} from 'axios';
import {pEvent} from 'p-event';
import {iCloudApp} from '../../app/icloud-app.js';
import { LibraryError } from '../../app/error/types.js';
import EventEmitter from 'events';
import { HANDLER_EVENT } from '../../app/error/handler.js';

export type PathTuple = [namePath: string, uuidPath: string]

/**
 * This class holds the local data structure
 */
export class PhotosLibrary extends EventEmitter {
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
     * The full path to the sub-dir within 'archiveDir', containing temporarily stashed albums
     */
    stashDir: string;

    /**
     * Creates the local PhotoLibrary, based on the provided CLI options
     * @param app - The app object holding CLI options
     */
    constructor(app: iCloudApp) {
        super()
        this.photoDataDir = this.getFullPathAndCreate([app.options.dataDir]);
        this.assetDir = this.getFullPathAndCreate([PHOTOS_LIBRARY.ASSET_DIR]);
        this.archiveDir = this.getFullPathAndCreate([PHOTOS_LIBRARY.ARCHIVE_DIR]);
        this.stashDir = this.getFullPathAndCreate([PHOTOS_LIBRARY.ARCHIVE_DIR, PHOTOS_LIBRARY.STASH_DIR]);
    }

    /**
     * Joins the subpaths & photosDataDir together (if photosDataDir is set) and creates the folder if it does not exist
     * @param subpaths - An array of subpaths
     * @returns The full path
     */
    getFullPathAndCreate(subpaths: string[]) {
        const thisDir = this.photoDataDir ? path.join(this.photoDataDir, ...subpaths) : path.join(...subpaths);
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
                    this.emit(HANDLER_EVENT, new LibraryError(`Ignoring invalid file: ${fileName}`, "WARN").addCause(err));
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
        (await this.loadAlbum(Album.getRootAlbum(), this.photoDataDir))
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
    async loadAlbum(album: Album, albumPath: string): Promise<Album[]> {
        // If we are loading an archived folder, we can ignore the content and add it to the queue
        if (album.albumType === AlbumType.ARCHIVED) {
            return [album];
        }

        const albums: Album[] = [];

        // Not adding dummy album
        if (album.getUUID().length > 0 && album.getUUID() !== PHOTOS_LIBRARY.STASH_DIR) {
            albums.push(album);
        }

        this.logger.info(`Loading album ${album.getDisplayName()}`);

        const symbolicLinks = (await fs.promises.readdir(albumPath, {
            "withFileTypes": true,
        })).filter(file => file.isSymbolicLink());

        this.logger.debug(`Found ${symbolicLinks.length} symbolic links in ${album.getDisplayName()}`);

        for (const link of symbolicLinks) {
            // The target's basename contains the UUID
            const target = await fs.promises.readlink(path.join(albumPath, link.name));

            if (album.albumType === AlbumType.FOLDER) {
                const [loadedAlbum, fullPath] = await this.readFolderFromDisk(link.name, albumPath, album.getUUID());
                albums.push(...await this.loadAlbum(loadedAlbum, fullPath));
            } else if (album.albumType === AlbumType.ALBUM) {
                const uuidFile = path.parse(target).base;
                albums[0].assets[uuidFile] = link.name;
            }
        }

        return albums;
    }

    /**
     * Creates a shallow album, by reading the basic information from disk
     * @param folderName - The foldername that will link to the uuid
     * @param parentFolderPath - The path of the parent's folder
     * @param parentUUID - The parent Album UUID
     * @returns The shallow Album and its path
     */
    async readFolderFromDisk(folderName: string, parentFolderPath: string, parentUUID: string): Promise<[Album, string]> {
        const uuidFolderName = await fs.promises.readlink(path.join(parentFolderPath, folderName));
        const uuid = path.basename(uuidFolderName).substring(1); // Removing leading '.'
        const fullPath = path.join(parentFolderPath, uuidFolderName);
        const folderType = await this.readAlbumTypeFromPath(fullPath);
        const loadedAlbum = new Album(uuid, folderType, folderName, parentUUID);
        return [loadedAlbum, fullPath];
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
                this.emit(HANDLER_EVENT, new LibraryError(`Extranous file found in folder ${path}`, "WARN"));
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
                    throw new LibraryError(`Unable to verify asset ${asset.getDisplayName()}`, "FATAL")
                        .addContext('asset', asset);
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
     * Finds the absolut paths of the folder pair for a given album
     * The path is created, by finding the parent on filesystem. The folder paths do not necessarily exist, the parent path needs to exist.
     * @param album - The album
     * @returns A tuple containing the albumNamePath, uuidPath
     * @throws An error, if the parent path cannot be found
     */
    findAlbumPaths(album: Album): PathTuple {
        // Directory path of the parent folder
        let parentPath = this.photoDataDir;
        if (album.parentAlbumUUID) {
            const parentPathExt = this.findAlbumByUUIDInPath(album.parentAlbumUUID, this.photoDataDir);
            if (parentPathExt.length === 0) {
                throw new LibraryError(`Unable to find parent of album ${album.getDisplayName()}`, "FATAL")
                    .addContext('album', album)
            }

            parentPath = path.join(parentPath, parentPathExt);
        }

        // LinkedAlbum will be the visible album, with the correct name
        const albumNamePath = path.join(parentPath, album.getSanitizedFilename());
        // AlbumPath will be the actual directory, having the UUID as foldername
        const uuidPath = path.join(parentPath, `.${album.getUUID()}`);
        return [albumNamePath, uuidPath];
    }

    /**
     * Creates a path tuple containing the full path to the stashed album
     * @param album - The album within the stash
     * @returns A PathTuple containing the name based and UUID based path (not validated)
     */
    findStashAlbumPaths(album: Album): PathTuple {
        const stashedAlbumNamePath = path.join(this.stashDir, path.basename(album.getSanitizedFilename()));
        const stashedUUIDPath = path.join(this.stashDir, path.basename(`.${album.getUUID()}`));
        return [stashedAlbumNamePath, stashedUUIDPath];
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
            throw new LibraryError(`Unable to find album ${albumUUID} in path ${rootPath}: Multiple matches`, "FATAL")
                .addContext('searchResult', searchResult);
        }

        // No match in this folder hierachy
        return ``;
    }

    /**
     * Writes a given album to disk & links the necessary assets
     * @param album - The album to be written to disk
     */
    writeAlbum(album: Album) {
        const [albumNamePath, uuidPath] = this.findAlbumPaths(album);

        if (fs.existsSync(uuidPath) || fs.existsSync(albumNamePath)) {
            throw new LibraryError(`Unable to create album ${album.getDisplayName()}: ${uuidPath} or ${albumNamePath} already exists!`, "FATAL");
        }

        // Creating album
        this.logger.debug(`Creating folder ${uuidPath}`);
        fs.mkdirSync(uuidPath, {"recursive": true});
        // Symlinking to correctly named album
        this.logger.debug(`Linking ${albumNamePath} to ${path.basename(uuidPath)}`);
        fs.symlinkSync(path.basename(uuidPath), albumNamePath);

        if (album.albumType === AlbumType.ALBUM) {
            this.linkAlbumAssets(album, uuidPath);
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
                this.emit(HANDLER_EVENT, new LibraryError(`Not linking ${relativeAssetPath} to ${linkedAsset} in album ${album.getDisplayName()}`, "WARN").addCause(err))
            }
        });
    }

    /**
     * Deletes the given album. The folder will only be deleted, if it contains no 'real' files
     * @param album - The album that needs to be removed
     */
    deleteAlbum(album: Album) {
        this.logger.debug(`Deleting folder ${album.getDisplayName()}`);
        const [albumNamePath, uuidPath] = this.findAlbumPaths(album);
        // Path to album
        if (!fs.existsSync(uuidPath)) {
            throw new LibraryError(`Unable to find uuid path, expected ${uuidPath}`, "FATAL");
        }

        // Checking content
        const pathContent = fs.readdirSync(uuidPath, {"withFileTypes": true})
            .filter(item => !(item.isSymbolicLink() || PHOTOS_LIBRARY.SAFE_FILES.includes(item.name))); // Filter out symbolic links, we are fine with deleting those as well as the 'safe' files
        if (pathContent.length > 0) {
            throw new LibraryError(`Album in path ${uuidPath} not empty`, "FATAL")
                .addContext('pathContent', pathContent);
        }

        // Path to real name folder
        if (!fs.existsSync(albumNamePath)) {
            throw new LibraryError(`Unable to find albumName path, expcted ${albumNamePath}`, "FATAL");
        }

        fs.rmSync(uuidPath, {"recursive": true});
        fs.unlinkSync(albumNamePath);
        this.logger.debug(`Sucesfully deleted album ${album.getDisplayName()} at ${albumNamePath} & ${uuidPath}`);
    }

    /**
     * Stashes an archived album in case it was deleted/moved in the remote library
     * @param album - The album that needs to be stashed
     */
    stashArchivedAlbum(album: Album) {
        this.logger.debug(`Stashing album ${album.getDisplayName()}`);
        this.movePathTuple(
            this.findAlbumPaths(album),
            this.findStashAlbumPaths(album),
        );
    }

    /**
     * Tries to retrieve a previously stashed archived album
     * @param album - The album that needs to be retrieved
     */
    retrieveStashedAlbum(album: Album) {
        this.logger.debug(`Retrieving stashed album ${album.getDisplayName()}`);
        this.movePathTuple(
            this.findStashAlbumPaths(album),
            this.findAlbumPaths(album),
        );
    }

    /**
     * Moves & re-links the path tuple
     * @param src - The source of folders
     * @param dest - The destination of folders
     */
    movePathTuple(src: PathTuple, dest: PathTuple) {
        const [srcNamePath, srcUUIDPath] = src;
        const [destNamePath, destUUIDPath] = dest;

        if (!fs.existsSync(srcNamePath)) {
            throw new LibraryError(`Unable to find source album name path, expected ${srcNamePath}`, "FATAL");
        }

        if (!fs.existsSync(srcUUIDPath)) {
            throw new LibraryError(`Unable to find source uuid path, expected ${srcUUIDPath}`, "FATAL");
        }

        if (fs.existsSync(destNamePath)) {
            throw new LibraryError(`Supposed destination path already exists: ${destNamePath}`, "FATAL");
        }

        if (fs.existsSync(destUUIDPath)) {
            throw new LibraryError(`Supposed destination uuid path already exists: ${destUUIDPath}`, "FATAL");
        }

        this.logger.debug(`Moving ${srcUUIDPath} to ${destUUIDPath}`);
        fs.renameSync(srcUUIDPath, destUUIDPath);
        this.logger.debug(`Unlinking ${srcNamePath} and re-linking ${destNamePath}`);
        fs.unlinkSync(srcNamePath);
        fs.symlinkSync(path.basename(destUUIDPath), destNamePath);
    }

    /**
     * This function will look for orphaned albums and remove the unecessary UUID links to make them more manageable
     */
    async cleanArchivedOrphans() {
        this.logger.debug(`Cleaning archived orphans`);
        const archivedOphans = await this.loadAlbum(Album.getStashAlbum(), this.stashDir);
        for (const album of archivedOphans) {
            this.logger.debug(`Found orphaned album ${album}`);
            const [namePath, uuidPath] = this.findStashAlbumPaths(album);
            let targetPath: string;
            let index = 0;
            do {
                const basename = index === 0 ? path.basename(namePath) : `${path.basename(namePath)}-${index}`;
                index++;
                targetPath = path.join(this.archiveDir, basename);
            } while (fs.existsSync(targetPath));

            this.logger.debug(`Moving ${uuidPath} to ${targetPath}, unlinking ${namePath}`);
            fs.renameSync(uuidPath, targetPath);
            fs.unlinkSync(namePath);
        }
    }
}