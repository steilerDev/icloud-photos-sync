import {describe, expect, test, jest} from '@jest/globals';
import * as fs from 'fs';
import {iCloud} from '../src/lib/icloud/icloud.js';

// Setting timeout to 20sec, since all of those integration tests might take a while due to hitting multiple remote APIs
jest.setTimeout(20 * 1000);
let tmpDir
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
    
    let icloud;

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

        test.todo(`Login flow without token`);
    });
    describe(`Fetching records`, () => {
        test.todo(`Fetch all records`);
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