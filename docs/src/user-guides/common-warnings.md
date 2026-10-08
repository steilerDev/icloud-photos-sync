# Common Warnings

While using this application, warnings might appear. This is either due to the fact that the API is not completely understood and/or inconsistent. The overall goals of the application can still be achieved, however a small percentage of assets might be miss-represented. The impact can be gauged by observing the below messages.

For most warnings, the CLI only prints a count summary, the details are written to the log file. Each warning is logged with the level `WARN` and the source `RuntimeWarning`, for example:

```
[2026-01-01T00:00:00.000Z] WARN RuntimeWarning: Extraneous file found in directory /opt/icloud-photos-library/My Album
```

The same warnings are also exported as `warn-*` fields of the [metrics file](sync-metrics.md#metrics) and as `type` label of the [`icps_warnings_total`](sync-metrics.md#prometheus-openmetrics) Prometheus metric.

The [suppress warnings flag](cli.md#suppress-warnings) only hides the warnings printed directly to the CLI (unknown filetype, MFA, trusted phone numbers, web server and resource file warnings). The count summaries printed after each sync step, as well as the log file, are not affected.

## Syncing

### Warning: Detected unknown filetype (`descriptor` with `ext`)

Supported filetypes need to be hardcoded in the application. This error indicates that one of your assets has a filetype that is currently not supported. If you have [error reporting](error-reporting.md) enabled, your filetype is reported to the author automatically and the message is printed without the `Warning:` prefix (`...: This error will be automatically reported (See GH issue 143 for more information)`). Otherwise, report your filetype in the [open issue](https://github.com/steilerDev/icloud-photos-sync/issues/143).

The assets with unknown filetype will be ignored during syncing, the remaining files will sync as expected. Those assets are also counted towards the [unable to load remote assets](#warning-unable-to-load-number-remote-assets) (or [local assets](#warning-unable-to-load-number-local-assets)) warning.

Search the log file for a `RuntimeWarning` of the format `Unknown file extension ${ext} for descriptor ${descriptor}`.

### Warning: Detected `number` extraneous files

There should only be symlinks in folders and non-archived albums. Extraneous files are highlighted during library loading.

Search the log file for a `RuntimeWarning` of the format `Extraneous file found in directory ${filePath}`, to find and remove the extraneous file from your file system.

### Warning: Unable to load `number` local assets

There are various reasons, why the application cannot load an asset from the user's local library (e.g. permission issues). The assets that could not be loaded will be ignored during the synchronization.

Search the log file for a `RuntimeWarning` of the format `Error while loading file ${filePath}: ${errDescription}` to get an idea, why loading fails.

### Warning: Detected `number` albums, where asset counts don't match

In an initial set, the API is queried for the number of assets in a given album. This is followed by a query to get all assets associated with the album. For some reason those APIs sometimes return contradicting results (I suspect an error within the iCloud backend).

Search the log file for a `RuntimeWarning` of the format `Expected ${expectedCount} CPLAssets & CPLMasters, but got ${actualCPLAssetCount} CPLAssets and ${actualCPLMasterCount} CPLMasters for album ${albumId}` to understand which albums and assets are impacted. `albumId` is the album's UUID (the name of its hidden `.{UUID}` folder in the library), or `All photos` for the whole library.

Records that could not be parsed are listed with a `WARN` log line of the format `${number} unexpected errors for ${albumId}: ${errorCodes}`. Those records are ignored.

### Warning: Unable to load `number` remote assets

There are various reasons, why the application cannot load an asset from the iCloud Photos Library backend (e.g. unreliable network connection). The assets that could not be loaded will be ignored during the synchronization.

Search the log file for a `RuntimeWarning` of the format `Error while loading iCloud asset ${recordName}: ${errDescription}` to understand which assets are impacted.

### Warning: Detected `number` errors while adding assets

A failed download (network or HTTP error) or a failed verification of the downloaded file only affects this asset. The sync continues with the remaining assets and the affected assets will be retried during the next sync.

File system errors (e.g. missing permissions or no space left on the device) affect all assets: They abort the current sync attempt, which is then [retried](#detected-error-during-sync).

Search the log file for a `RuntimeWarning` of the format `Error while verifying asset ${assetName}: ${errDescription}` to understand which assets are impacted. `assetName` is the asset's file checksum, which (URL-safe encoded) is also the base of its file name within `_All-Photos`.

### Warning: Detected `number` errors while linking assets to albums

When linking assets into the directory tree various errors can happen (e.g. assets with a naming conflict in the same folder). This leads to assets missing within the album structure, while still being within the `_All-Photos` folder.

Search the log file for a `RuntimeWarning` of the format `Error while linking ${srcPath} to ${dstPath}: ${errDescription}` to understand which assets and albums are impacted.

### Warning: Detected `number` errors while writing albums

There are various reasons, why the application cannot write an an album to disk (e.g. permission issues). The albums experiencing this error are most likely not written to disk or missing assets.

Search the log file for a `RuntimeWarning` of the format `Error while writing album ${albumName}: ${errDescription}` to understand which albums are impacted.

### Detected error during sync

```
Detected error during sync: ${errDescription}
Refreshing iCloud connection & retrying (attempt #${number})...
```

The current sync attempt failed (e.g. due to a network error, an expired session or a file system error). The application re-establishes the iCloud connection and starts over, keeping all assets that were already written. Each retry counts towards the [maximum number of retries](cli.md#max-retries), after which the sync fails.

The same message is logged as `RuntimeWarning`.

### Download URLs expired after writing `number` assets, refreshing remote state...

The download URLs, which are part of the fetched metadata, expire after roughly 15 minutes. Large libraries therefore need multiple passes: The remote state is fetched again and the sync continues with the remaining assets. As long as assets were written since the previous refresh, this does not count as a retry.

### CloudKit asked to retry `request` after `number`s (retry `n`/10)

The iCloud backend is throttling the application. All metadata requests are paused for the requested time. If the same request is throttled more than 10 times, it fails and the sync is [retried](#detected-error-during-sync). If this happens regularly, consider lowering the [metadata rate](cli.md#metadata-rate).

This message is only written to the log file.

### Sync execution skipped, because a job is still running

In daemon mode, the scheduled sync was skipped, because the previous sync (or a re-authentication requested through the [Web UI](web-ui.md)) was still running. The message includes the time of the next scheduled run. If this happens regularly, choose a less frequent schedule.

## Authentication & Web UI

### MFA error

Printed as `Warning: MFA_RESEND_FAILED: Unable to resend MFA code caused by ${errDescription}`, if the MFA code could not be requested through the selected method. Request it again, or choose a different method.

Search the log file for a `RuntimeWarning` of the format `Error within MFA flow: ${errDescription}`.

### Trusted phone numbers error

Printed as `Warning: MFA_NO_PHONE_NUMBERS: Unable to acquire trusted phone numbers caused by ${errDescription}`, if the trusted phone numbers of the account could not be loaded. The Web UI can then not offer the phone numbers for requesting the MFA code via SMS or voice call, the code pushed to the trusted devices is not affected.

Search the log file for a `RuntimeWarning` of the format `Error while loading trusted phone numbers: ${errDescription}`.

### Web server error

Printed, if the [Web UI](web-ui.md) or its [API](api.md) received a request it could not process, e.g. an unknown endpoint, an invalid MFA code format, an MFA code while none was expected, or a request while a sync is in progress. The request is rejected, the application continues.

Search the log file for a `RuntimeWarning` of the format `Error within web server: ${errDescription}`.

### Resource file error

Printed, if the resource file `.icloud-photos-sync` in the data directory could not be read or written (e.g. due to missing permissions). If it cannot be written, the trust token is not persisted and a new MFA code is required upon the next start.

Search the log file for a `RuntimeWarning` of the format `Error while accessing resource file: ${errDescription}`.

## Archiving

### Detected `number` errors while archiving assets

There are various reasons, why the application cannot archive an asset (e.g. permission issues). The asset experiencing this error might not be correctly archived or corrupted. The remote asset will not be deleted in this case.

Search the log file for a `RuntimeWarning` of the format `Error while archiving asset ${assetPath}: ${errDescription}` to understand which assets are impacted.
