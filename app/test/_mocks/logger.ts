import log from 'loglevel';
import {OptionValues} from 'commander';

/**
 * Mocked logger setup
 * @param cliOpts - Ignored
 */
export function setupLogger(_cliOpts: OptionValues): void {
    log.setLevel(`INFO`);
}

/**
 * Returns a mocked logger, only logging relevant information
 * @param _instance - Ignored
 * @returns A logger object
 */
export function getLogger(_instance: any): log.Logger {
    const _logger = log.default;
    _logger.methodFactory = function (methodName, _logLevel, _loggerName) {
        return function (message) {
            if (process.env?.DEBUG === `true`) {
                if (methodName === `warn`) {
                    console.warn(`Warning: ${message}`);
                } else if (methodName === `error`) {
                    console.warn(`Error: ${message}`);
                } else {
                    console.log(message);
                }
            }
        };
    };

    _logger.setLevel(`INFO`);
    return _logger;
}