import log from 'loglevel';
import {OptionValues} from 'commander';
import {jest} from '@jest/globals';

/**
 * Mocked logger setup
 * @param cliOpts - Ignored
 */
export const setupLogger: (OptionValues) => void = jest.fn()

/**
 * Mocked log file name
 */
export const logFile = `test`;

/**
 * @returns The default logger silenced
 */
export const getLogger: (_instance: any) => log.Logger = jest.fn(() => {
    log.default.setLevel(process.env?.DEBUG ? "DEBUG" : "silent")
    return log.default
})
