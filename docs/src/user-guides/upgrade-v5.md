# Upgrading to v5

Version 5 brings a new runtime, a hardened Docker image and a reworked network stack. The local library format is unchanged, so an existing library (and its trust token) is used as-is - no re-sync is necessary. Check the following breaking changes before upgrading.

## Node.js 26 required

When installing through npm, Node.js `26` or newer is required. Upgrade Node.js before installing the new version:

```
node --version   # needs to print v26.x or newer
npm install -g icloud-photos-sync
```

The Docker image ships with the matching runtime, no action is necessary.

## Docker image without shell

The Docker image is now based on [Docker Hardened Images](hardening.md#docker-image) and no longer includes a shell, package manager or other system utilities:

- `docker exec -it photos-sync sh` is no longer possible. Commands of this application can still be executed directly, e.g. `docker exec -it photos-sync icloud-photos-sync token`.
- Use [`docker debug`](https://docs.docker.com/reference/cli/docker/debug/) to inspect the running container.
- Custom images or entrypoints building on top of `steilerdev/icloud-photos-sync` that rely on `sh`, `apk` or other utilities need to be adjusted.

## Library volume ownership

The application still runs with UID `100` and GID `101`, however the default library path `/opt/icloud-photos-library` is no longer world-writable, but owned by this user.

- **Bind mounts** (e.g. `/path/on/host:/opt/icloud-photos-library`) keep the permissions of the host directory and are not affected.
- **Existing named volumes** that already contain a library keep their permissions and are not affected.
- **New named or anonymous volumes** are owned by `100:101`. If the container is executed with a different [`user`](https://docs.docker.com/reference/compose-file/services/#user), the application fails to write to such a volume (`EACCES`). Either remove the `user` option (running as `100:101`), or use a bind mount to a host directory owned by the configured user.

## Proxy environment variables

`HTTP_PROXY`, `HTTPS_PROXY` and `NO_PROXY` are no longer applied implicitly. If you rely on a proxy, enable it with `USE_SYSTEM_PROXY=true` (or `--use-system-proxy`), see [Proxy](proxy.md).

## Multi-factor authentication

Apple changed the iCloud authentication flow with iOS 26.4, which broke MFA in previous versions. v5 implements the new flow, with the trusted device push being the default method again. SMS and voice codes can still be requested through the [Web UI](web-ui.md) or the [API](api.md). Existing trust tokens remain valid, so MFA is only requested once the token expires.

## New optional features

The following features are new in v5 and do not require any change upon upgrade:

- Reading the Apple ID credentials from files through the [username file](cli.md#username-file) and [password file](cli.md#password-file) options, e.g. for Docker secrets
- A Prometheus compatible metrics endpoint, see [Sync Metrics](sync-metrics.md)
- Support for the [Node.js permission model](hardening.md#nodejs-permission-model)
