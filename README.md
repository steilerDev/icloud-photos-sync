<p align="center">
  <a href="https://icps.steiler.dev/">
    <img alt="icloud-photos-sync Logo" src="https://icps.steiler.dev/assets/icloud-photos-sync-open-graph.png">
  </a>
</p>

<h1 align="center"><strong>iCloud Photos Sync</strong></h1>

<p align="center">
  <a href="https://github.com/steilerDev/icloud-photos-sync/releases">
    <img alt="GitHub release (latest by date)" src="https://img.shields.io/github/v/release/steilerdev/icloud-photos-sync?style=for-the-badge&logo=github&logoColor=white">
  </a>
  <a href="https://www.npmjs.com/package/icloud-photos-sync">
    <img alt="npm" src="https://img.shields.io/npm/dm/icloud-photos-sync?label=npm%20downloads&style=for-the-badge&logo=npm&logoColor=white">
  </a>
  <a href="https://hub.docker.com/r/steilerdev/icloud-photos-sync">
    <img alt="Docker Pulls" src="https://img.shields.io/docker/pulls/steilerdev/icloud-photos-sync?style=for-the-badge&logo=docker&logoColor=white">
  </a>
</p>
<hr>
<p align="center">
  <a href="https://icps.steiler.dev/get-started/">
    <img alt="Get Started" src="https://img.shields.io/static/v1?label=&message=Get%20Started&color=important&style=for-the-badge&logo=readthedocs&logoColor=white" style="width: 50%;">
  </a>
</p>
<p align="center">
  <a href="https://icps.steiler.dev/user-guides/cli">
    <img alt="CLI Reference" src="https://img.shields.io/static/v1?label=&message=CLI%20Reference&color=grey&style=for-the-badge" style="width: 30%;">
  </a>
</p>
<hr>
<p align="center">
  <a href="https://icps.steiler.dev/dev/coverage/">
    <img alt="Test Coverage (Lines)" src="https://img.shields.io/badge/dynamic/json?color=success&label=Coverage%20%28Lines%29&style=for-the-badge&logo=jest&logoColor=white&query=%24.total.lines.pct&suffix=%25&url=https%3A%2F%2Ficps.steiler.dev%2Fdev%2Fcoverage%2Fcoverage-summary.json">
  </a>
  <a href="https://icps.steiler.dev/dev/coverage/">
    <img alt="Test Coverage (Functions)" src="https://img.shields.io/badge/dynamic/json?color=success&label=Coverage%20%28Functions%29&style=for-the-badge&logo=jest&logoColor=white&query=%24.total.functions.pct&suffix=%25&url=https%3A%2F%2Ficps.steiler.dev%2Fdev%2Fcoverage%2Fcoverage-summary.json">
  </a>
</p>
<p align="center">
  <a href="https://github.com/steilerDev/icloud-photos-sync/blob/main/CODE_OF_CONDUCT.md">
    <img alt="Code of Conduct" src="https://img.shields.io/badge/Contributor_Covenant-2.1-blue?style=for-the-badge">
  </a>
</p>
<hr>

## Overview
This project provides a one-way sync engine for the iCloud Photos Library. The intention behind this project is to provide an easy way to backup the full iCloud Photos Library to the native filesystem.

Currently, this can only be achieved, by having a Mac continuously run the *Photos.app* (with `Keep originals` enabled). With this method, the files cannot be easily viewed without the *Photos.app*.

*icloud-photos-sync is an independent project, and is not affiliated, endorsed, recommended by or otherwise affiliated with Apple Inc.*

This CLI Application offers the following high level functionality:

<details>
  <summary><i>Continuously sync your complete remote iCloud Photos Library to your local file system efficiently</i></summary>
  <p>
    <ul>
      <li>iCloud Shared Photo Library support</li>
      <li>Support of MFA authentication through trusted devices, SMS and voice authentication - <a href="https://github.com/steilerDev/icloud-photos-sync/issues/207">Security Key Support pending, please help out if you have this use case</a>!</li>
      <li>Enable autonomous operation, by caching of MFA trust token</li>
      <li>Support of large libraries, through efficient diffing algorithm instead of full library pull</li>
      <li>Full iCloud Photos Library backup with all important files in their original state and edits - <a href="https://github.com/steilerDev/icloud-photos-sync/issues/121">Live Photos support pending</a></li>
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
      <li>Optionally all photos from the archived folder can be deleted from the iCloud Photos Library, unless they are *Favorites* (reducing cloud storage needs)</li>
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

