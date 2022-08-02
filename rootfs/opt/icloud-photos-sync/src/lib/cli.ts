import {Command, Option, OptionValues} from 'commander';
import chalk from 'chalk';
import * as PACKAGE_INFO from './package.js';
import {iCloud} from './icloud/icloud.js';
import * as ICLOUD from './icloud/constants.js';
import * as SYNC_ENGINE from './sync-engine/constants.js';
import {SyncEngine} from './sync-engine/sync-engine.js';
import {SingleBar} from 'cli-progress';
import {exit} from 'process';

export class CLIInterface {
    progressBar: SingleBar;
    static instance: CLIInterface;

    /**
     * Creates a new CLI interface based on the provided components
     * @param iCloud - The iCloud connection
     * @param syncEngine - The Sync Engine
     */
    constructor(iCloud: iCloud, syncEngine: SyncEngine) {
        this.progressBar = new SingleBar({
            etaAsynchronousUpdate: true,
            format: ` {bar} {percentage}% | Elapsed: {duration_formatted} | {value}/{total} assets downloaded`,
            barCompleteChar: `\u25A0`,
            barIncompleteChar: ` `,
        });
        this.setupCLIiCloudInterface(iCloud);
        this.setupCLISyncEngineInterface(syncEngine);

        process.on(`SIGTERM`, () => {
            // Issued by docker compose down
            CLIInterface.fatalError(`Received SIGTERM, aborting!`);
        });

        process.on(`SIGINT`, () => {
            // Received from ctrl-c
            CLIInterface.fatalError(`Received SIGINT, aborting!`);
        });

        console.log(chalk.white(CLIInterface.getHorizontalLine()));
        console.log(chalk.white.bold(`Welcome to ${PACKAGE_INFO.NAME}, v.${PACKAGE_INFO.VERSION}!`));
        console.log(chalk.green(`Made with <3 by steilerDev`));
    }

    /**
     * Initiates the CLI interface and connects it to the relevant components
     * @param iCloud - The iCloud object
     * @param photosLibrary - The Photos Library object
     * @param syncEngine - The Sync Engine object
     */
    static createCLIInterface(iCloud: iCloud, syncEngine: SyncEngine) {
        if (!this.instance) {
            this.instance = new CLIInterface(iCloud, syncEngine);
        }
    }

    /**
     * Processing CLI arguments
     * @returns The parsed values from the commandline/environment variables
     */
    static getCLIOptions(): OptionValues {
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
            .addOption(new Option(`-d, --data_dir <string>`, `Directory to store local copy of library`)
                .env(`DATA_DIR`)
                .default(`/opt/icloud-photos-library`))
            .addOption(new Option(`-p, --port <number>`, `port number for MFA server (Awaiting MFA code when necessary)`)
                .env(`PORT`)
                .default(80))
            .addOption(new Option(`-l, --log_level <level>`, `Set the log level`)
                .env(`LOG_LEVEL`)
                .choices([`trace`, `debug`, `info`, `warn`, `error`])
                .default(`info`))
            .addOption(new Option(`--log_to_cli`, `Disables logging to file and logs to the console`)
                .env(`LOG_TO_CLI`)
                .default(false))
            .addOption(new Option(`-t, --download_threads <number>`, `Sets the number of download threads`)
                .env(`DOWNLOAD_THREADS`)
                .default(5))
            .addOption(new Option(`-r, --max_retries <number>`, `Sets the number of maximum retries upon an error (-1 means that it will always retry)`)
                .env(`MAX_RETRIES`)
                .default(-1));
        program.parse();
        return program.opts();
    }

    /**
     * Logs a fatal error and exits the application
     * @param err - The error message to display
     */
    static fatalError(err: string) {
        console.log();
        console.log(chalk.red(CLIInterface.getHorizontalLine()));
        console.log(chalk.red(`Experienced fatal error at ${CLIInterface.getDateTime()}: ${err}`));
        console.log(chalk.red(CLIInterface.getHorizontalLine()));
        exit(1);
    }

    /**
     *
     * @returns A horizontal line
     */
    static getHorizontalLine(): string {
        return `-`.repeat(process.stdout.columns);
    }

    /**
     *
     * @returns A local date time string
     */
    static getDateTime(): string {
        return new Date().toLocaleString();
    }

