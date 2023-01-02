# Changelog

## Nightly Changes
This release contains a massive amount of 'behind the scenes' changes to the development and testing process. This is a big step torwards long term maintainability of this code base.

  * Created fully automated CI/CD process for smooth future releases
  * Performing continous API tests via GH Actions using a test environment
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
  * Foundations for archiving
  * Various bug fixes, re-implementations and re-structuring
  * Documentation pages using MKDocs & GH Pages
  * Now running CodeQL and dependabot scans
  * Initial steps for support of iCloud Shared Photo Libraries
  * Error and Crash Reporting integration
  * Archiving fully working

## v0.2.0 - Folder Sync working
With this release the sync of the remote state is fully functional. This release adds the reconstruction of the full folder structure. In a space efficient way (through links).

## v0.1.1 - MVP Release
This is the MVP release. Currently only assets are synced, the folder structure cannot be synced nor archiving is implemented yet.

See [Milestone Plan in the README](https://github.com/steilerDev/icloud-photos-sync/blob/9492d82079f41e3fd98c66d664a680a6c34afd97/README.md#milestone-plan) for more details.