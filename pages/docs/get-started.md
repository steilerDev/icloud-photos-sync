# Get Started - A Complete User Guide

This guide outlines the lifecycle of this application. Since it is written in Typescript it can be executed directly on various platforms through NodeJS. Please check this application's [OS support matrix](../#os-support) for compatibility. Additionally a Docker Image is provided.

Find examples for the various deployment options within this guide.

## Installation
=== "Docker"

    Docker images are available on [DockerHub](https://hub.docker.com/r/steilerdev/icloud-photos-sync).

    The `latest` tag should always represent the latest stable release, whereas the `nightly` tag offers the latest development build, which might not be stable.

    === "docker compose"
        
        Create a `docker-compose.yml` file, similiar to the one below. The [CLI Reference](../user-guides/cli/) contains all possible configuration options.

        ```
        version: '2'
        services:
          photos-sync:
            image: steilerdev/icloud-photos-sync:latest
            container_name: photos-sync
            command: "sync"
            environment:
              APPLE_ID_USER: "<iCloud Username>"
              APPLE_ID_PWD: "<iCloud Password>"
              ENABLE_CRASH_REPORTING: true
            volumes:
              - <photos-dir>:/opt/icloud-photos-library
        ```

        Get the latest image by running:

        ```
        docker compose pull
        ```
    
    === "docker run"
        
        Get the latest image by running: 
        
        ```
        docker pull steilerdev/icloud-photos-sync:latest
        ```

=== "node"

    When setting up the environment, Please keep the [currently recommended NodeJS version](https://github.com/steilerDev/icloud-photos-sync/blob/main/app/.node-version) in mind, when setting this up.

    === "NPM"

        The application can be installed (globally) from [npm](https://www.npmjs.com/package/icloud-photos-sync) using:

        ```
        npm install -g icloud-photos-sync
        ```

    === "From Source"

        To build the application from source, clone this repository, go to `app/` and build it:
        
        ```
        git clone https://github.com/steilerDev/icloud-photos-sync.git
        cd icloud-photos-sync/app/
        npm install
        npm run build
        ```

## Authentication

Since this application needs full access to a user's iCloud Photos Library, a full authentication (including Multi-Factor-Authentication) is required. 

Upon initial authentication, this application will register as a 'trusted device'. This includes the acquisition of a trust token. As long as this token is valid, no MFA code is necessary to authenticate. It seems that this token currently expires after 30 days.

In order to only perform authentication (without syncing any assets) and validate or acquire the trust token, the [`token` command](../user-guides/cli/#token-command) can be used.

=== "Docker"

    === "docker compose"
        
        To run the `token` command, temporarily change the `docker-compose.yml`:

        ```
        version: '2'
        services:
          photos-sync:
            image: steilerdev/icloud-photos-sync:latest
            container_name: photos-sync
            command: "token"
            environment:
              APPLE_ID_USER: "<iCloud Username>"
              APPLE_ID_PWD: "<iCloud Password>"
              ENABLE_CRASH_REPORTING: true
            volumes:
              - </path/to/your/local/library>:/opt/icloud-photos-library
        ```

        And start the application using

        ```
        docker compose up
        ```
    
    === "docker run"

        ```
        docker run steilerdev/icloud-photos-sync:latest -v "</path/to/your/local/library>/library:/opt/icloud-photos-library" --name photos-sync \
            -u "<iCloud Username>" \
            -p "<iCloud Password>" \
            --enable-crash-reporting \
            token
        ```

=== "node"

    === "NPM"

        ```
        icloud-photos-sync \
            -u "<iCloud Username>" \
            -p "<iCloud Password>" \
            -d "</path/to/your/local/library>" \
            --enable-crash-reporting \
            token
        ```

    === "From Source"
        
        ```
        npm run execute -- \
            -u "<iCloud Username>" \
            -p "<iCloud Password>" \
            -d "</path/to/your/local/library>" \
            --enable-crash-reporting \
            token
        ```

### Multi-Factor-Authentication

In case no valid trust token is available, a MFA code is required in order to sucesfully authenticate. 

The CLI application will pause execution, in case it detects that a MFA code is necessary, open a web server (default on port `80`) and wait for user input. At this point, a MFA code should have already been sent to the primary device. 

#### Submit MFA Code

The MFA code can be entered throught the exposed API:

  - Request: 
    - Endpoint: `/mfa`
    - Query Parameters:
        - `code` - Expects the 6 digit MFA code
  - Response: 
    - `200 {'message': 'Read MFA code: <code>'}`
    - `400 {'message': 'Unexpected MFA code format! Expecting 6 digits'}`

=== "Docker"

    Submitting code `123456` using helper script:

    ```
    docker exec photos-sync enter_mfa 123456
    ```

=== "node"

    === "NPM"

        Submitting code `123456` using a CLI tool for making network requests, e.g. `curl`:

        ```
        curl -X POST localhost:80/mfa?code=123456
        ```

    === "From Source"

        Submitting code `123456` using this repository's helper scripts (located in `docker/rootfs/root/`) to a locally running `icloud-photos-sync`. The script will read the MFA server's port through the environmental variable `PORT` (`80` as default).

        ```
        docker/rootfs/root/enter_mfa 123456
        ```

#### Re-send MFA Code

In case the primary MFA device is not available, or the initial push is no longer available, you can request a new MFA code. 

This can be requested using the exposed API:

  - Request: 
    - Endpoint: `/resend_mfa`
    - Query Parameters:
        - `method` - Expects one of the following methods: `sms`, `voice`, `device`
        - `phoneNumberId` - If multiple phone numbers are registered, select the appropriate one (if you select a non-existing phone number id, the CLI application will print valid ones)
  - Response: 
    - `200 {'message': 'Requesting MFA resend with method <method>'}`
    - `400 {'message': 'Method does not match expected format'}`

=== "Docker"

    Resending MFA code using `sms` to phone with number ID `2` using helper script:
    ```
    docker exec photos-sync resend_mfa sms 2
    ```

=== "node"

    === "NPM"

        Resending MFA code using `sms` to phone with number ID `2` using a CLI tool for making network requests, e.g. `curl`:

        ```
        curl -X POST localhost:80/resend_mfa?method=sms&phoneNumberId=2
        ```

    === "From Source"
        
        Resending MFA code using `sms` to phone with number ID `2` using  this repository's helper scripts (located in `docker/rootfs/root/`) to a locally running `icloud-photos-sync`. The script will read the MFA server's port through the environmental variable `PORT` (`80` as default).

        ```
        docker/rootfs/root/resend_mfa sms 2
        ```


## Syncing

The `sync` command will perform authentication, proceed to load the local and remote library and compare the two states. The remote state will always be applied: 
  * Extranous local files will be removed (expections are 'Archived Folders', see [below](#archiving))
  * Missing remote files will be downloaded

This synchonisation will also create the folder structure present in the iCloud Photos Library.

Since this application does not use any local database, it is imperative, that the [file structure](../dev/local-file-structure/) is not changed by any other application or user.

During the sync process various warning could happen. A list of [common warnings](../user-guides/common-warnings/) is available.

### Ad-hoc

In order to perform a single synchronisation execution, the [`sync` command](../user-guides/cli/#sync-command) will be used.

=== "Docker"

    === "docker compose"
        
        Given the following `docker-compose.yml`:

        ```
        version: '2'
        services:
          photos-sync:
            image: steilerdev/icloud-photos-sync:latest
            container_name: photos-sync
            command: "sync"
            environment:
              APPLE_ID_USER: "<iCloud Username>"
              APPLE_ID_PWD: "<iCloud Password>"
              ENABLE_CRASH_REPORTING: true
            volumes:
              - </path/to/your/local/library>:/opt/icloud-photos-library
        ```

        Start the application using

        ```
        docker compose up
        ```
    
    === "docker run"

        ```
        docker run steilerdev/icloud-photos-sync:latest -v "</path/to/your/local/library>/library:/opt/icloud-photos-library" --name photos-sync \
            -u "<iCloud Username>" \
            -p "<iCloud Password>" \
            --enable-crash-reporting \
            sync
        ```

=== "node"

    === "NPM"

        ```
        icloud-photos-sync \
            -u "<iCloud Username>" \
            -p "<iCloud Password>" \
            -d "</path/to/your/local/library>" \
            --enable-crash-reporting \
            sync
        ```

    === "From Source"
        
        ```
        npm run execute -- \
            -u "<iCloud Username>" \
            -p "<iCloud Password>" \
            -d "</path/to/your/local/library>" \
            --enable-crash-reporting \
            sync
        ```

### Scheduled

This application does not have a built in scheduling feature ([yet](https://github.com/steilerDev/icloud-photos-sync/issues/126)). Therefore scheduling can be achived through a scheduling software like [`crontab`](https://crontab.guru/crontab.5.html). The following configurations applies to Debian 10.

For scheduled execution the `--fail-on-mfa` flag is advised, otherwise the app will not conclude running in case a MFA is required for authentication. With this flag, the application will exit with a non-zero code, in such case. This can be used to notify the user, in the below example through the `syslog`.

=== "Docker"

    === "docker compose"
        
        Given the following `docker-compose.yml`:

        ```
        version: '2'
        services:
          photos-sync:
            image: steilerdev/icloud-photos-sync:latest
            container_name: photos-sync
            command: "sync"
            environment:
              APPLE_ID_USER: "<iCloud Username>"
              APPLE_ID_PWD: "<iCloud Password>"
              FAIL_ON_MFA: true
            ENABLE_CRASH_REPORTING: true
            volumes:
              - </path/to/your/local/library>:/opt/icloud-photos-library
        ```

        Run `crontab -e` and add the following line using your preferred [cron schedule](https://crontab.guru/):

        ```
        0 4 * * 0,3 docker compose -f /path/to/docker-compose.yml || logger -s -p user.alert "icloud-photos-sync failed!"
        ```
    
    === "docker run"

        Run `crontab -e` and add the following line using your preferred [cron schedule](https://crontab.guru/):

        ```
        0 4 * * 0,3 docker run steilerdev/icloud-photos-sync:latest -v "/path/to/your/library:/opt/icloud-photos-library" --name photos-sync -u "<iCloud Username>" -p "<iCloud Password>" -d </path/to/your/local/library> --fail-on-mfa --enable-crash-reporting sync || logger -s -p user.alert "icloud-photos-sync failed!"
        ```

=== "node"

    === "NPM"

        Run `crontab -e` and add the following line using your preferred [cron schedule](https://crontab.guru/):

        ```
        0 4 * * 0,3 icloud-photos-sync -u "<iCloud Username>" -p "<iCloud Password>" -d </path/to/your/local/library> --fail-on-mfa --enable-crash-reporting sync || logger -s -p user.alert "icloud-photos-sync failed!"
        ```

    === "From Source"

        Run `crontab -e` and add the following line using your preferred [cron schedule](https://crontab.guru/):
        
        ```
        0 4 * * 0,3 npm --prefix </path/to/install/dir> run execute -- -u "<iCloud Username>" -p "<iCloud Password>" -d </path/to/your/local/library> --fail-on-mfa --enable-crash-reporting sync || logger -s -p user.alert 
        ```

## Archiving

In order to reduce complexity and storage needs in the iCloud Photos Library, archiving allows you to take a snapshot of a provided album and ignore changes to the album moving foward. This allows you to remove some or all of the photos whithin the album in the cloud after it was archived, while retaining a copy of all pictures locally.

Optionally, this tool can remove non-favorited photos from iCloud upon archiving. The favorite flag on the remaining photos in the cloud can be removed after the `archive` command completed successfully.

In case the album is renamed in the backend, the archived local copy will be renamed as well, but its content will not change. If the album is removed from the backend, the archived copy will be moved into `_Archive`. Files and folders in that path (except `_Archive/.stash`) can be freely modified. After a folder has been put into `_Archive`, it can be moved back into the folder structure of the library and will be ignored moving foward.

In order to archive an album, the [`archive` command](../user-guides/cli/#archive-command) will be used.

=== "Docker"

    === "docker compose"
        
        To run the `archive` command, temporarily change the `docker-compose.yml`. To automatically delete non-favorited pictures in the album from iCloud, add the `REMOTE_DELETE: true` environment variable.

        ```
        version: '2'
        services:
          photos-sync:
            image: steilerdev/icloud-photos-sync:latest
            container_name: photos-sync
            command: "archive </opt/icloud-photos-library/<path/to/album>>"
            environment:
              APPLE_ID_USER: "<iCloud Username>"
              APPLE_ID_PWD: "<iCloud Password>"
              ENABLE_CRASH_REPORTING: true
            volumes:
              - </path/to/your/local/library>:/opt/icloud-photos-library
        ```

        Start the application using

        ```
        docker compose up
        ```
    
    === "docker run"

        To automatically delete non-favorited pictures in the album from iCloud, add the `--remote-delete` flag

        ```
        docker run steilerdev/icloud-photos-sync:latest -v "</path/to/your/local/library>/library:/opt/icloud-photos-library" --name photos-sync \
            -u "<iCloud Username>" \
            -p "<iCloud Password>" \
            --enable-crash-reporting \
            archive \
            /opt/icloud-photos-library/<path/to/album>
        ```

=== "node"

    === "NPM"

        To automatically delete non-favorited pictures in the album from iCloud, add the `--remote-delete` flag.

        ```
        icloud-photos-sync \
            -u "<iCloud Username>" \
            -p "<iCloud Password>" \
            -d "</path/to/your/local/library>" \
            --enable-crash-reporting \
            archive \
            </path/to/your/local/library>/<path/to/album>
        ```

    === "From Source"
        
        To automatically delete non-favorited pictures in the album from iCloud, add the `--remote-delete` flag.

        ```
        npm run execute -- \
            -u "<iCloud Username>" \
            -p "<iCloud Password>" \
            -d "</path/to/your/local/library>" \
            --enable-crash-reporting \
            archive \
            </path/to/your/local/library>/<path/to/album>
        ```