# Common Warnings

While using this application, warnings might appear. This is either due to the fact that the API is not completely understood and/or inconsistent. The overall goals of the application can still be achieved, however a small percentage of assets might be miss-represented. The impact can be gauged by observing the below messages.

Warnings can be suppressed with the [suppress warnings flag](cli.md#suppress-warnings).

## Syncing

### Warning: Detected unknown filetype (`descriptor` with `ext`)

Supported filetypes need to be hardcoded in the application. This error indicates that one of your assets has a filetype that is currently not supported. If you have error reporting enabled, your filetype has been automatically reported to the author. Alternatively report your filetype in the [open issue](https://github.com/steilerDev/icloud-photos-sync/issues/143).

The assets with unknown filetype will be ignored during syncing, the remaining files will sync as expected.

### Warning: Detected `number` extraneous files

There should only be symlinks in folders and non-archived albums. Extraneous files are highlighted during library loading.

Search the log file for a `RuntimeError` of the format `Extraneous file found in directory ${filePath}`, to find and remove the extraneous file from your file system.

### Warning: Unable to load `number` local assets

There are various reasons, why the application cannot load an asset from the user's local library (e.g. permission issues). The assets that could not be loaded will be ignored during the synchronization.

Search the log file for a `RuntimeError` of the format `Error while loading file ${filePath}: ${errDescription}` to get an idea, why loading fails.

### Warning: Detected `number` albums, where asset counts don't match

In an initial set, the API is queried for the number of assets in a given album. This is followed by a query to get all assets associated with the album. For some reason those APIs sometimes return contradicting results (I suspect an error within the iCloud backend).

Search the log file for a `RuntimeError` of the format `Expected ${expectedCount} CPLAssets & CPLMasters, but got ${actualCPLAssetCount} CPLAssets and ${actualCPLMasterCount} CPLMasters for album ${albumName}` to understand which albums and assets are impacted.

### Warning: Unable to load `number` remote assets

There are various reasons, why the application cannot load an asset from the iCloud Photos Library backend (e.g. unreliable network connection). The assets that could not be loaded will be ignored during the synchronization.

Search the log file for a `RuntimeError` of the format `Error while loading iCloud asset ${recordName}: ${errDescription}` to understand which assets are impacted.

### Warning: Detected `number` errors while adding assets

There are various reasons, why the application cannot write an asset to disk (e.g. network connection or permission issues). The assets experiencing this error are most likely not written to disk or corrupted.

Search the log file for a `RuntimeError` of the format `Error while verifying asset ${assetName}: ${errDescription}` to understand which assets are impacted.

### Warning: Detected `number` errors while linking assets to albums

When linking assets into the directory tree various errors can happen (e.g. assets with a naming conflict in the same folder). This leads to assets missing within the album structure, while still being within the `_All-Photos` folder.

Search the log file for a `RuntimeError` of the format `Error while linking ${srcPath} to ${dstPath}: ${errDescription}` to understand which assets and albums are impacted.

### Detected `number` errors while writing albums

There are various reasons, why the application cannot write an an album to disk (e.g. permission issues). The albums experiencing this error are most likely not written to disk or missing assets.

Search the log file for a `RuntimeError` of the format `Error while writing album ${albumName}: ${errDescription}` to understand which albums are impacted.

## Archiving

### Detected `number` errors while archiving assets

There are various reasons, why the application cannot archive an asset (e.g. permission issues). The asset experiencing this error might not be correctly archived or corrupted. The remote asset will not be deleted in this case.

Search the log file for a `RuntimeError` of the format `Error while archiving asset ${assetPath}: ${errDescription}` to understand which assets are impacted.