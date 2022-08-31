<p align="center">
  <a href="https://steilerdev.github.io/icloud-photos-sync/">
    <img alt="icloud-photos-sync Logo" width="200px" src="https://steilerdev.github.io/icloud-photos-sync/assets/icloud-photos-sync.svg">
  </a>
  <h1>iCloud Photos Sync</h1>
  <p><b>Work in progress</b>, <a href="https://steilerdev.github.io/icloud-photos-sync/dev/milestone-plan/">see current state & milestone plan</a></p>
</p>

### Status
[![API Status](https://img.shields.io/github/workflow/status/steilerDev/icloud-photos-sync/API%20Test?label=API%20Status&style=for-the-badge)](https://github.com/steilerDev/icloud-photos-sync/actions/workflows/api-test.yml)
[![Development Release Status](https://img.shields.io/github/workflow/status/steilerDev/icloud-photos-sync/Development%20Release?label=Dev%20Release&style=for-the-badge)](https://github.com/steilerDev/icloud-photos-sync/actions/workflows/dev-release.yml)
[![Production Release Status](https://img.shields.io/github/workflow/status/steilerDev/icloud-photos-sync/Production%20Release?label=Prod%20Release&style=for-the-badge)](https://github.com/steilerDev/icloud-photos-sync/actions/workflows/prod-release.yml)

### OS Support
![OS Support Debian](https://img.shields.io/static/v1?label=Debian-11&message=Dev%20Platform&color=informational&style=for-the-badge)
[![OS Support Ubuntu](https://img.shields.io/static/v1?label=Ubuntu-latest&message=Unit%20Test&color=success&style=for-the-badge)](https://github.com/actions/runner-images#available-images)
[![OS Support MacOS](https://img.shields.io/static/v1?label=MacOS-latest&message=Unit%20Test&color=success&style=for-the-badge)](https://github.com/actions/runner-images#available-images)
[![OS Support Windows](https://img.shields.io/static/v1?label=Windows-latest&message=Skipped&color=inactive&style=for-the-badge)](https://github.com/actions/runner-images#available-images)

### Downloads
[![GitHub release (latest by date including pre-releases)](https://img.shields.io/github/v/release/steilerdev/icloud-photos-sync?include_prereleases&style=for-the-badge)](https://github.com/steilerDev/icloud-photos-sync/releases)
[![npm](https://img.shields.io/npm/dm/icloud-photos-sync?label=npm%20downloads&style=for-the-badge)](https://www.npmjs.com/package/icloud-photos-sync)
[![Docker Pulls](https://img.shields.io/docker/pulls/steilerdev/icloud-photos-sync?style=for-the-badge)](https://hub.docker.com/r/steilerdev/icloud-photos-sync)

## Overview
This project provides a one-way sync engine for the iCloud Photos Library. The intention behind this project is to provide an easy way, to natively backup the full iCloud Photos Library to the native filesystem.

Currently, this can only be achived, by having a Mac continously run the *Photos.app* (with `Keep originals` enabled). With this method, the files cannot be easily viewed without the Photos.app.

This CLI Application offers the following functionality:
  - Continously sync your remote iCloud Photos Library to your local file system
  - Support for MFA Authentication through trusted devices, SMS and Voice authentication
  - Archiving of folders
    - All assets currently in the album will be persisted in the respective folder on the machine running icloud-photos-sync
    - Future syncs will ignore the folder (so those assets will not be changed/deleted)
    - If the remote album is moved, the archived folder will be moved to the same location
    - If the remote album is deleted, the archived folder will be put into a 'lost+found' type of folder
    - (*optionally*) All photos from the archived folder will be deleted from the iCloud Photos Library, unless they are *Favorites* (Saving cloud storage needs)

My personal use case / workflow is [documented on GH Pages](https://steilerdev.github.io/icloud-photos-sync/dev/motivation/), alongside some other potential interessting pieces of (developer) documentation.

## Guides
This app is written in Typescript/NodeJS and can therefore be executed directly on the host through npm. Alternatively a Docker Image is provided:
  - [NPM User Guide](https://steilerdev.github.io/icloud-photos-sync/user-guides/npm/)
  - [Docker User Guide](https://steilerdev.github.io/icloud-photos-sync/user-guides/docker/)
  - [CLI Reference](https://steilerdev.github.io/icloud-photos-sync/user-guides/cli/)

## Contributing & Feedback
he tool is not yet 'production ready', since it (mighmost likely) still contains some issues and edge cases, that need to be addressed.

I hope for the support of the community, to fully understand the reverse-engineered API and discover edge cases and bugs. I tried to make this code base as maintainable and automated as possible, in order to make future releases and contributions quick and easy.

Please [open an issue](https://github.com/steilerDev/icloud-photos-sync/issues/new) (and attach the `.icloud-photos-sync.log`, stored in the `DATA_DIR`) for any bug you are experiencing!