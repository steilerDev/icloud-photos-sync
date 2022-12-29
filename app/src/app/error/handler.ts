import {iCloudApp} from "./../icloud-app.js";
import * as bt from 'backtrace-node';
import {EventEmitter} from 'events';
import * as PACKAGE_INFO from '../../lib/package.js';
import {getLogger, logFile} from "../../lib/logger.js";
import {iCPSError, InterruptError} from "./types.js";
import {randomUUID} from "crypto";

export const HANDLER_EVENT = `error-handler`;
export const ERROR_EVENT = `error`;
export const WARN_EVENT = `warn`;

export class ErrorHandler extends EventEmitter {
    /**
     * Default logger for the class
     */
    protected logger = getLogger(this);

    /**
     * The error reporting client - if activated
     */
    btClient?: bt.BacktraceClient;

    constructor(app: iCloudApp) {
        super();
        if (app.options.enableCrashReporting) {
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

        // Register handlers
        process.on(`SIGTERM`, async () => {
            await this.handle(new InterruptError(`SIGTERM`));
        });

        process.on(`SIGINT`, async () => {
            await this.handle(new InterruptError(`SIGINT`));
        });
    }

    /**
     * Handles a given error. Fatal errors will exit the application
     * @param err - The occured error
     */
    async handle(err: iCPSError) {
        const errorId = await this.reportError(err);
        const errorReport = `${err.getDescription()} (Error Code: ${errorId})`;
        if (err.sev === `WARN`) {
            this.emit(WARN_EVENT, errorReport);
            this.logger.warn(errorReport);
        }

        if (err.sev === `FATAL`) {
            this.emit(ERROR_EVENT, errorReport);
            this.logger.error(errorReport);
            process.exit(1);
        }
    }

    registerHandlerForObject(object: EventEmitter) {
        object.on(HANDLER_EVENT, async err => {
            await this.handle(err);
        });
    }

    /**
     * Reports the provided error to the error reporting backend
     * @param err - The occured error
     * @returns - An error code
     */
    async reportError(err: iCPSError): Promise<string> {
        if (!this.btClient) {
            return `No error code! Pelase enable crash reporting!`;
        }

        const errorUUID = randomUUID();
        const report = this.btClient.createReport(err, {
            'icps.description': err.getDescription(),
            'icps.severity': err.sev,
            'icps.addtlContext': JSON.stringify(err.getContext()),
            'icps.uuid': errorUUID,
        }, [logFile]);

        if (err.cause) {
            report.addAttribute(`icps.cause`, err.cause);
        }

        // Result = await this.btClient.sendAsync(report);
        // const privateRxIdAttribute = `_rxId`;
        // const errorCode = result[privateRxIdAttribute] as string;
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