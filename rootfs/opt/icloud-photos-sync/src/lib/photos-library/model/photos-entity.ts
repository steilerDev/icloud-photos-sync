export interface PEntity<T> {
    getUUID(): string
    getDisplayName(): string
    equal(entity: T): boolean
    unpack(): T
}

export type PLibraryEntities<T> = {
    [key: string]: T // Keyed by getUUID
}

export type PLibraryProcessingQueues<T> = [toBeDeleted: T[], toBeAdded: T[]]