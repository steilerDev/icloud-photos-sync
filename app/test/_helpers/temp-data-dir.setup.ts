import {afterAll} from '@jest/globals';
import * as fs from 'fs';
import * as Config from './_config';

// Each test file uses its own temporary data dir (see _config.ts), which is removed after all tests of the file ran
afterAll(() => {
    fs.rmSync(Config.defaultConfig.dataDir, {recursive: true, force: true});
});
