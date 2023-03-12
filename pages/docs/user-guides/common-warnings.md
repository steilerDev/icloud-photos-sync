# Common Warnings

While using this application, warnings might appear. This is either due to the fact that the API is not completely understood and/or inconsistent. The overall goals of the application can still be achieved, however a small percentage of assets might be miss-represented. The impact can be gauged by observing the below messages.

Warnings can be suppressed with a [configuration options](https://steilerdev.github.io/icloud-photos-sync/user-guides/cli/).

### Authentication

  - `Unable to request new MFA code <cause>`
    Requesting a new MFA code was unsuccessful. The cause should provide information about this - probably the selected method is not available. Re-try using a different method.
  - `Received request with unsupported method` or `Received request to unknown endpoint` or `Received unexpected MFA code format, expecting 6 digits`
    The local server, listening for commands in the context of multi-factor authentication received an unexpected request. Make sure your requests are [formatted correctly](https://steilerdev.github.io/icloud-photos-sync/get-started/#multi-factor-authentication).

### Syncing

  - Local Library:
    - `Found invalid file <fileName>`
      An invalid file was found in the directory tree and will be ignored - consider removing it.
    - `Found dead symlink (removing it) <path>`
      A dead symlink was found and removed.
    - `Extraneous file found while processing a folder`
      An un-safe file was found in the directory tree - consider removing it.
  - Remote Library:
    - `Received unexpected amount of records, expected <n> CPLMaster & <m> CPLAsset records, but got <x> CPLMaster & <y> CPLAsset records for album <albumName>`
      In an initial set, the API is queried for the number of assets in a given album. This is followed by a query to get all assets associated with the album. For some reason those APIs sometimes return contradicting results. (I suspect an error within the iCloud backend)
  - State write:
    - `Unable to verify asset <assetName>`
      After writing the asset, there is a conflict between the expected and actual state of the asset. Since this check fails, the file will be removed during the next sync execution and the retrieval of the remote asset is performed again. This might lead to temporary inconsistencies of the local library.
    - `Unable to link assets, <pathA> to <pathB>`
      An asset could not be linked into an album. The cause provided should indicate if this is due to an issue within the folder or a missing asset. This is probably related to previous errors and indicates temporary inconsistencies of the local library.
    - `Unable to add album <albumName>`
      The given album could not be added to the file tree. This does not affect the actual assets, since those are only linked to the album. The cause provided should indicate the root cause. This will lead to temporary inconsistencies of the local library.
    - `Detected recoverable error, refreshing iCloud connection & retrying (#<retryCount>)...`
      A recoverable error happened during execution. This is most likely due to the fact, that the iCloud metadata will be stale after 60mins.
  

### Archiving

  - `Unable to find remote asset <uuid>` or `Unable to get record name <name>`
    An asset that should be remotely deleted can not be retrieved. The remote asset will not be deleted by this process.