A [*Get Started Guide* can be found on GH Pages](https://icps.steiler.dev/get-started/). Additional documentation and further resources - including my [personal use case / workflow](https://icps.steiler.dev/dev/motivation/) - are published there as well. 

I am also trying to publish regular updates on the progress of this project in a [development blog](https://github.com/steilerDev/icloud-photos-sync/discussions/305).

## Limitations

As this application is using an undocumented public API, there are a couple of known limitations:

- **iCloud Shared Photo Library**:
  While this app is syncing all assets from the *Shared Photo Library*, unfortunately the API does not provide the location of shared assets within the user's folder hierarchy (when navigating to a folder on the WebUI while having *Shared Photo Library* enabled will yield an error). Until this functionality is available, *Shared Photo Library* assets will only be present in the `_Shared-Photos` folder and therefore cannot be archived.
- **FileType Support**:
  The support of file types needs to be hardcoded by this application, since a full list is not available or retrievable. If you come across an `Unknown filetype descriptor` error, [please report it](https://github.com/steilerDev/icloud-photos-sync/issues/143), in order for the file type to be added to the application.

Please also check out [open and known issues](https://github.com/steilerDev/icloud-photos-sync/issues?q=is%3Aopen+is%3Aissue+label%3Aclass%28bug%29%2Cclass%28improvement%29%2C%22class%28known+issue%29%22) and [existing feature requests](https://github.com/steilerDev/icloud-photos-sync/issues?q=is%3Aopen+is%3Aissue+label%3Aclass%28feature%29+label%3Astatus%28open%29%2Cstatus%28wontfix%29%2Cstatus%28backlog%29%2C%22status%28help+needed%29%22%2C%22status%28in+progress%29%22%2Cstatus%28investigating%29%2Cstatus%28previewed%29+) for more information.

## OS Support

<p align="center">
  <img alt="OS Support Debian" src="https://img.shields.io/static/v1?label=Debian-11&message=Dev%20Platform&color=informational&style=for-the-badge&logo=debian&logoColor=white">
  <a href="https://github.com/actions/runner-images#available-images">
    <img alt="OS Support Ubuntu" src="https://img.shields.io/static/v1?label=Ubuntu-latest&message=Unit%20Test&color=success&style=for-the-badge&logo=ubuntu&logoColor=white">
  </a>
  <a href="https://github.com/actions/runner-images#available-images">
    <img alt="OS Support MacOS" src="https://img.shields.io/static/v1?label=MacOS-latest&message=Unit%20Test&color=success&style=for-the-badge&logo=macos&logoColor=white">
  </a>
  <a href="https://github.com/actions/runner-images#available-images">
    <img alt="OS Support Windows" src="https://img.shields.io/static/v1?label=Windows-latest&message=Not%20planned&color=inactive&style=for-the-badge&logo=windows&logoColor=white">
  </a>
</p>

## Contributing & Feedback

Please check the [contributing guidelines](https://github.com/steilerDev/icloud-photos-sync/blob/main/CONTRIBUTING.md) to learn how to engage with this project.

## Acknowledgments

- Special thanks to [@foxt](https://foxt.dev/) for helping with reverse engineering some tricky parts of the iCloud API ([GSA](https://github.com/steilerDev/icloud-photos-sync/issues/363) & [ADP](https://github.com/steilerDev/icloud-photos-sync/issues/202)). Check out [iCloud.js](https://github.com/foxt/icloud.js), in case you need to access other aspects of iCloud.

### Release Workflow

<p align="center">
  <a href="https://github.com/steilerDev/icloud-photos-sync/actions/workflows/event_push.yml">
    <img alt="Nightly Release Status" src="https://img.shields.io/github/actions/workflow/status/steilerDev/icloud-photos-sync/event_push.yml?branch=dev&label=Nightly&style=for-the-badge&logo=githubactions&logoColor=white">
  </a>
  <a href="https://github.com/steilerDev/icloud-photos-sync/actions/workflows/event_push.yml">
    <img alt="Beta Release Status" src="https://img.shields.io/github/actions/workflow/status/steilerDev/icloud-photos-sync/event_push.yml?branch=beta&label=Beta&style=for-the-badge&logo=githubactions&logoColor=white">
  </a>
  <a href="https://github.com/steilerDev/icloud-photos-sync/actions/workflows/event_push.yml">
    <img alt="Production Release Status" src="https://img.shields.io/github/actions/workflow/status/steilerDev/icloud-photos-sync/event_push.yml?branch=main&label=Production&style=for-the-badge&logo=githubactions&logoColor=white">
  </a>
</p>

### Monitoring Workflow

<p align="center">
  <a href="https://github.com/steilerDev/icloud-photos-sync/actions/workflows/monitor_api.yml">
    <img alt="API Status" src="https://img.shields.io/github/actions/workflow/status/steilerdev/icloud-photos-sync/monitor_api.yml?branch=main&event=schedule&style=for-the-badge&logo=githubactions&logoColor=white&label=API%20Status">
  </a>
</p>