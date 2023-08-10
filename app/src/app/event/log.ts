import * as fs from 'fs';
import {ResourceManager} from "../../lib/resource-manager/resource-manager.js";
import {iCPSEventError, iCPSEventLog} from "../../lib/resource-manager/events.js";
import {iCPSError} from "../error/error.js";
import {APP_ERR} from "../error/error-codes.js";
import {FILE_ENCODING} from '../../lib/resource-manager/resources.js';

export enum LogLevel {
    DEBUG = `debug`,
    INFO = `info`,
    WARN = `warn`,
    ERROR = `error`,
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

        try {
            // Try opening the file - truncate if exists
            this.logFileDescriptor = fs.openSync(ResourceManager.logFilePath, `w`);

            switch (ResourceManager.logLevel) {
            case `debug`:
                ResourceManager.events(this).on(iCPSEventLog.DEBUG, (source: any, msg: string) => this.logMessage(LogLevel.DEBUG, source, msg));
            default:
            case `info`:
                ResourceManager.events(this).on(iCPSEventLog.INFO, (source: any, msg: string) => this.logMessage(LogLevel.INFO, source, msg));
            case `warn`:
                ResourceManager.events(this).on(iCPSEventLog.WARN, (source: any, msg: string) => this.logMessage(LogLevel.WARN, source, msg));
            case `error`:
                ResourceManager.events(this).on(iCPSEventLog.ERROR, (source: any, msg: string) => this.logMessage(LogLevel.ERROR, source, msg));
            }
        } catch (err) {
            ResourceManager.emit(iCPSEventError.HANDLER_EVENT, new iCPSError(APP_ERR.LOGGER).setWarning().addCause(err));
        }
    }

    /**
     * Logs a message to the log file
     * @param level - The log level
     * @param source - The source of the message, either a string of an object instance
     * @param msg - The message to log
     */
    private logMessage(level: LogLevel, source: any, msg: string) {
        const _source = typeof source === `string` ? source : String(source.constructor.name);

        const prefixedMessage = `[${new Date().toISOString()}] ${level.toUpperCase()} ${_source}: ${msg}\n`;
        fs.appendFileSync(this.logFileDescriptor, prefixedMessage, {encoding: FILE_ENCODING});
    }
}