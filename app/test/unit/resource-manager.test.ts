import mockfs from 'mock-fs';
import {describe, test, expect} from '@jest/globals';
import {ResourceManager} from '../../src/lib/resource-manager/resource-manager';
import {nonRejectOptions, rejectOptions, validOptions} from '../_helpers/app-factory.helper';
import {appOptions} from '../_helpers/resource-manager.helper';

describe(`Lifecycle`, () => {
    test(`Should initiate`, () => {
        ResourceManager.setup(appOptions);

        expect(ResourceManager._instance).toBeDefined();
    });
});