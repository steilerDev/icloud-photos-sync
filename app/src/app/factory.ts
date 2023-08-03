import {Command, Option, InvalidArgumentError} from "commander";
import Cron from "croner";
import * as PACKAGE_INFO from '../lib/package.js';
import {ErrorHandler} from "./event/error-handler.js";
import {TokenApp, SyncApp, ArchiveApp, iCPSApp, DaemonApp} from "./icloud-app.js";
import {ResourceManager} from "../lib/resource-manager/resource-manager.js";
import {LogLevel} from "./event/log.js";

/**
 * This function can be used as a commander argParser. It will try to parse the value as a positive integer and throw an invalid argument error in case it fails
 * @param value - The string literal, read from the CLI
 * @param _dummyPrevious - Conforming to the interface - unused
 * @returns The parsed number
 * @throws An InvalidArgumentError in case parsing failed
 */
function commanderParsePositiveInt(value: string, _dummyPrevious?: unknown): number {
    const parsedValue = parseInt(value, 10);
    if (isNaN(parsedValue)) {
        throw new InvalidArgumentError(`Not a number.`);
    }

    if (parsedValue < 0) {
        throw new InvalidArgumentError(`Not a positive number.`);
    }

    return parsedValue;
}

/**
 * This function can be used as a commander argParser. It will try to parse the value as an integer or the string literal 'Infinity' and throw an invalid argument error in case it fails
 * @param value - The string literal, read from the CLI
 * @param _dummyPrevious - Conforming to the interface - unused
 * @returns The parsed number
 * @throws An InvalidArgumentError in case parsing failed
 */
function commanderParsePositiveIntOrInfinity(value: string, _dummyPrevious?: unknown): number {
    if (value === `Infinity`) {
        return Infinity;
    }

    return commanderParsePositiveInt(value);
}

/**
 * Tries parsing a string as Cron schedule
 * @param value - The string literal, read from the CLI
 * @param _dummyPrevious - Conforming to the interface - unused
 * @returns The original string
 * @throws An InvalidArgumentError in case parsing failed
 */
function commanderParseCron(value: string, _dummyPrevious?: unknown): string {
    try {
        const job = new Cron(value);
        job.stop();
        return value;
    } catch (err) {
        throw new InvalidArgumentError(`Not a valid cron pattern. See https://crontab.guru (or for more information on the underlying implementation https://github.com/hexagon/croner#pattern)`);
    }
}

/**
 * This function can be used as a commander argParser. It will try to parse the value as an interval with the format \<numberOfRequests|Infinity\>/\<timeInMs\>.
 * @param value - The string literal, read from the CLI
 * @param _dummyPrevious - Conforming to the interface - unused
 * @returns A tuple consisting of the max number of runs in the given interval of time and the interval in ms.
 * @throws An InvalidArgumentError in case parsing failed
 */
function commanderParseInterval(value: string, _dummyPrevious?: unknown): [number, number] {
    const expectedRegExp = /^([0-9]+|Infinity)\/([0-9]+)$/;
    const match = value.match(expectedRegExp);
    if (!match) {
        throw new InvalidArgumentError(`Not a valid interval pattern. Expects the format '<numberOfRequests|Infinity>/<timeInMs>', e.g. '1/20' to limit requests to one in 20ms.`);
    }

    const intervalCap = commanderParsePositiveIntOrInfinity(match[1]);
    if (typeof intervalCap === `number` && intervalCap <= 0) {
        throw new InvalidArgumentError(`Not a valid interval. Number of runs needs to be >0`);
    }

    return [
        intervalCap,
        commanderParsePositiveInt(match[2]),
    ];
}

export type iCPSAppOptions = {
    username: string,
    password: string,
    trustToken?: string,
    dataDir: string,
    port: number,
    maxRetries: number,
    downloadThreads: number,
    schedule: string,
    enableCrashReporting: boolean,
    failOnMfa: boolean,
    force: boolean,
    refreshToken: boolean,
    remoteDelete: boolean,
    logLevel: LogLevel,
    silent: boolean,
    logToCli: boolean,
    suppressWarnings: boolean,
    exportMetrics: boolean,
    networkCapture: boolean,
    metadataRate: [number, number]
}

/**
 * This function will parse the provided string array and environment variables and return the correct application object.
 * @param argv - The argument vector to be parsed
 * @returns - The appropriate iCloudApp object, ready to run
 */
