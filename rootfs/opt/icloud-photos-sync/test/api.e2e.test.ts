import {describe, expect, test, jest, beforeAll, afterAll} from '@jest/globals';
import * as fs from 'fs';
import {iCloud} from '../src/lib/icloud/icloud.js';

import expectedAssetsAll from "./data/api.expected.all-cpl-assets.json";
import expectedMastersAll from "./data/api.expected.all-cpl-masters.json";
import expectedMastersAlbum from "./data/api.expected.album-cpl-masters.json"
import expectedAssetsAlbum from "./data/api.expected.album-cpl-assets.json"
import expectedAlbumsAll from "./data/api.expected.all-cpl-albums.json"
import {postProcessAssetData, postProcessMasterData, postProcessAlbumData, sortByRecordName, writeTestData} from './helpers/helpers.js';

// Setting timeout to 20sec, since all of those integration tests might take a while due to hitting multiple remote APIs
jest.setTimeout(20 * 1000);
let tmpDir: string;

beforeAll(() => {
    tmpDir = fs.mkdtempSync(`icloud-photos-sync-test`);
});

afterAll(() => {
    fs.rmdirSync(tmpDir);
});

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

    // Not running API tests on github for now, as the MFA token is not portable
    if (!process.env.CI) {
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
                await expect(_icloud.authenticate()).rejects.toMatch(`MFA code required, failing due to failOnMfa flag`);
            });
        });

        describe(`Fetching records`, () => {
            test(`Fetch all records`, async () => {
                await icloud.ready;
                const [assets, masters] = await icloud.photos.fetchAllPictureRecords();
                //writeTestData(assets.map(postProcessAssetData), "all-assets-data")
                //writeTestData(masters.map(postProcessMasterData), "all-master-data")

                // Expecting assets, with ressource to have a download url (as this is variable)
                assets.forEach(asset => {
                    if (asset?.resource) {
                        expect(asset.resource.downloadURL).toBeDefined();
                    }
                });
                // This matches the non-variable part of the data
                expect(assets.map(postProcessAssetData).sort(sortByRecordName)).toEqual(expectedAssetsAll.sort(sortByRecordName));

                // Expecting all masters to have a ressource with download url
                masters.forEach(master => {
                    expect(master?.resource.downloadURL).toBeDefined();
                });
                // This matches the non-variable part of the data
                expect(masters.map(postProcessMasterData).sort(sortByRecordName)).toEqual(expectedMastersAll.sort(sortByRecordName));
            });

            test(`Fetch all records of one album`, async () => {
                await icloud.ready
                const albumRecordName = `311f9778-1f40-4762-9e57-569ebf5fb070`
                const [assets, masters] = await icloud.photos.fetchAllPictureRecords(albumRecordName)

                //writeTestData(assets.map(postProcessAssetData), "album-assets-data")
                //writeTestData(masters.map(postProcessMasterData), "album-master-data")
                expect(assets.map(postProcessAssetData).sort(sortByRecordName)).toEqual(expectedAssetsAlbum.sort(sortByRecordName))
                expect(masters.map(postProcessMasterData).sort(sortByRecordName)).toEqual(expectedMastersAlbum.sort(sortByRecordName))
            });
        });
        describe(`Fetching albums`, () => {
            test(`Fetch all albums`, async () => {
                await icloud.ready;
                const fetchedAlbums = await icloud.photos.fetchAllAlbumRecords();

                // Needing to wait until all promises for the album assets have settled
                const processedAlbums: any[] = []
                for (const fetchedAlbum of fetchedAlbums) {
                    processedAlbums.push(await postProcessAlbumData(fetchedAlbum))
                }

                //writeTestData(processedAlbums, `all-album-data`);
                expect(processedAlbums.sort(sortByRecordName)).toEqual(expectedAlbumsAll.sort(sortByRecordName))
            });
            test.todo(`Fetch one album`);
        });
        describe(`Deleting records`, () => {
            test.todo(`Delete a record - How to restore state afterwards??`);
        });
    }
});