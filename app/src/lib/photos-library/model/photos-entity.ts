/**
 * A common interface across Albums & Assets in order to re-use some code snippets
 */
export interface PEntity<T> {
    /**
     * Returns the UUID of this entity
     */
    getUUID(): string
    /**
     * Return the display name of this enity
     */
    getDisplayName(): string
    /**
     * Compares this instance with a given enity
     * @param entity - The entity to compare this instance to
     * @returns True, if both enities are equal
     */
    equal(entity: T): boolean
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