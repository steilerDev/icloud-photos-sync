# CLI Reference
```
Usage: icloud-photos-sync [options] [command]

One-way sync engine for iCloud Photos Library within the native file system

Options:
  -V, --version                    output the version number
  -u, --username <email>           AppleID username (env: APPLE_ID_USER)
  -p, --password <email>           AppleID password (env: APPLE_ID_PWD)
  -T, --trust-token <string>       The trust token for authentication. If not provided, '.trust-token.icloud' in data dir is tried to be read. If all fails, a new trust token will be acquired, requiring the
                                   input of an MFA code. (env: TRUST_TOKEN)
  --fail-on-mfa                    If a MFA is necessary, exit the program. (This is usefull in test scenarios) (default: false, env: FAIL_ON_MFA)
  -d, --data-dir <string>          Directory to store local copy of library (default: "/opt/icloud-photos-library", env: DATA_DIR)
  -p, --port <number>              port number for MFA server (Awaiting MFA code when necessary) (default: 80, env: PORT)
  -l, --log-level <level>          Set the log level. Note: 'trace' might leak sensitive session data (choices: "trace", "debug", "info", "warn", "error", default: "info", env: LOG_LEVEL)
  --log-to-cli                     Disables logging to file and logs everything to the console. This will be ignored if '--silent' is set (default: false, env: LOG_TO_CLI)
  -s, --silent                     Disables logging to the console and forces logs to go to the log file. (default: false, env: SILENT)
  -t, --download-threads <number>  Sets the number of download threads (default: 5, env: DOWNLOAD_THREADS)
  -r, --max-retries <number>       Sets the number of maximum retries upon an error (-1 means that it will always retry) (default: -1, env: MAX_RETRIES)
  --dry-run                        Do not perform any write actions. Only print out changes that would be performed (default: false, env: DRY_RUN)
  -h, --help                       display help for command

Commands:
  sync                             This command will fetch the remote state and persist it to the local disk.
  archive [options] <path>         Archives a given folder. Before archiving, it will first perform a sync, to make sure the correct state is archived.
  token [options]                  Validates the current trust token and prints it to the command line
  help [command]                   display help for command
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

Archives a given folder. Before archiving, it will first perform a sync, to make sure the correct state is archived.

Arguments:
  path                Path to the folder that should be archived

Options:
  --no-remote-delete  Do not delete any remote assets upon archiving (env: NO_REMOTE_DELETE)
  -h, --help          display help for command
```

## `token` command
```
Usage: icloud-photos-sync token [options]

Validates the current trust token and prints it to the command line

Options:
  --refresh-token  Ignore any stored token and always refresh it (default: false, env: REFRESH_TOKEN)
  -h, --help       display help for comman
```
