# Common Warnings

During the sync process a couple of warnings can pop up. The primary reason for this being, that the API behaves differently than I expect. Given however the experience I gathered, the following warnings will be printed out, but are handled gracefully by the application.

## `Ignoring unknown album type 6`
The program only syncs albums (type `0`) and folders (type `3`) - any other unexpected album type will be ignored (those are maybe smart albums?).

## `Filtering record <some-id>: duplicate`
Because the iCloud API is arbitrarily limiting results, the application needs to send multiple queries in order to acquire the full data set. This is done in a conservative fasion (without knowing the exact limitations of the API), which sometimes leads to overlaps in the result set.

Therefore duplicate entries in the query are removed.

## `Expected <n> CPLMaster & <m> CPLAsset records, but got <x> CPLMaster & <y> CPLAsset records for album <someAlbum>
In an initial set, the API is queried for the number of assets in a given album. This is followed by a query to get all assets associated with the album. For some reason those APIs sometimes return contradicting results. (I suspect an error within the iCloud backend)

## `Warning: [...] Detected recoverable error, refreshing iCloud connection & retrying (#<n>)...`
Assets returned by the API are only valid for a certain amount of time (it seems to be one hour). This happens most often on an initial sync.

After that the connection needs to be refreshed. The amount of retries can be configured.