import chalk from 'chalk';
import {SingleBar} from 'cli-progress';
import {iCPSEventArchiveEngine, iCPSEventRuntimeError, iCPSEventRuntimeWarning, iCPSState} from '../../lib/resources/events-types.js';
import {Resources} from '../../lib/resources/main.js';
import {iCPSError} from '../error/error.js';
import {SerializedState, StateType} from '../../lib/resources/state-manager.js';

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
            format: ` {bar} {percentage}% | {msg}`,
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
                .on(iCPSState.RUNTIME_WARNING, (msg: string) => {
                    this.printWarning(msg);
                })
        }

        Resources.events(this)
            .on(iCPSEventRuntimeError.HANDLED_ERROR, (err: iCPSError) => this.printError(err.getDescription()));

        Resources.events(this)
            .on(iCPSState.STATE_CHANGED, (state: SerializedState) => {
                if(state.state === StateType.RUNNING || state.state === StateType.BLOCKED) {
                    //this.print(`${state.state.toUpperCase()}: ${state.progressMsg}`)
                    if(Number.isInteger(state.progress)) {
                        if(!this.progressBar.isActive) {
                            this.progressBar.start(100, state.progress, {
                                msg: state.progressMsg
                            })
                        } else {
                            this.progressBar.update(state.progress, {
                                msg: state.progressMsg
                            })
                        }
                    }
                }
                if(state.state === StateType.READY) {
                    if(this.progressBar.isActive) {
                        this.progressBar.stop()
                        console.log()
                    }
                    if(state.prevError) {
                        this.printError(`${state.state.toUpperCase()}: ${state.prevTrigger} was not successful: ${state.prevError.message}`)
                    } else {
                        if(state.prevTrigger) {
                            this.printSuccess(`${state.state.toUpperCase()}: ${state.prevTrigger} was successful`)
                        } else {
                            this.printSuccess(`${state.state.toUpperCase()}: Application ready`)
                        }
                    }

                    if(state.runtimeWarningCount > 0) {
                        this.printWarning(`The operation created ${state.runtimeWarningCount} runtime warnings - please check the logs for details.`)
                    }
                }
            })

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
        console.log();
        this.print(chalk.yellow(msg));
    }

    /**
     * Prints an error
     * @param err - The error string
     */
    printError(err: string) {
        this.print(chalk.red(err));
    }

    /**
     * Prints a success message
     * @param msg - The success string
     */
    printSuccess(msg: string) {
        this.print(chalk.green(msg));
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