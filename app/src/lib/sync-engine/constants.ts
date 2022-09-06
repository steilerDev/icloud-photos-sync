/**
 * Event lifecycle of Sync Engine class
 */
export enum EVENTS {
    START = `start`,
    FETCH_N_LOAD = `fetch-n-load`, // No arg
    FETCH_N_LOAD_COMPLETED = `fetch-n-load-completed`, // RemoteAssetCount, remoteAlbumCount, LocalAssetCount, localAlbumCount
    DIFF = `diff`, // No arg
    DIFF_COMPLETED = `diff-completed`, // No arg
    WRITE = `write`, // No arg
    WRITE_ASSETS = `write-assets`, // ToBeDeletedCount, toBeAddedCount, toBeKeptCount
    WRITE_ASSET_COMPLETED = `write-asset-completed`, // AssetName
    WRITE_ASSETS_COMPLETED = `write-assets-completed`, // No arg
    WRITE_ALBUMS = `write-albums`, // ToBeDeletedCount, toBeAddedCount, toBeKeptCount
    WRITE_ALBUMS_COMPLETED = `write-albums-completed`, // No arg
    WRITE_COMPLETED = `write-completed`, // No arg
    DONE = `done`, // No arg
    RETRY = `retry`, // RetryCount
    ERROR = `error`, // ErrorMessage
}