import log from 'loglevel';
import prefix from 'loglevel-plugin-prefix';
import chalk from 'chalk';

/**
 * Logger color definitions
 */
export const colors = {
    /**
     * TRace
     */
    TRACE: chalk.magenta,
    /**
     * Debug
     */
    DEBUG: chalk.cyan,
    INFO: chalk.blue,
    WARN: chalk.yellow,
    ERROR: chalk.red,
};

/**
 * Logger setup including the configuration of logger prefix
 * @param logLevel - The log level for this application
 */
export function setupLogger(logLevel: string): void {
    prefix.reg(log);
    log.setLevel(logLevel as any, false);

    prefix.apply(log, {
        format(level, name, timestamp) {
            return `${chalk.gray(`[${timestamp}]`)} ${colors[level.toUpperCase()](level)} ${chalk.green(`${name}:`)}`;
        },
    });
}