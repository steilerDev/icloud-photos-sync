import * as bt from 'backtrace-node';
import {EventEmitter} from 'events';
import * as PACKAGE_INFO from '../../lib/package.js';
import {getLogger, logFile} from "../../lib/logger.js";
import {iCPSError, InterruptError} from "./types.js";
import {randomUUID} from "crypto";
import {OptionValues} from "commander";

/**
 * The event emitted by classes of this application and picked up by the handler.
 */
export const HANDLER_WARN_EVENT = `handler-event`;
/**
 * Event emitted in case an error was handled. Error string provided as argument.
 */
export const ERROR_EVENT = `error`;
/**
 * Event emitted in case a warning was handled. Error string provided as argument.
 */
export const WARN_EVENT = `warn`;
/**
 * Event emitted in case the app should have exited, but is running in 'scheduled' mode
 */
export const EXIT_EVENT = `exit`;

/**
 * This class handles errors thrown or `HANDLER_EVENT` emitted by classes of this application
 */
export class ErrorHandler extends EventEmitter {
    /**
     * The error reporting client - if activated
     */
    btClient?: bt.BacktraceClient;

    constructor(options: OptionValues) {
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

        // Register handlers for interrupts
        process.on(`SIGTERM`, async () => {
            await this.handle(new InterruptError(`SIGTERM`));
            process.exit(2);
        });

        process.on(`SIGINT`, async () => {
            await this.handle(new InterruptError(`SIGINT`));
            process.exit(2);
        });
    }

    /**
     * Handles a given error. Report fatal errors and provide appropriate output.
     * @param err - The occured error
     */
    async handle(err: unknown) {
        const _err = iCPSError.toiCPSError(err);

        let message = _err.getDescription();
        // Check if the error should be reported
        const shouldReport = _err.sev === `FATAL` && !(_err instanceof InterruptError);

        // Report error and append error code
        if (shouldReport) {
            const errorId = await this.reportError(_err);
            message += ` (Error Code: ${errorId})`;
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
     * Registers an event listener for `HANDLER_WARN_EVENT` on the provided object.
     * @param object - An EventEmitter, which will emit `HANDLER_WARN_EVENT`
     */
    registerWarningHandlerForObject(object: EventEmitter) {
        object.on(HANDLER_WARN_EVENT, async (err: unknown) => {
            await this.handle(err);
        });
    }

    /**
     * Reports the provided error to the error reporting backend
     * @param err - The occured error
     * @returns - An unique error code
     */
    async reportError(err: iCPSError): Promise<string> {
        if (!this.btClient) {
            return `No error code! Pelase enable crash reporting!`;
        }

        const errorUUID = randomUUID();
        const report = this.btClient.createReport(err, {
            'icps.description': err.getDescription(),
            'icps.severity': err.sev,
            'icps.ctx': JSON.stringify(err.getContext()),
            'icps.uuid': errorUUID,
        }, [logFile]);

        if (err.cause) {
            report.addAttribute(`icps.cause`, err.cause);
        }

        await this.btClient.sendAsync(report);
        return errorUUID;
    }

    /**
    * This function removes confidental data from the environment after parsing arguments, to make sure, nothing is collected.
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

            for (const confidentalCliValue of confidentialEntry.cli) {
                const confidentalCliValueIndexArgV = process.argv.findIndex(value => value === confidentalCliValue);
                if (confidentalCliValueIndexArgV !== -1) {
                    process.argv[confidentalCliValueIndexArgV + 1] = confidentialEntry.replacement;
                }

                const confidentalCliValueIndexExecArgV = process.execArgv.findIndex(value => value === confidentalCliValue);
                if (confidentalCliValueIndexExecArgV !== -1) {
                    process.argv[confidentalCliValueIndexExecArgV + 1] = confidentialEntry.replacement;
                }
            }
        }
    }
}