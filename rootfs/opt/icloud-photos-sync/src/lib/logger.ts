import log from 'loglevel';
import prefix from 'loglevel-plugin-prefix';
import chalk from 'chalk';

/**
 * Logger color definitions
 */
export const colors = {
    TRACE: chalk.magenta,
    DEBUG: chalk.cyan,
    INFO: chalk.blue,
    WARN: chalk.yellow,
    ERROR: chalk.red,
};

/**
 * Logger setup including the configuration of logger prefix
 * @param logLevel - The log level for this application
 */
export function setupLogger(logLevel: log.LogLevelDesc): void {
    prefix.reg(log);
    log.setLevel(logLevel, false);

    prefix.apply(log, {
        format(level, name, timestamp) {
            return `${chalk.gray(`[${timestamp}]`)} ${colors[level.toUpperCase()](level)} ${chalk.green(`${name}:`)}`;
        },
    });

    // Set specific loggers to levels to reduce verbosity during development
    log.getLogger(`I-Cloud`).setLevel(log.levels.INFO);
    log.getLogger(`I-Cloud-Photos`).setLevel(log.levels.INFO);
    log.getLogger(`I-Cloud-Auth`).setLevel(log.levels.INFO);
    log.getLogger(`MFAServer`).setLevel(log.levels.INFO);
    log.getLogger(`Photos-Library`).setLevel(log.levels.DEBUG);

    log.getLogger(`Sync-Engine`).setLevel(log.levels.DEBUG);
}