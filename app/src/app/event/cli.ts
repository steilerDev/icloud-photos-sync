import chalk from 'chalk';
import {SingleBar} from 'cli-progress';
import {Resources} from '../../lib/resources/main.js';
import {iCPSEventApp, iCPSEventArchiveEngine, iCPSEventCloud, iCPSEventMFA, iCPSEventPhotos, iCPSEventRuntimeError, iCPSEventRuntimeWarning, iCPSEventSyncEngine} from '../../lib/resources/events-types.js';
import {MFAMethod} from '../../lib/icloud/mfa/mfa-method.js';
import {iCPSError} from '../error/error.js';

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
     */
    constructor() {
        this.progressBar = new SingleBar({
            etaAsynchronousUpdate: true,
            format: ` {bar} {percentage}% | Elapsed: {duration_formatted} | {value}/{total} assets downloaded`,
            barCompleteChar: `\u25A0`,
            barIncompleteChar: ` `,
        });

        if (Resources.manager().silent) {
            return;
        }

        console.clear();

        this.print(chalk.white(this.getHorizontalLine()));
        this.print(chalk.white.bold(`Welcome to ${Resources.PackageInfo.name}, v.${Resources.PackageInfo.version}!`));
        this.print(chalk.green(`Made with <3 by steilerDev`));
        this.print(chalk.white(this.getHorizontalLine()));

        if (!Resources.manager().suppressWarnings) {
            Resources.events(this)
                .on(iCPSEventRuntimeWarning.MFA_ERROR, (err: iCPSError) => {
                    this.printWarning(err.getDescription());
                })
                .on(iCPSEventRuntimeWarning.FILETYPE_ERROR, (ext: string, descriptor: string) => {
                    if (Resources.manager().enableCrashReporting) {
                        this.print(`Detected unknown filetype (${descriptor} with ${ext}): This error will be automatically reported (See GH issue 143 for more information)`);
                    } else {
                        this.printWarning(`Detected unknown filetype (${descriptor} with ${ext}): Please report in GH issue 143`);
                    }
                })
                .on(iCPSEventRuntimeWarning.RESOURCE_FILE_ERROR, (err: iCPSError) => {
                    this.printWarning(err.getDescription());
                });
        }

        Resources.events(this)
            .on(iCPSEventRuntimeError.HANDLED_ERROR, (err: iCPSError) => this.printError(err.getDescription()));

        Resources.events(this)
            .on(iCPSEventCloud.AUTHENTICATION_STARTED, () => {
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
            })
            .on(iCPSEventCloud.SESSION_EXPIRED, () => {
                this.print(chalk.yellowBright(`Session expired, re-authenticating...`));
            })
            .on(iCPSEventCloud.PCS_REQUIRED, () => {
                this.print(chalk.yellowBright(`Advanced Data Protection requires additional cookies, acquiring...`));
            });

        Resources.events(this)
            .on(iCPSEventMFA.STARTED, port => {
                this.print(chalk.white(`Listening for input on port ${port}`));
            })
            .on(iCPSEventMFA.MFA_RESEND, (method: MFAMethod) => {
                this.print(chalk.white(`Resending MFA code via ${method.toString()}...`));
            })
            .on(iCPSEventMFA.MFA_RECEIVED, (method: MFAMethod, code: string) => {
                this.print(chalk.white(`MFA code received from ${method.toString()} (${code})`));
            })
            .on(iCPSEventMFA.MFA_NOT_PROVIDED, () => {
                this.print(chalk.yellowBright(`MFA code not provided in time, aborting...`));
            });

        Resources.events(this)
            .on(iCPSEventPhotos.SETUP_COMPLETED, () => {
                this.print(chalk.white(`iCloud Photos setup completed, checking indexing status...`));
            })
            .on(iCPSEventPhotos.READY, () => {
                this.print(chalk.white(`iCloud Photos ready!`));
            });

        Resources.events(this)
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

        Resources.events(this)
            .on(iCPSEventSyncEngine.START, () => {
                this.print(chalk.white(this.getHorizontalLine()));
                this.print(chalk.white.bold(`Starting sync at ${this.getDateTime()}`));
            })
            .on(iCPSEventSyncEngine.FETCH_N_LOAD, () => {
                this.print(chalk.white(this.getHorizontalLine()));
                this.print(chalk.white(`Loading local & fetching remote iCloud Library state...`));
                Resources.event().resetEventCounter(iCPSEventRuntimeWarning.EXTRANEOUS_FILE);
                Resources.event().resetEventCounter(iCPSEventRuntimeWarning.LIBRARY_LOAD_ERROR);

                Resources.event().resetEventCounter(iCPSEventRuntimeWarning.COUNT_MISMATCH);
                Resources.event().resetEventCounter(iCPSEventRuntimeWarning.ICLOUD_LOAD_ERROR);
            })
            .on(iCPSEventSyncEngine.FETCH_N_LOAD_COMPLETED, (remoteAssetCount: number, remoteAlbumCount: number, localAssetCount: number, localAlbumCount: number) => {
                this.print(chalk.green(`Loaded local state: ${localAssetCount} assets & ${localAlbumCount} albums`));

                const extraneousFiles = Resources.event().getEventCount(iCPSEventRuntimeWarning.EXTRANEOUS_FILE);
                if (extraneousFiles > 0) {
                    this.printWarning(`Detected ${extraneousFiles} extraneous files, please check the logs for more details (and see https://icps.steiler.dev/warnings/ for context)`);
                }

                const libraryLoadErrors = Resources.event().getEventCount(iCPSEventRuntimeWarning.LIBRARY_LOAD_ERROR);
                if (libraryLoadErrors > 0) {
                    this.printWarning(`Unable to load ${libraryLoadErrors} local assets, please check the logs for more details (and see https://icps.steiler.dev/warnings/ for context)`);
                }

                this.print(chalk.green(`Fetched remote state: ${remoteAssetCount} assets & ${remoteAlbumCount} albums`));
                const mismatchErrors = Resources.event().getEventCount(iCPSEventRuntimeWarning.COUNT_MISMATCH);
                if (mismatchErrors > 0) {
                    this.printWarning(`Detected ${mismatchErrors} albums, where asset counts don't match, please check the logs for more details (and see https://icps.steiler.dev/warnings/ for context)`);
                }

                const iCloudLoadErrors = Resources.event().getEventCount(iCPSEventRuntimeWarning.ICLOUD_LOAD_ERROR);
                if (iCloudLoadErrors > 0) {
                    this.printWarning(`Unable to load ${iCloudLoadErrors} remote assets, please check the logs for more details (and see https://icps.steiler.dev/warnings/ for context)`);
                }
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

                Resources.event().resetEventCounter(iCPSEventRuntimeWarning.WRITE_ASSET_ERROR);
            })
            .on(iCPSEventSyncEngine.WRITE_ASSET_COMPLETED, () => {
                this.progressBar.increment();
            })
            .on(iCPSEventRuntimeWarning.WRITE_ASSET_ERROR, () => {
                this.progressBar.increment();
            })
            .on(iCPSEventSyncEngine.WRITE_ASSETS_COMPLETED, () => {
                this.progressBar.stop();

                this.print(chalk.greenBright(`Asset sync completed!`));
                const writeAssetErrors = Resources.event().getEventCount(iCPSEventRuntimeWarning.WRITE_ASSET_ERROR);
                if (writeAssetErrors > 0) {
                    this.printWarning(`Detected ${writeAssetErrors} errors while adding assets, please check the logs for more details (and see https://icps.steiler.dev/warnings/ for context)`);
                }
            })
            .on(iCPSEventSyncEngine.WRITE_ALBUMS, (toBeDeletedCount: number, toBeAddedCount: number, toBeKept: number) => {
                this.print(chalk.cyan(`Syncing albums, by keeping ${toBeKept} and removing ${toBeDeletedCount} local albums, as well as adding ${toBeAddedCount} remote albums...`));
                Resources.event().resetEventCounter(iCPSEventRuntimeWarning.WRITE_ALBUM_ERROR);
                Resources.event().resetEventCounter(iCPSEventRuntimeWarning.LINK_ERROR);
            })
            .on(iCPSEventSyncEngine.WRITE_ALBUMS_COMPLETED, () => {
                this.print(chalk.greenBright(`Album sync completed!`));
                const linkErrors = Resources.event().getEventCount(iCPSEventRuntimeWarning.LINK_ERROR);
                if (linkErrors > 0) {
                    this.printWarning(`Detected ${linkErrors} errors while linking assets to albums, please check the logs for more details (and see https://icps.steiler.dev/warnings/ for context)`);
                }

                const writeAlbumErrors = Resources.event().getEventCount(iCPSEventRuntimeWarning.WRITE_ALBUM_ERROR);
                if (writeAlbumErrors > 0) {
                    this.printWarning(`Detected ${writeAlbumErrors} errors while writing albums, please check the logs for more details (and see https://icps.steiler.dev/warnings/ for context)`);
                }
            })
            .on(iCPSEventSyncEngine.WRITE_COMPLETED, () => {
                this.print(chalk.green(`Successfully wrote diff to disk!`));
            })
            .on(iCPSEventSyncEngine.DONE, () => {
                this.print(chalk.white(this.getHorizontalLine()));
                this.print(chalk.green.bold(`Successfully completed sync at ${this.getDateTime()}`));
                this.print(chalk.white(this.getHorizontalLine()));
            })
            .on(iCPSEventSyncEngine.RETRY, (retryCount: number, err: iCPSError) => {
                this.progressBar.stop();
                this.print(chalk.magenta(`Detected error during sync: ${err.getDescription()}`));
                this.print(chalk.magenta(`Refreshing iCloud connection & retrying (attempt #${retryCount})...`));
                this.print(chalk.white(this.getHorizontalLine()));
            });

        Resources.events(this)
            .on(iCPSEventArchiveEngine.ARCHIVE_START, (path: string) => {
                this.print(chalk.white.bold(`Archiving local path ${path}`));
                Resources.event().resetEventCounter(iCPSEventRuntimeWarning.ARCHIVE_ASSET_ERROR);
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
                const archiveAssetErrors = Resources.event().getEventCount(iCPSEventRuntimeWarning.ARCHIVE_ASSET_ERROR);
                if (archiveAssetErrors > 0) {
                    this.printWarning(`Detected ${archiveAssetErrors} errors while archiving assets, please check the logs for more details (and see https://icps.steiler.dev/warnings/ for context)`);
                }

                this.print(chalk.white(this.getHorizontalLine()));
            });
    }

    /**
     * Will print the message to the console
     * @param msg - The message to be printed
     */
    print(msg: string) {
        console.log(msg);
    }

    /**
     * Prints a warning
     * @param msg - The warning string
     */
    printWarning(msg: string) {
        this.print(chalk.yellow(`Warning: ${msg}`));
    }

    /**
     * Prints an error
     * @param err - The error string
     */
    printError(err: string) {
        this.print(chalk.red(`Error: ${err}`));
    }

    /**
     *
     * @returns A horizontal line of the width of the screen
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