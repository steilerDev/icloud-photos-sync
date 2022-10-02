<p align="center">
  <a href="https://steilerdev.github.io/icloud-photos-sync/">
    <img alt="icloud-photos-sync Logo" src="https://steilerdev.github.io/icloud-photos-sync/assets/icloud-photos-sync-open-graph.png">
  </a>
</p>

<h1 align="center"><strong>iCloud Photos Sync</strong></h1>
<p align="center" style="font-size:130%;">
  ⚠️ <strong>Work in progress</strong>, <a href="https://steilerdev.github.io/icloud-photos-sync/dev/milestone-plan/">see curent state &amp; milestone plan</a> ⚠️
</p>

<p align="center">
  <a href="https://github.com/steilerDev/icloud-photos-sync/actions/workflows/api-test.yml">
    <img alt="API Status" src="https://img.shields.io/github/workflow/status/steilerDev/icloud-photos-sync/API%20Test?label=API%20Status&amp;style=for-the-badge">
  </a>
  <a href="https://github.com/steilerDev/icloud-photos-sync/actions/workflows/dev-release.yml">
    <img alt="Development Release Status" src="https://img.shields.io/github/workflow/status/steilerDev/icloud-photos-sync/Development%20Release?label=Dev%20Release&amp;style=for-the-badge">
  </a>
  <a href="https://github.com/steilerDev/icloud-photos-sync/actions/workflows/prod-release.yml">
    <img alt="Production Release Status" src="https://img.shields.io/github/workflow/status/steilerDev/icloud-photos-sync/Production%20Release?label=Prod%20Release&amp;style=for-the-badge">
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

My personal use case / workflow is [documented on GH Pages](https://steilerdev.github.io/icloud-photos-sync/dev/motivation/), alongside some other potential interessting pieces of documentation.

## Guides
This application is written in Typescript/NodeJS and can therefore be executed directly on various platforms through npm. Please check this application's [OS support matrix](#os-support) for compatibility. Alternatively a Docker Image is provided (and preferred).

  - [NPM User Guide](https://steilerdev.github.io/icloud-photos-sync/user-guides/npm/)
  - [Docker User Guide](https://steilerdev.github.io/icloud-photos-sync/user-guides/docker/)
  - [CLI Reference](https://steilerdev.github.io/icloud-photos-sync/user-guides/cli/)

## OS Support
![OS Support Debian](https://img.shields.io/static/v1?label=Debian-11&message=Dev%20Platform&color=informational&style=for-the-badge)

[![OS Support Ubuntu](https://img.shields.io/static/v1?label=Ubuntu-latest&message=Unit%20Test&color=success&style=for-the-badge)](https://github.com/actions/runner-images#available-images)

[![OS Support MacOS](https://img.shields.io/static/v1?label=MacOS-latest&message=Unit%20Test&color=success&style=for-the-badge)](https://github.com/actions/runner-images#available-images)

[![OS Support Windows](https://img.shields.io/static/v1?label=Windows-latest&message=Not%20planned&color=inactive&style=for-the-badge)](https://github.com/actions/runner-images#available-images)

## Contributing & Feedback
This tool is not yet *production ready*, since it (most likely) still contains some issues and edge cases, that need to be addressed.

I hope for the support of the community, to fully understand the reverse-engineered API and discover edge cases and bugs. I tried to make this code base as maintainable and automated as possible, in order to make future releases and contributions quick and easy.

Please [open an issue](https://github.com/steilerDev/icloud-photos-sync/issues/new) (and attach the `.icloud-photos-sync.log`, stored in the `DATA_DIR`) for any bug you are experiencing!