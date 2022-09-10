import {Album, AlbumType} from "../../photos-library/model/album.js";
import {PLibraryProcessingQueues} from "../../photos-library/model/photos-entity.js";
import {SyncEngine} from "../sync-engine.js";

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
        this.removeAlbum(album);
    });

    toBeAdded.forEach(album => {
        this.addAlbum(album);
    });

    this.photosLibrary.cleanArchivedOrphans();
}

/**
 * Writes the data structure of an album to disk. This includes:
 *   * Create a hidden folder containing the UUID
 *   * Create a link to the hidden folder, containing the real name of the album
 *   * (If possible) link correct pictures from the assetFolder to the newly created album
 * @param album - The album, that should be written to disk
 */
export function addAlbum(this: SyncEngine, album: Album) {
    // If albumType == Archive -> Check in 'archivedFolder' and move
    this.logger.debug(`Creating album ${album.getDisplayName()} with parent ${album.parentAlbumUUID}`);

    if (album.albumType === AlbumType.ARCHIVED) {
        this.photosLibrary.retrieveStashedAlbum(album);
        return;
    }

    try {
        this.photosLibrary.writeAlbum(album);
    } catch (err) {
        this.logger.warn(`Unable to add album ${album.getDisplayName()}: ${err.message}`);
    }
}

/**
 * This will delete an album from disk and remove all associated symlinks
 * Deletion will only happen if the album is 'empty'. This means it only contains symlinks or 'safe' files. Any other folder or file will result in the folder not being deleted.
 * @param album - The album that needs to be deleted
 */
export function removeAlbum(this: SyncEngine, album: Album) {
    this.logger.debug(`Removing album ${album.getDisplayName()}`);

    if (album.albumType === AlbumType.ARCHIVED) {
        this.photosLibrary.stashArchivedAlbum(album);
        return;
    }

    try {
        this.photosLibrary.deleteAlbum(album);
    } catch (err) {
        this.logger.warn(`Unable to delete album ${album.getDisplayName()}: ${err.message}`);
    }
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