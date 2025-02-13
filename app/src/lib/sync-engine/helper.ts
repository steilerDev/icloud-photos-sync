import path from "path";
import {LIBRARY_ERR} from "../../app/error/error-codes.js";
import {iCPSError} from "../../app/error/error.js";
import {CPLAlbum, CPLAsset, CPLMaster} from "../icloud/icloud-photos/query-parser.js";
import {Album} from "../photos-library/model/album.js";
import {Asset, AssetType} from "../photos-library/model/asset.js";
import {PEntity, PLibraryEntities, PLibraryProcessingQueues} from "../photos-library/model/photos-entity.js";
import {Resources} from "../resources/main.js";
import {iCPSEventRuntimeWarning} from "../resources/events-types.js";

/**
 * This object exposes various static helpers required to perform a sync
 */
export const SyncEngineHelper = {
    /**
     * @see {@link convertCPLAlbums}
     */
    convertCPLAlbums,
    /**
     * @see {@link convertCPLAssets}
     */
    convertCPLAssets,
    /**
     * @see {@link sortQueue}
     */
    sortQueue,
    /**
     * @see {@link compareQueueElements}
     */
    compareQueueElements,
    /**
     * @see {@link getProcessingQueues}
     */
    getProcessingQueues,
    /**
     * @see {@link resolveHierarchicalDependencies}
     */
    resolveHierarchicalDependencies,
};

/**
 * Matches CPLAsset/CPLMaster pairs and parses their associated Asset(s)
 * @param cplAssets - The given asset
 * @param cplMasters - The given master
 * @returns An array of all containing assets
 */
function convertCPLAssets(cplAssets: CPLAsset[], cplMasters: CPLMaster[]): Asset[] {
    const cplMasterRecords = {};
    cplMasters.forEach(masterRecord => {
        cplMasterRecords[masterRecord.recordName] = masterRecord;
    });
    const remoteAssets: Asset[] = [];
    cplAssets.forEach(asset => {
        const master: CPLMaster = cplMasterRecords[asset.masterRef];
        try {
            const parsedOrigFilename = path.parse(Buffer.from(master.filenameEnc, `base64`).toString());

            const origFilename = parsedOrigFilename.name;
            const origExt = parsedOrigFilename.ext;

            if (master?.resource && master?.resourceType) {
                remoteAssets.push(Asset.fromCPL(master.resource, master.resourceType, origExt, master.modified, origFilename, AssetType.ORIG, asset.recordName, asset.favorite, master.zoneName));
            }

            if (asset?.resource && asset?.resourceType) {
                remoteAssets.push(Asset.fromCPL(asset.resource, asset.resourceType, origExt, asset.modified, origFilename, AssetType.EDIT, asset.recordName, asset.favorite, asset.zoneName));
            }
        } catch (err) {
            if (err instanceof iCPSError && err.code === LIBRARY_ERR.UNKNOWN_FILETYPE_DESCRIPTOR.code) {
                Resources.emit(iCPSEventRuntimeWarning.FILETYPE_ERROR, (err.context as any).extension, (err.context as any).descriptor);
            }

            Resources.emit(iCPSEventRuntimeWarning.ICLOUD_LOAD_ERROR, err, asset, master);
        }
    });
    return remoteAssets;
}

/**
 * Transforms a CPLAlbum into an array of Albums
 * @param cplAlbums - The given CPL Album
 * @returns Once settled, a completely populated Album array
 */
function convertCPLAlbums(cplAlbums: CPLAlbum[]) : Album[] {
    const remoteAlbums: Album[] = [];
    for (const cplAlbum of cplAlbums) {
        remoteAlbums.push(Album.fromCPL(cplAlbum));
    }

    return remoteAlbums;
}

/**
 * This function will sort a given queue. The sort is performed on a copy of the array, referencing the same objects.
 * Order is defined as follows: For every album in the array, its parent's index (if exists) is always smaller than the index of the album (parent is 'in front' of all of its children)
 * @param unsortedQueue - The unsorted queue.
 * @returns A sorted queue
 */
