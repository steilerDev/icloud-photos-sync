import {Command, Option, OptionValues} from 'commander';
import chalk from 'chalk';
import * as PACKAGE_INFO from './package.js';
import {iCloud} from './icloud/icloud.js';
import * as ICLOUD from './icloud/constants.js';
import * as SYNC_ENGINE from './sync-engine/constants.js';
import {SyncEngine} from './sync-engine/sync-engine.js';
import {SingleBar} from 'cli-progress';
import {exit} from 'process';
import {getLogger} from './logger.js';
import {ArchiveEngine} from './archive-engine/archive-engine.js';

export const CLIInterfaceCommand = {
    archive: `archive`,
    sync: `sync`,
    token: `token`,
};

export class CLIInterface {
    /**
     * Default logger for the class
     */
    private logger = getLogger(this);

    /**
     * The progress bar, shown while fetching remote assets
     */
    progressBar: SingleBar;
    /**
     * Indicates if this class should write to the console or the log file
     */
    enableCLIOutput: boolean;

    /**
     * Creates a new CLI interface based on the provided components
     * @param cliOpts - The options read from the interface
     * @param iCloud - The iCloud connection
     * @param syncEngine - The Sync Engine
     */
    constructor(cliOpts: OptionValues, iCloud: iCloud, syncEngine: SyncEngine) {
        this.progressBar = new SingleBar({
            etaAsynchronousUpdate: true,
            format: ` {bar} {percentage}% | Elapsed: {duration_formatted} | {value}/{total} assets downloaded`,
            barCompleteChar: `\u25A0`,
            barIncompleteChar: ` `,
        });

        // If both are false it display will happen, otherwise output will go to log (and log might print it to the console, depending on logToCli)
        this.enableCLIOutput = !cliOpts.logToCli && !cliOpts.silent;

        this.setupCLIiCloudInterface(iCloud);
        this.setupCLISyncEngineInterface(syncEngine);

        process.on(`SIGTERM`, () => {
            // Issued by docker compose down
            this.fatalError(`Received SIGTERM, aborting!`);
        });

        process.on(`SIGINT`, () => {
            // Received from ctrl-c
            this.fatalError(`Received SIGINT, aborting!`);
        });

        if (this.enableCLIOutput) {
            console.clear();
        }

        this.print(chalk.white(this.getHorizontalLine()));
        this.print(chalk.white.bold(`Welcome to ${PACKAGE_INFO.NAME}, v.${PACKAGE_INFO.VERSION}!`));
        this.print(chalk.green(`Made with <3 by steilerDev`));
    }

