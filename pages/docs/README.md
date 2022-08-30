# iCloud Photos Sync

**Work in progress, [current state and upcoming milestones below](#milestone-plan)**

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

Albums can be archived ([currently an open milestone](#milestone-plan)). This will enable users to keep their favorite pictures in the iCloud Photos Library, while reducing iCloud storage needs. This is done by offloading them to the local server/NAS (where this script is running).

Upon archiving an album the following will happen:
- All assets currently in the album will be persisted in the respective folder on the machine running icloud-photos-sync
- Future syncs will ignore the folder (so those assets will not be changed/deleted)
- All photos from the archived folder will be deleted from the iCloud Photos Library, unless they are *Favorites*

My personal use case / workflow is documented [below](#motivation), providing a real life example of this application.

## Usage

### Docker
I recommend using the provided docker image to run the script. Running the container will perform a sync and then exit.

Using `docker-compose.yml`:
```
version: '2'
services:
  photo-sync:
    image: icloud-photos-sync:latest
    container_name: photo-sync
    environment:
       APPLE_ID_USER: "<iCloud Username>"
       APPLE_ID_PWD: "<iCloud Password>"
    volumes:
      - <photos-dir>:/opt/icloud-photos-library
```

A full list of configuration options (applied through environment variables) can be found by executing `docker run icloud-photos-sync:latest icloud-photos-sync --help`.

The latest snapshot build is available through the `nightly` tag on DockerHub. This release channel might not be stable.

### CLI from npm
The application can be installed from npm using:
```
npm install -g icloud-photos-sync
```

How to run the application and a full list of configuration options can be found by executing `icloud-photos-sync --help`.

### Build from source
To build the application from source, clone this repository, go to `rootfs/opt/icloud-photos-sync` and run
```
npm run build
```

Execute the program with
```
npm run execute
```

How to run the application and a full list of configuration options can be found by executing `npm run execute -- --help`.

## MFA
Once the MFA code is required, the tool will open up a webserver and listen on the specified port (Default: `80`).
### Enter MFA
Provide the MFA code by `POST`ing it to `/mfa` with parameter `code`. E.g. using `curl`:
```
curl -X POST localhost:80/mfa?code=<6-digit-code>
```

When using docker, you can use the following helper script:
```
docker exec photo-sync enter_mfa <6-digit-code>
```

### Re-requesting MFA
Re-request the MFA code by `POST`ing to `/resend_mfa` with parameter `method` (either `sms`, `voice` or `device`). If you have registered multiple phone numbers, specify their id through the optional parameter `phoneNumberId` (number > 0 expected). E.g. using `curl`:
```
curl -X POST localhost:80/resend_mfa?method=sms&phoneNumberId=1
```

When using docker, you can use the following helper script:
```
docker exec photo-sync resend_mfa <method> <phoneNumberId>
```

