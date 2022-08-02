**Work in progress, [current state and upcoming milestones below](#milestone-plan).**

This project provides a one-way sync engine for the iCloud Photos Library. The intention behind this project is to provide an easy way, to natively backup the full iCloud Photos Library to the native filesystem (only tested on Linux Debian 10/buster).

Currently, this can only be achived, by having a Mac continously run the Photos.app (with 'Keep originals' enabled). With this method the files cannot be easily viewed without the Photos.app.

Albums can be archived ([currently an open milestone](#milestone-plan)). This will enable users to keep their favorite pictures in the iCloud Photos Library, while reducing iCloud storage needs. This is done by offloading them to the local server/NAS (where this script is running).

Upon archiving an album the following will happen:
- All assets currently in the album will be persisted in the respective folder on the machine running icloud-photos-sync
- Future syncs will ignore the folder (so those assets will not be changed/deleted)
- All photos from the archived folder will be deleted from the iCloud Photos Library, unless they are *Favorites*

My personal use case / workflow is documented [below](#motivation), providing a real life example of this application.

# Usage

## Docker
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

## CLI from npm
The application can be installed from npm using:
```
npm install -g icloud-photos-sync
```

How to run the application and a full list of configuration options can be found by executing `icloud-photos-sync --help`.

## Build from source
To build the application from source, clone this repository, go to `rootfs/opt/icloud-photos-sync` and run
```
npm run build
```

Execute the program with
```
npm run execute
```

How to run the application and a full list of configuration options can be found by executing `npm run execute -- --help`.

# Enter MFA
Once the MFA code is required, the tool will open up a webserver and listen on the specified port (Default: `80`). Provide the code by `POST`ing it to `/mfa` with parameter `code`. E.g. using `curl`:
```
curl -X POST localhost:80/mfa?code=<6-digit-code>
```

When using docker, you can use the following helper script:
```
docker exec photo-sync enter_mfa <6-digit-code>
```
There is currently no way to re-request it, besides quiting the application and re-running it.

# Milestone Plan
As I'm currently actively developing this tool, I'm looking for any and all feedback! Especially since the iCloud API was reverse engineered using my personal account, there might be edge cases, that I have not considered yet (especially the non-standard file types returned by Apple are limited to the file types I am using)

The tool is not yet 'production ready', however I would like to ask the community to test the functionality and open issues, so we can get it there (please attach the `.icloud-photos-sync.log`, stored in the `DATA_DIR`).

1. :white_check_mark: iCloud Authentication 
2. :white_check_mark: State fetched from iCloud
   - :white_check_mark: Asset state ('All photos')
   - :white_check_mark: Album state (List of Albums)
3. :white_check_mark: Parsing fetched state
   - :white_check_mark: Parsing assets
   - :white_check_mark: Parsing albums
4. :white_check_mark: Loading local state
   - :white_check_mark: Asset state
   - :white_check_mark: Album state
5. :white_check_mark: Diffing local / remote state
6. :white_check_mark: Applying diff
   - :white_check_mark: Asset diff
   - :white_check_mark: Album diff
7. :white_check_mark: Writing diff to disk
   - :white_check_mark: Writing asset diff
   - :x: Writing album diff
8. :x: Enable archiving
9. :x: Improve MFA workflow (re-request code/send code through other means)
10. :x: Provide WebUI
    - :x: Archive folders through UI
    - :x: Explore all pictures through UI
11. :x: Figure out checksum algorithm to (properly) verify downloaded files

# Motivation
In this section, I want to provide some background on the intention for developing this tool and the use case it is adressing, as well as the workflow it is used in.

## Problem Statement
Currently there is no way, to backup the iCloud Photos Library and easily access it's organized content. The only solution is Apple's *Photos.app*, which will create a `.photoslibrary` file, which is not easily accessible. Additionally, a Mac needs to run sufficiently often and have 'Keep originals' turned on, in order to make sure the data is actually synced.

I am a hobby photographer, who has been using Lightroom for quite a while. However I want to move to a full mobile workflow, leveraging iCloud Photos Library for cross device sync and the interoperability of cross platform editing tools.

However I am not comfortable storing the only copy of my pictures on a third party cloud provider. Therefore I need a mechanism to sync those files to a local machine that can be backed up using any mechanism.

Additionally, I am going to import pictures from my SLT camera, shot in raw format. Those will take up large amounts of cloud storage, however I do not want to fully remove them, in case they will be necessary in the future. Therefore I need a mechanism to move pictures from the iCloud Photos Library to my local system for 'long term storage', while keeping the most important ones in the iCloud Photos Library for easy access.

## Workflow
1. Pictures are taken on an iOS device or imported through an iOS device into the iCloud Photos Library
2. Pictures are sorted into a dedicated album for this event
3. Unwanted pictures are deleted, best pictures are edited (I'm currently using [Darkroom](https://darkroom.co/) for this)
4. Pictures are exported/released
5. Favorite pictures are marked as 'Favorites'
6. `icloud-photos-sync` tool is run to have all pictures downloaded (or is running constantly in the background)
7. Folder is marked as archived through `icloud-photos-sync`, which will persist them locally and remove non-favorite photos from the iCloud Photos Library
