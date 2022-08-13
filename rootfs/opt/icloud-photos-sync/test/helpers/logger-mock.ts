import log from 'loglevel';
import {OptionValues} from 'commander';

/**
 * Mocked logger setup
 * @param cliOpts - Ignored
 */
export function setupLogger(cliOpts: OptionValues): void {
    log.setLevel("INFO");
}

/**
 * Returns a mocked logger, only logging relevant information
 * @param instance - Ignored
 * @returns A logger object
 */
export function getLogger(instance: any): log.Logger {
    const _logger = log.default
    _logger.methodFactory = function (methodName, logLevel, loggerName) {
        return function (message) {
            if (methodName === `warn`) {
                console.warn(`Warning: ${message}`);
            } else if (methodName === `error`) {
                console.error(`Error: ${message}`);
            } else {
                console.log(message)
            }
        };
    };
    _logger.setLevel("INFO");
    return _logger
}