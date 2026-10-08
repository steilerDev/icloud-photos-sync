# Local File Structure
This documentation describes the local file structure, that is written by this application. Even though the design of this application should handle alterations to the file system structure, it is not recommended to change it manually.

## Design Goal
The structure was created with the primary design goal of not requiring an additional database system, that keeps track of the metadata of locally synced assets. There is a performance impact on the load time of the local library, as the full data tree has to be scanned when loading the local state, however this choice was made deliberately:

- Reduces system complexity for handling a database system
- Ensures that the local file system will never deviate from the metadata store
- Never having to deal with a corrupted metadata store

This approach is trading off performance with data integrity and should ensure straight forward failure recovery.

## Root folder
The root folder is specified through environment variable `DATA_DIR`. All assets and information are stored here:

  * [`_All-Photos` folder](#primary-asset-dir) (aka. `PRIMARY_ASSET_DIR`)
  * [`_Shared-Photos` folder](#shared-asset-dir) (aka. `SHARED_ASSET_DIR`)
  * [`_Archive` folder](#archive-dir) (aka. `ARCHIVE_DIR`)
  * [`_Trash` folder](#trash-dir) (aka. `TRASH_DIR`), if [soft delete is enabled](../user-guides/cli.md#soft-delete) and no other [trash dir](../user-guides/cli.md#trash-dir) is configured
  * [`.icloud-photos-sync` resource file](#resource-file)
  * `.icloud-photos-sync.log` log file (overwritten upon application restart)
  * `.icloud-photos-sync.metrics` file, that [exports metrics using the Influx Line Protocol](../user-guides/sync-metrics.md) (overwritten upon application restart), if [metrics export is enabled](../user-guides/cli.md#export-metrics)
  * `.icloud-photos-sync.har` file, that contains a HAR file capture of the last execution, if [network capture is enabled](../user-guides/cli.md#enable-network-capture)
  * `.library.lock` lock file, identifying the process currently using the library (random instance id, PID and hostname). The holder refreshes its modification time every 15 seconds - a lock without refresh for 60 seconds (or whose process is no longer running on the same host) is considered stale
  * [User created folders](#user-folders) from the iCloud Library
  * [`_Hidden-Photos` album](#hidden-album), if [syncing hidden photos is enabled](../user-guides/cli.md#sync-hidden)

### Resource File
The `.icloud-photos-sync` JSON file persists the following information (validated against a schema on load):

  * `libraryVersion`: The version of the local library layout (currently `1`). If it does not match the version expected by the application, it aborts with `LIBRARY_ERR.VERSION_MISMATCH`.
  * `trustToken`: The trust token acquired after the last MFA, used to sign in without MFA.
  * `notificationVapidCredentials` and `notificationSubscriptions`: The key pair and the subscriptions of the web UI's push notifications.

Session secrets and cookies are only held in memory and never written to disk.

### Asset Directories

The primary and shared asset directory contain the actual assets, downloaded from the iCloud backend.

Their filename is the unique checksum, as provided by the iCloud backend (re-encoded from base64 to [base64url](https://datatracker.ietf.org/doc/html/rfc4648#section-5), in order to be a valid filename), together with their correct file extension. The m-time is set, based on the returned 'modified' timestamp.

The filename was selected to use the checksum as a unique asset identifier. This allows efficient comparison of local and remote assets while avoiding naming conflicts. Additional comparison checks include the file size and the modified timestamp.

### Primary Asset dir

The primary asset dir contains all assets stored in the user's iCloud Photos Library.

### Shared Asset Dir
The asset dir contains all assets stored in the shared iCloud Photos Library.

### Archive Dir
If an archived album is deleted or moved in the iCloud backend, it is first moved to a stash subfolder (`_Archive/.stash`). If the album is still present in the remote library (e.g. because it was moved), it is restored from the stash to its new location. Otherwise it is moved to `_Archive/<album name>` (suffixed with `-1`, `-2`, ... in case of conflicts), dropping the UUID folder structure. Files and folders in this directory are ignored by this application and can be organized in this folder as you wish.

### Trash Dir
If [soft delete is enabled](../user-guides/cli.md#soft-delete), assets that were deleted in the iCloud backend are moved into the trash dir, instead of being deleted from disk. The trash dir mirrors the asset directories (`_All-Photos` and `_Shared-Photos`) and keeps the assets' filename and m-time. Assets that are replaced (because their metadata changed) are deleted permanently. This application never reads or cleans this directory.

### User Folders
Every user folder has two components:

  - A symlink with the display name of the folder/album, which links to
  - A folder containing the data, named after the UUID of the folder (and hidden: `.{UUID}`)

This is done to keep sync relevant UUIDs within the file system, while presenting the user with readable strings that resemble their photos library.

Slashes (`/`) in folder and album names are replaced with underscores (`_`) for the display name symlink.

For each asset within an album, a relative symlink to the asset dir is created, with its m-time set to the asset's m-time. Naming is based on the filename, provided by iCloud. Original files don't have a suffix, edits are suffixed with `-edited`. The video part of live photos is not synced.

Due to current limitations of the iCloud Web API, user folders only contain assets from the primary library, assets from the shared library cannot be linked to user folders.

Hidden assets are only linked into user folders, if [syncing hidden photos is enabled](../user-guides/cli.md#sync-hidden).

#### Safe files
The following files are considered *safe*, and are ignored when reading the library: `.DS_Store` and `.fuse_hidden*`.

#### Archived albums
If an album (a folder without subfolders) contains a regular file that is not *safe*, it is treated as archived, and its content is ignored upon future syncs. Folders containing subfolders can't be archived: they stay folders, and a warning about the extraneous file is emitted.

When [archiving an album](../get-started.md#archiving), every symlink in the album is replaced with a copy of the linked asset, keeping its m-time. With [`--remote-delete`](../user-guides/cli.md#remote-delete), the archived assets are then removed from the iCloud backend (except favorites).

### Hidden Album
If [syncing hidden photos is enabled](../user-guides/cli.md#sync-hidden), the assets of the *Hidden* album are stored in the primary and shared asset dir, alongside all other assets. Since the *Hidden* album has no representation in the album tree of the iCloud Web API, it is created as an album named `_Hidden-Photos` in the root folder, using the static UUID `----Hidden-Photos----`. It links to all hidden assets of the primary and shared library.
