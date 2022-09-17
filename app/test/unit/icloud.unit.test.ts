import mockfs from 'mock-fs';
import {describe, test, beforeEach, afterEach, expect} from '@jest/globals';
import path from 'path';
import * as ICLOUD from '../../src/lib/icloud/constants';
import {appDataDir} from '../_helpers/config';
import fs from 'fs';
import {iCloudAuth} from '../../src/lib/icloud/auth';

describe(`Unit Tests - iCloud (not covered by API tests)`, () => {
    const testTrustToken1 = `HSARMTKNSRVWFlaje+uXQGSn7KqxCHcGvTYF5r7F6j8wnFOsemu+g20/1mNJmE+hfNgaB09Bt3RDLzU4kWCsjQUvEsv3C//DrFvldh26AGf9sSv8QyRkUFNJjSHH7fHHiWaZRlWIZk9viZVnxiAh+NE/cA9ZGpbshwkVErwD5/cHN+Ek69ufbIS0O5P0eA==SRVX`;
    const testTrustToken2 = `HSURMTK+uXQGSeYF5r7F6/1mNJmE+09Btj8wnFOn7KqxCHcGvTNSRVWhfNgaBFlajsemu+g203RDLzU4kWCsjQUvEsv3CNE/cA9ZGpbshwkVErwD5/cHsSv8QyRkUFNJjSHH7fHHiWaZRlWIZk9viZVnxiAh+5N+Ek69ufbIS0O//DrFvldh26AGf9P0eA==TRUY`;
    const testSessionToken = `Bnk2bdAKCT@FzjWvCeptvMPtU6DGvqPPyQTx4dmeCKFU@ZyN`;
    beforeEach(() => {
        mockfs({
            [appDataDir]: {
                [ICLOUD.TRUST_TOKEN_FILE_NAME]: testTrustToken1,
            },
        });
    });

    afterEach(() => {
        mockfs.restore();
    });

    test(`Read token from file`, () => {
        const icloudAuth = new iCloudAuth(`testuser@steilerdev.de`, `testpassword`, ``, appDataDir);
        expect(icloudAuth.iCloudAccountTokens.trustToken).toEqual(testTrustToken1);
    });

    test(`Don't read token file, if token is supplied`, () => {
        const icloudAuth = new iCloudAuth(`testuser@steilerdev.de`, `testpassword`, testTrustToken2, appDataDir);
        expect(icloudAuth.iCloudAccountTokens.trustToken).toEqual(testTrustToken2);
    });

    test(`Process valid request & write new token to file`, async () => {
        const response = {
            "data": {},
            "status": 0,
            "statusText": ``,
            "config": {},
            "headers": {
                [ICLOUD.AUTH_RESPONSE_HEADER.SESSION_TOKEN.toLowerCase()]: testSessionToken,
                [ICLOUD.AUTH_RESPONSE_HEADER.TRUST_TOKEN.toLowerCase()]: testTrustToken2,
            },
        };
        const icloudAuth = new iCloudAuth(`testuser@steilerdev.de`, `testpassword`, ``, appDataDir);
        await icloudAuth.processAccountTokens(response);
        const writtenFile = fs.readFileSync(path.join(appDataDir, ICLOUD.TRUST_TOKEN_FILE_NAME)).toString();
        expect(writtenFile).toEqual(testTrustToken2);
    });

    test(`Process invalid request & don't update file`, async () => {
        const response = {
            "data": {},
            "status": 0,
            "statusText": ``,
            "config": {},
            "headers": {},
        };
        const icloudAuth = new iCloudAuth(`testuser@steilerdev.de`, `testpassword`, testTrustToken1, appDataDir);
        expect.assertions(2);
        await icloudAuth.processAccountTokens(response)
            .catch(err => expect(err.message).toMatch(/^Unable to validate account tokens/));
        const writtenFile = fs.readFileSync(path.join(appDataDir, ICLOUD.TRUST_TOKEN_FILE_NAME)).toString();
        expect(writtenFile).toEqual(testTrustToken1);
    });
});