function sortQueue(unsortedQueue: Album[]): Album[] {
    return [...unsortedQueue].sort((a, b) => SyncEngineHelper.compareQueueElements(unsortedQueue, a, b));
}

/**
 * Compares two queue elements, based on the specification of compareFn of Array.sort
 * @param fullQueue - The full queue necessary to check for ancestors
 * @param a - The first element
 * @param b - The second element
 * @returns - Returns a negative value if the first element is less than the second element, zero if they're equal, and a positive value otherwise.
 */
function compareQueueElements(fullQueue: Album[], a: Album, b: Album): number {
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
    } catch (_err) {
        return 0; // If there is a broke in the link, return them as equal
    }
}

/**
 * This function diffs two entity arrays (can be either Albums or Assets) and returns the corresponding processing queue
 * @param remoteEntities - The entities fetched from a remote state
 * @param _localEntities - The local entities as read from disk
 * @returns A processing queue, containing the entities that needs to be deleted, added and kept. In the case of albums, this will not take hierarchical dependencies into consideration
 */
function getProcessingQueues<T>(remoteEntities: PEntity<T>[], _localEntities: PLibraryEntities<T>): PLibraryProcessingQueues<T> {
    const localEntities = {..._localEntities};
    // This.logger.debug(`Getting processing queues`);
    const toBeAdded: T[] = [];
    const toBeKept: T[] = [];
    remoteEntities.forEach(remoteEntity => {
        const localEntity = localEntities[remoteEntity.getUUID()];
        if (!localEntity || !remoteEntity.equal(localEntity)) {
            // No local entity OR local entity does not match remote entity -> Remote asset will be added & local asset will not be removed from deletion queue
            Resources.logger(`SyncHelper`).debug(`Adding new remote entity ${remoteEntity.getDisplayName()}`);
            // Making sure entities have all relevant properties
            toBeAdded.push(remoteEntity.apply(localEntity));
        } else {
            // Local asset matches remote asset, nothing to do, but preventing local asset to be deleted
            Resources.logger(`SyncHelper`).debug(`Keeping existing local entity ${remoteEntity.getDisplayName()}`);
            toBeKept.push(remoteEntity.apply(localEntity));
            delete localEntities[remoteEntity.getUUID()];
        }
    });
    // The original library should only hold those records, that have not been referenced by the remote state, removing them
    const toBeDeleted = Object.values(localEntities);
    Resources.logger(`SyncHelper`).debug(`Got ${toBeDeleted.length} remaining local entities that need to be deleted: ${toBeDeleted.map(entity => (entity as any).getDisplayName()).join(`, `)}`);
    return [toBeDeleted, toBeAdded, toBeKept];
}

/**
 * If an ancestor (not parent) of an Album is marked for deletion, the album needs to be moved (aka deleted & added), since it did not change from a diffing perspective (same parent)
 * @param queues - The album processing queue for the albums
 * @param localAlbumEntities - The local state
 * @returns Updated processing queues with resolved hierarchical dependencies, ready for processing
 */
function resolveHierarchicalDependencies(queues: PLibraryProcessingQueues<Album>, localAlbumEntities: PLibraryEntities<Album>): PLibraryProcessingQueues<Album> {
    // This.logger.debug(`Resolving hierarchical dependencies in album processing queues...`);
    const toBeDeleted = queues[0];
    const toBeAdded = queues[1];
    let toBeKept = queues[2];

    // Storing the indices of items that need moving, so they can later be removed from the toBeKept Array
    const removeIndexesFromKept: number[] = [];
    const localAlbums = Object.values(localAlbumEntities);

    // Go over all kept albums
    toBeKept.forEach((keptAlbum, index) => {
        // Check if any of the deleted is an ancestor of the kept album
        if (toBeDeleted.some(deletedAlbum => keptAlbum.hasAncestor(deletedAlbum, localAlbums))) {
            // This.logger.debug(`Found hierarchical dependency for album ${keptAlbum.getDisplayName()}`);
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