# Get Started - A Complete User Guide

This guide outlines the lifecycle of this application. Since it is written in Typescript it can be executed directly on various platforms through NodeJS. Please check this application's [OS support matrix](../#os-support) for compatibility. Additionally a Docker Image is provided.

The recommended installation path is using `docker compose`, since this nicely manages configuration and dependencies.

Find examples for the various deployment options within this guide.

## Installation
=== "Docker"

    Docker images are available on [DockerHub](https://hub.docker.com/r/steilerdev/icloud-photos-sync).

    The `latest` tag should always represent the latest stable release, whereas the `nightly` tag offers the latest development build, which might not be stable.

    === "docker compose"
        
        Create a `docker-compose.yml` file, similar to the one below. Please add your Apple ID credentials and desired location of the library on disk. Optionally, add the timezone and your local users' `UID` and `GID`. 
        
        The [CLI Reference](../user-guides/cli/) contains all available configuration options.

        ```
        version: '2'
        services:
          photos-sync:
            image: steilerdev/icloud-photos-sync:latest
            container_name: photos-sync
            user: <uid>:<gid> 
            environment:
              APPLE_ID_USER: "<iCloud Username>"
              APPLE_ID_PWD: "<iCloud Password>"
              TZ: "Europe/Berlin"                                                       
              SCHEDULE: "* 2 * * *"
              REMOTE_DELETE: true
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

    When setting up the environment, please keep the [currently recommended NodeJS version](https://github.com/steilerDev/icloud-photos-sync/blob/main/app/.node-version) in mind.

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
        
        Expecting the previously defined `docker compose` service being running (through `docker compose up -d`).

        In order to execute the `token` command within the container, run the following command:

        ```
        docker exec -t photos-sync icloud-photos-sync token
        ```

        !!! tip "Concurrency"
            Depending on the defined schedule, the container service might already perform a sync. In order to avoid sync collisions two instances of this application cannot access the same library concurrently, which might lead to `LibraryError (FATAL): Locked by PID 1, cannot release.` errors.
            
            In case you are certain that there is no instance running (and the lock is still there, because it was not released properly previously), use the `--force` flag upon the next run to remove it.
    
    === "docker run"

        ```
        docker run -v "</path/to/your/local/library>:/opt/icloud-photos-library" --name photos-sync steilerdev/icloud-photos-sync:latest \
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

In case no valid trust token is available, a MFA code is required in order to successfully authenticate. 

The CLI application will pause execution, in case it detects that a MFA code is necessary, open a web server (default on port `80`) and wait for user input. At this point, a MFA code should have already been sent to the primary device. 

#### Submit MFA Code

The MFA code can be entered through the exposed API:

  - Request: 
    - Endpoint: `/mfa`
    - Query Parameters:
        - `code` - Expects the 6 digit MFA code
  - Response: 
    - `200 {'message': 'Read MFA code: <code>'}`
    - `400 {'message': 'Unexpected MFA code format! Expecting 6 digits'}`

=== "Docker"

    Submitting code `123456` using helper script within running container:

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
        - `phoneNumberId` - If multiple phone numbers are registered, select the appropriate one (if you select a non-existing phone number id, the log of the main application will print valid ones)
  - Response: 
    - `200 {'message': 'Requesting MFA resend with method <method>'}`
    - `400 {'message': 'Method does not match expected format'}`

=== "Docker"

    Resending MFA code using `sms` to phone with number ID `2` using helper script within running container:

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

  * Extraneous local files will be removed (exceptions are ['Archived Folders'](#archiving))
  * Missing remote files will be downloaded

This synchronization will also create the folder structure present in the iCloud Photos Library. If iCloud Shared Photo Library is enabled, the shared assets will be stored in the `_Shared-Photos` folder.

!!! warning "File Structure"
    Since this application does not use any local database, it is imperative, that the [file structure](../dev/local-file-structure/) is not changed by any other application or user.

During the sync process various warning could happen. A list of [common warnings](../user-guides/common-warnings/) is available.

!!! tip "Syncing large libraries"
    Initial sync of large libraries can take some time. After one hour the initially fetched metadata expires, which will lead to a failure of the ongoing sync. The tool should recover from this with a warning and reload the metadata. Make sure `--max-retries` is set to a high number or `Infinity`, otherwise the process might prematurely fail.

    Additionally you might need to limit the rate of metadata fetching, because the iCloud API has been observed to have limitations causing `SOCKET HANGUP` errors for libraries holding more than 10.000 assets. Do this by setting `--metadata-rate` - it seems `1/20` ensures sufficient throttling.

### Ad-hoc

In order to perform a single synchronization execution, the [`sync` command](../user-guides/cli/#sync-command) will be used.

=== "Docker"

    === "docker compose"
        
        Expecting the previously defined `docker compose` service being running (through `docker compose up -d`).
        
        In order to execute the `sync` command within the container, run the following command:

        ```
        docker exec -t photos-sync icloud-photos-sync sync
        ```
    
    === "docker run"

        ```
        docker run -v "</path/to/your/local/library>/library:/opt/icloud-photos-library" --name photos-sync steilerdev/icloud-photos-sync:latest \
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

When using the [`daemon` command](../user-guides/cli/#daemon-command), the application will start scheduling synchronization executions based on the provided schedule. 

This schedule is expecting to be in [cron](https://crontab.guru) format. For more details on the specific implementation, see [Croner's pattern documentation](https://github.com/hexagon/croner#pattern).

=== "Docker"

    === "docker compose"
        
        Running `docker compose up -d` on the [previously defined `docker-compose.yml`](#installation) launches the app in daemon mode.
    
    === "docker run"

        ```
        docker run -v "</path/to/your/local/library>/library:/opt/icloud-photos-library" --name photos-sync steilerdev/icloud-photos-sync:latest \
            -u "<iCloud Username>" \
            -p "<iCloud Password>" \
            --enable-crash-reporting \
            --schedule "* 2 * * *" \
            daemon
        ```

=== "node"

    === "NPM"

        ```
        icloud-photos-sync \
            -u "<iCloud Username>" \
            -p "<iCloud Password>" \
            -d "</path/to/your/local/library>" \
            --enable-crash-reporting \
            --schedule "* 2 * * *" \
            daemon
        ```

    === "From Source"
        
        ```
        npm run execute -- \
            -u "<iCloud Username>" \
            -p "<iCloud Password>" \
            -d "</path/to/your/local/library>" \
            --enable-crash-reporting \
            --schedule "* 2 * * *" \
            daemon
        ```

## Archiving

In order to reduce complexity and storage needs in the iCloud Photos Library, archiving allows you to take a snapshot of a provided album and ignore changes to the album moving forward. This allows you to remove some or all of the photos within the album in iCloud after it was archived, while retaining a copy of all pictures locally.

Optionally, this tool can remove non-favorite photos from iCloud upon archiving. The favorite flag on the remaining photos in the cloud can be removed after the `archive` command completed successfully.

In case the album is renamed in the backend, the archived local copy will be renamed as well, but its content will not change. If the album is removed from the backend, the archived copy will be moved into `_Archive`. Files and folders in that path (except `_Archive/.stash`) can be freely modified. After a folder has been put into `_Archive`, it can be moved back into the folder structure of the library and will be ignored moving forward.

In order to archive an album, the [`archive` command](../user-guides/cli/#archive-command) will be used.

=== "Docker"

    === "docker compose"
        
        Expecting the previously defined `docker compose` service being running (through `docker compose up -d`). To automatically delete non-favorite pictures in the album from iCloud, add the `REMOTE_DELETE` environmental variable to your `docker-compose.yml`.
        
        In order to execute the `archive` command within the container, run the following command:

        ```
        docker exec -t photos-sync icloud-photos-sync archive /opt/icloud-photos-library/<path/to/album>
        ```
    
    === "docker run"

        To automatically delete non-favorite pictures in the album from iCloud, add the `--remote-delete` flag

        ```
        docker run -v "</path/to/your/local/library>/library:/opt/icloud-photos-library" --name photos-sync steilerdev/icloud-photos-sync:latest \
            -u "<iCloud Username>" \
            -p "<iCloud Password>" \
            --enable-crash-reporting \
            archive \
            /opt/icloud-photos-library/<path/to/album>
        ```

=== "node"

    === "NPM"

        To automatically delete non-favorite pictures in the album from iCloud, add the `--remote-delete` flag.

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
        
        To automatically delete non-favorite pictures in the album from iCloud, add the `--remote-delete` flag.

        ```
        npm run execute -- \
            -u "<iCloud Username>" \
            -p "<iCloud Password>" \
            -d "</path/to/your/local/library>" \
            --enable-crash-reporting \
            archive \
            </path/to/your/local/library>/<path/to/album>
        ```