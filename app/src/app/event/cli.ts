import chalk from 'chalk';
import * as PACKAGE_INFO from '../../lib/package.js';
import {SingleBar} from 'cli-progress';
import {ResourceManager} from '../../lib/resource-manager/resource-manager.js';
import {iCPSEventApp, iCPSEventArchiveEngine, iCPSEventCloud, iCPSEventError, iCPSEventLog, iCPSEventMFA, iCPSEventPhotos, iCPSEventSyncEngine} from '../../lib/resource-manager/events.js';
import {MFAMethod} from '../../lib/icloud/mfa/mfa-method.js';

/**
 * This class handles the input/output to the command line
 */
export class CLIInterface {
    /**
     * The progress bar, shown while fetching remote assets
     */
    progressBar: SingleBar;

    /**
     * Creates a new CLI interface based on the provided components
     * @param options - Parsed CLI Options
     */
    constructor() {
        this.progressBar = new SingleBar({
            etaAsynchronousUpdate: true,
            format: ` {bar} {percentage}% | Elapsed: {duration_formatted} | {value}/{total} assets downloaded`,
            barCompleteChar: `\u25A0`,
            barIncompleteChar: ` `,
        });

        if (ResourceManager.silent) {
            return;
        }

        console.clear();

        // An error handler is only supplied on the initial run, this is not needed on scheduled runs
        this.print(chalk.white(this.getHorizontalLine()));
        this.print(chalk.white.bold(`Welcome to ${PACKAGE_INFO.NAME}, v.${PACKAGE_INFO.VERSION}!`));
        this.print(chalk.green(`Made with <3 by steilerDev`));

        if (ResourceManager.logToCli) {
            ResourceManager.events(this)
                .on(iCPSEventLog.DEBUG, (instance: any, msg: string) => this.printLog(`debug`, instance, msg))
                .on(iCPSEventLog.INFO, (instance: any, msg: string) => this.printLog(`info`, instance, msg))
                .on(iCPSEventLog.WARN, (instance: any, msg: string) => this.printLog(`warn`, instance, msg))
                .on(iCPSEventLog.ERROR, (instance: any, msg: string) => this.printLog(`error`, instance, msg));
        }

        if (!ResourceManager.suppressWarnings) {
            ResourceManager.events(this)
                .on(iCPSEventError.HANDLER_WARN, (msg: string) => this.printWarning(msg));
        }

        ResourceManager.events(this)
            .on(iCPSEventError.HANDLER_ERROR, (msg: string) => this.printFatalError(msg));

        ResourceManager.events(this)
            .on(iCPSEventCloud.AUTHENTICATION_STARTED, () => {
                this.print(chalk.white(this.getHorizontalLine()));
                this.print(chalk.white(`Authenticating user...`));
            })
            .on(iCPSEventCloud.AUTHENTICATED, () => {
                this.print(chalk.white(`User authenticated`));
            })
            .on(iCPSEventCloud.MFA_REQUIRED, () => {
                this.print(chalk.yellowBright(`MFA code required`));
            })
            .on(iCPSEventCloud.TRUSTED, () => {
                this.print(chalk.white(`Device trusted`));
            })
            .on(iCPSEventCloud.ACCOUNT_READY, () => {
                this.print(chalk.white(`Sign in successful!`));
            });

        ResourceManager.events(this)
            .on(iCPSEventMFA.STARTED, port => {
                this.print(chalk.white(`Listening for input on port ${port}`));
            })
            .on(iCPSEventMFA.MFA_RESEND, (method: MFAMethod) => {
                this.print(chalk.white(`Resending MFA code via ${method.toString()}...`));
            })
            .on(iCPSEventMFA.MFA_RECEIVED, (method: MFAMethod, code: string) => {
                this.print(chalk.white(`MFA code received via ${method.toString()} (${code})`));
            })
            .on(iCPSEventMFA.MFA_NOT_PROVIDED, () => {
                this.print(chalk.yellowBright(`MFA code not provided in time, aborting...`));
            });

        ResourceManager.events(this)
            .on(iCPSEventPhotos.SETUP_COMPLETED, () => {
                this.print(chalk.white(`iCloud Photos setup completed, checking indexing status...`));
            })
            .on(iCPSEventPhotos.READY, () => {
                this.print(chalk.white(`iCloud Photos ready!`));
            });

        ResourceManager.events(this)
            .on(iCPSEventApp.TOKEN, token => {
                this.print(chalk.green(`Validated token:\n${token}`));
            })
            .on(iCPSEventApp.SCHEDULED, (next: Date) => {
                this.print(chalk.white(this.getHorizontalLine()));
                this.print(chalk.white(`Started in daemon mode!`));
                this.print(chalk.white(`Next execution: ${this.getDateTime(next)}`));
                this.print(chalk.white(this.getHorizontalLine()));
            })
            .on(iCPSEventApp.SCHEDULED_DONE, (next: Date) => {
                this.print(chalk.green(this.getHorizontalLine()));
                this.print(chalk.green(`Completed scheduled sync!`));
                this.print(chalk.white(`Next execution: ${this.getDateTime(next)}`));
                this.print(chalk.green(this.getHorizontalLine()));
            })
            .on(iCPSEventApp.SCHEDULED_RETRY, (next: Date) => {
                this.print(chalk.green(this.getHorizontalLine()));
                this.print(chalk.white(`Sync will retry execution at ${this.getDateTime(next)}`));
                this.print(chalk.green(this.getHorizontalLine()));
            });

        ResourceManager.events(this)
            .on(iCPSEventSyncEngine.START, () => {
                this.print(chalk.white(this.getHorizontalLine()));
                this.print(chalk.white.bold(`Starting sync at ${this.getDateTime()}`));
            })
            .on(iCPSEventSyncEngine.FETCH_N_LOAD, () => {
                this.print(chalk.white(this.getHorizontalLine()));
                this.print(chalk.white(`Loading local & fetching remote iCloud Library state...`));
            })
            .on(iCPSEventSyncEngine.FETCH_N_LOAD_COMPLETED, (remoteAssetCount: number, remoteAlbumCount: number, localAssetCount: number, localAlbumCount: number) => {
                this.print(chalk.green(`Loaded local state: ${localAssetCount} assets & ${localAlbumCount} albums`));
                this.print(chalk.green(`Fetched remote state: ${remoteAssetCount} assets & ${remoteAlbumCount} albums`));
            })
            .on(iCPSEventSyncEngine.DIFF, () => {
                this.print(chalk.white(`Diffing remote with local state...`));
            })
            .on(iCPSEventSyncEngine.DIFF_COMPLETED, () => {
                this.print(chalk.green(`Diffing completed!`));
            })
            .on(iCPSEventSyncEngine.WRITE, () => {
                this.print(chalk.white(`Writing diff to disk...`));
            })
            .on(iCPSEventSyncEngine.WRITE_ASSETS, (toBeDeletedCount: number, toBeAddedCount: number, toBeKept: number) => {
                this.print(chalk.cyan(`Syncing assets, by keeping ${toBeKept} and removing ${toBeDeletedCount} local assets, as well as adding ${toBeAddedCount} remote assets...`));
                this.progressBar.start(toBeAddedCount, 0);
            })
            .on(iCPSEventSyncEngine.WRITE_ASSET_COMPLETED, _recordName => {
                this.progressBar.increment();
            })
            .on(iCPSEventSyncEngine.WRITE_ASSETS_COMPLETED, () => {
                this.progressBar.stop();
                this.print(chalk.greenBright(`Successfully synced assets!`));
            })
            .on(iCPSEventSyncEngine.WRITE_ALBUMS, (toBeDeletedCount: number, toBeAddedCount: number, toBeKept: number) => {
                this.print(chalk.cyan(`Syncing albums, by keeping ${toBeKept} and removing ${toBeDeletedCount} local albums, as well as adding ${toBeAddedCount} remote albums...`));
            })
            .on(iCPSEventSyncEngine.WRITE_ALBUMS_COMPLETED, () => {
                this.print(chalk.greenBright(`Successfully synced albums!`));
            })
            .on(iCPSEventSyncEngine.WRITE_COMPLETED, () => {
                this.print(chalk.green(`Successfully wrote diff to disk!`));
            })
            .on(iCPSEventSyncEngine.DONE, () => {
                this.print(chalk.white(this.getHorizontalLine()));
                this.print(chalk.green.bold(`Successfully completed sync at ${this.getDateTime()}`));
                this.print(chalk.white(this.getHorizontalLine()));
            })
            .on(iCPSEventSyncEngine.RETRY, retryCount => {
                this.progressBar.stop();
                this.print(chalk.magenta(`Detected recoverable error, refreshing iCloud connection & retrying (#${retryCount})...`));
                this.print(chalk.white(this.getHorizontalLine()));
            });

        ResourceManager.events(this)
            .on(iCPSEventArchiveEngine.ARCHIVE_START, (path: string) => {
                this.print(chalk.white.bold(`Archiving local path ${path}`));
            })
            .on(iCPSEventArchiveEngine.PERSISTING_START, (numberOfAssets: number) => {
                this.print(chalk.cyan(`Persisting ${numberOfAssets} assets`));
            })
            .on(iCPSEventArchiveEngine.REMOTE_DELETE, (numberOfAssets: number) => {
                this.print(chalk.yellow(`Deleting ${numberOfAssets} remote assets`));
            })
            .on(iCPSEventArchiveEngine.ARCHIVE_DONE, () => {
                this.print(chalk.white(this.getHorizontalLine()));
                this.print(chalk.green.bold(`Successfully completed archiving`));
                this.print(chalk.white(this.getHorizontalLine()));
            });
    }

    /**
     * Will print the message to the correct target (console or log file)
     * @param msg - The message to be printed, or 'undefined' if message should be ignored
     */
    print(msg: string) {
        if (msg !== `undefined`) {
            console.log(msg);
        }
    }

    printLog(level: string, instance: any, msg: string) {
        console.log(`${chalk.gray(`[${new Date().toLocaleString()}] ${level.toUpperCase()}`)} ${chalk.white(`${String(instance.constructor.name)}: ${msg}`)}`);
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
}