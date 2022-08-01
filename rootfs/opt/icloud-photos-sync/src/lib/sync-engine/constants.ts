export const FILE_NAME = `photos-library.db`;

export enum EVENTS {
    FETCH_N_LOAD = `fetch-n-load`, // No arg
    FETCH_N_LOAD_COMPLETED = `fetch-n-load-completed`, // LocalAssetCount, localAlbumCount, remoteAssetCount, remoteAlbumCount
    DIFF = `diff`, // No arg
    DIFF_COMPLETED = `diff-completed`, // No arg
    WRITE = `write`, // No arg
    WRITE_ASSETS = `write-assets`, // ToBeDeletedCount, toBeAddedCount
    WRITE_ASSET_COMPLETED = `write-asset-completed`, // AssetName
    WRITE_ASSETS_COMPLETED = `write-assets-completed`, // No arg
    WRITE_ALBUMS = `write-albums`, // ToBeDeletedCount, toBeAddedCount
    WRITE_ALBUMS_COMPLETED = `write-albums-completed`, // No arg
    WRITE_COMPLETED = `write-completed`, // No arg
    DONE = `done`, // No arg
    RETRY = `retry`, // RetryCount
    ERROR = `error` // ErrorMessage
}