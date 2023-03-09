import * as bt from 'backtrace-node';
import {EventEmitter} from 'events';
import * as PACKAGE_INFO from '../../lib/package.js';
import {getLogger, logFile} from "../../lib/logger.js";
import {iCPSError} from "../error/error.js";
import {randomUUID} from "crypto";
import {EventHandler} from './event-handler.js';
import {ERR_SIGINT, ERR_SIGTERM} from '../error/error-codes.js';
import {DaemonAppEvents} from '../icloud-app.js';
import {iCPSAppOptions} from '../factory.js';

/**
 * The event emitted by classes of this application and picked up by the handler.
 */
export const HANDLER_EVENT = `handler-event`;
/**
 * Event emitted in case an error was handled. Error string provided as argument.
 */
export const ERROR_EVENT = `error`;
/**
 * Event emitted in case a warning was handled. Error string provided as argument.
 */
export const WARN_EVENT = `warn`;

/**
 * This class handles errors thrown or `HANDLER_EVENT` emitted by classes of this application
 */
export class ErrorHandler extends EventEmitter implements EventHandler {
    /**
     * The error reporting client - if activated
     */
    btClient?: bt.BacktraceClient;

    /**
     * Flag to indicate verbose error output
     */
    verbose: boolean = false;

    constructor(options: iCPSAppOptions) {
        super();
        if (options.enableCrashReporting) {
            this.btClient = bt.initialize({
                "endpoint": `https://submit.backtrace.io/steilerdev/92b77410edda81e81e4e3b37e24d5a7045e1dae2825149fb022ba46da82b6b49/json`,
                "handlePromises": true,
                "attributes": {
                    "application": PACKAGE_INFO.NAME,
                    'application.version': PACKAGE_INFO.VERSION,
                },
            });
            // This.btClient.setSymbolication();
        }

        if (options.logLevel === `trace` || options.logLevel === `debug`) {
            this.verbose = true;
        }

        // Register handlers for interrupts
        process.on(`SIGTERM`, async () => {
            await this.handle(new iCPSError(ERR_SIGTERM));
            process.exit(2);
        });

        process.on(`SIGINT`, async () => {
            await this.handle(new iCPSError(ERR_SIGINT));
            process.exit(2);
        });
    }

    /**
     * Handles a given error. Report fatal errors and provide appropriate output.
     * @param err - The occurred error
     */
    async handle(err: unknown) {
        const _err = iCPSError.toiCPSError(err);

        let message = _err.getDescription();
        // Check if the error should be reported
        const shouldReport = _err.sev === `FATAL` && !(_err.code === ERR_SIGINT.code || _err.code === ERR_SIGTERM.code);

        // Report error and append error code
        if (shouldReport) {
            const errorId = await this.reportError(_err);
            message += ` (Error Code: ${errorId})`;
        }

        if (this.verbose) {
            message += `\ncontext:${JSON.stringify(_err.context)}`;
        }

        // Performing output based on severity
        switch (_err.sev) {
        case `WARN`:
            this.emit(WARN_EVENT, message);
            getLogger(this).warn(message);
            break;
        default:
        case `FATAL`:
            this.emit(ERROR_EVENT, message);
            getLogger(this).error(message);
            break;
        }
    }

    /**
     * Registers an event listener for `HANDLER_EVENT` on the provided object.
     * @param objects - A list of EventEmitter, which will emit `HANDLER_EVENT`
     */
    registerObjects(...objects: EventEmitter[]) {
        objects.forEach(obj => {
            obj.on(HANDLER_EVENT, async (err: unknown) => {
                await this.handle(err);
            });
            if (this.btClient) {
                obj.on(DaemonAppEvents.EVENTS.START, () => {
                    /* eslint-disable */
                    const metrics = this.btClient['_backtraceMetrics'];
                    /* eslint-enable */
                    if (metrics) {
                        metrics.sendUniqueEvent();
                        metrics.sendSummedEvent(`Application Launches`);
                        metrics.sendSummedEvent(`Scheduled sync starts`);
                    }
                });
            }
        });
    }

    /**
     * Reports the provided error to the error reporting backend
     * @param err - The occurred error
     * @returns - An unique error code
     */
    async reportError(err: iCPSError): Promise<string> {
        if (!this.btClient) {
            return `No error code! Please enable crash reporting!`;
        }

        const errorUUID = randomUUID();
        const report = this.btClient.createReport(err, {
            'icps.description': err.getDescription(),
            'icps.uuid': errorUUID,
        }, [logFile]);

        await this.btClient.sendAsync(report);
        return errorUUID;
    }

    /**
    * This function removes confidential data from the environment after parsing arguments, to make sure, nothing is collected.
    */
    static cleanEnv() {
        const confidentialData = {
            "username": {
                "env": `APPLE_ID_USER`,
                "cli": [
                    `-u`, `--username`,
                ],
                "replacement": `<APPLE ID USERNAME>`,
            },
            "password": {
                "env": `APPLE_ID_PWD`,
                "cli": [
                    `-p`, `--password`,
                ],
                "replacement": `<APPLE ID PASSWORD>`,
            },
            "trust-token": {
                "env": `TRUST_TOKEN`,
                "cli": [
                    `-T`, `--trust-token`,
                ],
                "replacement": `<TRUST TOKEN>`,
            },
        };

        for (const confidentialEntry of Object.values(confidentialData)) {
            if (process.env[confidentialEntry.env]) {
                process.env[confidentialEntry.env] = confidentialEntry.replacement;
            }

            for (const confidentialCliValue of confidentialEntry.cli) {
                const confidentialCliValueIndexArgV = process.argv.findIndex(value => value === confidentialCliValue);
                if (confidentialCliValueIndexArgV !== -1) {
                    process.argv[confidentialCliValueIndexArgV + 1] = confidentialEntry.replacement;
                }

                const confidentialCliValueIndexExecArgV = process.execArgv.findIndex(value => value === confidentialCliValue);
                if (confidentialCliValueIndexExecArgV !== -1) {
                    process.argv[confidentialCliValueIndexExecArgV + 1] = confidentialEntry.replacement;
                }
            }
        }
    }
}