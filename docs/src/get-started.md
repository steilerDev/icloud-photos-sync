# Get Started - A Complete User Guide
This guide outlines the lifecycle of this application. Since it is written in Typescript it can be executed directly on various platforms through NodeJS. Please check this application's [OS support matrix](README.md#os-support) for compatibility. Additionally a Docker Image is provided.

The recommended installation path is using `docker compose`, since this nicely manages configuration and dependencies. How to setup [Docker](https://docs.docker.com/engine/install/), [docker compose](https://docs.docker.com/compose/install/) or a [NodeJS environment](https://nodejs.org/en/download) on your host is out of the scope for this document.

Find examples for the various deployment options within this guide.

## Installation
The `latest` tag should always represent the latest stable release, whereas the `beta` tag provides a semi-stable preview of the upcoming release, while the `nightly` tag offers the latest development build, which might not be stable.

=== "Docker"

    Docker images are available on [DockerHub](https://hub.docker.com/r/steilerdev/icloud-photos-sync) for `linux/amd64` and `linux/arm64` platform. Alternatively the docker image tar archive is available from the [Github releases](https://github.com/steilerDev/icloud-photos-sync/releases) and can be installed using `docker load --input <fileName>`

    === "docker compose"
        
        Create a `docker-compose.yml` file, similar to the one below. Please add your Apple ID credentials and desired location of the library on disk. Optionally, add the timezone and your local users' `UID` and `GID`. 
        

        ```
        services:
          photos-sync:
            image: steilerdev/icloud-photos-sync:latest
            container_name: photos-sync
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
            If you don't want to store your plain text username and/or password in the docker environment, it is possible to omit the [username](user-guides/cli.md#username) and/or [password](user-guides/cli.md#password) option. In this scenarios, the username/password needs to be provided manually on each startup from the command line.
            To input the data into the running Docker container it needs to be started with [`tty: true`](https://docs.docker.com/reference/compose-file/services/#tty) and [`stdin_open: true`](https://docs.docker.com/reference/compose-file/services/#stdin_open). Once the container was started, you can attach to the running `icloud-photos-sync` process using [`docker attach photos-sync`](https://docs.docker.com/engine/reference/commandline/attach/), and detach with the sequence `CTRL-p CTRL-q`.
            To execute a command within the running container (that needs access to the credentials), use `docker exec -it` [to open tty and stdin](https://docs.docker.com/reference/cli/docker/container/exec/#run-docker-exec-on-a-running-container), e.g. `docker exec -it photos-sync token`.

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

## Usage

When launching this application without specifying a command, it will start in daemon mode - executing the synchronization based on the provided cron schedule using the supplied credentials (or prompting for credentials upon startup, in case none are supplied). 

Unfortunately iCloud's application specific passwords don't support access to the iCloud Photos Library - therefore you will need to supply your Apple ID password - Passkeys are not supported.

=== "Docker"

    === "docker compose"
        
        Running `docker compose up -d` on the [previously defined `docker-compose.yml`](#installation) launches the app in daemon mode.
    
    === "docker run"

        ```
        docker run -v "</path/to/your/local/library>/library:/opt/icloud-photos-library" --name photos-sync  --user <uid>:<gid> steilerdev/icloud-photos-sync:latest \
            -u "<iCloud Username>" \
            -p "<iCloud Password>" \
            --enable-crash-reporting \
            --schedule "* 2 * * *" 
        ```

=== "node"

    === "NPM"

        ```
        icloud-photos-sync \
            -u "<iCloud Username>" \
            -p "<iCloud Password>" \
            -d "</path/to/your/local/library>" \
            --enable-crash-reporting \
            --schedule "* 2 * * *" 
        ```

    === "From Source"
        
        ```
        npm run execute -- \
            -u "<iCloud Username>" \
            -p "<iCloud Password>" \
            -d "</path/to/your/local/library>" \
            --enable-crash-reporting \
            --schedule "* 2 * * *" 
        ```

!!! warning "Password containing dollar sign (`$`)"
    In case your password contains a dollar sign, this might be mis-handled by your shell. You should [wrap the password string in single quotes](https://stackoverflow.com/a/33353687/3763870) in order to preserve the string literal. E.g. `[...] -p pas$word [...]` would become `[...] -p 'pas$word' [...]`.

The primary interface to interact with this application is a WebUI, however configuration is performed through CLI arguments and/or environment variables, see the [CLI Reference](user-guides/cli.md) for a comprehensive list of all available options. Additionally [an API is exposed](user-guides/api.md) through the integrated web server.

### Authentication

Since this application needs full access to a user's iCloud Photos Library, a full authentication with Apple (including Multi-Factor-Authentication) is initially required. While this will acquire a trust token, Apple's system requires refreshing this token every ~30 days by providing a re-authentication utilizing an MFA code.

In order to perform authentication (without syncing any assets) to validate or acquire the trust token, navigate to the WebUI and select `Renew authentication`.

![Initial Sync](../assets/web-ui/unknown.png)

This will trigger the authentication flow and an MFA code will be requested from your trusted devices. This will forward to a form to enter the 6-digit code - use the `Submit` button to confirm your submission.

![MFA Form](../assets/web-ui/mfa-form.png)

In case your trusted devices are not available and you need to resend the MFA code through other methods, select `Resend Code/Change Method`.

![MFA Methods](../assets/web-ui/mfa-methods.png)

Once the code has been accepted, the program will run autonomously based on the configured cron schedule until an MFA code is required.

![Reauth Success](../assets/web-ui/reauth-success.png)

### Ad-Hoc Sync

When selecting `Sync now` from the WebUI, the tool will perform authentication, proceed to load the local and remote library and compare the two states. 

![Unknown](../assets/web-ui/unknown.png)

The remote state will always be applied:

  * Extraneous local files will be removed (exceptions are ['Archived Folders'](#archiving))
  * Missing remote files will be downloaded

The synchronization will also create the folder structure present in the iCloud Photos Library, to achieve a user friendly navigation. If iCloud Shared Photo Library is enabled, the shared assets will be stored in the `_Shared-Photos` folder.

!!! warning "File Structure"
    Since this application does not use any local database, it is imperative, that the [file structure](dev/local-file-structure.md) is not changed by any other application or user.

During the sync process various warning could be produced within the application logs of the CLI. The list of [common warnings](user-guides/common-warnings.md) contains more details on them.

!!! tip "Syncing large libraries"
    Initial sync of large libraries can take some time. After one hour the initially fetched metadata expires, after 8 hours the session expires, which will lead to a failure of the ongoing sync. The tool will refresh the metadata and/or session, unless the maximum number of retries is reached. Make sure to [set the retry option](user-guides/cli.md#max-retries) to a high number or `Infinity`, otherwise the process might prematurely fail. Restarting a previously failed sync will keep all previously successfully downloaded assets.

    Additionally you might need to limit the rate of metadata fetching, because the iCloud API has been observed to enforce rate limits, causing `SOCKET HANGUP` errors. This appears to be applicable for libraries holding more than 10.000 assets. Do this by [setting the metadata rate option](user-guides/cli.md#metadata-rate) - it seems `1/20` ensures sufficient throttling.

During the sync, the WebUI will not show any detailed progress information - please check the CLI output and/or log files for more information on the sync progress.

![Sync](../assets/web-ui/sync.png)

=== "Docker"

    === "docker compose"

        !!! tip "File limits"
            Syncing a large library might fail due to reaching the maximum limit of open files. The `nofile` limit can be set [in the `docker-compose.yml`](https://docs.docker.com/compose/compose-file/05-services/#ulimits), but might require an increase of the [system limits](https://linuxhint.com/permanently_set_ulimit_value/).
    
    === "docker run"

        !!! tip "File limits"
            Syncing a large library might fail due to reaching the maximum limit of open files. The `nofile` limit can be set through [a CLI argument](https://docs.docker.com/engine/reference/commandline/run/#ulimit), but might require an increase of the [system limits](https://linuxhint.com/permanently_set_ulimit_value/).

=== "node"

    !!! tip "File limits"
        Syncing a large library might fail due to reaching the maximum limit of open files. The `nofile` limit can be [increased temporarily or permanently](https://linuxhint.com/permanently_set_ulimit_value/).

### PWA & Notifications

The Web UI is implemented as a PWA. This way, the app can cleanly be added to the home screen. The Service Worker of the PWA will only cache the static resources, which means that while you are offline or your server is unreachable you can open the PWA, but it will only show you that it can't fetch the state. The PWA can also publish push notifications to inform you about the state of execution. 

To enable notifications, add the PWA to your home screen, tap on the notification and grant notification permissions. Note that notifications or other PWA capabilities might not work, if you do not use a TLS encrypted connection with a certificate trusted by the device. PWA capabilities have only been tested with Safari on MacOS and iOS - utilizing Google's notification system would require the acquisition of a GCM key (this is currently not in scope, but can be requested through a Github issue).

### Archiving

!!! warning "State of Archiving"
    The current implementation of archiving should be functional, however has not yet been fully tested in a real world scenario and it's implementation is subject to change. I would not recommend relying on this feature heavily.

In order to reduce complexity and storage needs in the iCloud Photos Library, archiving allows you to take a snapshot of a provided album and ignore changes to the album moving forward. This allows you to remove some or all of the photos within the album in iCloud after it was archived, while retaining a copy of all pictures locally.

Optionally, this tool can remove non-favorite photos from iCloud upon archiving. The favorite flag on the remaining photos in the cloud can be removed after the `archive` command completed successfully.

In case the album is renamed in the backend, the archived local copy will be renamed as well, but its content will not change. If the album is removed from the backend, the archived copy will be moved into `_Archive`. Files and folders in that path (except `_Archive/.stash`) can be freely modified. After a folder has been put into `_Archive`, it can be moved back into the folder structure of the library and will be ignored moving forward.

In order to archive an album, the [`archive` command](user-guides/cli.md#archive) will be used. To automatically delete non-favorite pictures in the album from iCloud, add the [`remote-delete`](user-guides/cli.md#remote-delete) flag

=== "Docker"

    === "docker compose"
        
        Expecting the [previously defined `docker compose` service](#installation) being running (through `docker compose up -d`):
        
        ```
        docker exec -t photos-sync icloud-photos-sync archive /opt/icloud-photos-library/<path/to/album>
        ```
    
    === "docker run"

        ```
        docker run -v "</path/to/your/local/library>/library:/opt/icloud-photos-library" --name photos-sync  --user <uid>:<gid> steilerdev/icloud-photos-sync:latest \
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

## Additional resources

- Monitor the tool through [sync metrics](user-guides/sync-metrics.md)
- Integrate with [health check service](user-guides/health-checks.md)
- Consult the [common warnings](user-guides/common-warnings.md) in case any pop up
- Read about the requirements for supporting accounts with [Advanced Data Protection](user-guides/adp.md)
- Access your photo library locally through a [web UI](user-guides/web-ui.md)

## Contributing & Feedback

Please always make sure that you are able to access your iCloud Photo Library through https://icloud.com. Sometimes it is necessary to agree to a dialogue in the web application in order to use it, which this tool is dependent on.

Please check the [contributing guidelines](https://github.com/steilerDev/icloud-photos-sync/blob/main/CONTRIBUTING.md) to learn how to engage with this project. The document outlines the bug reporting, feature and support request process for this tool.

Consider supporting the development efforts by [sponsoring the author](https://github.com/sponsors/steilerDev).