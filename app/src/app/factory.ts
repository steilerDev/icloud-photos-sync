import {Command, Option, InvalidArgumentError} from "commander";
import Cron from "croner";
import * as PACKAGE_INFO from '../lib/package.js';
import {ErrorHandler} from "./event/error-handler.js";
import {TokenApp, SyncApp, ArchiveApp, iCPSApp, DaemonApp} from "./icloud-app.js";

/**
 * This function can be used as a commander argParser. It will try to parse the value as an integer and throw an invalid argument error in case it fails
 * @param value - The string literal, read from the CLI
 * @param _dummyPrevious - Conforming to the interface - unused
 * @returns The parsed number
 */
function commanderParseInt(value: string, _dummyPrevious: unknown): number {
    // ParseInt takes a string and a radix
    const parsedValue = parseInt(value, 10);
    if (isNaN(parsedValue)) {
        throw new InvalidArgumentError(`Not a number.`);
    }

    return parsedValue;
}

function commanderParseCron(value: string, _dummyPrevious: unknown): string {
    try {
        const job = new Cron(value);
        job.stop();
        return value;
    } catch (err) {
        throw new InvalidArgumentError(`Not a valid cron pattern. See https://crontab.guru (or for more information on the underlying implementation https://github.com/hexagon/croner#pattern)`);
    }
}

/**
 * This function will parse the provided string array and environment variables and return the correct application object.
 * @param argv - The argument vector to be parsed
 * @returns - The appropriate iCloudApp object, ready to run
 */
export function appFactory(argv: string[]): iCPSApp {
    const AppCommands = {
        "archive": `archive`,
        "sync": `sync`,
        "token": `token`,
        "daemon": `daemon`,
    };

    const program = new Command();
    let app: iCPSApp;

    program.name(PACKAGE_INFO.NAME)
        .description(PACKAGE_INFO.DESC)
        .version(PACKAGE_INFO.VERSION)
        .addOption(new Option(`-u, --username <email>`, `AppleID username`)
            .env(`APPLE_ID_USER`)
            .makeOptionMandatory(true))
        .addOption(new Option(`-p, --password <password>`, `AppleID password`)
            .env(`APPLE_ID_PWD`)
            .makeOptionMandatory(true))
        .addOption(new Option(`-T, --trust-token <string>`, `The trust token for authentication. If not provided, '.trust-token.icloud' in data dir is tried to be read. If all fails, a new trust token will be acquired, requiring the input of an MFA code.`)
            .env(`TRUST_TOKEN`))
        .addOption(new Option(`-d, --data-dir <string>`, `Directory to store local copy of library`)
            .env(`DATA_DIR`)
            .default(`/opt/icloud-photos-library`))
        .addOption(new Option(`-P, --port <number>`, `port number for MFA server (Awaiting MFA code when necessary)`)
            .env(`PORT`)
            .default(80)
            .argParser(commanderParseInt))
        .addOption(new Option(`-r, --max-retries <number>`, `Sets the number of maximum retries upon an error (-1 means that it will always retry)`)
            .env(`MAX_RETRIES`)
            .default(-1)
            .argParser(commanderParseInt))
        .addOption(new Option(`-t, --download-threads <number>`, `Sets the number of download threads`)
            .env(`DOWNLOAD_THREADS`)
            .default(5)
            .argParser(commanderParseInt))
        .addOption(new Option(`-S, --schedule <cron-string>`, `In case this app is executed in daemon mode, it will use this cron schedule to perform regular syncs`)
            .env(`SCHEDULE`)
            .default(`0 2 * * *`)
            .argParser(commanderParseCron))
        .addOption(new Option(`--enable-crash-reporting`, `Enables automatic collection of errors and crashes, see https://icloud-photos-sync.steilerdev.de/user-guides/error-reporting/ for more information`)
            .env(`ENABLE_CRASH_REPORTING`)
            .default(false))
        .addOption(new Option(`--fail-on-mfa`, `If a MFA is necessary, exit the program. (This might be useful in test and scheduled scenarios)`)
            .env(`FAIL_ON_MFA`)
            .default(false))
        .addOption(new Option(`--force`, `Force the execution of the operation, independent of an existing lock on the library. USE WITH CAUTION`)
            .env(`FORCE`)
            .default(false))
        .addOption(new Option(`--refresh-token`, `Ignore any stored token and always refresh it`)
            .env(`REFRESH_TOKEN`)
            .default(false))
        .addOption(new Option(`--remote-delete`, `If this flag is set, delete non-favorite photos in the iCloud Photos backend upon archiving.`)
            .env(`REMOTE_DELETE`)
            .default(false))
        .addOption(new Option(`-l, --log-level <level>`, `Set the log level. NOTE: 'trace' might leak sensitive session data`)
            .env(`LOG_LEVEL`)
            .choices([`trace`, `debug`, `info`, `warn`, `error`])
            .default(`info`))
        .addOption(new Option(`-s, --silent`, `Disables logging to the console and forces logs to go to the log file.`)
            .env(`SILENT`)
            .default(false))
        .addOption(new Option(`--log-to-cli`, `Disables logging to file and logs everything to the console. This will be ignored if '--silent' is set`)
            .env(`LOG_TO_CLI`)
            .default(false))
        .addOption(new Option(`--suppress-warnings`, `Non critical warnings will not be displayed in the UI. They will still go into the log.`)
            .env(`SUPPRESS_WARNINGS`)
            .default(false));

    program.command(AppCommands.daemon)
        .action(() => {
            app = new DaemonApp(program.opts());
        })
        .description(`Starts the synchronization in scheduled daemon mode - continuously running based on the provided cron schedule.`);

    program.command(AppCommands.token)
        .action(() => {
            app = new TokenApp(program.opts());
        })
        .description(`Validates the current trust token, fetches a new one (if necessary) and prints it to the CLI.`);

    program.command(AppCommands.sync)
        .action(() => {
            app = new SyncApp(program.opts());
        })
        .description(`This command will fetch the remote state and persist it to the local disk.`);

    program.command(AppCommands.archive)
        .action(archivePath => {
            app = new ArchiveApp(program.opts(), archivePath);
        })
        .description(`Archives a given folder. Before archiving, it will first perform a sync, to make sure the correct state is archived.`)
        .argument(`<path>`, `Path to the folder that should be archived`);

    program.parse(argv);
    ErrorHandler.cleanEnv();
    return app;
}