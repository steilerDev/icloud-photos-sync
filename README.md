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

<p align="center">
  <strong>Back up your complete iCloud Photos Library to your own disk or NAS, and keep it in sync.</strong><br>
  Runs unattended in Docker. A small web UI handles the Apple sign-in, including MFA codes and Advanced Data Protection.
</p>

<p align="center">
  <a href="#quick-start"><strong>Quick start</strong></a> ·
  <a href="https://icps.steiler.dev/get-started/">Get Started guide</a> ·
  <a href="https://icps.steiler.dev/user-guides/cli">CLI reference</a>
</p>

<hr>

## Quick start

You need Docker with [docker compose](https://docs.docker.com/compose/install/) and an Apple ID with two-factor authentication.

**1. Create a folder for the library and a `docker-compose.yml` next to it.**

```sh
mkdir library
```

```yaml
services:
  photos-sync:
    image: steilerdev/icloud-photos-sync:latest
    container_name: photos-sync
    restart: unless-stopped
    user: "1000:1000"                  # your user's `id -u`:`id -g`, needs write access to ./library
    environment:
      APPLE_ID_USER: "<iCloud username>"
      APPLE_ID_PWD: "<iCloud password>"
      TZ: "Europe/Berlin"
      SCHEDULE: "0 2 * * *"            # sync every night at 2:00
      ENABLE_CRASH_REPORTING: true     # optional, helps fixing bugs
    ports:
      - 80:80                          # web UI
    volumes:
      - ./library:/opt/icloud-photos-library
```

**2. Start it.**

```sh
docker compose up -d
```

**3. Sign in through the web UI.** Open `http://<your-host>` and select *Renew Authentication*. Apple sends a code to your trusted devices; enter it in the web UI. Then select *Sync Now* to start the first sync, or wait for the schedule.

That's it. From now on the library syncs on the schedule. Apple asks for a new MFA code about every 30 days: select *Enable Notifications* in the web UI to get a push notification when that happens.

Good to know:

- **Advanced Data Protection:** turn on *Access iCloud Data on the Web* and approve the request that shows up on your device during the first sync. See [Advanced Data Protection](https://icps.steiler.dev/user-guides/adp/).
- **No plain-text password:** use `APPLE_ID_PWD_FILE` with Docker secrets, or leave the password out and enter it on startup. See [Installation](https://icps.steiler.dev/get-started/#installation).
- **Large libraries:** the first sync of a large library takes hours and may need a higher open-file limit. See [Ad-Hoc Sync](https://icps.steiler.dev/get-started/#ad-hoc-sync).

**Where are my photos?** Every photo and video is in `library/_All-Photos` (and `library/_Shared-Photos` for the iCloud Shared Library), named by its iCloud checksum. Your iCloud folders and albums appear as folders next to it, linking to those files. A readable, date-based layout with the original file names is planned for v6 ([#354](https://github.com/steilerDev/icloud-photos-sync/issues/354)).

**Without Docker:** `npm install -g icloud-photos-sync` (Node.js 26 or newer), then run `icloud-photos-sync --help`. See the [Get Started guide](https://icps.steiler.dev/get-started/) for all options.

## Features

- **Complete library:** all originals plus their edits, the iCloud Shared Photo Library and, optionally, the *Hidden* album
- **Your folders and albums** mirrored locally, without storing any photo twice
- **Advanced Data Protection** supported
- **MFA made easy:** codes through trusted devices, SMS or voice, entered in the web UI. The trust token is cached, so syncs run unattended for about 30 days.
- **Efficient incremental sync:** only new and changed assets are downloaded; large libraries are supported
- **Web UI:** sync status, ad-hoc syncs, live logs and push notifications. It can be installed as an app (PWA).
- **Safe deletes:** assets deleted in iCloud can go to a trash folder instead of being removed
- **Archiving:** keep an album locally forever and, optionally, delete its non-favorite photos from iCloud to free up storage
- **Monitoring:** Influx and Prometheus metrics, health check pings
- **Secure operation:** credentials from files (Docker secrets), shell-free image based on Docker Hardened Images, optional Node.js permission model

*icloud-photos-sync is an independent project, and is not affiliated, endorsed, recommended by or otherwise affiliated with Apple Inc.*

## Why

The only official way to keep a local copy of the full library is a Mac that keeps *Photos.app* running with *Download Originals* enabled, and those files can't easily be used outside *Photos.app*. This project syncs the library to a plain folder on any Linux host or NAS. Read more about the [motivation and the maintainer's own workflow](https://icps.steiler.dev/dev/motivation/).

## Documentation

- [Get Started guide](https://icps.steiler.dev/get-started/): installation, authentication, syncing, archiving
- [CLI reference](https://icps.steiler.dev/user-guides/cli): every option and its environment variable
- [Web UI](https://icps.steiler.dev/user-guides/web-ui/), [Advanced Data Protection](https://icps.steiler.dev/user-guides/adp/), [Health Checks](https://icps.steiler.dev/user-guides/health-checks/), [Sync Metrics](https://icps.steiler.dev/user-guides/sync-metrics/), [Runtime Hardening](https://icps.steiler.dev/user-guides/hardening/), [Viewing with Photoview](https://icps.steiler.dev/user-guides/photoview/)
- [Troubleshooting](https://icps.steiler.dev/user-guides/troubleshooting/) and [common warnings](https://icps.steiler.dev/user-guides/common-warnings/)

## Limitations

This application uses an undocumented iCloud API, which comes with a few limitations:

- **Live Photos:** only the still image is synced, not the video part ([#121](https://github.com/steilerDev/icloud-photos-sync/issues/121)).
- **iCloud Shared Photo Library:** the API doesn't tell where shared assets sit in your folders and albums. Shared assets therefore only appear in `_Shared-Photos` and can't be archived.
- **File types:** supported file types are hard-coded, because no complete list is available. If you see an `Unknown filetype descriptor` warning, [please report it](https://github.com/steilerDev/icloud-photos-sync/issues/143).
- **Security keys** can't be used as the second factor.

Please also check the [open and known issues](https://github.com/steilerDev/icloud-photos-sync/issues?q=is%3Aopen+is%3Aissue+label%3A%22class%28bug%29%22%2C%22class%28improvement%29%22%2C%22class%28known+issue%29%22) and [existing feature requests](https://github.com/steilerDev/icloud-photos-sync/issues?q=is%3Aopen+is%3Aissue+label%3A%22class%28feature%29%22+label%3A%22status%28open%29%22%2C%22status%28wontfix%29%22%2C%22status%28backlog%29%22%2C%22status%28help+needed%29%22%2C%22status%28in+progress%29%22%2C%22status%28investigating%29%22%2C%22status%28previewed%29%22).

## OS Support

The Docker image is available for `linux/amd64` and `linux/arm64`. The npm package runs wherever Node.js 26 runs, except Windows.

<p align="center">
  <img alt="OS Support Debian" src="https://img.shields.io/static/v1?label=Debian-13&message=Dev%20Platform&color=informational&style=for-the-badge&logo=debian&logoColor=white">
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

<p align="center">
  <a href="https://icps.steiler.dev/dev/coverage/">
    <img alt="Test Coverage (Lines)" src="https://img.shields.io/badge/dynamic/json?color=success&label=Coverage%20%28Lines%29&style=for-the-badge&logo=jest&logoColor=white&query=%24.total.lines.pct&suffix=%25&url=https%3A%2F%2Ficps.steiler.dev%2Fdev%2Fcoverage%2Fcoverage-summary.json">
  </a>
  <a href="https://icps.steiler.dev/dev/coverage/">
    <img alt="Test Coverage (Functions)" src="https://img.shields.io/badge/dynamic/json?color=success&label=Coverage%20%28Functions%29&style=for-the-badge&logo=jest&logoColor=white&query=%24.total.functions.pct&suffix=%25&url=https%3A%2F%2Ficps.steiler.dev%2Fdev%2Fcoverage%2Fcoverage-summary.json">
  </a>
  <a href="https://github.com/steilerDev/icloud-photos-sync/blob/main/CODE_OF_CONDUCT.md">
    <img alt="Code of Conduct" src="https://img.shields.io/badge/Contributor_Covenant-2.1-blue?style=for-the-badge">
  </a>
</p>

## Acknowledgments

Special thanks to:
 - [@konraddysput](https://github.com/konraddysput) for help on the Backtrace integration.
 - [@timvahlbrock](https://github.com/timvahlbrock) for their interest in this project and contributions in getting it updated.
 - All current and past sponsors of this project.

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
