import mockfs from 'mock-fs';
import {beforeAll, describe, expect, test, jest, beforeEach, afterEach, afterAll} from '@jest/globals';
import {iCloud} from '../../src/lib/icloud/icloud.js';
import crypto from 'crypto';

import * as Config from '../_helpers/_config';
import expectedAssetsAll from "./_data/expected.all-cpl-assets.json";
import expectedMastersAll from "./_data/expected.all-cpl-masters.json";
import expectedMastersAlbum from "./_data/expected.album-cpl-masters.json";
import expectedAssetsAlbum from "./_data/expected.album-cpl-assets.json";
import expectedAlbumsAll from "./_data/expected.all-cpl-albums.json";
import {postProcessAssetData, postProcessMasterData, postProcessAlbumData, sortByRecordName, writeTestData as _writeTestData} from '../_helpers/api.helper';
import {Asset, AssetType} from '../../src/lib/photos-library/model/asset.js';
import {FileType} from '../../src/lib/photos-library/model/file-type.js';
import {Zones} from '../../src/lib/icloud/icloud-photos/query-builder.js';
import {prepareResourceForApiTests} from '../_helpers/_general.js';
import {Resources} from '../../src/lib/resources/main.js';
import fs from 'fs';

// Setting timeout to 20sec, since all of those integration tests might take a while due to hitting multiple remote APIs
jest.setTimeout(30 * 1000);

describe(`API E2E Tests`, () => {
    beforeEach(() => {
        mockfs({
            [Config.defaultConfig.dataDir]: {
                '_All-Photos': {},
            },
        });
    });

    afterEach(() => {
        mockfs.restore();
    });

    test(`API Prerequisite`, () => {
        const resourceManager = prepareResourceForApiTests().manager;
        expect(resourceManager.username).toBeDefined();
        expect(resourceManager.username.length).toBeGreaterThan(0);
        expect(resourceManager.password).toBeDefined();
        expect(resourceManager.password.length).toBeGreaterThan(0);
        expect(resourceManager.trustToken).toBeDefined();
        expect(resourceManager.trustToken!.length).toBeGreaterThan(0);
    });

    describe.skip(`Login flow`, () => {
        let instances: Resources.Types.Instances;

        beforeEach(() => {
            instances = prepareResourceForApiTests();
        });

        test(`Invalid username/password`, async () => {
            instances.manager._resources.username = `test@apple.com`;
            instances.manager._resources.password = `somePassword`;
            const icloud = new iCloud();
            await expect(icloud.authenticate()).rejects.toThrow(/^Username does not seem to exist$/);
            await expect(icloud.logout()).resolves.not.toThrow();
        });

        test(`Invalid password`, async () => {
            instances.manager._resources.password = `somePassword`;
            const icloud = new iCloud();
            await expect(icloud.authenticate()).rejects.toThrow(/^Username\/Password does not seem to match$/);
            await expect(icloud.logout()).resolves.not.toThrow();
        });

        test(`Success - Legacy Login`, async () => {
            instances.manager._resources.legacyLogin = true;
            const icloud = new iCloud();
            await expect(icloud.authenticate()).resolves.not.toThrow();
            await expect(icloud.logout()).resolves.not.toThrow();
        });

        test(`Success - SRP Login`, async () => {
            const icloud = new iCloud();
            await expect(icloud.authenticate()).resolves.not.toThrow();
            await expect(icloud.logout()).resolves.not.toThrow();
        });
    });

    describe(`Logged in test cases`, () => {
        let icloud: iCloud;

        beforeAll(async () => {
            prepareResourceForApiTests();
            icloud = new iCloud();
            await icloud.authenticate();
        });

        afterAll(async () => {
            await icloud.logout();
        });

        describe(`Fetching records`, () => {
            test(`Fetch all records`, async () => {
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
                const albumRecordName = `6dcb67d9-a073-40ba-9441-3a792da34cf5`;
                const [assets, masters] = await icloud.photos.fetchAllCPLAssetsMasters(albumRecordName);
                expect(assets.length).toEqual(0);
                expect(masters.length).toEqual(0);
            });
        });
        describe(`Fetching albums`, () => {
            test(`Fetch all albums`, async () => {
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
                const recordName = `7198a6a0-27fe-4fb6-961b-74231e425858`; // 'Stuff' folder
                const fetchedAlbum = await icloud.photos.fetchCPLAlbums(recordName);
                // Verifying only structure, not content, as content was validated in the all case
                expect(fetchedAlbum.length).toEqual(0);
            });

            test(`Fetch folder with multiple albums`, async () => {
                const recordName = `6e7f4f44-445a-41ee-a87e-844a9109069d`; // '2022' folder
                const fetchedAlbums = await icloud.photos.fetchCPLAlbums(recordName);
                // Verifying only structure, not content, as content was validated in the all case
                expect(fetchedAlbums.length).toEqual(3);
            });
        });

        describe(`Assets & Records`, () => {
            test(`Download an asset`, async () => {
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

                await icloud.photos.downloadAsset(asset);

                const file = await fs.promises.readFile(asset.getAssetFilePath());
                const fileHash = crypto.createHash(`sha1`).update(file).digest(`base64`).toString();

                expect(file.length).toBe(asset.size);
                expect(fileHash).toEqual(assetHash);
            });

            // Cant really do this: test.todo(`Delete a record - How to restore state afterwards??`);
        });
    });
});