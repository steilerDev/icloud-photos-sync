import chalk from 'chalk';
import * as PACKAGE_INFO from '../../lib/package.js';
import {iCloud} from '../../lib/icloud/icloud.js';
import * as ICLOUD from '../../lib/icloud/constants.js';
import * as SYNC_ENGINE from '../../lib/sync-engine/constants.js';
import * as ARCHIVE_ENGINE from '../../lib/archive-engine/constants.js';
import {SyncEngine} from '../../lib/sync-engine/sync-engine.js';
import {SingleBar} from 'cli-progress';
import {getLogger} from '../../lib/logger.js';
import {ArchiveEngine} from '../../lib/archive-engine/archive-engine.js';
import {ErrorHandler, ERROR_EVENT, WARN_EVENT} from './error-handler.js';
import {EventHandler} from './event-handler.js';
import EventEmitter from 'events';
import {DaemonAppEvents} from '../icloud-app.js';
import {iCPSAppOptions} from '../factory.js';

/**
 * This class handles the input/output to the command line
 */
export class CLIInterface implements EventHandler {
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
     * Indicates, if non-critical warnings should be shown in the UI
     */
    suppressWarnings: boolean;

    /**
     * Creates a new CLI interface based on the provided components
     * @param options - Parsed CLI Options
     */
    constructor(options: iCPSAppOptions) {
        this.progressBar = new SingleBar({
            "etaAsynchronousUpdate": true,
            "format": ` {bar} {percentage}% | Elapsed: {duration_formatted} | {value}/{total} assets downloaded`,
            "barCompleteChar": `\u25A0`,
            "barIncompleteChar": ` `,
        });

        // If both are false it display will happen, otherwise output will go to log (and log might print it to the console, depending on logToCli)
        this.enableCLIOutput = !options.logToCli && !options.silent;
        this.suppressWarnings = options.suppressWarnings;

        if (this.enableCLIOutput) {
            console.clear();
        }

        // An error handler is only supplied on the initial run, this is not needed on scheduled runs
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
     * Prints a warning
     * @param msg - The message string
     */
    printWarning(msg: string) {
        this.print(chalk.yellow(msg));
    }

    /**
     * Prints a fatal error
     * @param err - The error string
     */
    printFatalError(err: string) {
        this.print(chalk.red(this.getHorizontalLine()));
        this.print(chalk.red(`Experienced fatal error at ${this.getDateTime()}: ${err}`));
        this.print(chalk.red(this.getHorizontalLine()));
    }

    /**
     *
     * @returns A horizontal line
     */
    getHorizontalLine(): string {
        return `-`.repeat(process.stdout.columns);
    }

    /**
     * @param date - An optional date to convert instead of now()
     * @returns A local date time string
     */
    getDateTime(date: Date = new Date()): string {
        return date.toLocaleString();
    }

    /**
     * Starts listening on class specific events on the provided object for status printing
     * @param objects - The EventEmitter
     */
    registerObjects(...objects: EventEmitter[]) {
        objects.forEach(obj => {
            if (obj instanceof iCloud) {
                this.handleICloud(obj);
                return;
            }

            if (obj instanceof SyncEngine) {
                this.handleSyncEngine(obj);
                return;
            }

            if (obj instanceof ArchiveEngine) {
                this.handleArchiveEngine(obj);
                return;
            }

            if (obj instanceof DaemonAppEvents) {
                this.handleDaemonApp(obj);
            }

            if (obj instanceof ErrorHandler) {
                this.handleErrorHandler(obj);
            }
        });
    }

    /**
     * Listens to iCloud events and provides CLI output
     * @param iCloud - The iCloud object to listen on
     */
    private handleICloud(iCloud: iCloud) {
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

        iCloud.on(ICLOUD.EVENTS.TOKEN, token => {
            this.print(chalk.green(`Validated token:\n${token}`));
        });
    }

    /**
     * Listens to Sync Engine events and provides CLI output
     * @param syncEngine - The Sync Engine object to listen on
     */
    private handleSyncEngine(syncEngine: SyncEngine) {
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
            this.print(chalk.greenBright(`Successfully synced assets!`));
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.WRITE_ALBUMS, (toBeDeletedCount, toBeAddedCount, toBeKept) => {
            this.print(chalk.cyan(`Syncing albums, by keeping ${toBeKept} and removing ${toBeDeletedCount} local albums, as well as adding ${toBeAddedCount} remote albums...`));
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.WRITE_ALBUMS_COMPLETED, () => {
            this.print(chalk.greenBright(`Successfully synced albums!`));
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.WRITE_COMPLETED, () => {
            this.print(chalk.green(`Successfully wrote diff to disk!`));
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.DONE, () => {
            this.print(chalk.white(this.getHorizontalLine()));
            this.print(chalk.green.bold(`Successfully completed sync at ${this.getDateTime()}`));
            this.print(chalk.white(this.getHorizontalLine()));
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.RETRY, retryCount => {
            this.progressBar.stop();
            this.print(chalk.magenta(`Detected recoverable error, refreshing iCloud connection & retrying (#${retryCount})...`));
            this.print(chalk.white(this.getHorizontalLine()));
        });
    }

    /**
     * Listens to Archive Engine events and provides CLI output
     * @param archiveEngine - The Archive Engine object to listen on
     */
    private handleArchiveEngine(archiveEngine: ArchiveEngine) {
        archiveEngine.on(ARCHIVE_ENGINE.EVENTS.ARCHIVE_START, (path: string) => {
            this.print(chalk.white.bold(`Archiving local path ${path}`));
        });

        archiveEngine.on(ARCHIVE_ENGINE.EVENTS.PERSISTING_START, (numberOfAssets: number) => {
            this.print(chalk.cyan(`Persisting ${numberOfAssets} assets`));
        });

        archiveEngine.on(ARCHIVE_ENGINE.EVENTS.REMOTE_DELETE, (numberOfAssets: number) => {
            this.print(chalk.yellow(`Deleting ${numberOfAssets} remote assets`));
        });

        archiveEngine.on(ARCHIVE_ENGINE.EVENTS.ARCHIVE_DONE, () => {
            this.print(chalk.white(this.getHorizontalLine()));
            this.print(chalk.green.bold(`Successfully completed archiving`));
            this.print(chalk.white(this.getHorizontalLine()));
        });
    }

    /**
     * Listens to Error Handler events and provides CLI output
     * @param errorHandler - The Error Handler object to listen on
     */
    private handleErrorHandler(errorHandler: ErrorHandler) {
        errorHandler.on(ERROR_EVENT, (err: string) => {
            this.printFatalError(err);
        });

        if (!this.suppressWarnings) {
            errorHandler.on(WARN_EVENT, (err: string) => {
                this.print(chalk.yellow(err));
            });
        }
    }

    /**
     * Handles events emitted from the daemon app
     * @param daemon - The daemon app event emitter
     */
    private handleDaemonApp(daemon: DaemonAppEvents) {
        daemon.on(DaemonAppEvents.EVENTS.SCHEDULED, (next: Date) => {
            this.print(chalk.white(this.getHorizontalLine()));
            this.print(chalk.white(`Started in daemon mode!`));
            this.print(chalk.white(`Next execution: ${this.getDateTime(next)}`));
            this.print(chalk.white(this.getHorizontalLine()));
        });

        daemon.on(DaemonAppEvents.EVENTS.DONE, (next: Date) => {
            this.print(chalk.green(this.getHorizontalLine()));
            this.print(chalk.green(`Completed scheduled sync!`));
            this.print(chalk.white(`Next execution: ${this.getDateTime(next)}`));
            this.print(chalk.green(this.getHorizontalLine()));
        });

        daemon.on(DaemonAppEvents.EVENTS.RETRY, (next: Date) => {
            this.print(chalk.green(this.getHorizontalLine()));
            this.print(chalk.white(`Sync will retry execution at ${this.getDateTime(next)}`));
            this.print(chalk.green(this.getHorizontalLine()));
        });
    }
}