    /**
     * Listens to iCloud events and provides CLI output
     */
    setupCLIiCloudInterface(iCloud: iCloud) {
        iCloud.on(ICLOUD.EVENTS.AUTHENTICATION_STARTED, () => {
            console.log(chalk.white(CLIInterface.getHorizontalLine()));
            console.log(chalk.white(`Authenticating user...`));
        });

        iCloud.on(ICLOUD.EVENTS.AUTHENTICATED, () => {
            console.log(chalk.white(`User authenticated`));
        });

        iCloud.on(ICLOUD.EVENTS.MFA_REQUIRED, port => {
            console.log(chalk.yellowBright(`MFA code required, listening for input on port ${port}...`));
        });

        iCloud.on(ICLOUD.EVENTS.MFA_RECEIVED, () => {
            console.log(chalk.white(`MFA code received`));
        });

        iCloud.on(ICLOUD.EVENTS.TRUSTED, () => {
            console.log(chalk.white(`Device trusted`));
        });

        iCloud.on(ICLOUD.EVENTS.ACCOUNT_READY, () => {
            console.log(chalk.white(`Sign in successful!`));
        });

        iCloud.on(ICLOUD.EVENTS.READY, () => {
            console.log(chalk.white(CLIInterface.getHorizontalLine()));
            console.log(chalk.greenBright(`iCloud connection established!`));
        });

        iCloud.on(ICLOUD.EVENTS.ERROR, (msg: string) => {
            console.log(chalk.white(CLIInterface.getHorizontalLine()));
            console.log(chalk.red(`Unexpected error: ${msg}`));
        });
    }

    /**
     * Listens to Sync Engine events and provides CLI output
     */
    setupCLISyncEngineInterface(syncEngine: SyncEngine) {
        syncEngine.on(SYNC_ENGINE.EVENTS.START, () => {
            console.log(chalk.white(CLIInterface.getHorizontalLine()));
            console.log(chalk.white.bold(`Starting sync at ${CLIInterface.getDateTime()}`));
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.FETCH_N_LOAD, () => {
            console.log(chalk.white(`Loading local state & fetching remote iCloud Library state...`));
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.FETCH_N_LOAD_COMPLETED, (remoteAssetCount, remoteAlbumCount, localAssetCount, localAlbumCount) => {
            console.log(chalk.green(`Loaded Local state: ${localAssetCount} assets & ${localAlbumCount} albums`));
            console.log(chalk.green(`Fetched Remote state: ${remoteAssetCount} assets & ${remoteAlbumCount} albums`));
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.DIFF, () => {
            console.log(chalk.white(`Diffing remote with local state...`));
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.DIFF_COMPLETED, () => {
            console.log(chalk.green(`Diffing completed!`));
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.WRITE, () => {
            console.log(chalk.white(`Writing diff to disk...`));
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.WRITE_ASSETS, (toBeDeletedCount, toBeAddedCount) => {
            console.log(chalk.cyan(`Syncing assets, by removing ${toBeDeletedCount} local assets & downloading ${toBeAddedCount} remote assets...`));
            this.progressBar.start(toBeAddedCount, 0);
        });

        // RecordName would be available
        syncEngine.on(SYNC_ENGINE.EVENTS.WRITE_ASSET_COMPLETED, () => {
            this.progressBar.increment();
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.WRITE_ASSETS_COMPLETED, () => {
            this.progressBar.stop();
            console.log(chalk.greenBright(`Succesfully synced assets!`));
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.WRITE_ALBUMS, (toBeDeletedCount, toBeAddedCount) => {
            console.log(chalk.cyan(`Linking albums, by removing ${toBeDeletedCount} local albums & adding ${toBeAddedCount} remote albums...`));
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.WRITE_ALBUMS_COMPLETED, () => {
            console.log(chalk.greenBright(`Succesfully synced albums!`));
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.WRITE_COMPLETED, () => {
            console.log(chalk.green(`Succesfully wrote diff to disk!`));
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.DONE, () => {
            console.log(chalk.green.bold(`Succesfully completed sync at ${CLIInterface.getDateTime()}`));
            console.log(chalk.white(CLIInterface.getHorizontalLine()));
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.RETRY, retryCount => {
            this.progressBar.stop();
            console.log(chalk.magenta(`Detected recoverable error, refreshing iCloud connection & retrying (#${retryCount})...`));
            console.log(chalk.white(CLIInterface.getHorizontalLine()));
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.ERROR, msg => {
            this.progressBar.stop();
            console.log(chalk.red(`Sync engine: Unexpected error: ${msg}`));
            console.log(chalk.white(CLIInterface.getHorizontalLine()));
        });
    }
}