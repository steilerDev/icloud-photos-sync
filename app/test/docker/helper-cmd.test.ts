import {describe, expect, jest, test} from "@jest/globals";

import {ICPSContainer} from "../_helpers/testcontainers.helper";

describe(`Docker Help Command`, () => {

    // Setting timeout to 30sec, in order for Docker environment to spin up
    jest.setTimeout(30 * 1000);

    test(`Container should run help`, async () => {
        const container = await new ICPSContainer()
            .withHelpCommand()
            .start();

        expect(container.getFullLogs()).resolves.toEqual(`Usage: icloud-photos-sync [options] [command]

One-way sync engine for the iCloud Photos Library into the native file system
with archiving capabilities

Options:
  -V, --version                    output the version number
  -u, --username <string>          AppleID username. Omitting the option will
                                   result in the CLI to ask for user input
                                   before startup. (env: APPLE_ID_USER)
  -p, --password <string>          AppleID password. Omitting the option will
                                   result in the CLI to ask for user input
                                   before startup. (env: APPLE_ID_PWD)
  -T, --trust-token <string>       The trust token for authentication. If not
                                   provided, the trust token is read from the
                                   \`.icloud-photos-sync\` resource file in data
                                   dir. If no stored trust token could be
                                   loaded, a new trust token will be acquired
                                   (requiring the input of an MFA code). (env:
                                   TRUST_TOKEN)
  -d, --data-dir <string>          Directory to store local copy of library.
                                   (default: "/opt/icloud-photos-library", env:
                                   DATA_DIR)
  -P, --port <number>              Port to listen on when awaiting MFA input.
                                   (default: 80, env: PORT)
  -r, --max-retries <number>       Sets the number of maximum retries upon a
                                   sync error (\`Infinity\` means that it will
                                   always retry). (default: 10, env:
                                   MAX_RETRIES)
  -t, --download-threads <number>  Sets the number of concurrent download
                                   threads (\`Infinity\` will remove all
                                   limitations). (default: 5, env:
                                   DOWNLOAD_THREADS)
  --download-timeout <number>      Sets the timeout (in minutes) for downloading
                                   assets, because downloads sometimes hang.
                                   Should be increased on slower connections
                                   and/or if there are large assets in the
                                   library (\`Infinity\` will remove the timeout).
                                   (default: 10, env: DOWNLOAD_TIMEOUT)
  -S, --schedule <cron-string>     In case this app is executed in daemon mode,
                                   it will use this cron schedule to perform
                                   regular sync operations. (default: "0 2 * *
                                   *", env: SCHEDULE)
  --enable-crash-reporting         Enables automatic collection of errors and
                                   crashes, see
                                   https://icps.steiler.dev/error-reporting/ for
                                   more information. (default: false, env:
                                   ENABLE_CRASH_REPORTING)
  --fail-on-mfa                    If a MFA is necessary, exit the program.
                                   (default: false, env: FAIL_ON_MFA)
  --force                          Forcefully remove an existing library lock.
                                   USE WITH CAUTION! (default: false, env:
                                   FORCE)
  --refresh-token                  Invalidate any stored trust token upon
                                   startup. (default: false, env: REFRESH_TOKEN)
  --remote-delete                  If this flag is set, delete non-favorite
                                   photos in the iCloud Photos backend upon
                                   archiving. (default: false, env:
                                   REMOTE_DELETE)
  -l, --log-level <level>          Set the log level. (choices: "debug", "info",
                                   "warn", "error", default: "info", env:
                                   LOG_LEVEL)
  -s, --silent                     Disables all output to the console. (default:
                                   false, env: SILENT)
  --log-to-cli                     Disables logging to file and logs everything
                                   to the console. (default: false, env:
                                   LOG_TO_CLI)
  --suppress-warnings              Non critical warnings will not be displayed
                                   in the UI. They will still go into the log.
                                   (default: false, env: SUPPRESS_WARNINGS)
  --export-metrics                 Enables the export of sync metrics to a file
                                   using the Influx Line Protocol. Written to
                                   \`.icloud-photos-sync.metrics\` in the data
                                   dir. (default: false, env: EXPORT_METRICS)
  --enable-network-capture         Enables network capture, and generate a HAR
                                   file for debugging purposes. Written to
                                   \`.icloud-photos-sync.har\` in the data dir.
                                   (default: false, env: ENABLE_NETWORK_CAPTURE)
  --metadata-rate <interval>       Limits the rate of metadata fetching in order
                                   to avoid getting throttled by the API.
                                   Expects the format
                                   \`<numberOfRequests|Infinity>/<timeInMs>\`,
                                   e.g. \`1/20\` to limit requests to one request
                                   in 20ms. (default: Infinity/0, env:
                                   METADATA_RATE)
  --region <string>                Changes the iCloud region. (choices: "world",
                                   "china", default: "world", env: REGION)
  --legacy-login                   Enables plain text legacy login method.
                                   (default: false, env: LEGACY_LOGIN)
  --health-check-url <url>         URL to ping to monitor the health of icloud
                                   photos sync, see
                                   https://icps.steiler.dev/health-checks/ for
                                   more information. (env: HEALTH_CHECK_URL)
  -h, --help                       display help for command

Commands:
  daemon                           Starts the synchronization in scheduled
                                   daemon mode - continuously running based on
                                   the provided cron schedule.
  token                            Validates the current trust token, fetches a
                                   new one (if necessary) and prints it to the
                                   CLI.
  sync                             Fetches the remote state and persist it to
                                   the local disk once.
  archive <path>                   Archives a given folder. Before archiving, it
                                   will first perform a sync, to make sure the
                                   correct state is archived.
  help [command]                   display help for command

Find the full documentation at https://icps.steiler.dev/\n`)
    })

})