export function appFactory(argv: string[]): iCPSApp {
    const AppCommands = {
        archive: `archive`,
        sync: `sync`,
        token: `token`,
        daemon: `daemon`,
    };

    const program = new Command();
    let app: iCPSApp;

    program.name(PACKAGE_INFO.NAME)
        .description(PACKAGE_INFO.DESC)
        .version(PACKAGE_INFO.VERSION)
        .addOption(new Option(`-u, --username <email>`, `AppleID username.`)
            .env(`APPLE_ID_USER`)
            .makeOptionMandatory(true))
        .addOption(new Option(`-p, --password <password>`, `AppleID password.`)
            .env(`APPLE_ID_PWD`)
            .makeOptionMandatory(true))
        .addOption(new Option(`-T, --trust-token <string>`, `The trust token for authentication. If not provided, '.trust-token.icloud' in data dir is tried to be read. If all fails, a new trust token will be acquired, requiring the input of an MFA code.`)
            .env(`TRUST_TOKEN`))
        .addOption(new Option(`-d, --data-dir <string>`, `Directory to store local copy of library.`)
            .env(`DATA_DIR`)
            .default(`/opt/icloud-photos-library`))
        .addOption(new Option(`-P, --port <number>`, `Port number for MFA server (Awaiting MFA code when necessary).`)
            .env(`PORT`)
            .default(80)
            .argParser(commanderParsePositiveInt))
        .addOption(new Option(`-r, --max-retries <number>`, `Sets the number of maximum retries upon an error ('Infinity' means that it will always retry).`)
            .env(`MAX_RETRIES`)
            .default(Infinity, `Infinity`)
            .argParser(commanderParsePositiveIntOrInfinity))
        .addOption(new Option(`-t, --download-threads <number>`, `Sets the number of download threads ('Infinity' will remove all limitations).`)
            .env(`DOWNLOAD_THREADS`)
            .default(5)
            .argParser(commanderParsePositiveIntOrInfinity))
        .addOption(new Option(`-S, --schedule <cron-string>`, `In case this app is executed in daemon mode, it will use this cron schedule to perform regular syncs.`)
            .env(`SCHEDULE`)
            .default(`0 2 * * *`)
            .argParser(commanderParseCron))
        .addOption(new Option(`--enable-crash-reporting`, `Enables automatic collection of errors and crashes, see https://icloud-photos-sync.steilerdev.de/user-guides/error-reporting/ for more information.`)
            .env(`ENABLE_CRASH_REPORTING`)
            .default(false))
        .addOption(new Option(`--fail-on-mfa`, `If a MFA is necessary, exit the program. (This might be useful in test and scheduled scenarios)`)
            .env(`FAIL_ON_MFA`)
            .default(false))
        .addOption(new Option(`--force`, `Force the execution of the operation, independent of an existing lock on the library. USE WITH CAUTION!`)
            .env(`FORCE`)
            .default(false))
        .addOption(new Option(`--refresh-token`, `Ignore any stored token and always refresh it.`)
            .env(`REFRESH_TOKEN`)
            .default(false))
        .addOption(new Option(`--remote-delete`, `If this flag is set, delete non-favorite photos in the iCloud Photos backend upon archiving.`)
            .env(`REMOTE_DELETE`)
            .default(false))
        .addOption(new Option(`-l, --log-level <level>`, `Set the log level.`)
            .env(`LOG_LEVEL`)
            .choices(Object.values(LogLevel))
            .default(`info`))
        .addOption(new Option(`-s, --silent`, `Disables all output to the console.`)
            .env(`SILENT`)
            .default(false))
        .addOption(new Option(`--log-to-cli`, `Disables logging to file and logs everything to the console.`)
            .env(`LOG_TO_CLI`)
            .default(false))
        .addOption(new Option(`--suppress-warnings`, `Non critical warnings will not be displayed in the UI. They will still go into the log.`)
            .env(`SUPPRESS_WARNINGS`)
            .default(false))
        .addOption(new Option(`--export-metrics`, `Enables the export of sync metrics to a file using the Influx Line Protocol.`)
            .env(`EXPORT_METRICS`)
            .default(false))
        .addOption(new Option(`--network-capture`, `Enables network capture, and generate a HAR file for debugging purposes. Written to '.icloud-photos-sync.har' in the data dir.`)
            .env(`NETWORK_CAPTURE`)
            .default(false))
        .addOption(new Option(`--metadata-rate <interval>`, `Limits the rate of metadata fetching in order to avoid getting throttled by the API. Expects the format '<numberOfRequests|Infinity>/<timeInMs>', e.g. '1/20' to limit requests to one request in 20ms.`)
            .env(`METADATA_RATE`)
            .default([Infinity, 0], `Infinity/0`)
            .argParser(commanderParseInterval));

    program.command(AppCommands.daemon)
        .action((_, command) => {
            ResourceManager.setup(command.parent.opts());
            app = new DaemonApp();
        })
        .description(`Starts the synchronization in scheduled daemon mode - continuously running based on the provided cron schedule.`);

    program.command(AppCommands.token)
        .action((_, command) => {
            ResourceManager.setup(command.parent.opts());
            app = new TokenApp();
        })
        .description(`Validates the current trust token, fetches a new one (if necessary) and prints it to the CLI.`);

    program.command(AppCommands.sync)
        .action((_, command) => {
            ResourceManager.setup(command.parent.opts());
            app = new SyncApp();
        })
        .description(`This command will fetch the remote state and persist it to the local disk.`);

    program.command(AppCommands.archive)
        .action((archivePath, _, command) => {
            ResourceManager.setup(command.parent.opts());
            app = new ArchiveApp(archivePath);
        })
        .description(`Archives a given folder. Before archiving, it will first perform a sync, to make sure the correct state is archived.`)
        .argument(`<path>`, `Path to the folder that should be archived`);

    program.parse(argv);
    ErrorHandler.cleanEnv();
    return app;
}