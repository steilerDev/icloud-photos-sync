import * as path from 'path';
import * as PHOTOS_LIBRARY from './constants.js';
import {Album, AlbumType} from './model/album.js';
import fs from 'fs';
import {Asset} from './model/asset.js';
import {PLibraryEntities} from './model/photos-entity.js';
import {iCPSError} from '../../app/error/error.js';
import {LIBRARY_ERR} from '../../app/error/error-codes.js';
import {Zones} from '../icloud/icloud-photos/query-builder.js';
import {Resources} from '../resources/main.js';
import {iCPSEventRuntimeWarning} from '../resources/events-types.js';

type PathTuple = [namePath: string, uuidPath: string]

/**
 * This class holds the local data structure
 */
export class PhotosLibrary {
    /**
     * The full path to the sub-dir within 'photoDataDir', containing all assets from the primary library
     */
    primaryAssetDir: string;

    /**
     * The full path to the sub-dir within 'photoDataDir', containing all assets from the shared library
     */
    sharedAssetDir: string;

    /**
     * The full path to the sub-dir within 'photoDataDir', containing all archived folders, who have been deleted on the backend
     */
    archiveDir: string;

    /**
     * The full path to the sub-dir within 'archiveDir', containing temporarily stashed albums
     */
    stashDir: string;

    /**
     * Creates the local PhotoLibrary
     * @throws An iCPSError if the library version does not match
     */
    constructor() {
        if (Resources.manager().libraryVersion !== PHOTOS_LIBRARY.LIBRARY_VERSION) {
            throw new iCPSError(LIBRARY_ERR.VERSION_MISMATCH)
                .addMessage(`The library version of the local library (${Resources.manager().libraryVersion}) does not match the expected version (${PHOTOS_LIBRARY.LIBRARY_VERSION})`);
        }

        this.primaryAssetDir = this.getFullPathAndCreate([PHOTOS_LIBRARY.PRIMARY_ASSET_DIR]);
        this.sharedAssetDir = this.getFullPathAndCreate([PHOTOS_LIBRARY.SHARED_ASSET_DIR]);
        this.archiveDir = this.getFullPathAndCreate([PHOTOS_LIBRARY.ARCHIVE_DIR]);
        this.stashDir = this.getFullPathAndCreate([PHOTOS_LIBRARY.ARCHIVE_DIR, PHOTOS_LIBRARY.STASH_DIR]);
    }

    /**
     * Joins the subpaths & photosDataDir together and creates the folder recursively if it does not exist
     * @param subpaths - An array of subpaths
     * @returns The full path
     */
    getFullPathAndCreate(subpaths: string[]): string {
        const thisDir = path.join(Resources.manager().dataDir, ...subpaths);
        if (!fs.existsSync(thisDir)) {
            Resources.logger(this).debug(`${thisDir} does not exist, creating`);
            fs.mkdirSync(thisDir, {recursive: true});
        }

        return thisDir;
    }

    /**
     * Loads all assets from disk
     * @returns A structured list of assets, as they are currently present on disk
     */
    async loadAssets(): Promise<PLibraryEntities<Asset>> {
        return {
            ...await this.loadAssetsForZone(Zones.Primary),
            ...await this.loadAssetsForZone(Zones.Shared),
        };
    }

