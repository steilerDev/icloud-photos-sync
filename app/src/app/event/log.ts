import * as fs from 'fs';
import {ResourceManager} from "../../lib/resource-manager/resource-manager.js";
import {iCPSEventError, iCPSEventLog} from "../../lib/resource-manager/events.js";
import {iCPSError} from "../error/error.js";
import {APP_ERR} from "../error/error-codes.js";
import {FILE_ENCODING} from '../../lib/resource-manager/resources.js';
import Ajv from 'ajv';

export enum LogLevel {
    DEBUG = `debug`,
    INFO = `info`,
    WARN = `warn`,
    ERROR = `error`,
}

/**
 * Creates a wrapper around the logger events to be used by the AJV validator
 */
export class AjvLogInterface implements Ajv.Logger {
    /**
     * Formats the provided arguments as a string
     * @param args - The arguments to format
     * @returns The formatted string
     */
    format(...args: unknown[]): string {
        return args.map(arg => String(arg)).join(` `);
    }

    /**
     * Emits a log info event using the provided arguments
     * @param args - The arguments to log
     */
    log(...args: unknown[]): unknown {
        return ResourceManager.emit(iCPSEventLog.INFO, this, this.format(...args));
    }

    /**
     * Emits a log warn event using the provided arguments
     * @param args - The arguments to log
     */
    warn(...args: unknown[]): unknown {
        return ResourceManager.emit(iCPSEventLog.WARN, this, this.format(...args));
    }

    /**
     * Emits a log error event using the provided arguments
     * @param args - The arguments to log
     */
    error(...args: unknown[]): unknown {
        return ResourceManager.emit(iCPSEventLog.ERROR, this, this.format(...args));
    }
}

/**
 * This class handles the input/output to a log file
 */
export class LogInterface {
    /**
     * The opened file descriptor of the log file
     */
    private logFileDescriptor: number;

    constructor() {
        if (ResourceManager.logToCli) {
            return;
        }

        ResourceManager.enableLogging();

        try {
            // Try opening the file - truncate if exists
            this.logFileDescriptor = fs.openSync(ResourceManager.logFilePath, `w`);

            switch (ResourceManager.logLevel) {
            case `debug`:
                ResourceManager.on(iCPSEventLog.DEBUG, (instance: any, msg: string) => this.logMessage(LogLevel.DEBUG, instance, msg));
            default:
            case `info`:
                ResourceManager.on(iCPSEventLog.INFO, (instance: any, msg: string) => this.logMessage(LogLevel.INFO, instance, msg));
            case `warn`:
                ResourceManager.on(iCPSEventLog.WARN, (instance: any, msg: string) => this.logMessage(LogLevel.WARN, instance, msg));
            case `error`:
                ResourceManager.on(iCPSEventLog.ERROR, (instance: any, msg: string) => this.logMessage(LogLevel.ERROR, instance, msg));
            }
        } catch (err) {
            ResourceManager.emit(iCPSEventError.HANDLER_EVENT, new iCPSError(APP_ERR.LOGGER).setWarning().addCause(err));
        }
    }

    private logMessage(level: LogLevel, instance: any, msg: string) {
        if (level === `warn` && msg === undefined) {
            console.log();
        }

        const prefixedMessage = `[${new Date().toISOString()}] ${level.toUpperCase()} ${String(instance.constructor.name)}: ${msg}\n`;
        fs.appendFileSync(this.logFileDescriptor, prefixedMessage, {encoding: FILE_ENCODING});
    }
}