import mockfs from 'mock-fs';
import {describe, expect, test, jest, beforeEach, afterEach} from '@jest/globals';
import {iCloud} from '../../src/lib/icloud/icloud.js';
import crypto from 'crypto';

import expectedAssetsAll from "../_data/api.expected.all-cpl-assets.json";
import expectedMastersAll from "../_data/api.expected.all-cpl-masters.json";
import expectedMastersAlbum from "../_data/api.expected.album-cpl-masters.json";
import expectedAssetsAlbum from "../_data/api.expected.album-cpl-assets.json";
import expectedAlbumsAll from "../_data/api.expected.all-cpl-albums.json";
import {postProcessAssetData, postProcessMasterData, postProcessAlbumData, sortByRecordName, writeTestData as _writeTestData} from '../_helpers/api.helper';
import {appDataDir} from '../_helpers/_config';
import {Asset, AssetType} from '../../src/lib/photos-library/model/asset.js';
import {FileType} from '../../src/lib/photos-library/model/file-type.js';
import {appWithOptions} from '../_helpers/app-factory.helper';
import {iCloudError} from '../../src/app/error/types.js';

// Setting timeout to 20sec, since all of those integration tests might take a while due to hitting multiple remote APIs
jest.setTimeout(20 * 1000);

const username = process.env.TEST_APPLE_ID_USER;
const password = process.env.TEST_APPLE_ID_PWD;
const token = process.env.TEST_TRUST_TOKEN;

let icloud: iCloud;

