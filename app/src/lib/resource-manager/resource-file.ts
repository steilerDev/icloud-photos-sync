/**
 * Expected layout of the resource file
 */
export type ResourceFile = {
    /**
     * The library version of the currently present library
     * @minimum 1
     * @default 1
     */
    libraryVersion: number,
    /**
     * The currently used trust token
     */
    trustToken?: string
}