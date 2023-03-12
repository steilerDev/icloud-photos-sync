# Common Warnings

While using this application, warnings might appear. This is either due to the fact that the API is not completely understood and/or inconsistent. The overall goals of the application can still be achieved, however a small percentage of assets might be miss-represented. The impact can be gauged by observing the below messages.

Warnings can be suppressed with a [configuration options](https://steilerdev.github.io/icloud-photos-sync/user-guides/cli/).

### Authentication

  - `MFA_RESEND_FAILED (WARN): Unable to request new MFA code caused by <cause>`
    Requesting a new MFA code was unsuccessful. The cause should provide information about this - probably the selected method is not available. Re-try using a different method.
  - `MFA_METHOD_NOT_FOUND (WARN): Received request with unsupported method (endpoint <endpoint>, method <method>)` or `MFA_ROUTE_NOT_FOUND (WARN): Received request to unknown endpoint (<url>)` or `MFA_CODE_FORMAT (WARN): Received unexpected MFA code format, expecting 6 digits (<url>)`
    The local server, listening for commands in the context of multi-factor authentication received an unexpected request. Make sure your requests are [formatted correctly](https://steilerdev.github.io/icloud-photos-sync/get-started/#multi-factor-authentication).

### Syncing

  - Local Library:
    - `LIBRARY_INVALID_FILE (WARN): Found invalid file (<fileName>) caused by <cause>`
      An invalid file was found in the directory tree and will be ignored - consider removing it.
    - `LIBRARY_DEAD_SYMLINK (WARN): Found dead symlink (removing it) (<path>) caused by <cause>`
      A dead symlink was found and removed.
    - `LIBRARY_EXTRANEOUS_FILE (WARN): Extraneous file found while processing a folder (<path>)`
      An un-safe file was found in the directory tree - consider removing it.
  - Remote Library:
    - `ICLOUD_PHOTOS_COUNT_MISMATCH (WARN): Received unexpected amount of records (expected <n> CPLMaster & <m> CPLAsset records, but got <x> CPLMaster & <y> CPLAsset records for album <albumName>)`
      In an initial set, the API is queried for the number of assets in a given album. This is followed by a query to get all assets associated with the album. For some reason those APIs sometimes return contradicting results. (I suspect an error within the iCloud backend)
  - State write:
    - `LIBRARY_INVALID_ASSET (warn): Unable to verify asset (<assetName>) caused by <cause>`
      After writing the asset, there is a conflict between the expected and actual state of the asset. Since this check fails, the file will be removed during the next sync execution and the retrieval of the remote asset is performed again. This might lead to temporary inconsistencies of the local library.
    - `LIBRARY_LINK (WARN): Unable to link assets (<pathA> to <pathB>) caused by <cause>`
      An asset could not be linked into an album. The cause provided should indicate if this is due to an issue within the folder or a missing asset. This is probably related to previous errors and indicates temporary inconsistencies of the local library.
    - `SYNC_ADD_ALBUM (WARN): Unable to add album (<albumName>) caused by <cause>`
      The given album could not be added to the file tree. This does not affect the actual assets, since those are only linked to the album. The cause provided should indicate the root cause. This will lead to temporary inconsistencies of the local library.

### Archiving

  - `ARCHIVE_NO_REMOTE_ASSET (WARN): Unable to find remote asset (<uuid>)` or `ARCHIVE_NO_REMOTE_RECORD_NAME (WARN): Unable to get record name (<name>)`
    An asset that should be remotely deleted can not be retrieved. The remote asset will not be deleted by this process.