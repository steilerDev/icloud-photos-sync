import {Album, AlbumType} from "../../photos-library/model/album.js";
import {PLibraryProcessingQueues} from "../../photos-library/model/photos-entity.js";
import {SyncEngine} from "../sync-engine.js";
import path from 'path';
import fs from 'fs';
import * as PHOTOS_LIBRARY from '../../photos-library/constants.js';

/**
 * Writes the album changes defined in the processing queue to to disk
 * @param processingQueue - The album processing queue, expected to have resolved all hierarchical dependencies
 * @returns A promise that settles, once all album changes have been written to disk
 */
export async function writeAlbums(this: SyncEngine, processingQueue: PLibraryProcessingQueues<Album>) {
    this.logger.info(`Writing lib structure!`);

    // Making sure our queues are sorted
    const toBeDeleted: Album[] = this.queueIsSorted(processingQueue[0]) ? processingQueue[0] : this.sortQueue(processingQueue[0]);
    const toBeAdded: Album[] = this.queueIsSorted(processingQueue[1]) ? processingQueue[1] : this.sortQueue(processingQueue[1]);

    // Deletion before addition, in order to avoid duplicate folders
    // Reversing processing order, since we need to remove nested folders first
    toBeDeleted.reverse().forEach(album => {
        this.deleteAlbum(album);
    });

    toBeAdded.forEach(album => {
        this.addAlbum(album);
    });
}

/**
 * Writes the data structure of an album to disk. This includes:
 *   * Create a hidden folder containing the UUID
 *   * Create a link to the hidden folder, containing the real name of the album
 *   * (If possible) link correct pictures from the assetFolder to the newly created album
 * @param album - The album, that should be written to disk
 */
