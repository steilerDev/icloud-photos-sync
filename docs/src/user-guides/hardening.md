# Runtime Hardening

## Docker Image

The Docker image is based on [Docker Hardened Images](https://dhi.io/catalog/node), a minimal, CVE-minimized Node.js runtime, shipping with a software bill of materials (SBOM) and build provenance. Besides Node.js and the application, the image contains no shell, no package manager and no other system utilities.

The application is executed as non-root user with UID `100` and GID `101`. Use the [`user`](https://docs.docker.com/reference/compose-file/services/#user) option to run it with a different user. The default library path `/opt/icloud-photos-library` is owned by `100:101` and not world-writable, therefore a different user requires a bind mount to a host directory owned by this user - a new named or anonymous volume is not writable for it.

!!! warning "No shell available"
    Since the image does not include a shell, `docker exec -it photos-sync sh` is no longer possible. Executing another command of this application through `docker exec` fails with `LIBRARY_LOCKED`, since the running daemon holds the library lock until it exits. Instead:

    - Use the 'Renew Authentication' button of the [Web UI](web-ui.md), instead of the `token` command.
    - For `sync` or `archive`, stop the service and execute the command in a new container, e.g. `docker compose run --rm photos-sync archive <path>`.

    Do not use `--force` while the daemon is running, since this starts a second process writing to the library, which also tries to start a second web server on the same port.

    In order to debug the container, use [`docker debug`](https://docs.docker.com/reference/cli/docker/debug/), which attaches a toolbox to the running container without modifying it.

## Node.js Permission Model

The [Node.js permission model](https://nodejs.org/api/permissions.html#permission-model) can be used to restrict the resources the application is able to access. This is an opt-in hardening measure, limiting the impact of a potential vulnerability in the application or its dependencies.

The application requires the following permissions:

| Flag | Reason |
| ---- | ------ |
| `--allow-fs-read=*` | Reading the library, the application's resources and system information |
| `--allow-fs-write=*` | Albums are created as symbolic links. Node.js only permits the creation of symbolic links with unrestricted file system access, therefore write access cannot be limited to the library directory |
| `--allow-net` | Communicating with the iCloud backend, serving the Web UI and optionally [health checks](health-checks.md) and [crash reporting](error-reporting.md) |

Everything else is denied, most notably spawning child processes (including shells), worker threads, native addons, WASI, FFI and the inspector.

The permission model is enabled through the `NODE_OPTIONS` environment variable:

=== "docker compose"

    ```
    services:
      photos-sync:
        image: steilerdev/icloud-photos-sync:latest
        environment:
          NODE_OPTIONS: "--permission --allow-fs-read=* --allow-fs-write=* --allow-net"
          ...
    ```

=== "docker run"

    ```
    docker run -e NODE_OPTIONS="--permission --allow-fs-read=* --allow-fs-write=* --allow-net" ... steilerdev/icloud-photos-sync:latest
    ```

=== "node"

    ```
    NODE_OPTIONS="--permission --allow-fs-read=* --allow-fs-write=* --allow-net" icloud-photos-sync daemon
    ```

!!! info "Experimental warning"
    The `--allow-net` flag is currently flagged as experimental by Node.js, therefore a corresponding `ExperimentalWarning` is printed upon startup.

If any of the required permissions are missing, the application will refuse to start, printing the missing flags:

```
APP_INSUFFICIENT_PERMISSIONS: Node.js permission model is enabled, but required permissions are missing (missing --allow-fs-write=*)
```

Since the file system access cannot be restricted by Node.js, consider restricting it through Docker: The library volume is the only location the application writes to, therefore the container's root file system can be mounted [read-only](https://docs.docker.com/reference/compose-file/services/#read_only) (`read_only: true` in docker compose, `--read-only` for docker run). If [soft delete](cli.md#soft-delete) is enabled with an absolute [trash directory](cli.md#trash-dir) outside of the library, this directory needs its own writable mount.
