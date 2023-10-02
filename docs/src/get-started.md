# Get Started - A Complete User Guide

This guide outlines the lifecycle of this application. Since it is written in Typescript it can be executed directly on various platforms through NodeJS. Please check this application's [OS support matrix](../#os-support) for compatibility. Additionally a Docker Image is provided.

The recommended installation path is using `docker compose`, since this nicely manages configuration and dependencies.

Find examples for the various deployment options within this guide.

## Installation
The `latest` tag should always represent the latest stable release, whereas the `beta` tag provides a semi-stable preview of the upcoming release, while the `nightly` tag offers the latest development build, which might not be stable.

=== "Docker"

    Docker images are available on [DockerHub](https://hub.docker.com/r/steilerdev/icloud-photos-sync). Alternatively the docker image tar archive is available from the [Github releases](https://github.com/steilerDev/icloud-photos-sync/releases) and can be installed using `docker load --input <fileName>`

    !!! tip "ARM Support"
            The Docker image is also build for the arm64 platform (however [publishing this version is not possible through the current CI setup](https://github.com/docker/buildx/issues/1152)). The tar archive of the arm64 build of this image is available from the [Github releases](https://github.com/steilerDev/icloud-photos-sync/releases) and can be loaded using `docker load --input <fileName>`.

    === "docker compose"
        
        Create a `docker-compose.yml` file, similar to the one below. Please add your Apple ID credentials and desired location of the library on disk. Optionally, add the timezone and your local users' `UID` and `GID`. 
        
        The [CLI Reference](../user-guides/cli/) contains all available configuration options. Add them as environment variables to the `environment` key.

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
              ENABLE_CRASH_REPORTING: true
            volumes:
              - <photos-dir>:/opt/icloud-photos-library
        ```

        !!! tip "Plain text username/password"
            If you don't want to store your plain text username and/or password in the docker environment, it is possible to omit the [username](https://icps.steiler.dev/user-guides/cli/#username) and/or [password](https://icps.steiler.dev/user-guides/cli/#password) option. In this scenarios, the username/password needs to be provided manually on each startup from the command line.
            To input the data into the running Docker container [it needs to be started with `tty: true` and `stdin_open: true`](https://docs.docker.com/compose/compose-file/compose-file-v3/#domainname-hostname-ipc-mac_address-privileged-read_only-shm_size-stdin_open-tty-user-working_dir). Once the container was started, you can attach to the running `icloud-photos-sync` process using [`docker attach photos-sync`](https://docs.docker.com/engine/reference/commandline/attach/), and detach with the sequence `CTRL-p CTRL-q`.

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

    When setting up the environment, please keep the [currently recommended NodeJS version](https://github.com/steilerDev/icloud-photos-sync/blob/main/app/node-version) in mind.

    !!! info "Experimental node modules"
        This application uses experimental node modules, which are not yet available in the LTS version of NodeJS. This includes [import assertions](https://github.com/tc39/proposal-import-attributes) and importing JSON modules. To remove runtime warnings and ensuring proper execution, it is recommended to set the `NODE_NO_WARNINGS` environmental variable to `1`.

    === "NPM"

        The application can be installed (globally) from [npm](https://www.npmjs.com/package/icloud-photos-sync) using:

        ```
        npm install -g icloud-photos-sync
        ```

        Alternatively the `npm pack` tar archive is available for download from the [Github releases](https://github.com/steilerDev/icloud-photos-sync/releases) and can be installed using `npm install -g <fileName>`

    === "From Source"

        To build the application from source, clone this repository, go to `app/` and build it:
        
        ```
        git clone https://github.com/steilerDev/icloud-photos-sync.git
        cd icloud-photos-sync/app/
        npm install
        npm run build
        ```


## Authentication

Since this application needs full access to a user's iCloud Photos Library, a full authentication with Apple (including Multi-Factor-Authentication) is required. Unfortunately iCloud's application specific passwords don't support access to the iCloud Photos Library.

Upon initial authentication, this application will register as a 'trusted device'. This includes the acquisition of a trust token. As long as this token is valid, no MFA code is required to authenticate. It seems that this token currently expires after 30 days.

In order to only perform authentication (without syncing any assets) and validate or acquire the trust token, the [`token` command](../user-guides/cli/#token) can be used.

!!! tip "Concurrency"
    Depending on the defined schedule, the container service might already perform a sync. In order to avoid sync collisions two instances of this application cannot access the same library concurrently, which might lead to `LibraryError (FATAL): Locked by PID 1, cannot release.` errors.
            
    In case you are certain that there is no instance running (and the lock is still there, because it was not released properly previously), use the `--force` flag upon the next run to remove it.

=== "Docker"

    === "docker compose"
        
        Expecting the [previously defined `docker compose` service](#installation) being running (through `docker compose up -d`):

        ```
        docker exec -t photos-sync icloud-photos-sync token
        ```
    
    === "docker run"

        ```
        docker run -v "</path/to/your/local/library>:/opt/icloud-photos-library" --name photos-sync steilerdev/icloud-photos-sync:latest \
            -u "<iCloud Username>" \
            -p "<iCloud Password>" \
            --enable-crash-reporting \
            token
        ```

        !!! tip "Plain text username/password"
            If you don't want to store your plain text username and/or password in the docker environment, it is possible to omit the [username](https://icps.steiler.dev/user-guides/cli/#username) and/or [password](https://icps.steiler.dev/user-guides/cli/#password) option. In this scenarios, the username/password needs to be provided manually on each startup from the command line.
            To input the data into the running Docker container it needs to be started with `docker run -it` [to open tty and stdin](https://docs.docker.com/engine/reference/run/#foreground). Once the container was started, you can attach to the running `icloud-photos-sync` process using [`docker attach photos-sync`](https://docs.docker.com/engine/reference/commandline/attach/), and detach with the sequence `CTRL-p CTRL-q`.

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

!!! warning "Password containing dollar sign (`$`)"
    In case your password contains a dollar sign, this might be mis-handled by your shell. You should [wrap the password string in single quotes](https://stackoverflow.com/a/33353687/3763870) in order to preserve the string literal. E.g. `[...] -p pas$word [...]` would become `[...] -p 'pas$word' [...]`.

### Multi-Factor-Authentication

In case no valid trust token is available, a MFA code is required in order to successfully authenticate. 

The CLI application will pause execution, in case it detects that a MFA code is necessary, [open a web server](../user-guides/cli/#port) and wait for user input. At this point, a MFA code should have already been sent to the primary device. 

The MFA code needs to be submitted within 10 minutes. If this was not done, the execution will exit and needs to be restarted.

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

    Submitting code `123456` using helper script within running container (run the script without any arguments, to get more details on the available options):

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

        Submitting code `123456` using this repository's helper scripts (located in `docker/rootfs/root/`) to a locally running `icloud-photos-sync` (run the script without any arguments, to get more details on the available options):

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

    Resending MFA code using `sms` to phone with number ID `2` using helper script within running container (run the script without any arguments, to get more details on the available options):

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
        
        Resending MFA code using `sms` to phone with number ID `2` using  this repository's helper scripts (located in `docker/rootfs/root/`) to a locally running `icloud-photos-sync` (run the script without any arguments, to get more details on the available options):

        ```
        docker/rootfs/root/resend_mfa sms 2
        ```


## Syncing

The `sync` command will perform authentication, proceed to load the local and remote library and compare the two states. The remote state will always be applied:

  * Extraneous local files will be removed (exceptions are ['Archived Folders'](#archiving))
  * Missing remote files will be downloaded

The synchronization will also create the folder structure present in the iCloud Photos Library, to achieve a user friendly navigation. If iCloud Shared Photo Library is enabled, the shared assets will be stored in the `_Shared-Photos` folder.

!!! warning "File Structure"
    Since this application does not use any local database, it is imperative, that the [file structure](../dev/local-file-structure/) is not changed by any other application or user.

During the sync process various warning could be produced. The list of [common warnings](../user-guides/common-warnings/) contains more details on them.

!!! tip "Syncing large libraries"
    Initial sync of large libraries can take some time. After one hour the initially fetched metadata expires, after 8 hours the session expires, which will lead to a failure of the ongoing sync. The tool will refresh the metadata and/or session, unless the maximum number of retries is reached. Make sure to [set the retry option](../user-guides/cli/#max-retries) to a high number or `Infinity`, otherwise the process might prematurely fail. Restarting a previously failed sync will keep all previously successfully downloaded assets.

    Additionally you might need to limit the rate of metadata fetching, because the iCloud API has been observed to enforce rate limits, causing `SOCKET HANGUP` errors. This appears to be applicable for libraries holding more than 10.000 assets. Do this by [setting the metadata rate option](../user-guides/cli/#metadata-rate) - it seems `1/20` ensures sufficient throttling.

### Ad-hoc

In order to perform a single synchronization execution, the [`sync` command](../user-guides/cli/#sync) will be used.

=== "Docker"

    === "docker compose"

        Expecting the [previously defined `docker compose` service](#installation) being running (through `docker compose up -d`):
        
        ```
        docker exec -t photos-sync icloud-photos-sync sync
        ```

        !!! tip "File limits"
            Syncing a large library might fail due to reaching the maximum limit of open files. The `nofile` limit can be set [in the `docker-compose.yml`](https://docs.docker.com/compose/compose-file/05-services/#ulimits), but might require an increase of the [system limits](https://linuxhint.com/permanently_set_ulimit_value/).
    
    === "docker run"

        ```
        docker run -v "</path/to/your/local/library>/library:/opt/icloud-photos-library" --name photos-sync steilerdev/icloud-photos-sync:latest \
            -u "<iCloud Username>" \
            -p "<iCloud Password>" \
            --enable-crash-reporting \
            sync
        ```

        !!! tip "File limits"
            Syncing a large library might fail due to reaching the maximum limit of open files. The `nofile` limit can be set through [a CLI argument](https://docs.docker.com/engine/reference/commandline/run/#ulimit), but might require an increase of the [system limits](https://linuxhint.com/permanently_set_ulimit_value/).

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

    !!! tip "File limits"
        Syncing a large library might fail due to reaching the maximum limit of open files. The `nofile` limit can be [increased temporarily or permanently](https://linuxhint.com/permanently_set_ulimit_value/).

### Scheduled

When using the [`daemon` command](../user-guides/cli/#daemon), the application will start scheduled synchronization executions based on a [cron schedule](../user-guides/cli/#daemon).

This schedule is expected to be in [cron](https://crontab.guru) format. For more details on the specific implementation, see [Croner's pattern documentation](https://github.com/hexagon/croner#pattern).

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

!!! tip "MFA Code during scheduled executions"
    The trust token (used to circumvent the MFA code) is expiring after 30 days. Each authentication will read the trust token from file and exit execution if a trust token has expired and no MFA code was supplied in time (this usually happens during scheduled runs in the night). In this scenario, running the `token` command to update the trust token is possible, without having to restart the scheduled execution.

## Archiving

In order to reduce complexity and storage needs in the iCloud Photos Library, archiving allows you to take a snapshot of a provided album and ignore changes to the album moving forward. This allows you to remove some or all of the photos within the album in iCloud after it was archived, while retaining a copy of all pictures locally.

Optionally, this tool can remove non-favorite photos from iCloud upon archiving. The favorite flag on the remaining photos in the cloud can be removed after the `archive` command completed successfully.

In case the album is renamed in the backend, the archived local copy will be renamed as well, but its content will not change. If the album is removed from the backend, the archived copy will be moved into `_Archive`. Files and folders in that path (except `_Archive/.stash`) can be freely modified. After a folder has been put into `_Archive`, it can be moved back into the folder structure of the library and will be ignored moving forward.

In order to archive an album, the [`archive` command](../user-guides/cli/#archive) will be used. To automatically delete non-favorite pictures in the album from iCloud, add the [`remote-delete`](../user-guides/cli/#remote-delete) flag

=== "Docker"

    === "docker compose"
        
        Expecting the [previously defined `docker compose` service](#installation) being running (through `docker compose up -d`):
        
        ```
        docker exec -t photos-sync icloud-photos-sync archive /opt/icloud-photos-library/<path/to/album>
        ```
    
    === "docker run"

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

        ```
        npm run execute -- \
            -u "<iCloud Username>" \
            -p "<iCloud Password>" \
            -d "</path/to/your/local/library>" \
            --enable-crash-reporting \
            archive \
            </path/to/your/local/library>/<path/to/album>
        ```

## Contributing & Feedback

Please check the [contributing guidelines](https://github.com/steilerDev/icloud-photos-sync/blob/main/CONTRIBUTING.md) to learn how to engage with this project. The document outlines the bug reporting, feature and support request process for this tool.