export function addAlbum(this: SyncEngine, album: Album) {
    this.logger.debug(`Creating album ${album.getDisplayName()} with parent ${album.parentAlbumUUID}`);
    const parentPath = album.parentAlbumUUID // If UUID is undefined -> Folder is in root
        ? this.findAlbum(album.parentAlbumUUID)
        : this.photosLibrary.photoDataDir;
    // LinkedAlbum will be the visible album, with the correct name
    const linkedAlbum = path.join(parentPath, album.getSanitizedFilename());
    // AlbumPath will be the actual directory, having the UUID as foldername
    const albumPath = path.join(parentPath, `.${album.getUUID()}`);
    // Relative album path is relative to parent, not linkedAlbum
    const relativeAlbumPath = path.relative(parentPath, albumPath);
    try {
        // Creating album
        this.logger.debug(`Creating folder ${albumPath}`);
        fs.mkdirSync(albumPath, {recursive: true});
        // Symlinking to correctly named album
        this.logger.debug(`Linking ${relativeAlbumPath} to ${linkedAlbum}`);
        fs.symlinkSync(relativeAlbumPath, linkedAlbum);
        if (album.albumType === AlbumType.ALBUM) { // Only need to link assets, if we are in an album!
            Object.keys(album.assets).forEach(assetUUID => {
                const linkedAsset = path.format({
                    dir: albumPath,
                    base: album.assets[assetUUID],
                });
                const assetPath = path.format({
                    dir: this.photosLibrary.assetDir,
                    base: assetUUID,
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
                    this.logger.warn(`Not linking ${relativeAlbumPath} to ${linkedAsset} in album ${album.getDisplayName()}: ${err.message}`);
                }
            });
        }
    } catch (err) {
        this.logger.warn(`Unable to add album ${album.getDisplayName()}: ${err.message}`);
    }
}

/**
 * This will delete an album from disk and remove all associated symlinks
 * Deletion will only happen if the album is 'empty'. This means it only contains symlinks or 'safe' files. Any other folder or file will result in the folder not being deleted.
 * @param album - The album that needs to be deleted
 */
export function deleteAlbum(this: SyncEngine, album: Album) {
    this.logger.debug(`Deleting folder ${album.getDisplayName()}`);
    const albumPath = this.findAlbum(album.getUUID());
    const linkedPath = path.normalize(`${albumPath}/../${album.getSanitizedFilename()}`); // The linked folder is one layer below
    const pathContent = fs.readdirSync(albumPath, {withFileTypes: true})
        .filter(item => !(item.isSymbolicLink() || PHOTOS_LIBRARY.SAFE_FILES.includes(item.name))); // Filter out symbolic links, we are fine with deleting those as well as the 'safe' files
    if (pathContent.length > 0) {
        this.logger.warn(`Unable to delete album ${album.getDisplayName()}: Album in path ${path} not empty (${JSON.stringify(pathContent.map(item => item.name))})`);
    } else if (!fs.existsSync(linkedPath)) {
        this.logger.warn(`Unable to delete album ${album.getDisplayName()}: Unable to find linked file, expected ${linkedPath}`);
    } else {
        try {
            fs.rmSync(albumPath, {recursive: true});
            fs.unlinkSync(linkedPath);
        } catch (err) {
            this.logger.warn(`Unable to delete album ${album.getDisplayName()}: ${err}`);
        }

        this.logger.debug(`Sucesfully deleted album ${album.getDisplayName} at ${path} & ${linkedPath}`);
    }
}

/**
 * Finds a given album within the photoDataDir
 * @param albumUUID - The UUID of the album
 * @returns The full path to the album, or the empty string, if the album was not found
 */
export function findAlbum(this: SyncEngine, albumUUID: string) {
    const relativeFolderPath = this.findAlbumInPath(albumUUID, this.photosLibrary.photoDataDir);
    return relativeFolderPath === `` ? ``
        : path.join(this.photosLibrary.photoDataDir, relativeFolderPath);
}

/**
 * Finds a given album in a given path (as long as it is within the directory tree)
 * @param albumUUID - The UUID of the album
 * @param rootPath  - The path in which the album should be searched
 * @returns The path to the album, relative to the provided path, or the empty string if the album could not be found, or the full path including photoDataDir, if _rootPath was undefined
 */
export function findAlbumInPath(this: SyncEngine, albumUUID: string, rootPath: string): string {
    this.logger.trace(`Checking ${rootPath} for folder ${albumUUID}`);
    // Get all folders in the path
    const foldersInPath = fs.readdirSync(rootPath, {withFileTypes: true}).filter(dirent => dirent.isDirectory());

    // See if the searched folder is in the path
    const filteredFolder = foldersInPath.filter(folder => folder.name === `.${albumUUID}`); // Since the folder is hidden, a dot is prefacing it
    if (filteredFolder.length === 1) {
        return filteredFolder[0].name;
    }

    if (filteredFolder.length > 1) {
        throw new Error(`Unable to find album ${albumUUID} in path ${path}: Multiple matches: ${JSON.stringify(filteredFolder)}`);
    }
    // No luck in the current folder. Looking in all child folders

    // This will contain either empty strings or the path to the searched album
    const searchResult = foldersInPath.map(folder => {
        // Look into each folder and see if the album can be found there
        const result = this.findAlbumInPath(albumUUID, path.join(rootPath, folder.name));
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
        throw new Error(`Unable to find album ${albumUUID} in path ${path}: Multiple matches: ${JSON.stringify(searchResult)}`);
    }

    // No match in this folder hierachy
    return ``;
}

/**
 * This function will sort a given queue
 * Order is defined as follows: For every album in the array, its parent's index is never bigger than the index of the album (parent is 'in front' of all of its children)
 * @param unsortedQueue - The unsorted queue
 * @returns A sorted queue
 */
export function sortQueue(this: SyncEngine, unsortedQueue: Album[]): Album[] {
    this.logger.debug(`Sorting queue...`);
    const sortedQueue = unsortedQueue.sort((a, b) => {
        if (a.hasAncestor(b, unsortedQueue)) {
            return 1; // B is ancestor, therefore his index needs to be smaller
        }

        if (b.hasAncestor(a, unsortedQueue)) {
            return -1; // A is ancestor, therefore his index needs to be smaller
        }

        return 0; // Either they are the same, or independent
    });
    // Double checking, because I don't trust my code
    if (!this.queueIsSorted(sortedQueue)) {
        throw new Error(`Expected sorted queue, but got ${JSON.stringify(sortedQueue)}`);
    } else {
        return sortedQueue;
    }
}

/**
 * This function checks, if the provided album queue is 'in order'
 * Order is defined as follows: For every album in the array, its parent's index is always smaller than the index of the album (parent is 'in front' of all of its children)
 * @param albumQueue - The album queue to check
 * @returns True if for every album in the array, its parent's index is always smaller than the index of the album (parent is 'in front' of all of its children)
 */
export function queueIsSorted(this: SyncEngine, albumQueue: Album[]): boolean {
    return albumQueue.every((currentAlbum, index) => {
        if (currentAlbum.parentAlbumUUID === ``) { // If the album is in the root folder, it can be ignored
            return true;
        } // Album has a parent

        return albumQueue // FindIndex will return -1 if there is no match, we hope that there is no match
            .slice(index) // Reducing search space, since we need to check if the parent is 'behind' the current album
            .findIndex(potentialParentAlbum => currentAlbum.parentAlbumUUID === potentialParentAlbum.getUUID()) === -1; // Get the index of the album
    });
}