    /**
     * Loads all assets from disk for a given zone
     * @param zone - Either 'primary' or 'shared'
     * @returns A structured list of assets, as they are currently present on disk
     * @emits iCPSEventRuntimeWarning.FILETYPE_ERROR - If a file with an unknown extension is found
     * @emits iCPSEventRuntimeWarning.LIBRARY_LOAD_ERROR - If any other error occurs while loading an asset
     */
    async loadAssetsForZone(zone: Zones): Promise<PLibraryEntities<Asset>> {
        const libAssets: PLibraryEntities<Asset> = {};
        const zonePath = zone === Zones.Primary ? this.primaryAssetDir : this.sharedAssetDir;
        (await fs.promises.readdir(zonePath, {withFileTypes: true}))
            .filter(file => file.isFile())
            .filter(file => PHOTOS_LIBRARY.SAFE_FILES.every(regex => !regex.test(file.name)))
            .forEach(file => {
                const filePath = path.format({
                    dir: zonePath,
                    base: file.name,
                });
                try {
                    const fileStat = fs.statSync(filePath);
                    const asset = Asset.fromFile(file.name, fileStat, zone);
                    libAssets[asset.getUUID()] = asset;
                    Resources.logger(this).debug(`Loaded asset ${asset.getDisplayName()}`);
                } catch (err) {
                    if (err instanceof iCPSError && err.code === LIBRARY_ERR.UNKNOWN_FILETYPE_EXTENSION.code) {
                        Resources.emit(iCPSEventRuntimeWarning.FILETYPE_ERROR, (err.context as any).extension);
                    }

                    Resources.emit(iCPSEventRuntimeWarning.LIBRARY_LOAD_ERROR, err, filePath);
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
        (await this.loadAlbum(Album.getRootAlbum(), Resources.manager().dataDir))
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

        Resources.logger(this).info(`Loading album ${album.getDisplayName()}`);

        const symbolicLinks = (await fs.promises.readdir(albumPath, {
            withFileTypes: true,
        })).filter(file => file.isSymbolicLink());

        Resources.logger(this).debug(`Found ${symbolicLinks.length} symbolic links in ${album.getDisplayName()}`);

        for (const link of symbolicLinks) {
            // If we are loading a folder, we need to iterate over it's contents UUIDs
            if (album.albumType === AlbumType.FOLDER) {
                let loadedAlbum: Album;
                let fullPath: string;
                try {
                    [loadedAlbum, fullPath] = await this.readFolderFromDisk(link.name, albumPath, album.getUUID());
                    albums.push(...await this.loadAlbum(loadedAlbum, fullPath));
                } catch (err) {
                    // This error might be caused by a dead symlink, let's check
                    await this.removeDeadSymlink(path.join(albumPath, link.name), err);
                }
            }

            if (album.albumType === AlbumType.ALBUM) { // If we are loading an album, we need to get the assets from their UUID based folder
                const target = await fs.promises.readlink(path.join(albumPath, link.name));
                const uuidFile = path.parse(target).base;
                albums[0].assets[uuidFile] = link.name;
            }
        }

        return albums;
    }

    /**
     * Will try and remove a dead symlink
     * @param symlinkPath - Location of the potential dead symlink
     * @param cause - Optional cause of the execution of this function
     * @throws An iCPSError in case the provided path is NOT a dead symlink
     */
    async removeDeadSymlink(symlinkPath: string, cause?: Error) {
        try {
            // Checking if there is actually a dead symlink
            if (await fs.promises.lstat(symlinkPath) && !fs.existsSync(symlinkPath)) {
                return await fs.promises.unlink(symlinkPath);
            }

            throw new iCPSError(LIBRARY_ERR.UNKNOWN_SYMLINK_ERROR)
                .addMessage(symlinkPath)
                .addCause(cause);
        } catch (err) {
            throw new iCPSError(LIBRARY_ERR.UNKNOWN_SYMLINK_ERROR)
                .addMessage(symlinkPath)
                .addCause(err);
        }
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
     * @param thisPath - The path to the folder on disk
     * @returns The album type of the folder
     * @emits iCPSEventRuntimeWarning.EXTRANEOUS_FILE - If an album contains extraneous files (instead of only symlinks)
     */
    async readAlbumTypeFromPath(thisPath: string): Promise<AlbumType> {
        // If the folder contains other folders, it will be of AlbumType.Folder
        const directoryPresent = (await fs.promises.readdir(thisPath, {
            withFileTypes: true,
        })).some(file => file.isDirectory());

        const dirContent = await fs.promises.readdir(thisPath, {
            withFileTypes: true,
        });

        // If there are files in the folders, the folder is treated as archived
        const filePresent = dirContent
            .filter(file => PHOTOS_LIBRARY.SAFE_FILES.every(regex => !regex.test(file.name)))
            .some(file => file.isFile());

        if (directoryPresent) {
            // AlbumType.Folder cannot be archived!
            if (filePresent) {
                Resources.emit(iCPSEventRuntimeWarning.EXTRANEOUS_FILE, thisPath);
            }

            return AlbumType.FOLDER;
        }

        if (filePresent) {
            return AlbumType.ARCHIVED;
        }

        return AlbumType.ALBUM;
    }

    /**
     * Deletes the specified asset from disk
     * @param asset - The asset that needs to be removed
     * @returns A promise, that resolves once the asset was deleted from disk
     */
    async deleteAsset(asset: Asset) {
        Resources.logger(this).info(`Deleting asset ${asset.getDisplayName()}`);
        await fs.promises.rm(asset.getAssetFilePath(), {force: true});
    }

    /**
     * Verifies if a given Asset object is present on disk
     * @param asset - The asset to verify
     * @returns True, if the Asset object is present on disk
     * @throws An error, in case the object cannot be verified
     */
    async verifyAsset(asset: Asset): Promise<boolean> {
        Resources.logger(this).debug(`Verifying asset ${asset.getDisplayName()}`);
        return asset.verify();
    }

    /**
     * Finds the absolute paths of the folder pair for a given album
     * The path is created, by finding the parent on filesystem. The folder paths do not necessarily exist, the parent path needs to exist.
     * @param album - The album
     * @returns A tuple containing the albumNamePath, uuidPath
     * @throws An iCPSError, if the parent path cannot be found
     */
    findAlbumPaths(album: Album): PathTuple {
        // Directory path of the parent folder
        let parentPath = Resources.manager().dataDir;
        if (album.parentAlbumUUID) {
            const parentPathExt = this.findAlbumByUUIDInPath(album.parentAlbumUUID, Resources.manager().dataDir);
            if (parentPathExt.length === 0) {
                throw new iCPSError(LIBRARY_ERR.NO_PARENT)
                    .addMessage(album.getDisplayName())
                    .addContext(`album`, album);
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
     * @throws An iCPSError, if multiple albums with the same UUID are found
     */
    findAlbumByUUIDInPath(albumUUID: string, rootPath: string): string {
        // Get all folders in the path
        const foldersInPath = fs.readdirSync(rootPath, {withFileTypes: true}).filter(dirent => dirent.isDirectory());

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
            Resources.logger(this).debug(`Found folder ${albumUUID} in ${rootPath}`);
            return searchResult[0];
        }

        if (searchResult.length > 1) {
            throw new iCPSError(LIBRARY_ERR.MULTIPLE_MATCHES)
                .addMessage(`${albumUUID} in path ${rootPath}`)
                .addContext(`searchResult`, searchResult);
        }

        // No match in this folder hierarchy
        return ``;
    }

    /**
     * Writes a given album to disk & links the necessary assets
     * @param album - The album to be written to disk
     * @throws An iCPSError, if any album related directories already exist
     */
    writeAlbum(album: Album) {
        const [albumNamePath, uuidPath] = this.findAlbumPaths(album);

        if (fs.existsSync(uuidPath)) {
            throw new iCPSError(LIBRARY_ERR.EXISTS)
                .addMessage(uuidPath)
                .addContext(`album`, album);
        }

        if (fs.existsSync(albumNamePath)) {
            throw new iCPSError(LIBRARY_ERR.EXISTS)
                .addMessage(albumNamePath)
                .addContext(`album`, album);
        }

        // Creating album
        Resources.logger(this).debug(`Creating folder ${uuidPath}`);
        fs.mkdirSync(uuidPath, {recursive: true});
        // Symlinking to correctly named album
        Resources.logger(this).debug(`Linking ${albumNamePath} to ${path.basename(uuidPath)}`);
        fs.symlinkSync(path.basename(uuidPath), albumNamePath);

        // @remarks Something is wrong here - see E2E test
        if (album.albumType === AlbumType.ALBUM) {
            this.linkAlbumAssets(album, uuidPath);
        }
    }

    /**
     * Links the assets for the given album
     * @remarks ALbums only refer to PrimaryAssets - hardcoding this
     * @param album - Album holding information about the linked assets
     * @param albumPath - Album path to link assets to
     * @emits iCPSEventRuntimeWarning.LINK_ERROR - If linking of an asset fails
     */
    linkAlbumAssets(album: Album, albumPath: string) {
        Object.keys(album.assets).forEach(assetUUID => {
            const linkedAsset = path.format({
                dir: albumPath,
                base: album.assets[assetUUID],
            });
            const assetPath = path.format({
                dir: this.primaryAssetDir,
                base: assetUUID,
            });
            // Relative asset path is relative to album, not the linkedAsset
            const relativeAssetPath = path.relative(albumPath, assetPath);
            try {
                Resources.logger(this).debug(`Linking ${relativeAssetPath} to ${linkedAsset}`);

                // Getting asset time, in order to update link as well
                const assetTime = fs.statSync(assetPath).mtime;
                fs.symlinkSync(relativeAssetPath, linkedAsset);
                fs.lutimesSync(linkedAsset, assetTime, assetTime);
            } catch (err) {
                Resources.emit(iCPSEventRuntimeWarning.LINK_ERROR, err, assetPath, linkedAsset);
            }
        });
    }

    /**
     * Deletes the given album. The folder will only be deleted, if it contains no 'real' files
     * @param album - The album that needs to be removed
     * @throws An iCPSError, if the album is not empty or could not be found
     */
    deleteAlbum(album: Album) {
        Resources.logger(this).debug(`Deleting folder ${album.getDisplayName()}`);
        const [albumNamePath, uuidPath] = this.findAlbumPaths(album);
        // Path to album
        if (!fs.existsSync(uuidPath)) {
            throw new iCPSError(LIBRARY_ERR.FIND_PATH)
                .addMessage(uuidPath);
        }

        // Checking content
        const pathContent = fs.readdirSync(uuidPath, {withFileTypes: true})
            .filter(item => !item.isSymbolicLink()) // Filter out symbolic links, we are fine with deleting those as well as the 'safe' files
            .filter(file => PHOTOS_LIBRARY.SAFE_FILES.every(regex => !regex.test(file.name)));
        if (pathContent.length > 0) {
            throw new iCPSError(LIBRARY_ERR.NOT_EMPTY)
                .addMessage(uuidPath)
                .addContext(`pathContent`, pathContent);
        }

        // Path to real name folder
        if (!fs.existsSync(albumNamePath)) {
            throw new iCPSError(LIBRARY_ERR.FIND_PATH)
                .addMessage(albumNamePath);
        }

        fs.rmSync(uuidPath, {recursive: true});
        fs.unlinkSync(albumNamePath);
        Resources.logger(this).debug(`Successfully deleted album ${album.getDisplayName()} at ${albumNamePath} & ${uuidPath}`);
    }

    /**
     * Stashes an archived album in case it was deleted/moved in the remote library
     * @param album - The album that needs to be stashed
     */
    stashArchivedAlbum(album: Album) {
        Resources.logger(this).debug(`Stashing album ${album.getDisplayName()}`);
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
        Resources.logger(this).debug(`Retrieving stashed album ${album.getDisplayName()}`);
        this.movePathTuple(
            this.findStashAlbumPaths(album),
            this.findAlbumPaths(album),
        );
    }

    /**
     * Moves & re-links the path tuple - if named path cannot be found, unlinking will be ignored
     * Modified time is applied to target's modified and access time (atime is not reliable)
     * @param src - The source of folders
     * @param dest - The destination of folders
     * @throws An iCPSError, if the source paths cannot be found or destination paths already exist
     */
    movePathTuple(src: PathTuple, dest: PathTuple) {
        const [srcNamePath, srcUUIDPath] = src;
        const [destNamePath, destUUIDPath] = dest;

        if (!fs.existsSync(srcUUIDPath)) {
            throw new iCPSError(LIBRARY_ERR.FIND_PATH)
                .addMessage(srcUUIDPath);
        }

        const srcUUIDStats = fs.statSync(srcUUIDPath);

        if (fs.existsSync(destNamePath)) {
            throw new iCPSError(LIBRARY_ERR.EXISTS)
                .addMessage(destNamePath);
        }

        if (fs.existsSync(destUUIDPath)) {
            throw new iCPSError(LIBRARY_ERR.EXISTS)
                .addMessage(destUUIDPath);
        }

        Resources.logger(this).debug(`Moving ${srcUUIDPath} to ${destUUIDPath}`);
        fs.renameSync(srcUUIDPath, destUUIDPath);
        fs.utimesSync(destUUIDPath, srcUUIDStats.mtime, srcUUIDStats.mtime);

        let srcNameStats: fs.Stats = srcUUIDStats;
        try {
            srcNameStats = fs.lstatSync(srcNamePath);
            fs.unlinkSync(srcNamePath);
        } catch (err) {
            Resources.logger(this).debug(`Unable to unlink ${srcNamePath}: ${err.message}`);
        }

        Resources.logger(this).debug(`Re-linking ${destNamePath}`);
        fs.symlinkSync(path.basename(destUUIDPath), destNamePath);
        fs.lutimesSync(destNamePath, srcNameStats.mtime, srcNameStats.mtime);
    }

    /**
     * This function will look for orphaned albums and remove the unnecessary UUID links to make them more manageable
     */
    async cleanArchivedOrphans() {
        Resources.logger(this).debug(`Cleaning archived orphans`);
        const archivedOrphans = await this.loadAlbum(Album.getStashAlbum(), this.stashDir);
        for (const album of archivedOrphans) {
            Resources.logger(this).debug(`Found orphaned album ${album}`);
            const [namePath, uuidPath] = this.findStashAlbumPaths(album);
            let targetPath: string;
            let index = 0;
            do {
                const basename = index === 0 ? path.basename(namePath) : `${path.basename(namePath)}-${index}`;
                index++;
                targetPath = path.join(this.archiveDir, basename);
            } while (fs.existsSync(targetPath));

            Resources.logger(this).debug(`Moving ${uuidPath} to ${targetPath}, unlinking ${namePath}`);
            await fs.promises.rename(uuidPath, targetPath);
            await fs.promises.unlink(namePath);
        }
    }
}