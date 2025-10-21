import * as fs from 'fs';
import {iCPSState} from "../../lib/resources/events-types.js";
import {Resources} from "../../lib/resources/main.js";
import {FILE_ENCODING} from '../../lib/resources/resource-types.js';
import {LogLevel, LogMessage} from '../../lib/resources/state-manager.js';

/**
 * This class handles the input/output to a log file
 */
export class LogInterface {
    /**
     * The opened file descriptor of the log file
     */
    private logFileDescriptor: number;

    private logLevels: LogLevel[] = []

    constructor() {
        // Try opening the file - truncate if exists
        this.logFileDescriptor = fs.openSync(Resources.manager().logFilePath, `w`);

        Resources.events(this).on(iCPSState.LOG_ADDED, (logMsg: LogMessage) => {
            if(this.logLevels.includes(logMsg.level)) {
                this.logMessage(logMsg)
            }
        })

        /* eslint-disable no-fallthrough */
        switch (Resources.manager().logLevel) {
        case LogLevel.DEBUG:
            this.logLevels.push(LogLevel.DEBUG)
        default:
        case LogLevel.INFO:
            this.logLevels.push(LogLevel.INFO)
        case LogLevel.WARN:
            this.logLevels.push(LogLevel.WARN)
        case LogLevel.ERROR:
            this.logLevels.push(LogLevel.ERROR)
        }
    }

    /**
     * Logs a message to the log file
     * @param level - The log level
     * @param source - The source of the message, either a string of an object instance
     * @param message - The message to log
     */
    private logMessage(msg: LogMessage) {
        const prefixedMessage = LogInterface.logToString(msg)

        if (Resources.manager().logToCli) {
            console.log(prefixedMessage);
            return;
        }

        fs.appendFileSync(this.logFileDescriptor, prefixedMessage, {encoding: FILE_ENCODING});
    }

    /**
     * @param msg The log message to format
     * @returns A string representation for the log message
     */
    static logToString(msg: LogMessage): string {
        return `[${new Date(msg.time).toISOString()}] ${msg.level.toUpperCase()} ${msg.source}: ${msg.message}\n`;
    }
}