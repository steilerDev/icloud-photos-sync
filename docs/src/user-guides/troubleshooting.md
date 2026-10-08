# Troubleshooting

This page lists common problems and how to resolve them. Error messages contain an error code (e.g. `AUTH_UNAUTHORIZED`), which can be used to find the matching entry. Warnings that don't stop the sync are described in [Common Warnings](common-warnings.md).

Before digging deeper, make sure that you are able to access your iCloud Photos Library through [icloud.com](https://www.icloud.com) - this application relies on the same API.

## Authentication

### MFA code required (trust token expired)

The trust token, acquired through MFA, expires roughly every 30 days. Afterwards, the next sync waits for a new MFA code: The WebUI forwards to the MFA form and a [notification](web-ui.md#notifications) is sent (if enabled). Enter the code in the [WebUI](web-ui.md#mfa) within the [MFA timeout](cli.md#mfa-timeout) (default 10 minutes).

If no code was provided in time, the run fails (`MFA_TIMEOUT`, shown as `MFA code not provided` in the WebUI) and the next scheduled run asks again. Use `Renew Authentication` in the WebUI to restart the authentication at any time.

If the code is not delivered to your trusted devices, use `Resend Code/Change Method` to receive it via SMS or voice call. The [refresh token](cli.md#refresh-token) option discards a stored trust token and forces a new MFA.

### `AUTH_UNAUTHORIZED` / `AUTH_FORBIDDEN`

`Username/Password does not seem to match` or `Username does not seem to exist`: Check the provided credentials. Application specific passwords are not supported, the Apple ID password is required. If the password contains special characters (e.g. `$`), make sure they are not interpreted by your shell (wrap the value in single quotes) or use the [password file](cli.md#password-file) option.

### `AUTH_PRECONDITION_FAILED` / `AUTH_ACCOUNT_SETUP_INCOMPLETE`

iCloud requires an action on your account. Log in to [icloud.com](https://www.icloud.com) and complete the shown prompts (e.g. accept updated terms and conditions, update your password).

### Advanced Data Protection

Accounts with Advanced Data Protection need to approve the access on one of their devices, see [Advanced Data Protection](adp.md).

## Startup

### `LIBRARY_LOCKED`

The library is used by another process of this application - only one process can access the library at a time. This happens when running a command (e.g. `archive`) while the daemon is running: Stop the daemon first, see [Archiving](../get-started.md#archiving).

The process holding the lock refreshes it every 15 seconds. If the process stopped without releasing the lock (e.g. because the container was killed), the lock expires after 60 seconds: A new process waits for the expiry (if the holder cannot be checked, e.g. because it was running in another container) and removes the stale lock automatically. The [force](cli.md#force) option removes a lock immediately - never use it while another process is running.

### `WEB_SERVER_ADDR_IN_USE` / `WEB_SERVER_INSUFFICIENT_PRIVILEGES`

The WebUI could not be started on the configured [port](cli.md#port): Either another service (or another process of this application) is using the port, or the user is not allowed to open it - ports below `1024` usually require root privileges outside of Docker. Choose another port, e.g. `-P 8080`.

### `APP_INSUFFICIENT_PERMISSIONS`

Node's permission model is enabled, but required permissions are missing, see [Runtime Hardening](hardening.md).

### Invalid options

Options are validated on startup, the error message names the invalid option. Boolean options set through environment variables accept `true`, `1`, `yes`, `on` and `false`, `0`, `no`, `off` (or an empty value) - other values are rejected.

## Sync

### Permission denied (`EACCES`)

The application can't write to the library directory. In Docker, the application runs as UID `100` and GID `101`, unless a different user is configured (`user: <uid>:<gid>`) - make sure this user owns the mounted directory (and the [trash directory](cli.md#trash-dir), if it is located outside of the library).

### No space left on device (`ENOSPC`)

The disk holding the library is full. Since assets are only downloaded once, freeing space and restarting the sync continues where it stopped.

### Too many open files (`EMFILE`)

Large libraries might exceed the limit of open files. Increase the `nofile` limit, see [Syncing large libraries](../get-started.md#ad-hoc-sync), or reduce the number of [download threads](cli.md#download-threads).

### Throttling and `SOCKET HANGUP` errors

The iCloud API limits the rate of requests. Throttled requests are retried automatically. If errors persist (especially for libraries with more than 10.000 assets), limit the [metadata rate](cli.md#metadata-rate), e.g. `1/20`, and increase the [maximum number of retries](cli.md#max-retries).

### Unknown file type

Assets with a file type that is not yet supported are skipped, see [Common Warnings](common-warnings.md). With [crash reporting](error-reporting.md) enabled, they are reported automatically - otherwise please report them in [issue 143](https://github.com/steilerDev/icloud-photos-sync/issues/143).

### `LIBRARY_VERSION_MISMATCH`

The library was created by an incompatible version of this application. Use a new, empty data directory or downgrade to the matching version.

## Reporting an issue

If your problem is not listed, please [open an issue](https://github.com/steilerDev/icloud-photos-sync/blob/main/CONTRIBUTING.md). Enable [crash reporting](error-reporting.md) and include the `(error code: <uuid>)` from the error message, the application version and the relevant parts of the log file (`.icloud-photos-sync.log` in the data dir, use `--log-level debug` for more details). Remove any personal information before posting logs.
