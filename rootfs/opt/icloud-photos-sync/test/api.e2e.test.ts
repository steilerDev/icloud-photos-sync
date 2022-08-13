import {describe, expect, test, jest, beforeAll, afterAll} from '@jest/globals';
import * as fs from 'fs';
import {iCloud} from '../src/lib/icloud/icloud.js';


import expectedAssets from "./data/api.expected.cpl-assets.json"
import expectedMasters from "./data/api.expected.cpl-masters.json"
import { filterVariableData, sortByRecordName } from './helpers/helpers.js';

// Setting timeout to 20sec, since all of those integration tests might take a while due to hitting multiple remote APIs
jest.setTimeout(20 * 1000);
let tmpDir: string

beforeAll(() => {
    tmpDir = fs.mkdtempSync(`icloud-photos-sync-test`);
})

afterAll(() => {
    fs.rmdirSync(tmpDir)
})

describe(`API E2E Tests`, () => {
    const username = process.env.APPLE_ID_USER;
    const password = process.env.APPLE_ID_PWD;
    const token = process.env.TRUST_TOKEN;
    
    let icloud: iCloud;

    test(`API variables present`, () => {
        expect(username).toBeDefined();
        expect(password).toBeDefined();
        expect(token).toBeDefined();
    });

    describe(`Login flow`, () => {
        test(`Login flow`, async () => {
            const cliOpts = {
                username,
                password,
                trustToken: token,
                dataDir: tmpDir,
                failOnMfa: true,
            };
            icloud = new iCloud(cliOpts);
            await expect(icloud.authenticate()).resolves.not.toThrow();
        });

        test(`Login flow without token & failOnMfa`, async () => {
            const cliOpts = {
                username,
                password,
                dataDir: tmpDir,
                failOnMfa: true,
            };
            const _icloud = new iCloud(cliOpts);
            await expect(_icloud.authenticate()).rejects.toMatch("MFA code required, failing due to failOnMfa flag"); 
        })
    });

    describe(`Fetching records`, () => {
        test(`Fetch all records`, async () => {
            await icloud.ready
            const [assets, masters] = await icloud.photos.fetchAllPictureRecords()
            expect(assets.sort(sortByRecordName)).toEqual(expectedAssets.sort(sortByRecordName))
            expect(masters.map(filterVariableData).sort(sortByRecordName)).toEqual(expectedMasters.sort(sortByRecordName))
        });
        test.todo(`Fetch records of one album`);
    });
    describe(`Fetching albums`, () => {
        test.todo(`Fetch one album`);
        test.todo(`Fetch all albums`);
    });
    describe(`Deleting records`, () => {
        test.todo(`Delete a record - How to restore state afterwards??`);
    });
});