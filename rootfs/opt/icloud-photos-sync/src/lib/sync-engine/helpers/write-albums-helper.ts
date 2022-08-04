import {Album, AlbumType} from "../../photos-library/model/album.js";
import {PLibraryProcessingQueues} from "../../photos-library/model/photos-entity.js";
import {SyncEngine} from "../sync-engine.js";
import path from 'path';
import fs from 'fs';
import * as SYNC_ENGINE from '../constants.js';

/**
 * Writes the album changes defined in the processing queue to to disk
 * @param processingQueue - The album processing queue
 * @returns A promise that settles, once all album changes have been written to disk
 */
export async function writeAlbums(this: SyncEngine, processingQueue: PLibraryProcessingQueues<Album>) {
    this.logger.info(`Writing lib structure!`);

    // Making sure our queues are sorted
    const toBeDeleted: Album[] = this.queueIsSorted(processingQueue[0]) ? processingQueue[0] : this.sortQueue(processingQueue[0]);
    const toBeAdded: Album[] = this.queueIsSorted(processingQueue[1]) ? processingQueue[1] : this.sortQueue(processingQueue[1]);

    // Deletion before addition, in order to avoid duplicate folders
    toBeDeleted.reverse().forEach(album => {
        this.logger.debug(`Deleting album ${album.getDisplayName()}`);
        this.deleteAlbum(album);
    });

    toBeAdded.forEach(album => {
        this.logger.debug(`Adding album ${album.getDisplayName()}`);
        this.addAlbum(album);
    });
}

export function addAlbum(this: SyncEngine, album: Album) {
    this.logger.debug(`Creating album ${album.getDisplayName()} with parent ${album.parentAlbumUUID}`);
    const parentPath = album.parentAlbumUUID // If UUID is undefined -> Folder is in root
        ? path.join(this.photosLibrary.photoDataDir, this.findAlbumInPath(album.parentAlbumUUID, this.photosLibrary.photoDataDir))
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
                    const msg = `Not linking ${relativeAlbumPath} to ${linkedAsset} in album ${album.getDisplayName()}: ${err.message}`;
                    this.emit(SYNC_ENGINE.EVENTS.ERROR, msg);
                    this.logger.warn(msg);
                }
            });
        }
    } catch (err) {
        const msg = `Unable to add album ${album.getDisplayName()}: ${err.message}`;
        this.emit(SYNC_ENGINE.EVENTS.ERROR, msg);
        this.logger.warn(msg);
    }

    // Find parent
}

export function deleteAlbum(this: SyncEngine, album: Album) {
    // Only delete albums that have only symlinks in them
    // if they have files -> ignore!
    // if they have folders -> check if those folders will also be removed
}

/**
 * Finds a given album in a given path (as long as it is within the directory tree)
 * @param albumUUID - The UUID of the album
 * @param path  - The path in which the album should be searched
 * @returns The path to the album, relative to the provided path, or the empty string if the album could not be found
 */
export function findAlbumInPath(this: SyncEngine, albumUUID: string, rootPath: string): string {
    this.logger.debug(`Checking ${rootPath} for folder ${albumUUID}`);
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