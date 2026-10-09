# Get Started - A Complete User Guide
This guide outlines the lifecycle of this application. Since it is written in Typescript it can be executed directly on various platforms through NodeJS. Please check this application's [OS support matrix](README.md#os-support) for compatibility. Additionally a Docker Image is provided.

The recommended installation path is using `docker compose`, since this nicely manages configuration and dependencies. How to setup [Docker](https://docs.docker.com/engine/install/), [docker compose](https://docs.docker.com/compose/install/) or a [NodeJS environment](https://nodejs.org/en/download) on your host is out of the scope for this document.

Find examples for the various deployment options within this guide.

## Installation
The `latest` tag should always represent the latest stable release, whereas the `beta` tag provides a semi-stable preview of the upcoming release, while the `nightly` tag offers the latest development build, which might not be stable.

!!! info "Upgrading to v5"
    Version 5 contains breaking changes:

    - Node.js `26` or newer is required when installing through npm
    - The Docker image no longer contains a shell and the library path is no longer world-writable, see [Runtime Hardening](user-guides/hardening.md)
    - Proxy environment variables are only applied, if [explicitly enabled](user-guides/proxy.md)
    - Boolean options set through environment variables are only enabled by `true`, `1`, `yes` or `on` - values like `false` now disable the option, see the [CLI Reference](user-guides/cli.md)
    - The [Influx metrics](user-guides/sync-metrics.md) field of MFA warnings was renamed from `warn-mfa_resend_error` to `warn-mfa_error`

=== "Docker"

    Docker images are available on [DockerHub](https://hub.docker.com/r/steilerdev/icloud-photos-sync) for `linux/amd64` and `linux/arm64` platform. Alternatively the docker image tar archive is available from the [Github releases](https://github.com/steilerDev/icloud-photos-sync/releases) and can be installed using `docker load --input <fileName>`

    === "docker compose"
        
        Create a `docker-compose.yml` file, similar to the one below. Please add your Apple ID credentials and desired location of the library on disk. Optionally, add the timezone and your local users' `UID` and `GID` - if omitted, the application runs as UID `100` and GID `101`, which then need write access to the library directory. 
        

        ```
        services:
          photos-sync:
            image: steilerdev/icloud-photos-sync:latest
            container_name: photos-sync
            restart: unless-stopped
            user: <uid>:<gid> 
            environment:
              APPLE_ID_USER: "<iCloud Username>"
              APPLE_ID_PWD: "<iCloud Password>"
              TZ: "Europe/Berlin"                                                       
              SCHEDULE: "0 2 * * *"
              ENABLE_CRASH_REPORTING: true
            ports:
              - 80:80
            volumes:
              - <photos-dir>:/opt/icloud-photos-library
        ```

        !!! tip "Plain text username/password"
            If you don't want to store your plain text username and/or password in the docker environment, the [username file](user-guides/cli.md#username-file) and [password file](user-guides/cli.md#password-file) options (`APPLE_ID_USER_FILE` and `APPLE_ID_PWD_FILE`) can be used instead of `APPLE_ID_USER` and `APPLE_ID_PWD`. They point to files containing the respective value and work well with [Docker secrets](https://docs.docker.com/compose/how-tos/use-secrets/). Trailing line breaks are removed from the file content.

            ```
            services:
              photos-sync:
                image: steilerdev/icloud-photos-sync:latest
                environment:
                  APPLE_ID_USER_FILE: /run/secrets/apple_id_user
                  APPLE_ID_PWD_FILE: /run/secrets/apple_id_pwd
                secrets:
                  - apple_id_user
                  - apple_id_pwd
                # ...
            secrets:
              apple_id_user:
                file: ./apple_id_user.txt
              apple_id_pwd:
                file: ./apple_id_pwd.txt
            ```

            Alternatively, it is possible to omit the [username](user-guides/cli.md#username) and/or [password](user-guides/cli.md#password) option entirely. In this scenarios, the username/password needs to be provided manually on each startup from the command line.
            To input the data into the running Docker container it needs to be started with [`tty: true`](https://docs.docker.com/reference/compose-file/services/#tty) and [`stdin_open: true`](https://docs.docker.com/reference/compose-file/services/#stdin_open). Once the container was started, you can attach to the running `icloud-photos-sync` process using [`docker attach photos-sync`](https://docs.docker.com/reference/cli/docker/container/attach/), and detach with the sequence `CTRL-p CTRL-q`.
            To execute another command (e.g. [`archive`](#archiving)), use `docker compose run -it --rm photos-sync <command>` to open tty and stdin.

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

    Node.js `26` or newer is required. When setting up the environment, please keep the [currently recommended NodeJS version](https://github.com/steilerDev/icloud-photos-sync/blob/main/app/node-version) in mind.

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
        npm ci
        npm run build:dev
        ```

## Usage

When launching this application without specifying a command, it will start in daemon mode - executing the synchronization based on the provided cron schedule using the supplied credentials (or prompting for credentials upon startup, in case none are supplied). 

Unfortunately iCloud's application specific passwords don't support access to the iCloud Photos Library - therefore you will need to supply your Apple ID password - Passkeys and security keys are not supported.

The following commands are available:

- `daemon` (default): Runs the synchronization based on the [schedule](user-guides/cli.md#schedule)
- `sync`: Runs a single synchronization and exits
- `token`: Validates the trust token, acquires a new one (if necessary) and prints it
- `archive <path>`: Synchronizes the library and [archives](#archiving) the provided folder

=== "Docker"

    === "docker compose"
        
        Running `docker compose up -d` on the [previously defined `docker-compose.yml`](#installation) launches the app in daemon mode.
    
    === "docker run"

        ```
        docker run -d --restart unless-stopped --name photos-sync \
            -v "</path/to/your/local/library>:/opt/icloud-photos-library" \
            -p 80:80 \
            --user <uid>:<gid> \
            -e TZ="Europe/Berlin" \
            steilerdev/icloud-photos-sync:latest \
            --username "<iCloud Username>" \
            --password "<iCloud Password>" \
            --enable-crash-reporting \
            --schedule "0 2 * * *"
        ```

=== "node"

    !!! tip "Port"
        The WebUI listens on port `80` by default, which usually requires root privileges. Use the [port](user-guides/cli.md#port) option (e.g. `-P 8080`) to run as unprivileged user.

    === "NPM"

        ```
        icloud-photos-sync \
            -u "<iCloud Username>" \
            -p "<iCloud Password>" \
            -d "</path/to/your/local/library>" \
            --enable-crash-reporting \
            --schedule "0 2 * * *"
        ```

    === "From Source"
        
        ```
        npm run execute -- \
            -u "<iCloud Username>" \
            -p "<iCloud Password>" \
            -d "</path/to/your/local/library>" \
            --enable-crash-reporting \
            --schedule "0 2 * * *"
        ```

!!! warning "Password containing dollar sign (`$`)"
    In case your password contains a dollar sign, this might be mis-handled by your shell. You should [wrap the password string in single quotes](https://stackoverflow.com/a/33353687/3763870) in order to preserve the string literal. E.g. `[...] -p pas$word [...]` would become `[...] -p 'pas$word' [...]`.

The primary interface to interact with this application is the [WebUI](user-guides/web-ui.md), available at `http://<host>:<port>/` (port `80` by default). Configuration is performed through CLI arguments and/or environment variables, see the [CLI Reference](user-guides/cli.md) for a comprehensive list of all available options. Additionally [an API is exposed](user-guides/api.md) through the integrated web server.

### Authentication

Since this application needs full access to a user's iCloud Photos Library, a full authentication with Apple (including Multi-Factor-Authentication) is initially required. While this will acquire a trust token, Apple's system requires refreshing this token every ~30 days by providing a re-authentication utilizing an MFA code.

In order to perform authentication (without syncing any assets) to validate or acquire the trust token, navigate to the WebUI and select `Renew Authentication`.

![Ready](assets/web-ui/00_ready.png#only-light)
![Ready (dark mode)](assets/web-ui/00_ready-dark.png#only-dark)

This will trigger the authentication flow and an MFA code will be pushed to your trusted devices. This will forward to a form to enter the 6-digit code - use the `Submit` button to confirm your submission.

![Enter MFA](assets/web-ui/01_enter-mfa.png#only-light)
![Enter MFA (dark mode)](assets/web-ui/01_enter-mfa-dark.png#only-dark)

In case your trusted devices are not available and you need to resend the MFA code through other methods, select `Resend Code/Change Method`.

![Choose MFA](assets/web-ui/02_choose-mfa.png#only-light)
![Choose MFA (dark mode)](assets/web-ui/02_choose-mfa-dark.png#only-dark)

When selecting a phone based MFA method, the application will present all available 'trusted' numbers. Select the appropriate one for confirmation.

![Choose MFA Number](assets/web-ui/03_choose-mfa-number.png#only-light)
![Choose MFA Number (dark mode)](assets/web-ui/03_choose-mfa-number-dark.png#only-dark)

Once the code has been accepted, the program will run autonomously based on the configured cron schedule until an MFA code is required (~30 days).

![Auth Success](assets/web-ui/04_auth-success.png#only-light)
![Auth Success (dark mode)](assets/web-ui/04_auth-success-dark.png#only-dark)

### Ad-Hoc Sync

When selecting `Sync Now` from the WebUI, the tool will perform authentication and proceed to perform a sync immediately.

![Ready](assets/web-ui/00_ready.png#only-light)
![Ready (dark mode)](assets/web-ui/00_ready-dark.png#only-dark)

The remote state will always be applied:

  * Extraneous local files will be removed (exceptions are ['Archived Folders'](#archiving))
  * Missing remote files will be downloaded

The synchronization will also create the folder structure present in the iCloud Photos Library, to achieve a user friendly navigation. If iCloud Shared Photo Library is enabled, the shared assets will be stored in the `_Shared-Photos` folder.

!!! info "Hidden photos"
    Photos in the *Hidden* album are not synced by default. Enable the [`sync-hidden`](user-guides/cli.md#sync-hidden) flag to include them: They are stored alongside all other assets, linked into the albums they belong to and additionally linked into the `_Hidden-Photos` album. Disabling the flag again will remove them from the local library upon the next sync.

!!! warning "File Structure"
    Since this application does not use any local database, it is imperative, that the [file structure](dev/local-file-structure.md) is not changed by any other application or user.

During the sync process various warnings might be produced within the application logs. The list of [common warnings](user-guides/common-warnings.md) contains more details on them.

!!! tip "Syncing large libraries"
    Initial sync of large libraries can take some time. The download URLs, which are part of the fetched metadata, expire after roughly 15 minutes. Once they expired, the tool refreshes the metadata and continues with the remaining assets. As long as assets were downloaded since the previous refresh, this does not count towards the [maximum number of retries](user-guides/cli.md#max-retries). After 8 hours the session expires, which will lead to a failure of the ongoing sync. The tool will refresh the session, unless the maximum number of retries is reached. Restarting a previously failed sync will keep all previously successfully downloaded assets.

    The iCloud API enforces rate limits, which especially affect libraries holding more than 10.000 assets. If a request is throttled, the tool waits for the time requested by iCloud and retries the request, without failing the sync. To reduce the number of throttled requests, or if you encounter `SOCKET HANGUP` errors, you can additionally [limit the rate of metadata fetching](user-guides/cli.md#metadata-rate), e.g. using `1/20`.

During the sync, the WebUI shows the progress and the current step. The log viewer at the bottom of the page shows the log messages of the current run, more details are available in the CLI output and the log file (`.icloud-photos-sync.log` in the data dir).

![Running](assets/web-ui/05_running.png#only-light)
![Running (dark mode)](assets/web-ui/05_running-dark.png#only-dark)

![Logs](assets/web-ui/06_logs.png#only-light)
![Logs (dark mode)](assets/web-ui/06_logs-dark.png#only-dark)

=== "Docker"

    === "docker compose"

        !!! tip "File limits"
            Syncing a large library might fail due to reaching the maximum limit of open files. The `nofile` limit can be set [in the `docker-compose.yml`](https://docs.docker.com/reference/compose-file/services/#ulimits), but might require an increase of the [system limits](https://linuxhint.com/permanently_set_ulimit_value/).
    
    === "docker run"

        !!! tip "File limits"
            Syncing a large library might fail due to reaching the maximum limit of open files. The `nofile` limit can be set through [a CLI argument](https://docs.docker.com/reference/cli/docker/container/run/#ulimit), but might require an increase of the [system limits](https://linuxhint.com/permanently_set_ulimit_value/).

=== "node"

    !!! tip "File limits"
        Syncing a large library might fail due to reaching the maximum limit of open files. The `nofile` limit can be [increased temporarily or permanently](https://linuxhint.com/permanently_set_ulimit_value/).

### PWA & Notifications

The WebUI is implemented as a PWA and can be added to the home screen. It can send push notifications when a sync has finished or an MFA code is required - see the [WebUI guide](user-guides/web-ui.md#notifications) on how to enable them. Notifications require a TLS encrypted connection with a certificate trusted by the device.

### Archiving

!!! warning "State of Archiving"
    The current implementation of archiving should be functional, however has not yet been fully tested in a real world scenario and its implementation is subject to change. I would not recommend relying on this feature heavily.

In order to reduce complexity and storage needs in the iCloud Photos Library, archiving allows you to take a snapshot of a provided album and ignore changes to the album moving forward. This allows you to remove some or all of the photos within the album in iCloud after it was archived, while retaining a copy of all pictures locally.

Optionally, this tool can remove non-favorite photos from iCloud upon archiving (assets of the *Shared Photo Library* are never removed). The favorite flag on the remaining photos in the cloud can be removed after the `archive` command completed successfully.

In case the album is renamed in the backend, the archived local copy will be renamed as well, but its content will not change. If the album is removed from the backend, the archived copy will be moved into `_Archive`. Files and folders in that path (except `_Archive/.stash`) can be freely modified. After a folder has been put into `_Archive`, it can be moved back into the folder structure of the library and will be ignored moving forward.

In order to archive an album, the [`archive` command](user-guides/cli.md#archive) will be used. To automatically delete non-favorite pictures in the album from iCloud, add the [`remote-delete`](user-guides/cli.md#remote-delete) flag

=== "Docker"

    === "docker compose"
        
        The library can only be used by one process at a time. Using the [previously defined `docker compose` service](#installation), stop the daemon, run the `archive` command in a new container and restart the daemon afterwards:

        ```
        docker compose stop photos-sync
        docker compose run --rm photos-sync archive /opt/icloud-photos-library/<path/to/album>
        docker compose start photos-sync
        ```
    
    === "docker run"

        The library can only be used by one process at a time, stop a running daemon first (`docker stop photos-sync`):

        ```
        docker run --rm \
            -v "</path/to/your/local/library>:/opt/icloud-photos-library" \
            --user <uid>:<gid> \
            steilerdev/icloud-photos-sync:latest \
            --username "<iCloud Username>" \
            --password "<iCloud Password>" \
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

### Soft Delete

By default, assets that were deleted from the iCloud Photos Library are also permanently deleted from the local library during the next sync. If you are using this tool as a backup, you can enable the [`soft-delete`](user-guides/cli.md#soft-delete) flag. Deleted assets are then moved into a trash folder instead, keeping the `_All-Photos`/`_Shared-Photos` structure.

The trash folder defaults to `_Trash` within the data dir and can be changed through the [`trash-dir`](user-guides/cli.md#trash-dir) option. Relative paths are resolved against the data dir, absolute paths are used as they are (make sure the path is persisted, e.g. by mounting it into the Docker container). The trash folder must not be the data dir itself, nor be located within one of the asset folders.

Assets are kept in the trash folder until you remove them, the application never cleans it up. Assets that are only re-downloaded, because their metadata changed in iCloud, are replaced and not moved into the trash folder.

!!! tip "Docker"
    Use the environment variables `SOFT_DELETE=true` and (optionally) `TRASH_DIR=<path>`.

## Additional resources

- Check the [troubleshooting guide](user-guides/troubleshooting.md) if something doesn't work
- Consult the [common warnings](user-guides/common-warnings.md) in case any pop up
- Monitor the tool through [sync metrics](user-guides/sync-metrics.md)
- Integrate with [health check service](user-guides/health-checks.md)
- Read about the requirements for supporting accounts with [Advanced Data Protection](user-guides/adp.md)
- Route requests through a [proxy](user-guides/proxy.md)
- Restrict the application further through [runtime hardening](user-guides/hardening.md)
- Browse your photo library locally using [Photoview](user-guides/photoview.md)

## Contributing & Feedback

Please check the [contributing guidelines](https://github.com/steilerDev/icloud-photos-sync/blob/main/CONTRIBUTING.md) to learn how to engage with this project. The document outlines the bug reporting, feature and support request process for this tool.

Consider supporting the development efforts by [sponsoring the author](https://github.com/sponsors/steilerDev).