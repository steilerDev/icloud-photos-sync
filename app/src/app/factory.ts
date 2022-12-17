import {Command, Option} from "commander";
import * as PACKAGE_INFO from '../lib/package.js';
import {iCloudApp, TokenApp, SyncApp, ArchiveApp} from "./icloud-app.js";

/**
 * This function will parse the provided string array and return the correct application object
 * @param argv - The argument vector to be parsed
 * @returns - An initiated object that can be `run()`.
 */
export function appFactory(argv: string[]): iCloudApp {
    const AppCommands = {
        "archive": `archive`,
        "sync": `sync`,
        "token": `token`,
    };

    const program = new Command();

    program.name(PACKAGE_INFO.NAME)
        .description(PACKAGE_INFO.DESC)
        .version(PACKAGE_INFO.VERSION)
        .addOption(new Option(`-u, --username <email>`, `AppleID username`)
            .env(`APPLE_ID_USER`)
            .makeOptionMandatory(true))
        .addOption(new Option(`-p, --password <email>`, `AppleID password`)
            .env(`APPLE_ID_PWD`)
            .makeOptionMandatory(true))
        .addOption(new Option(`-T, --trust-token <string>`, `The trust token for authentication. If not provided, '.trust-token.icloud' in data dir is tried to be read. If all fails, a new trust token will be acquired, requiring the input of an MFA code.`)
            .env(`TRUST_TOKEN`))
        .addOption(new Option(`--fail-on-mfa`, `If a MFA is necessary, exit the program. (This is usefull in test scenarios)`)
            .env(`FAIL_ON_MFA`)
            .default(false))
        .addOption(new Option(`-d, --data-dir <string>`, `Directory to store local copy of library`)
            .env(`DATA_DIR`)
            .default(`/opt/icloud-photos-library`))
        .addOption(new Option(`-p, --port <number>`, `port number for MFA server (Awaiting MFA code when necessary)`)
            .env(`PORT`)
            .default(80))
        .addOption(new Option(`-l, --log-level <level>`, `Set the log level. Note: 'trace' might leak sensitive session data`)
            .env(`LOG_LEVEL`)
            .choices([`trace`, `debug`, `info`, `warn`, `error`])
            .default(`info`))
        .addOption(new Option(`--log-to-cli`, `Disables logging to file and logs everything to the console. This will be ignored if '--silent' is set`)
            .env(`LOG_TO_CLI`)
            .default(false))
        .addOption(new Option(`-s, --silent`, `Disables logging to the console and forces logs to go to the log file.`)
            .env(`SILENT`)
            .default(false))
        .addOption(new Option(`-t, --download-threads <number>`, `Sets the number of download threads`)
            .env(`DOWNLOAD_THREADS`)
            .default(5))
        .addOption(new Option(`--enable-crash-reporting`, `Enables automatic collection of errors and crashes, see https://steilerdev.github.io/icloud-photos-sync/user-guides/telemetry/ for more information`)
            .env(`ENABLE_CRASH_REPORTING`)
            .default(false))
        .addOption(new Option(`-r, --max-retries <number>`, `Sets the number of maximum retries upon an error (-1 means that it will always retry)`)
            .env(`MAX_RETRIES`)
            .default(-1))
        .addOption(new Option(`--refresh-token`, `Ignore any stored token and always refresh it`)
            .env(`REFRESH_TOKEN`)
            .default(false));

    program.command(AppCommands.sync)
        .description(`This command will fetch the remote state and persist it to the local disk.`);

    program.command(AppCommands.archive)
        .description(`Archives a given folder. Before archiving, it will first perform a sync, to make sure the correct state is archived.`)
        .argument(`<path>`, `Path to the folder that should be archived`)
        .addOption(new Option(`--no-remote-delete`, `Do not delete any remote assets upon archiving`)
            .env(`NO_REMOTE_DELETE`)
            .default(false));

    program.command(AppCommands.token)
        .description(`Validates the current trust token, fetches a new one (if necessary) and prints it to the CLI`);

    program.parse(argv);

    switch (program.args[0]) {
    case AppCommands.token:
        return new TokenApp(program.opts());
    case AppCommands.sync:
        return new SyncApp(program.opts());
    case AppCommands.archive:
        return new ArchiveApp(program.opts(), program.args[1]);
    default:
        throw new Error(`Unable to create application - unknown command ${program.args[0]}`);
    }
}