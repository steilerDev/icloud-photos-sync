/**
 * The directory, where the base assets (aka 'All Photos') are stored (within the provided Photo Data Dir)
 */
export const PRIMARY_ASSET_DIR = `_All-Photos`;
export const SHARED_ASSET_DIR = `_Shared-Photos`;
export const ARCHIVE_DIR = `_Archive`;
export const STASH_DIR = `.stash`;

/**
 * The name of the album, holding all assets from the 'Hidden' album (only synced if enabled)
 */
export const HIDDEN_ALBUM_NAME = `_Hidden-Photos`;

/**
 * The static UUID of the album holding all hidden assets, since this album has no representation in the iCloud backend
 */
export const HIDDEN_ALBUM_UUID = `----Hidden-Photos----`;

/**
 * The version of the local photos library
 */
export const LIBRARY_VERSION = 1;

/**
 * A list of file patterns, that are safe to ignore for the application.
 */
export const SAFE_FILES = [
    /^\.DS_Store$/,
    /^\.fuse_hidden.*/,
];