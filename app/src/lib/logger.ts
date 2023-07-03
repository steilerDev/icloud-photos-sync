import log from 'loglevel';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import {iCPSAppOptions} from '../app/factory.js';

const LOG_FILE_NAME = `.icloud-photos-sync.log`;

/**
 * The list of loggers and their respective names
 */
const LOGGER = {
    "iCloud": `i-Cloud`,
    "iCloudPhotos": `i-Cloud-Photos`,
    "iCloudAuth": `i-Cloud-Auth`,
    "MFAServer": `MFA-Server`,
    "PhotosLibrary": `Photos-Library`,
    "SyncEngine": `Sync-Engine`,
    "CLIInterface": `CLI-Interface`,
    "ArchiveEngine": `Archive-Engine`,
    "ErrorHandler": `Error-Handler`,
    "MetricsExporter": `Metrics-Exporter`,
    "InfluxLineProtocolPoint": `Influx-Line-Protocol`,
};

export let logFilePath: string;

/**
 * Logger setup including the configuration of logger prefix
 * Should only be called once - has guard in place so this does not happen
 * @param app - The App object, holding the CLI options
 */
export function setupLogger(options: iCPSAppOptions): void {
    if (logFilePath) {
        return;
    }

    logFilePath = path.format({
        "dir": options.dataDir,
        "base": LOG_FILE_NAME,
    });

    try {
        if (options.logToCli && !options.silent) {
            throw new Error(`Disabling logging to file, due to logToCli flag`);
        }

        const logPath = path.dirname(logFilePath);
        if (!fs.existsSync(logPath)) {
            fs.mkdirSync(logPath, {"recursive": true});
        }

        // Try opening the file - truncate if exists
        const logFd = fs.openSync(logFilePath, `w`);

        log.methodFactory = function (methodName, _logLevel, loggerName) {
            return function (message) {
                const prefixedMessage = `[${new Date().toISOString()}] ${methodName.toUpperCase()} ${String(loggerName)}: ${message}\n`;
                fs.appendFileSync(logFd, prefixedMessage);
            };
        };
    } catch (err) {
        console.warn(`Unable to write log to file ${logFilePath}: ${err.message} - using console output`);
        const originalFactory = log.methodFactory;
        log.methodFactory = function (methodName, logLevel, loggerName) {
            return function (...message: any[]) {
                const prefixedMessage = `${chalk.gray(`[${new Date().toLocaleString()}]`)} ${methodName.toUpperCase()} ${chalk.green(`${String(loggerName)}: ${message}`)}`;
                originalFactory(methodName, logLevel, loggerName)(prefixedMessage);
            };
        };
    }

    log.setLevel(options.logLevel as log.LogLevelDesc);
    if (options.logLevel === `trace`) {
        log.warn(`Log level set to 'trace', private data might be recorded in logs!`);
    }

    // Set specific loggers to levels to reduce verbosity during development
    /**
    log.getLogger(`I-Cloud`).setLevel(log.levels.INFO);
    log.getLogger(`I-Cloud-Photos`).setLevel(log.levels.DEBUG);
    log.getLogger(`I-Cloud-Auth`).setLevel(log.levels.INFO);
    log.getLogger(`MFAServer`).setLevel(log.levels.INFO);
    log.getLogger(`Photos-Library`).setLevel(log.levels.DEBUG);
    log.getLogger(`Sync-Engine`).setLevel(log.levels.DEBUG);
    */
}

/**
 * Returns the class specific logger
 * @param instance - The instance asking for a logger
 * @returns The class specific logger, unless it cannot be found, then the root logger is returned
 */
export function getLogger(instance: any): log.Logger {
    const className = instance.constructor.name;
    const loggerName = LOGGER[className];
    if (!loggerName) {
        log.warn(`Unable to find logger for class name ${className}, providing default logger`);
        return log;
    }

    return log.getLogger(loggerName);
}