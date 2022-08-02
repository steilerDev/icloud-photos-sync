**Work in progress, [current state and upcoming milestones below](#milestone-plan).**

This project provides a one-way sync engine for the iCloud Photos Library. The intention behind this project is to provide an easy way, to natively backup the full iCloud Photos Library to the native filesystem (only tested on Linux Debian 10/buster).

Currently, this can only be achived, by having a Mac continously run the Photos.app (with 'Keep originals' enabled). With this method the files cannot be easily viewed without the Photos.app.

Albums can be archived ([currently an open milestone](#milestone-plan)). This will enable users to keep their favorite pictures in the iCloud Photos Library, while reducing iCloud storage needs. This is done by offloading them to the local server/NAS (where this script is running).

Upon archiving an album the following will happen:
- All assets currently in the album will be persisted in the respective folder on the machine running icloud-photos-sync
- Future syncs will ignore the folder (so those assets will not be changed/deleted)
- All photos from the archived folder will be deleted from the iCloud Photos Library, unless they are *Favorites*

My personal use case / workflow is documented [below](#workflow-example), providing a real life example of this application.

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
10. :x:Provide WebUI
   - :x: Archive folders through UI
   - :x: Explore all pictures through UI

# Workflow example
TBC