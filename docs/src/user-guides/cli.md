# CLI Reference

```
Usage: icloud-photos-sync [options] [command]

One-way sync engine for iCloud Photos Library within the native file system

Options:
  -V, --version                    output the version number
  -u, --username <email>           AppleID username. (env: APPLE_ID_USER)
  -p, --password <password>        AppleID password. (env: APPLE_ID_PWD)
  -T, --trust-token <string>       The trust token for authentication. If not
                                   provided, '.trust-token.icloud' in data dir
                                   is tried to be read. If all fails, a new
                                   trust token will be acquired, requiring the
                                   input of an MFA code. (env: TRUST_TOKEN)
  -d, --data-dir <string>          Directory to store local copy of library.
                                   (default: "/opt/icloud-photos-library", env:
                                   DATA_DIR)
  -P, --port <number>              Port number for MFA server (Awaiting MFA
                                   code when necessary). (default: 80, env:
                                   PORT)
  -r, --max-retries <number>       Sets the number of maximum retries upon an
                                   error ('Infinity' means that it will always
                                   retry). (default: Infinity, env:
                                   MAX_RETRIES)
  -t, --download-threads <number>  Sets the number of download threads
                                   ('Infinity' will remove all limitations).
                                   (default: 5, env: DOWNLOAD_THREADS)
  -S, --schedule <cron-string>     In case this app is executed in daemon mode,
                                   it will use this cron schedule to perform
                                   regular syncs. (default: "0 2 * * *", env:
                                   SCHEDULE)
  --enable-crash-reporting         Enables automatic collection of errors and
                                   crashes, see
                                   https://icloud-photos-sync.steilerdev.de/user-guides/error-reporting/
                                   for more information. (default: false, env:
                                   ENABLE_CRASH_REPORTING)
  --fail-on-mfa                    If a MFA is necessary, exit the program.
                                   (This might be useful in test and scheduled
                                   scenarios) (default: false, env:
                                   FAIL_ON_MFA)
  --force                          Force the execution of the operation,
                                   independent of an existing lock on the
                                   library. USE WITH CAUTION! (default: false,
                                   env: FORCE)
  --refresh-token                  Ignore any stored token and always refresh
                                   it. (default: false, env: REFRESH_TOKEN)
  --remote-delete                  If this flag is set, delete non-favorite
                                   photos in the iCloud Photos backend upon
                                   archiving. (default: false, env:
                                   REMOTE_DELETE)
  -l, --log-level <level>          Set the log level. NOTE: 'trace' might leak
                                   sensitive session data. (choices: "trace",
                                   "debug", "info", "warn", "error", default:
                                   "info", env: LOG_LEVEL)
  -s, --silent                     Disables logging to the console and forces
                                   logs to go to the log file. (default: false,
                                   env: SILENT)
  --log-to-cli                     Disables logging to file and logs everything
                                   to the console. This will be ignored if
                                   '--silent' is set. (default: false, env:
                                   LOG_TO_CLI)
  --suppress-warnings              Non critical warnings will not be displayed
                                   in the UI. They will still go into the log.
                                   (default: false, env: SUPPRESS_WARNINGS)
  --export-metrics                 Enables the export of sync metrics to a file
                                   using the Influx Line Protocol. (default:
                                   false, env: EXPORT_METRICS)
  --metadata-rate <interval>       Limits the rate of metadata fetching in
                                   order to avoid getting throttled by the API.
                                   Expects the format
                                   '<numberOfRequests|Infinity>/<timeInMs>',
                                   e.g. '1/20' to limit requests to one request
                                   in 20ms. (default: Infinity/0, env:
                                   METADATA_RATE)
  -h, --help                       display help for command

Commands:
  daemon                           Starts the synchronization in scheduled
                                   daemon mode - continuously running based on
                                   the provided cron schedule.
  token                            Validates the current trust token, fetches a
                                   new one (if necessary) and prints it to the
                                   CLI.
  sync                             This command will fetch the remote state and
                                   persist it to the local disk.
  archive <path>                   Archives a given folder. Before archiving,
                                   it will first perform a sync, to make sure
                                   the correct state is archived.
  help [command]                   display help for command
```

## `token` command

```
Usage: icloud-photos-sync token [options]

Validates the current trust token, fetches a new one (if necessary) and prints
it to the CLI.

Options:
  -h, --help  display help for command
```

## `sync` command

```
Usage: icloud-photos-sync sync [options]

This command will fetch the remote state and persist it to the local disk.

Options:
  -h, --help  display help for command
```

## `archive` command

```
Usage: icloud-photos-sync archive [options] <path>

Archives a given folder. Before archiving, it will first perform a sync, to
make sure the correct state is archived.

Arguments:
  path        Path to the folder that should be archived

Options:
  -h, --help  display help for command
```
## `daemon` command

```
Usage: icloud-photos-sync daemon [options]

Starts the synchronization in scheduled daemon mode - continuously running
based on the provided cron schedule.

Options:
  -h, --help  display help for command
```
