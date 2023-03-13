## v1.2.0-nightly

## v1.1.0

  * **BREAKING CLI CHANGE**:
    * Specifying no command will print help and not automatically start `daemon` mode
    * The CLI option `-r, --max-retries` no longer uses `-1` to disable the option, but `Infinity`.
  * **Support for iCloud Shared Photo Library**
  * Filetype support added for
    * `avi`
  * Reworked error structure
  * Added sync metrics export functionality (See [docs](https://steilerdev.github.io/icloud-photos-sync/user-guides/sync-metrics/), closes [#127](https://github.com/steilerDev/icloud-photos-sync/issues/127))
  * Asset verification improvements:
    * Removed 2GB limitation during verification (closes [#155](https://github.com/steilerDev/icloud-photos-sync/issues/155))
    * Improves output when asset verification fails (closes [#156](https://github.com/steilerDev/icloud-photos-sync/issues/156))
    * Acceptable mtime range (before verification fails) increased to 1000ms
    * Failed asset verification no longer fatal error, but warning
  * Sync reliability improvements:
    * Added `412` response error handling during signin (closes [#185](https://github.com/steilerDev/icloud-photos-sync/issues/185))
    * Added recoverable `EAI_AGAIN` error (closes [#159](https://github.com/steilerDev/icloud-photos-sync/issues/159))
    * Handling `RUNNING` indexing state (closes [#167](https://github.com/steilerDev/icloud-photos-sync/issues/167))
    * Metadata rate limiting to support large libraries through `--metadata-rate` (closes [#182](https://github.com/steilerDev/icloud-photos-sync/issues/182))
  * Archive improvements:
    * Modified time is now properly preserved upon archiving (closes [#192](https://github.com/steilerDev/icloud-photos-sync/issues/192))

## v1.0.1

This release contains a massive amount of 'behind the scenes' changes to the development and testing process. This is a big step towards long term maintainability of this codebase.

  * Created fully automated CI/CD process for smooth future releases
  * Performing continuous API tests via GH Actions using a test environment
  * Implemented testing process
    * Unit tests implemented for
      * `app`
        * `factory`
      * `icloud`
        * `mfa-server`
        * `icloud-auth`
        * `icloud-photos` (pending)
      * `photos-library`
      * `mfa-server`
      * `sync-engine`
        * `fetchNLoad`
        * `diffing`
        * `asset-write`
        * `album-write`
      * `archive-engine`
    * API Tests of iCloud & iCloud Photos backend
    * Basic testing of Docker Image
  * Various bug fixes, re-implementations and re-structuring
  * Documentation pages using MKDocs & GH Pages
  * Now running CodeQL and dependabot scans
  * Initial steps for support of iCloud Shared Photo Libraries
  * Error and Crash Reporting integration
  * Archiving fully supported
  * Integrated scheduling to have synchronization happen regularly

## v0.2.0 - Folder Sync working
With this release the sync of the remote state is fully functional. This release adds the reconstruction of the full folder structure. In a space efficient way (through links).

## v0.1.1 - MVP Release
This is the MVP release. Currently only assets are synced, the folder structure cannot be synced nor archiving is implemented yet.