describe(`API E2E Tests`, () => {
    beforeEach(() => {
        mockfs({
            [appDataDir]: {},
        });
    });

    afterEach(() => {
        mockfs.restore();
    });

    test(`API Prerequisits`, () => {
        expect(username).toBeDefined();
        expect(username?.length).toBeGreaterThan(0);
        expect(password).toBeDefined();
        expect(password?.length).toBeGreaterThan(0);
        expect(token).toBeDefined();
        expect(token?.length).toBeGreaterThan(0);
    });

    describe(`Login flow`, () => {
        test(`Login flow with invalid username/password`, async () => {
            const cliOpts = {
                "username": `testuser@apple.com`,
                "password": `test123`,
                "dataDir": appDataDir,
                "failOnMfa": true,
            };
            const _icloud = new iCloud(appWithOptions(cliOpts));
            await expect(_icloud.authenticate()).rejects.toEqual(new iCloudError(`Username does not seem to exist`, `FATAL`));
        });

        test(`Login flow with invalid password`, async () => {
            const cliOpts = {
                username,
                "password": `test123`,
                "dataDir": appDataDir,
                "failOnMfa": true,
            };
            const _icloud = new iCloud(appWithOptions(cliOpts));
            await expect(_icloud.authenticate()).rejects.toEqual(new iCloudError(`Username/Password does not seem to match`, `FATAL`));
        });

        test(`Login flow without token & failOnMfa`, async () => {
            const cliOpts = {
                username,
                password,
                "dataDir": appDataDir,
                "failOnMfa": true,
            };
            const _icloud = new iCloud(appWithOptions(cliOpts));
            await expect(_icloud.authenticate()).rejects.toEqual(new iCloudError(`MFA code required, failing due to failOnMfa flag`, `FATAL`));
        });

        test(`Login flow`, async () => {
            const cliOpts = {
                username,
                password,
                "trustToken": token,
                "dataDir": appDataDir,
                "failOnMfa": true,
            };
            icloud = new iCloud(appWithOptions(cliOpts));
            await expect(icloud.authenticate()).resolves.not.toThrow();
        });
    });

    describe(`Fetching records`, () => {
        test(`Fetch all records`, async () => {
            await icloud.ready;
            const [assets, masters] = await icloud.photos.fetchAllPictureRecords();
            // _writeTestData(assets.map(postProcessAssetData), "all-assets-data")
            // _writeTestData(masters.map(postProcessMasterData), "all-master-data")

            // Expecting assets, with ressource to have a download url (as this is variable)
            assets.forEach(asset => {
                if (asset?.resource) {
                    expect(asset.resource.downloadURL).toBeDefined();
                }
            });
            // Expecting a total of 202 assets
            expect(assets.length).toEqual(202);
            // This matches the non-variable part of the data
            expect(assets.map(postProcessAssetData).sort(sortByRecordName)).toEqual(expectedAssetsAll.sort(sortByRecordName));

            // Expecting all masters to have a ressource with download url
            masters.forEach(master => {
                expect(master?.resource.downloadURL).toBeDefined();
            });
            // Expecting a total of 202 masters
            expect(masters.length).toEqual(202);
            // This matches the non-variable part of the data
            expect(masters.map(postProcessMasterData).sort(sortByRecordName)).toEqual(expectedMastersAll.sort(sortByRecordName));
        });

        test(`Fetch all records of one album`, async () => {
            await icloud.ready;
            const albumRecordName = `311f9778-1f40-4762-9e57-569ebf5fb070`;
            const [assets, masters] = await icloud.photos.fetchAllPictureRecords(albumRecordName);

            // _writeTestData(assets.map(postProcessAssetData), "api.expected.album-cpl-assets")
            // _writeTestData(masters.map(postProcessMasterData), "api.expected.album-cpl-masters")
            expect(assets.length).toEqual(202);
            expect(masters.length).toEqual(202);
            expect(assets.map(postProcessAssetData).sort(sortByRecordName)).toEqual(expectedAssetsAlbum.sort(sortByRecordName));
            expect(masters.map(postProcessMasterData).sort(sortByRecordName)).toEqual(expectedMastersAlbum.sort(sortByRecordName));
        });

        test(`Fetch records of empty album`, async () => {
            await icloud.ready;
            const albumRecordName = `6dcb67d9-a073-40ba-9441-3a792da34cf5`;
            const [assets, masters] = await icloud.photos.fetchAllPictureRecords(albumRecordName);
            expect(assets.length).toEqual(0);
            expect(masters.length).toEqual(0);
        });
    });
    describe(`Fetching albums`, () => {
        test(`Fetch all albums`, async () => {
            await icloud.ready;
            const fetchedAlbums = await icloud.photos.fetchAllAlbumRecords();
            expect(fetchedAlbums.length).toEqual(8);

            // Needing to wait until all promises for the album assets have settled
            const processedAlbums: any[] = [];
            for (const fetchedAlbum of fetchedAlbums) {
                processedAlbums.push(await postProcessAlbumData(fetchedAlbum));
            }

            // _writeTestData(processedAlbums, `all-album-data`);
            expect(processedAlbums.sort(sortByRecordName)).toEqual(expectedAlbumsAll.sort(sortByRecordName));
        });

        test(`Fetch empty folder`, async () => {
            await icloud.ready;
            const recordName = `7198a6a0-27fe-4fb6-961b-74231e425858`; // 'Stuff' folder
            const fetchedAlbum = await icloud.photos.fetchAlbumRecords(recordName);
            // Verifying only structure, not content, as content was validated in the all case
            expect(fetchedAlbum.length).toEqual(0);
        });

        test(`Fetch folder with multiple albums`, async () => {
            await icloud.ready;
            const recordName = `6e7f4f44-445a-41ee-a87e-844a9109069d`; // '2022' folder
            const fetchedAlbums = await icloud.photos.fetchAlbumRecords(recordName);
            // Verifying only structure, not content, as content was validated in the all case
            expect(fetchedAlbums.length).toEqual(3);
        });
    });

    describe(`Assets & Records`, () => {
        test(`Download an asset`, async () => {
            await icloud.ready;
            // Defining the asset
            const assetRecordName = `ARN5w7b2LvDDhsZ8DnbU3RuZeShX`;
            const assetHash = `tplrgnWiXEttU0xmKPzRWhUMrtE=`; // Pre-calculated
            const asset = new Asset(assetRecordName,
                170384,
                FileType.fromAssetType(`public.jpeg`),
                1660139199098,
                AssetType.ORIG,
                `test`,
                `NQtpvztdVKKNfrb8lf482g==`,
                `AS/OBaLJzK8dRs8QM97ikJQfJEGI`,
                ``,
                `ARN5w7b2LvDDhsZ8DnbU3RuZeShX`,
                false);

            // Need to get current download URL of above defined asset
            const masters = (await icloud.photos.fetchAllPictureRecords())[1];
            const thisMaster = masters.find(master => master.recordName === assetRecordName);
            asset.downloadURL = thisMaster?.resource?.downloadURL;

            expect(asset.downloadURL).toBeDefined();
            expect(asset.downloadURL?.length).toBeGreaterThan(0);

            // Actually downloading the file
            const stream = (await icloud.photos.downloadAsset(asset)).data;
            const chunks: any[] = [];
            const file: Buffer = await new Promise((resolve, reject) => {
                stream.on(`data`, chunk => chunks.push(Buffer.from(chunk)));
                stream.on(`error`, err => reject(err));
                stream.on(`end`, () => resolve(Buffer.concat(chunks)));
            });
            const fileHash = crypto.createHash(`sha1`).update(file).digest(`base64`).toString();

            expect(file.length).toBe(asset.size);
            expect(fileHash).toEqual(assetHash);
        });

        // Cant really do this: test.todo(`Delete a record - How to restore state afterwards??`);
    });
});