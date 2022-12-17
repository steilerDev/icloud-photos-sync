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
import {iCloudApp, SyncApp, ArchiveApp} from '../app/icloud-app.js';

/**
 * This class handles the input/output to the command line
 */
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
     * @param app - The application object, holding all necessary information
     */
    constructor(app: iCloudApp) {
        this.progressBar = new SingleBar({
            "etaAsynchronousUpdate": true,
            "format": ` {bar} {percentage}% | Elapsed: {duration_formatted} | {value}/{total} assets downloaded`,
            "barCompleteChar": `\u25A0`,
            "barIncompleteChar": ` `,
        });

        // If both are false it display will happen, otherwise output will go to log (and log might print it to the console, depending on logToCli)
        this.enableCLIOutput = !app.options.logToCli && !app.options.silent;

        this.setupCLIiCloudInterface(app.icloud);

        if (app instanceof SyncApp) {
            this.setupCLISyncEngineInterface(app.syncEngine);
        }

        if (app instanceof ArchiveApp) {
            this.setupCLIArchiveEngineInterface(app.archiveEngine);
        }

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
    }

    setupCLIArchiveEngineInterface(_archiveEngine: ArchiveEngine) {

    }
}