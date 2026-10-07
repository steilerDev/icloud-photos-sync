/**
 * The directory, where the base assets (aka 'All Photos') are stored (within the provided Photo Data Dir)
 */
export const PRIMARY_ASSET_DIR = `_All-Photos`;
export const SHARED_ASSET_DIR = `_Shared-Photos`;
export const ARCHIVE_DIR = `_Archive`;
export const STASH_DIR = `.stash`;

/**
 * The default directory (relative to the data dir), where deleted assets are moved to, if soft delete is enabled
 */
export const TRASH_DIR = `_Trash`;

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