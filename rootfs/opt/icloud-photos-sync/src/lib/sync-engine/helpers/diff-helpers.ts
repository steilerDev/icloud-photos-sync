/**
 * This file contains functions that will be included in the SyncEngine class, related to the diffing of Entities
 */

import {Album} from "../../photos-library/model/album.js";
import {PLibraryEntities, PLibraryProcessingQueues} from "../../photos-library/model/photos-entity.js";
import {SyncEngine} from "../sync-engine.js";

/**
 * If an ancestor (not parent) of an Album is marked for deletion, the album needs to be moved (aka deleted & added), since it did not change from a diffing perspective (same parent)
 * @param queues - The album processing queue for the albums
 * @param localAlbumEntities - The local state
 * @returns Updated processing queues with resolved hierarchical dependencies, ready for processing
 */
export function resolveHierarchicalDependencies(this: SyncEngine, queues: PLibraryProcessingQueues<Album>, localAlbumEntities: PLibraryEntities<Album>): PLibraryProcessingQueues<Album> {
    this.logger.debug(`Resolving hierarchical dependencies in album processing queues...`);
    const toBeDeleted = queues[0];
    const toBeAdded = queues[1];
    let toBeKept = queues[2];

    // Storing the indicies of items that need moving, so they can later be removed from the toBeKept Array
    const removeIndexesFromKept: number[] = [];
    const localAlbums = Object.values(localAlbumEntities);

    // Go over all kept albums
    toBeKept.forEach((keptAlbum, index) => {
        // Check if any of the deleted is an ancestor of the kept album
        if (toBeDeleted.some(deletedAlbum => keptAlbum.hasAncestor(deletedAlbum, localAlbums))) {
            this.logger.warn(`Album ${keptAlbum.getDisplayName()} has hierarchical dependency, marking it for deletion & re-addition`);
            // This means that this kept album actually needs to be deleted & added
            toBeDeleted.push(keptAlbum);
            toBeAdded.push(keptAlbum);
            // Marking the item to be removed from kept
            removeIndexesFromKept.push(index);
        }
    });
    toBeKept = toBeKept.filter((_album, index) => removeIndexesFromKept.indexOf(index) === -1);
    return [toBeDeleted, toBeAdded, toBeKept];
}