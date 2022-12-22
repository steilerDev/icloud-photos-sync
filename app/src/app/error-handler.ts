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
     * Starts listenening for an error event on the provided object
     * @param object - The object to listen on
     */
    registerErrorEventHandler(object: EventEmitter) {
        object.on(ERROR_EVENT, async err => {
            await this.fatalError(err);
        });
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
}