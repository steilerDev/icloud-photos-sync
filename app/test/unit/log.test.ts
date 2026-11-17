import {afterEach, beforeEach, describe, expect, test} from '@jest/globals';
import fs from 'fs';
import path from 'path';
import mockfs from '../_helpers/mock-fs.helper';
import {RESOURCES_ERR} from '../../src/app/error/error-codes';
import {iCPSError} from '../../src/app/error/error';
import {LogInterface} from '../../src/app/event/log';
import {Resources} from '../../src/lib/resources/main';
import * as Config from '../_helpers/_config';
import {prepareResources} from '../_helpers/_general';

beforeEach(() => {
    mockfs({
        [Config.defaultConfig.dataDir]: {},
    });
    prepareResources();
});

afterEach(() => {
    mockfs.restore();
});

describe(`Log file`, () => {
    test(`Creates the log file and writes messages of the configured level`, () => {
        const _logInterface = new LogInterface();

        Resources.logger(`Test`).info(`Info message`);
        Resources.logger(`Test`).debug(`Debug message`);

        const content = fs.readFileSync(Resources.manager().logFilePath, {encoding: `utf8`});
        expect(content).toMatch(/INFO Test: Info message\n$/);
        expect(content).not.toContain(`Debug message`);
    });

    test(`Throws an iCPSError, if the log file cannot be opened`, () => {
        // The data directory does not exist
        Resources.manager()._resources.dataDir = path.join(Config.defaultConfig.dataDir, `missing`);

        let thrown: unknown;
        try {
            const _logInterface = new LogInterface();
        } catch (err) {
            thrown = err;
        }

        expect(thrown).toBeInstanceOf(iCPSError);
        expect((thrown as iCPSError).code).toEqual(RESOURCES_ERR.UNABLE_TO_OPEN_LOG_FILE.code);
        expect((thrown as iCPSError).getRootErrorCode(true)).toEqual(RESOURCES_ERR.UNABLE_TO_OPEN_LOG_FILE.code);
        expect((thrown as iCPSError).getDescription()).toContain(`ENOENT`);
    });
});
