import log from 'loglevel';
import chalk from 'chalk';
import {OptionValues} from 'commander';
import * as fs from 'fs';
import * as path from 'path';

/*
 * Logger color definitions
 *
const colors = {
    TRACE: chalk.magenta,
    DEBUG: chalk.cyan,
    INFO: chalk.blue,
    WARN: chalk.yellow,
    ERROR: chalk.red,
}; **/

const LOG_FILE_NAME = `icloud-photos-sync.log`;

/**
 * Logger setup including the configuration of logger prefix
 * @param logLevel - The log level for this application
 */
export function setupLogger(cliOpts: OptionValues): void {
    const logFile = path.format({
        dir: cliOpts.app_data_dir,
        base: LOG_FILE_NAME,
    });

    if (!cliOpts.log_to_cli && fs.existsSync(logFile)) {
        fs.rmSync(logFile);
    }

    const originalFactory = log.methodFactory;
    log.methodFactory = function (methodName, logLevel, loggerName) {
        return function (message) {
            if (cliOpts.log_to_cli) {
                const prefixedMessage = `${chalk.gray(`[${new Date().toLocaleString()}]`)} ${methodName.toUpperCase()} ${chalk.green(`${String(loggerName)}: ${message}`)}`;
                originalFactory(methodName, logLevel, loggerName)(prefixedMessage);
            } else {
                const prefixedMessage = `[${new Date().toISOString()}] ${methodName.toUpperCase()} ${String(loggerName)}: ${message}`;
                fs.appendFileSync(logFile, `${prefixedMessage}\n`);
            }
        };
    };

    log.setLevel(cliOpts.log_level);

    // Set specific loggers to levels to reduce verbosity during development
    log.getLogger(`I-Cloud`).setLevel(log.levels.INFO);
    log.getLogger(`I-Cloud-Photos`).setLevel(log.levels.DEBUG);
    log.getLogger(`I-Cloud-Auth`).setLevel(log.levels.INFO);
    log.getLogger(`MFAServer`).setLevel(log.levels.INFO);
    log.getLogger(`Photos-Library`).setLevel(log.levels.DEBUG);
    log.getLogger(`Sync-Engine`).setLevel(log.levels.DEBUG);
}