    // Clear Structure
    //       Assets
    // Sync
    //      Dry Run
    // Archive <folder>
    /**
     * Processing CLI arguments
     * @returns The parsed values from the commandline/environment variables
     */
    static getCLIOptions(): [OptionValues, string[]] {
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
            .addOption(new Option(`-l, --log-level <level>`, `Set the log level`)
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
            .addOption(new Option(`-r, --max-retries <number>`, `Sets the number of maximum retries upon an error (-1 means that it will always retry)`)
                .env(`MAX_RETRIES`)
                .default(-1))
            .addOption(new Option(`--dry-run`, `Do not perform any write actions. Only print out changes that would be performed`)
                .env(`DRY_RUN`)
                .default(false));

        program.command(CLIInterfaceCommand.sync)
            .description(`This command will fetch the remote state and persist it to the local disk.`);

        program.command(CLIInterfaceCommand.archive)
            .description(`Archives a given folder. Before archiving, it will first perform a sync, to make sure the correct state is archived.`)
            .argument(`<path>`, `Path to the folder that should be archived`)
            .addOption(new Option(`--no-remote-delete`, `Do not delete any remote assets upon archiving`)
                .env(`NO_REMOTE_DELETE`)
                .default(false));

        program.command(CLIInterfaceCommand.token)
            .description(`Validates the current trust token and prints it to the command line`)
            .addOption(new Option(`--refresh-token`, `Ignore any stored token and always refresh it`)
                .env(`REFRESH_TOKEN`)
                .default(false));

        // Implement 'token' command, that will print out the current / a fresh trust token

        program.parse();
        return [program.opts(), program.args];
    }

    /**
     * Will print the message to the correct target (console or log file)
     * @param msg - The message to be printed, or 'undefined' if message should be ignored
     */
    print(msg: string) {
        if (msg !== `undefined`) {
            if (this.enableCLIOutput) {
                console.log(msg);
            } else {
                this.logger.info(chalk.reset(msg));
            }
        }
    }

    /**
     * Logs a fatal error and exits the application
     * @param err - The error message to display
     */
    fatalError(err: string) {
        this.print(chalk.red(this.getHorizontalLine()));
        this.print(chalk.red(`Experienced fatal error at ${this.getDateTime()}: ${err}`));
        this.print(chalk.red(this.getHorizontalLine()));
        exit(1);
    }

    /**
     *
     * @returns A horizontal line
     */
    getHorizontalLine(): string {
        return this.enableCLIOutput ? `-`.repeat(process.stdout.columns) : `undefined`;
    }

    /**
     *
     * @returns A local date time string
     */
    getDateTime(): string {
        return new Date().toLocaleString();
    }

    /**
     * Listens to iCloud events and provides CLI output
     */
    setupCLIiCloudInterface(iCloud: iCloud) {
        iCloud.on(ICLOUD.EVENTS.AUTHENTICATION_STARTED, () => {
            this.print(chalk.white(this.getHorizontalLine()));
            this.print(chalk.white(`Authenticating user...`));
        });

        iCloud.on(ICLOUD.EVENTS.AUTHENTICATED, () => {
            this.print(chalk.white(`User authenticated`));
        });

        iCloud.on(ICLOUD.EVENTS.MFA_REQUIRED, port => {
            this.print(chalk.yellowBright(`MFA code required, listening for input on port ${port}...`));
        });

        iCloud.on(ICLOUD.EVENTS.MFA_RECEIVED, () => {
            this.print(chalk.white(`MFA code received`));
        });

        iCloud.on(ICLOUD.EVENTS.TRUSTED, () => {
            this.print(chalk.white(`Device trusted`));
        });

        iCloud.on(ICLOUD.EVENTS.ACCOUNT_READY, () => {
            this.print(chalk.white(`Sign in successful!`));
        });

        iCloud.on(ICLOUD.EVENTS.READY, () => {
            this.print(chalk.greenBright(`iCloud connection established!`));
        });

        iCloud.on(ICLOUD.EVENTS.ERROR, (msg: string) => {
            this.print(chalk.red(`Unexpected error: ${msg}`));
            this.print(chalk.white(this.getHorizontalLine()));
        });
    }

    /**
     * Listens to Sync Engine events and provides CLI output
     */
    setupCLISyncEngineInterface(syncEngine: SyncEngine) {
        syncEngine.on(SYNC_ENGINE.EVENTS.START, () => {
            this.print(chalk.white(this.getHorizontalLine()));
            this.print(chalk.white.bold(`Starting sync at ${this.getDateTime()}`));
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.FETCH_N_LOAD, () => {
            this.print(chalk.white(this.getHorizontalLine()));
            this.print(chalk.white(`Loading local & fetching remote iCloud Library state...`));
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.FETCH_N_LOAD_COMPLETED, (remoteAssetCount, remoteAlbumCount, localAssetCount, localAlbumCount) => {
            this.print(chalk.green(`Loaded local state: ${localAssetCount} assets & ${localAlbumCount} albums`));
            this.print(chalk.green(`Fetched remote state: ${remoteAssetCount} assets & ${remoteAlbumCount} albums`));
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.DIFF, () => {
            this.print(chalk.white(`Diffing remote with local state...`));
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.DIFF_COMPLETED, () => {
            this.print(chalk.green(`Diffing completed!`));
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.WRITE, () => {
            this.print(chalk.white(`Writing diff to disk...`));
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.WRITE_ASSETS, (toBeDeletedCount, toBeAddedCount, toBeKept) => {
            this.print(chalk.cyan(`Syncing assets, by keeping ${toBeKept} and removing ${toBeDeletedCount} local assets, as well as adding ${toBeAddedCount} remote assets...`));
            this.progressBar.start(toBeAddedCount, 0);
        });

        // RecordName would be available
        syncEngine.on(SYNC_ENGINE.EVENTS.WRITE_ASSET_COMPLETED, () => {
            this.progressBar.increment();
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.WRITE_ASSETS_COMPLETED, () => {
            this.progressBar.stop();
            this.print(chalk.greenBright(`Succesfully synced assets!`));
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.WRITE_ALBUMS, (toBeDeletedCount, toBeAddedCount, toBeKept) => {
            this.print(chalk.cyan(`Syncing albums, by keeping ${toBeKept} and removing ${toBeDeletedCount} local albums, as well as adding ${toBeAddedCount} remote albums...`));
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.WRITE_ALBUMS_COMPLETED, () => {
            this.print(chalk.greenBright(`Succesfully synced albums!`));
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.WRITE_COMPLETED, () => {
            this.print(chalk.green(`Succesfully wrote diff to disk!`));
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.DONE, () => {
            this.print(chalk.white(this.getHorizontalLine()));
            this.print(chalk.green.bold(`Succesfully completed sync at ${this.getDateTime()}`));
            this.print(chalk.white(this.getHorizontalLine()));
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.RETRY, retryCount => {
            this.progressBar.stop();
            this.print(chalk.magenta(`Detected recoverable error, refreshing iCloud connection & retrying (#${retryCount})...`));
            this.print(chalk.white(this.getHorizontalLine()));
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.ERROR, msg => {
            this.progressBar.stop();
            this.print(chalk.red(`Sync engine: Unexpected error: ${msg}`));
            this.print(chalk.white(this.getHorizontalLine()));
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.DRY_RUN, msg => {
            this.print(chalk.red(`!!Dry run!! Would perform action: ${msg}`));
            this.print(chalk.white(this.getHorizontalLine()));
        });
    }

    setupCLIArchiveEngineInterface(archiveEngine: ArchiveEngine) {

    }
}