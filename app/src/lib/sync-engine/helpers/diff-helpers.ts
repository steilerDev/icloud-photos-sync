/**
 * This file contains functions that will be included in the SyncEngine class, related to the diffing of Entities
 */

import {HANDLER_EVENT} from "../../../app/event/error-handler.js";
import {SyncError} from "../../../app/error-types.js";
import {Album} from "../../photos-library/model/album.js";
import {PEntity, PLibraryEntities, PLibraryProcessingQueues} from "../../photos-library/model/photos-entity.js";
import {SyncEngine} from "../sync-engine.js";

/**
 * This function diffs two entity arrays (can be either Albums or Assets) and returns the corresponding processing queue
 * @param remoteEntities - The entities fetched from a remote state
 * @param _localEntities - The local entities as read from disk
 * @returns A processing queue, containing the entities that needs to be deleted, added and kept. In the case of albums, this will not take hierarchical dependencies into consideration
 */
export function getProcessingQueues<T>(this: SyncEngine, remoteEntities: PEntity<T>[], _localEntities: PLibraryEntities<T>): PLibraryProcessingQueues<T> {
    const localEntities = {..._localEntities};
    this.logger.debug(`Getting processing queues`);
    const toBeAdded: T[] = [];
    const toBeKept: T[] = [];
    remoteEntities.forEach(remoteEntity => {
        const localEntity = localEntities[remoteEntity.getUUID()];
        if (!localEntity || !remoteEntity.equal(localEntity)) {
            // No local entity OR local entity does not match remote entity -> Remote asset will be added & local asset will not be removed from deletion queue
            this.logger.debug(`Adding new remote entity ${remoteEntity.getDisplayName()}`);
            // Making sure entities have all relevant properties
            toBeAdded.push(remoteEntity.apply(localEntity));
        } else {
            // Local asset matches remote asset, nothing to do, but preventing local asset to be deleted
            this.logger.debug(`Keeping existing local entity ${remoteEntity.getDisplayName()}`);
            toBeKept.push(remoteEntity.apply(localEntity));
            delete localEntities[remoteEntity.getUUID()];
        }
    });
    // The original library should only hold those records, that have not been referenced by the remote state, removing them
    const toBeDeleted = Object.values(localEntities);
    this.logger.debug(`Adding ${toBeAdded.length} remote entities, removing ${toBeDeleted.length} local entities, keeping ${toBeKept.length} local entities`);
    return [toBeDeleted, toBeAdded, toBeKept];
}

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
            this.emit(HANDLER_EVENT, new SyncError(`Album ${keptAlbum.getDisplayName()} has hierarchical dependency, marking it for deletion & re-addition`)
                .addContext(`keptAlbum`, keptAlbum)
                .addContext(`localAlbums`, localAlbums),
            );
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