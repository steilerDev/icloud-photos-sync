import log from 'loglevel';
import {jest} from '@jest/globals';

export const setupLogger: () => void = jest.fn();

/**
 * Mocked log file name
 */
export const logFilePath = `test`;

/**
 * @returns The default logger silenced
 */
export const getLogger: (_instance: any) => log.Logger = jest.fn(() => {
    log.default.setLevel(process.env?.DEBUG ? `DEBUG` : `silent`);
    return log.default;
});