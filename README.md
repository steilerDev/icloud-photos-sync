<p align="center">
  <a href="https://steilerdev.github.io/icloud-photos-sync/">
    <img alt="icloud-photos-sync Logo" src="https://steilerdev.github.io/icloud-photos-sync/assets/icloud-photos-sync-open-graph.png">
  </a>
</p>

<h1 align="center"><strong>iCloud Photos Sync</strong></h1>

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
  <a href="https://steilerdev.github.io/icloud-photos-sync/get-started/">
    <img alt="Get Started" src="https://img.shields.io/static/v1?label=&message=Get%20Started&color=important&style=for-the-badge" style="width: 50%;">
  </a>
</p>
<p align="center">
  <a href="https://steilerdev.github.io/icloud-photos-sync/user-guides/cli">
    <img alt="CLI Reference" src="https://img.shields.io/static/v1?label=&message=CLI%20Reference&color=grey&style=for-the-badge" style="width: 30%;">
  </a>
</p>
<hr>

## Overview
This project provides a one-way sync engine for the iCloud Photos Library. The intention behind this project is to provide an easy way, to backup the full iCloud Photos Library to the native filesystem.

Currently, this can only be achived, by having a Mac continously run the *Photos.app* (with `Keep originals` enabled). With this method, the files cannot be easily viewed without the *Photos.app*.

This CLI Application offers the following high level functionality:

<details>
  <summary><i>Continuously sync your remote iCloud Photos Library to your local file system effeciently</i></summary>
  <p>
    <ul>
      <li>Support of MFA Authentication through trusted devices, SMS and Voice authentication</li>
      <li>Enable autonomous operation, by caching of MFA trust token</li>
      <li>Support of large libraries, through efficient diffing algorithm instead of full library pull</li>
      <li>Full iCloud Photos Library Backup with all important files in their original state + edits</li>
    </ul>
  </p>
</details>

<details>
  <summary><i>Efficient handling of local state</i></summary>
  <p>
    <ul>
      <li>Each asset is only downloaded once and linked to its respective folders</li>
      <li>No need track local state in database, since state is completely reflected in filesystem (through naming & linking)</li>
    </ul>
  </p>
</details>

<details>
  <summary><i>Archiving of folders</i></summary>
  <p>
    <ul>
      <li>All assets currently in the album will be persisted in the respective folder on the machine running icloud-photos-sync</li>
      <li>Future syncs will ignore the folder (so those assets will not be changed/deleted)</li>
      <li>If the remote album is moved, the archived folder will be moved to the same location</li>
      <li>If the remote album is deleted, the archived folder will be put into a 'lost+found' type of folder</li>
      <li>All photos from the archived folder can be deleted from the iCloud Photos Library, unless they are *Favorites* (Reducing cloud storage needs)</li>
    </ul>
  </p>
</details>

<details>
  <summary><i>Single purpose iCloud Photos application</i></summary>
  <p>
    <ul>
      <li>No reliance on full fledged third-party libraries that provide access to iCloud</li>
      <li>No configuration needed for continuous full backup</li>
      <li>Quicker support of use-case specific needs</li>
    </ul>
  </p>
</details>

## Documentation

A [*Get Started Guide* can be found on GH Pages](https://steilerdev.github.io/icloud-photos-sync/get-started/). Additional documentation and further ressources - including my [personal use case / workflow](https://steilerdev.github.io/icloud-photos-sync/dev/motivation/) - are published there as well

## OS Support
![OS Support Debian](https://img.shields.io/static/v1?label=Debian-11&message=Dev%20Platform&color=informational&style=for-the-badge)

[![OS Support Ubuntu](https://img.shields.io/static/v1?label=Ubuntu-latest&message=Unit%20Test&color=success&style=for-the-badge)](https://github.com/actions/runner-images#available-images)

[![OS Support MacOS](https://img.shields.io/static/v1?label=MacOS-latest&message=Unit%20Test&color=success&style=for-the-badge)](https://github.com/actions/runner-images#available-images)

[![OS Support Windows](https://img.shields.io/static/v1?label=Windows-latest&message=Not%20planned&color=inactive&style=for-the-badge)](https://github.com/actions/runner-images#available-images)


## Contributing & Feedback
This tool (most likely) still contains issues and edge cases, that need to be addressed. Therefore, I hope for the support of the community, to fully understand the reverse-engineered API and discover the remaining bugs. I tried to make this code base as maintainable and automated as possible, in order to make future releases and contributions quick and easy, including [unit](https://steilerdev.github.io/icloud-photos-sync/dev/coverage/) & [API](https://github.com/steilerDev/icloud-photos-sync/actions/workflows/api-test.yml) tests.

Please [open an issue](https://github.com/steilerDev/icloud-photos-sync/issues/new) (and attach the `.icloud-photos-sync.log`, stored in the `DATA_DIR`) for any bug you are experiencing. Additionally please [enable crash and error reporting](https://steilerdev.github.io/icloud-photos-sync/user-guides/error-reporting/), so this crash and all required technical details are recorded and reported.