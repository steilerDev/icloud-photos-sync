import {iCloudApp} from "./icloud-app.js";
import * as bt from 'backtrace-node';
import {EventEmitter} from 'events';
import * as PACKAGE_INFO from '../lib/package.js';
import {getLogger} from "../lib/logger.js";

export const ERROR_EVENT = `error`;

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
            //this.btClient.setSymbolication();
        }

        // Register handlers
        process.on(`SIGTERM`, async () => {
            await this.fatalError(new Error(`Interrupted by user: SIGTERM`));
        });

        process.on(`SIGINT`, async () => {
            await this.fatalError(new Error(`Interrupted by user: SIGINT`));
        });
    }

    /**
     * Reports a fatal error and exits the application
     * @param err - The occured error
     */
    async fatalError(err: Error) {
        if (this.btClient) {
            const errorId = await this.reportError(err);
            err = new Error(`Fatal Error: ${err.message} (Error Code: ${errorId})`, {"cause": err});
        } else {
            err = new Error(`Fatal Error: ${err.message} (No Error Code! Please enable crash reporting!)`, {"cause": err});
        }

        this.emit(ERROR_EVENT, err);
        process.exit(1);
    }

    /**
     * Reports the provided error to the error reporting backend
     * @param err - The occured error
     * @returns - An error code
     */
    async reportError(err: Error): Promise<string> {
        const report = this.btClient.createReport(err);
        if (err.cause) {
            report.addAttribute(`cause`, err.cause);
        }

        const privateRxIdAttribute = `_rxId`;
        const result = await this.btClient.sendAsync(report);
        const errorCode = result[privateRxIdAttribute] as string;
        return errorCode;
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