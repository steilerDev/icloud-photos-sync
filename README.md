# iCloud Photos Sync

**Work in progress, [current state and upcoming milestones on GH pages](https://steilerdev.github.io/icloud-photos-sync/dev/milestone-plan/)**

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

Currently, this can only be achived, by having a Mac continously run the Photos.app (with 'Keep originals' enabled). With this method the files cannot be easily viewed without the Photos.app.

Albums can be archived ([currently an open milestone](https://steilerdev.github.io/icloud-photos-sync/dev/milestone-plan/)). This will enable users to keep their favorite pictures in the iCloud Photos Library, while reducing iCloud storage needs. This is done by offloading them to the local server/NAS (where this script is running).

Upon archiving an album the following will happen:
- All assets currently in the album will be persisted in the respective folder on the machine running icloud-photos-sync
- Future syncs will ignore the folder (so those assets will not be changed/deleted)
- All photos from the archived folder will be deleted from the iCloud Photos Library, unless they are *Favorites*

My personal use case / workflow is [documented](https://steilerdev.github.io/icloud-photos-sync/dev/motivation/), alongside some other potential interessting pieces of documentation, helping to understand the scope of this project.

## Guides
This app is written in typescript and can therefore be used directly on the host through npm or by using the provided Docker image:
  - [NPM User Guide](https://steilerdev.github.io/icloud-photos-sync/user-guides/cli/)
  - [Docker User Guide](https://steilerdev.github.io/icloud-photos-sync/user-guides/docker/)
  - [CLI Reference](https://steilerdev.github.io/icloud-photos-sync/user-guides/cli/)

## Contributing & Feedback
This app relatively young and there might still be some issues, that need to be addressed..

I hope some early adopters will help me fully understand the reverse-engineered API and discover edge cases and bugs. I tried to make this code base as maintainable and automated as possible, in the hopes to find support through other contributors soon.

Please [open an issue](https://github.com/steilerDev/icloud-photos-sync/issues/new) for any bug you are experiencing!