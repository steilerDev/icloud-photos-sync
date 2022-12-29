import {HANDLER_EVENT} from "../../../app/error/handler.js";
import {SyncError} from "../../../app/error/types.js";
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
    const toBeDeleted: Album[] = this.sortQueue(processingQueue[0]);
    const toBeAdded: Album[] = this.sortQueue(processingQueue[1]);

    // Deletion before addition, in order to avoid duplicate folders
    // Reversing processing order, since we need to remove nested folders first
    toBeDeleted.reverse().forEach(album => {
        this.removeAlbum(album);
    });

    toBeAdded.forEach(album => {
        this.addAlbum(album);
    });

    await this.photosLibrary.cleanArchivedOrphans();
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
        this.emit(HANDLER_EVENT, new SyncError(`Unable to add album ${album.getDisplayName()}`, `WARN`).addCause(err));
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
        this.emit(HANDLER_EVENT, new SyncError(`Unable to delete album ${album.getDisplayName()}`, `WARN`).addCause(err));
    }
}

/**
 * This function will sort a given queue. The sort is performed on a copy of the array, referencing the same objects.
 * Order is defined as follows: For every album in the array, its parent's index (if exists) is always smaller than the index of the album (parent is 'in front' of all of its children)
 * @param unsortedQueue - The unsorted queue.
 * @returns A sorted queue
 */
export function sortQueue(this: SyncEngine, unsortedQueue: Album[]): Album[] {
    return [...unsortedQueue].sort((a, b) => SyncEngine.compareQueueElements(unsortedQueue, a, b));
}

/**
 * Compares two queue elements, based on the specification of compareFn of Array.sort
 * @param fullQueue - The full queue necessary to check for ancestors
 * @param a - The first element
 * @param b - The second element
 * @returns - Returns a negative value if the first element is less than the second element, zero if they're equal, and a positive value otherwise.
 */
export function compareQueueElements(fullQueue: Album[], a: Album, b: Album): number {
    if (a.getUUID() === b.getUUID()) {
        return 0;
    }

    if (a.hasAncestor(b, fullQueue)) {
        return 1; // B is ancestor, therefore his index needs to be bigger
    }

    if (b.hasAncestor(a, fullQueue)) {
        return -1; // A is ancestor, therefore his index needs to be bigger
    }

    try {
        const distanceToRootA = Album.distanceToRoot(a, fullQueue);
        const distanceToRootB = Album.distanceToRoot(b, fullQueue);
        return distanceToRootA - distanceToRootB; // Provide distance based on depth
    } catch (err) {
        return 0; // If there is a broke in the link, return them as equal
    }
}