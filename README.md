<p align="center">
  <a href="https://icloud-photos-sync.steilerdev.de/">
    <img alt="icloud-photos-sync Logo" src="https://icloud-photos-sync.steilerdev.de/assets/icloud-photos-sync-open-graph.png">
  </a>
</p>

<h1 align="center"><strong>iCloud Photos Sync</strong></h1>
<p align="center" style="font-size:130%;">
  ⚠️ <strong>Work in progress</strong>, <a href="https://github.com/steilerDev/icloud-photos-sync/milestone/1">see milestone plan</a> ⚠️
</p>

<p align="center">
  <a href="https://github.com/steilerDev/icloud-photos-sync/actions/workflows/api-test.yml">
    <img alt="API Status" src="https://img.shields.io/github/actions/workflow/status/steilerDev/icloud-photos-sync/api-test.yml?branch=main&label=API%20Status&style=for-the-badge">
  </a>
  <a href="https://github.com/steilerDev/icloud-photos-sync/actions/workflows/dev-release.yml">
    <img alt="Development Release Status" src="https://img.shields.io/github/actions/workflow/status/steilerDev/icloud-photos-sync/dev-release.yml?branch=dev&label=Dev%20Release&style=for-the-badge">
  </a>
  <a href="https://github.com/steilerDev/icloud-photos-sync/actions/workflows/prod-release.yml">
    <img alt="Production Release Status" src="https://img.shields.io/github/actions/workflow/status/steilerDev/icloud-photos-sync/prod-release.yml?branch=main&label=Prod%20Release&style=for-the-badge">
  </a>
</p>
<hr>
<p align="center">
  <a href="https://github.com/steilerDev/icloud-photos-sync/releases">
    <img alt="GitHub release (latest by date including pre-releases)" src="https://img.shields.io/github/v/release/steilerdev/icloud-photos-sync?include_prereleases&amp;style=for-the-badge">
  </a>
  <a href="https://www.npmjs.com/package/icloud-photos-sync">
    <img alt="npm" src="https://img.shields.io/npm/dm/icloud-photos-sync?label=npm%20downloads&amp;style=for-the-badge">
  </a>
  <a href="https://hub.docker.com/r/steilerdev/icloud-photos-sync">
    <img alt="Docker Pulls" src="https://img.shields.io/docker/pulls/steilerdev/icloud-photos-sync?style=for-the-badge">
  </a>
</p>
<hr>
<p align="center">
  <a href="https://icloud-photos-sync.steilerdev.de/user-guides/docker/">
    <img alt="Get Started - Docker" src="https://img.shields.io/badge/Get%20started!-Docker-blue?style=for-the-badge">
  </a>
  <a href="https://icloud-photos-sync.steilerdev.de/user-guides/npm/">
    <img alt="Get Started - NPM" src="https://img.shields.io/badge/Get%20started!-NPM-red?style=for-the-badge">
  </a>
</p>

## Overview
This project provides a one-way sync engine for the iCloud Photos Library. The intention behind this project is to provide an easy way, to natively backup the full iCloud Photos Library to the native filesystem.

Currently, this can only be achived, by having a Mac continously run the *Photos.app* (with `Keep originals` enabled). With this method, the files cannot be easily viewed without the Photos.app.

This CLI Application offers the following functionality:

  - *Continuously sync your remote iCloud Photos Library to your local file system effeciently*
    - Support of MFA Authentication through trusted devices, SMS and Voice authentication
    - Enable autonomous operation, by caching of MFA trust token (seems to be valid for 30 days: Aug 28, 2022 - Sep 27, 2022, Sep 28, 2022 - ???)
    - Support of large libraries, through efficient diffing algorithm instead of full library pull
    - Full iCloud Photos Library Backup with all important files in their original state + edits
  - *Efficient handling of local state*
    - Each asset is only downloaded once and linked to its respective folders
    - No need track local state in database, since state is completely reflected in filesystem (through naming & linking)
  - *Archiving of folders*
    - All assets currently in the album will be persisted in the respective folder on the machine running icloud-photos-sync
    - Future syncs will ignore the folder (so those assets will not be changed/deleted)
    - If the remote album is moved, the archived folder will be moved to the same location
    - If the remote album is deleted, the archived folder will be put into a 'lost+found' type of folder
    - (*optionally*) All photos from the archived folder will be deleted from the iCloud Photos Library, unless they are *Favorites* (Reducing cloud storage needs)
  - *Single purpose iCloud Photos application*
    - No reliance on full fledged third-party libraries that provide access to iCloud
    - No configuration needed for continuous full backup
    - Quicker support of use-case specific needs
  - *Support of shared Photos Library*

My personal use case / workflow is [documented on GH Pages](https://icloud-photos-sync.steilerdev.de/dev/motivation/), alongside some other potential interessting pieces of documentation.

## Guides
This application is written in Typescript/NodeJS and can therefore be executed directly on various platforms through npm. Please check this application's [OS support matrix](#os-support) for compatibility. Alternatively a Docker Image is provided (and preferred).

  - [NPM User Guide](https://icloud-photos-sync.steilerdev.de/user-guides/npm/)
  - [Docker User Guide](https://icloud-photos-sync.steilerdev.de/user-guides/docker/)
  - [CLI Reference](https://icloud-photos-sync.steilerdev.de/user-guides/cli/)

## OS Support
![OS Support Debian](https://img.shields.io/static/v1?label=Debian-11&message=Dev%20Platform&color=informational&style=for-the-badge)

[![OS Support Ubuntu](https://img.shields.io/static/v1?label=Ubuntu-latest&message=Unit%20Test&color=success&style=for-the-badge)](https://github.com/actions/runner-images#available-images)

[![OS Support MacOS](https://img.shields.io/static/v1?label=MacOS-latest&message=Unit%20Test&color=success&style=for-the-badge)](https://github.com/actions/runner-images#available-images)

[![OS Support Windows](https://img.shields.io/static/v1?label=Windows-latest&message=Not%20planned&color=inactive&style=for-the-badge)](https://github.com/actions/runner-images#available-images)

## Security of your Apple ID credentials
Since this application needs to communicate with the Apple iCloud backend, full access to your AppleID needs to be provided. By providing full access to the source code of this application, I hope to gain your trust, that I am not able to read or access your credentials or tokens!

This application will never log any credentials (except when log level is set to `trace`, so be careful when doing this!). Credentials are only sent directly to Apple's authentication servers - third party services are NOT involved.

In order to improve this application's development, this tool can report crash and error data to the developer. This capability requires opt-in and is the only non-Apple service this application will communicate with. Scrubbing of credentials and sensitive data is performed before any errors are persisted. More information about this topic can be found [here](https://icloud-photos-sync.steilerdev.de/user-guides/telemetry/).

## Contributing & Feedback
This tool is not yet *production ready*, since it (most likely) still contains some issues and edge cases, that need to be addressed.

I hope for the support of the community, to fully understand the reverse-engineered API and discover edge cases and bugs. I tried to make this code base as maintainable and automated as possible, in order to make future releases and contributions quick and easy.

Please [open an issue](https://github.com/steilerDev/icloud-photos-sync/issues/new) (and attach the `.icloud-photos-sync.log`, stored in the `DATA_DIR`) for any bug you are experiencing. Additionally please [enable crash and error reporting](https://icloud-photos-sync.steilerdev.de/user-guides/telemetry/), so this crash and all required technical details are recorded and reported.