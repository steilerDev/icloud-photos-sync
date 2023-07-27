import mockfs from 'mock-fs';
import {beforeAll, describe, expect, test, jest, beforeEach, afterEach} from '@jest/globals';
import {iCloud} from '../../src/lib/icloud/icloud.js';
import crypto from 'crypto';

import * as Config from '../_helpers/_config';
import expectedAssetsAll from "../_data/api.expected.all-cpl-assets.json";
import expectedMastersAll from "../_data/api.expected.all-cpl-masters.json";
import expectedMastersAlbum from "../_data/api.expected.album-cpl-masters.json";
import expectedAssetsAlbum from "../_data/api.expected.album-cpl-assets.json";
import expectedAlbumsAll from "../_data/api.expected.all-cpl-albums.json";
import {postProcessAssetData, postProcessMasterData, postProcessAlbumData, sortByRecordName, writeTestData as _writeTestData, prepareResourceManagerForApiTests, applyEnvSecrets} from '../_helpers/api.helper';
import {Asset, AssetType} from '../../src/lib/photos-library/model/asset.js';
import {FileType} from '../../src/lib/photos-library/model/file-type.js';
import {Zones} from '../../src/lib/icloud/icloud-photos/query-builder.js';
import {ResourceManager} from '../../src/lib/resource-manager/resource-manager.js';

// Setting timeout to 20sec, since all of those integration tests might take a while due to hitting multiple remote APIs
jest.setTimeout(30 * 1000);

describe(`API E2E Tests`, () => {

    test(`API Prerequisite`, () => {
        const resourceManager = prepareResourceManagerForApiTests();
        expect(resourceManager._resources.username).toBeDefined();
        expect(resourceManager._resources.username.length).toBeGreaterThan(0);
        expect(resourceManager._resources.password).toBeDefined();
        expect(resourceManager._resources.password.length).toBeGreaterThan(0);
        expect(resourceManager._resources.trustToken).toBeDefined();
        expect(resourceManager._resources.trustToken?.length).toBeGreaterThan(0);
    });

    describe(`Login flow`, () => {
        let resourceManager: ResourceManager;

        beforeEach(() => {
            resourceManager = prepareResourceManagerForApiTests();
            mockfs({
                [Config.defaultConfig.dataDir]: {},
            });
        });
    
        afterEach(() => {
            mockfs.restore();
        });

        test(`Invalid username/password`, async () => {
            resourceManager._resources.username = `test@apple.com`;
            resourceManager._resources.password = `somePassword`;

            const icloud = new iCloud();

            await expect(icloud.authenticate()).rejects.toThrow(/^Username does not seem to exist$/);
        });

        test(`Invalid password`, async () => {
            resourceManager._resources.password = `somePassword`;
            const icloud = new iCloud();
            await expect(icloud.authenticate()).rejects.toThrow(/^Username\/Password does not seem to match$/);
        });

        test(`Without token & failOnMfa`, async () => {
            resourceManager._resources.trustToken = undefined;
            resourceManager._resources.failOnMfa = true;
            const icloud = new iCloud();
            await expect(icloud.authenticate()).rejects.toThrow(/^MFA code required, failing due to failOnMfa flag$/);
        });

        test(`Success`, async () => {
            const icloud = new iCloud();
            await expect(icloud.authenticate()).resolves.not.toThrow();
        });
    });

    describe(`Logged in test cases`, () => {
        let icloud: iCloud;
        let resourceManager: ResourceManager;

        beforeAll(async () => {
            resourceManager = prepareResourceManagerForApiTests();
            icloud = new iCloud();
            await icloud.authenticate();
        });

        beforeEach(() => {
            mockfs({
                [Config.defaultConfig.dataDir]: {},
            });
        });
    
        afterEach(() => {
            mockfs.restore();
        });

        describe(`Fetching records`, () => {
            test(`Fetch all records`, async () => {
                await icloud.ready;
                const [assets, masters] = await icloud.photos.fetchAllCPLAssetsMasters();
                // _writeTestData(assets.map(postProcessAssetData), "all-assets-data")
                // _writeTestData(masters.map(postProcessMasterData), "all-master-data")

                // Expecting assets, with resource to have a download url (as this is variable)
                assets.forEach(asset => {
                    if (asset?.resource) {
                        expect(asset.resource.downloadURL).toBeDefined();
                    }
                });
                // Expecting a total of 202 assets
                expect(assets.length).toEqual(202);
                // This matches the non-variable part of the data
                expect(assets.map(postProcessAssetData).sort(sortByRecordName)).toEqual(expectedAssetsAll.sort(sortByRecordName));

                // Expecting all masters to have a resource with download url
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
                const [assets, masters] = await icloud.photos.fetchAllCPLAssetsMasters(albumRecordName);

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
                const [assets, masters] = await icloud.photos.fetchAllCPLAssetsMasters(albumRecordName);
                expect(assets.length).toEqual(0);
                expect(masters.length).toEqual(0);
            });
        });
        describe(`Fetching albums`, () => {
            test(`Fetch all albums`, async () => {
                await icloud.ready;
                const fetchedAlbums = await icloud.photos.fetchAllCPLAlbums();
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
                const fetchedAlbum = await icloud.photos.fetchCPLAlbums(recordName);
                // Verifying only structure, not content, as content was validated in the all case
                expect(fetchedAlbum.length).toEqual(0);
            });

            test(`Fetch folder with multiple albums`, async () => {
                await icloud.ready;
                const recordName = `6e7f4f44-445a-41ee-a87e-844a9109069d`; // '2022' folder
                const fetchedAlbums = await icloud.photos.fetchCPLAlbums(recordName);
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
                    FileType.fromAssetType(`public.jpeg`, `jpg`),
                    1660139199098,
                    Zones.Primary,
                    AssetType.ORIG,
                    `test`,
                    `NQtpvztdVKKNfrb8lf482g==`,
                    `AS/OBaLJzK8dRs8QM97ikJQfJEGI`,
                    ``,
                    `ARN5w7b2LvDDhsZ8DnbU3RuZeShX`,
                    false);

                // Need to get current download URL of above defined asset
                const masters = (await icloud.photos.fetchAllCPLAssetsMasters())[1];
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
});