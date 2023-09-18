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

  * [`_All-Photos` folder](#primary-asset-dir) (aka. `PRIMARY_ASSET_DIR`, [see src](https://github.com/steilerDev/icloud-photos-sync/wiki/lib.photos-library.constants#primary_asset_dir))
  * [`_Shared-Photos` folder](#shared-asset-dir) (aka. `SHARED_ASSET_DIR`, [see src](https://github.com/steilerDev/icloud-photos-sync/wiki/lib.photos-library.constants#shared_asset_dir))
  * [`_Archive` folder](#archive-dir) (aka. `ARCHIVE_DIR`, [see src](https://github.com/steilerDev/icloud-photos-sync/wiki/lib.photos-library.constants#archive_dir))
  * `.icloud-photos-sync` file holding resource information about the current photos library (including authentication secrets for re-authentication without MFA)
  * `.icloud-photos-sync.log` log file (overwritten upon application restart)
  * `icloud-photos-sync.metrics` file, that [export metrics using the Influx Line Protocol](https://steilerdev.github.io/icloud-photos-sync/user-guides/sync-metrics/) (overwritten upon application restart), if [metrics export is enabled](../../user-guides/cli/#export-metrics)
  * `icloud-photos-sync.har` file, that contains a HAR file capture of the last execution, if [network capture is enabled](../../user-guides/cli/#enable-network-capture)
  * `.crash-reporter` folder, that contains unsent error reports, in case the reporter was not able to send it before the application exited. Only present if [crash reporting is enabled](../../user-guides/cli/#enable-crash-reporting)
  * [User created folders](#user-folders) from the iCloud Library
  * lock file .library.lock
  * crash reporting db

### Asset Directories

The primary and shared asset directory contain the actual assets, downloaded from the iCloud backend.

Their filename is the unique checksum, as provided by the iCloud backend, together with their correct file extension. The m-time is set, based on the returned 'modified' timestamp.

The filename was selected to use the checksum as a unique asset identifier. This allows efficient comparison of local and remote assets while avoiding naming conflicts. Additional comparison checks include the file size and the modified timestamp.

### Primary Asset dir

The primary asset dir contains all assets stored in the user's iCloud Photos Library.

### Shared Asset Dir
The asset dir contains all assets stored in the shared iCloud Photos Library.

### Archive Dir
If an archived folder is deleted in the iCloud backend, this folder will be moved to the archive dir. When archived folders are moved on the backend, a subfolder (`.stash`) is used to keep track of them. Files and folders in this directory are ignored by this application and can be organized in this folder as you wish.

### User Folders
Every user folder has two components:

  - A symlink with the display name of the folder/album, which links to
  - A folder containing the data, named after the UUID of the folder (and hidden: `.{UUID}`)

This is done to keep sync relevant UUIDs within the file system, while presenting the user with readable strings that resemble their photos library.

For each asset within an album, a link to the (~~shared or~~ primary) asset dir is created. Naming is based on the filename, provided by iCloud. Original files don't have a suffix, edits are suffixed with `-edited`, live photos are suffixed with `-live` ([see src](https://github.com/steilerDev/icloud-photos-sync/wiki/lib.photos-library.model.asset.Asset#getprettyfilename)).

Due to current limitations of the iCloud Web API, user folders only contain assets from the primary library, assets from the shared library cannot be linked to user folders.

If a user folder contains any file that is not defined as *safe* (see [Safe Files](https://github.com/steilerDev/icloud-photos-sync/wiki/lib.photos-library.constants#safe_files)), it is marked as archived, and its content is ignored upon future syncs.