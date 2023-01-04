/**
 * A common interface across Albums & Assets in order to re-use some code snippets
 */
export interface PEntity<T> {
    /**
     * Returns the UUID of this entity
     */
    getUUID(): string
    /**
     * Return the display name of this entity
     */
    getDisplayName(): string
    /**
     * Compares this instance with a given entity
     * @param entity - The entity to compare this instance to
     * @returns True, if both entities are equal
     */
    equal(entity: T): boolean

    /**
     * Applies properties of the local entity to this remote entity
     * @param localEntity - The local entity's properties to be applied
     * @returns This object for convenient
     */
    apply(localEntity: T): T
}

/**
 * A list of entities, keyed by their 'getUUID' function
 */
export type PLibraryEntities<T> = {
    [key: string]: T
}

/**
 * A list of entities that need to be added, removed or kept as part of the sync
 */
export type PLibraryProcessingQueues<T> = [toBeDeleted: T[], toBeAdded: T[], toBeKept: T[]]