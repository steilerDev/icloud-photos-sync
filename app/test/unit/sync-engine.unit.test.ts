import mockfs from 'mock-fs';
import {describe, test, jest, expect, afterEach, beforeEach} from '@jest/globals';
import {CPLAlbum, CPLAsset, CPLMaster} from '../../src/lib/icloud/icloud-photos/query-parser';
import {SyncEngine} from '../../src/lib/sync-engine/sync-engine';
import expectedAssetsAll from "../_data/api.expected.all-cpl-assets.json";
import expectedMastersAll from "../_data/api.expected.all-cpl-masters.json";
import expectedAlbumsAll from "../_data/api.expected.all-cpl-albums.json";
import {iCloud} from '../../src/lib/icloud/icloud';
import {PhotosLibrary} from '../../src/lib/photos-library/photos-library';
import {Asset, AssetType} from '../../src/lib/photos-library/model/asset';
import {FileType} from '../../src/lib/photos-library/model/file-type';
import {PLibraryEntities} from '../../src/lib/photos-library/model/photos-entity';
import {Album, AlbumType} from '../../src/lib/photos-library/model/album';
import {AxiosResponse} from 'axios';
import {iCloudPhotos} from '../../src/lib/icloud/icloud-photos/icloud-photos';
import * as SYNC_ENGINE from '../../src/lib/sync-engine/constants';

const photosDataDir = `/media/files/photos-library`;

beforeEach(() => {
    mockfs({});
});

afterEach(() => {
    mockfs.restore();
});

function syncEngineFactory(): SyncEngine {
    const syncEngine = new SyncEngine(
        {
            "downloadThreads": 10,
            "maxRetry": -1,
        },
        new iCloud({
            "username": `steilerdev@web.de`,
            "password": `some-pass`,
            "trustToken": `token`,
            "dataDir": photosDataDir,
        }),
        new PhotosLibrary({
            "dataDir": photosDataDir,
        }),
    );
    syncEngine.iCloud.photos = new iCloudPhotos(syncEngine.iCloud.auth);
    return syncEngine;
}

describe(`Unit Tests - Sync Engine`, () => {
    describe(`Processing remote records`, () => {
        test(`Converting Assets - E2E Flow`, () => {
            const cplAssets = expectedAssetsAll.map((pseudoAsset: any) => {
                if (pseudoAsset.resource) {
                    pseudoAsset.resource.downloadURL = `https:/icloud.com`;
                }

                return pseudoAsset;
            }) as CPLAsset[];

            const cplMasters = expectedMastersAll.map((pseudoMaster: any) => {
                pseudoMaster.resource.downloadURL = `https:/icloud.com`;
                return pseudoMaster;
            }) as unknown as CPLMaster[];

            const assets = SyncEngine.convertCPLAssets(cplAssets, cplMasters);
            expect(assets.length).toEqual(206); // 202 + 4 edits
            for (const asset of assets) {
                expect(asset.fileChecksum.length).toBeGreaterThan(0);
                expect(asset.size).toBeGreaterThan(0);
                expect(asset.modified).toBeGreaterThan(0);
                expect(asset.fileType).toBeDefined();
                expect(asset.assetType).toBeDefined();
                expect(asset.origFilename.length).toBeGreaterThan(0);
                expect(asset.wrappingKey).toBeDefined();
                expect(asset.wrappingKey?.length).toBeGreaterThan(0);
                expect(asset.referenceChecksum).toBeDefined();
                expect(asset.referenceChecksum?.length).toBeGreaterThan(0);
                expect(asset.downloadURL).toBeDefined();
                expect(asset.downloadURL?.length).toBeGreaterThan(0);
                expect(asset.recordName).toBeDefined();
                expect(asset.recordName?.length).toBeGreaterThan(0);
                expect(asset.isFavorite).toBeDefined();
            }
        });

        test(`Converting Albums - E2E Flow`, async () => {
            const cplAlbums = expectedAlbumsAll as CPLAlbum[];

            const albums = await SyncEngine.convertCPLAlbums(cplAlbums);
            expect(albums.length).toEqual(8);
            for (const album of albums) {
                expect(album.albumName.length).toBeGreaterThan(0);
                expect(album.uuid.length).toBeGreaterThan(0);
                expect(album.albumType).toBeDefined();
            }
        });
    });

    describe(`Diffing state`, () => {
        test(`Add items to empty state`, () => {
            const remoteAssets = [
                new Asset(`somechecksum`, 42, FileType.fromExtension(`png`), 42, AssetType.ORIG, `test`, `somekey`, `somechecksum`, `https://icloud.com`, `somerecordname`, false),
                new Asset(`somechecksum1`, 42, FileType.fromExtension(`png`), 42, AssetType.EDIT, `test1`, `somekey`, `somechecksum1`, `https://icloud.com`, `somerecordname1`, false),
                new Asset(`somechecksum2`, 42, FileType.fromExtension(`png`), 42, AssetType.EDIT, `test2`, `somekey`, `somechecksum2`, `https://icloud.com`, `somerecordname2`, false),
                new Asset(`somechecksum3`, 42, FileType.fromExtension(`png`), 42, AssetType.ORIG, `test3`, `somekey`, `somechecksum3`, `https://icloud.com`, `somerecordname3`, false),
            ];
            const localAssets: PLibraryEntities<Asset> = {};

            const syncEngine = syncEngineFactory();

            const [toBeDeleted, toBeAdded, toBeKept] = syncEngine.getProcessingQueues(remoteAssets, localAssets);
            expect(toBeDeleted.length).toEqual(0);
            expect(toBeAdded.length).toEqual(4);
            expect(toBeKept.length).toEqual(0);
        });

        test(`Only remove items from existing state`, () => {
            const remoteAssets = [];

            const localAssets = {
                'somechecksum': new Asset(`somechecksum`, 42, FileType.fromExtension(`png`), 42, AssetType.ORIG, `test`, `somekey`, `somechecksum`, `https://icloud.com`, `somerecordname`, false),
                'somechecksum1': new Asset(`somechecksum1`, 42, FileType.fromExtension(`png`), 42, AssetType.EDIT, `test1`, `somekey`, `somechecksum1`, `https://icloud.com`, `somerecordname1`, false),
                'somechecksum2': new Asset(`somechecksum2`, 42, FileType.fromExtension(`png`), 42, AssetType.EDIT, `test2`, `somekey`, `somechecksum2`, `https://icloud.com`, `somerecordname2`, false),
                'somechecksum3': new Asset(`somechecksum3`, 42, FileType.fromExtension(`png`), 42, AssetType.ORIG, `test3`, `somekey`, `somechecksum3`, `https://icloud.com`, `somerecordname3`, false),
            };

            const syncEngine = syncEngineFactory();

            const [toBeDeleted, toBeAdded, toBeKept] = syncEngine.getProcessingQueues(remoteAssets, localAssets);
            expect(toBeDeleted.length).toEqual(4);
            expect(toBeAdded.length).toEqual(0);
            expect(toBeKept.length).toEqual(0);
        });

        test(`Only add items to existing state`, () => {
            const remoteAssets = [
                new Asset(`somechecksum`, 42, FileType.fromExtension(`png`), 42, AssetType.ORIG, `test`, `somekey`, `somechecksum`, `https://icloud.com`, `somerecordname`, false),
                new Asset(`somechecksum1`, 42, FileType.fromExtension(`png`), 42, AssetType.EDIT, `test1`, `somekey`, `somechecksum1`, `https://icloud.com`, `somerecordname1`, false),
                new Asset(`somechecksum2`, 42, FileType.fromExtension(`png`), 42, AssetType.EDIT, `test2`, `somekey`, `somechecksum2`, `https://icloud.com`, `somerecordname2`, false),
                new Asset(`somechecksum3`, 42, FileType.fromExtension(`png`), 42, AssetType.ORIG, `test3`, `somekey`, `somechecksum3`, `https://icloud.com`, `somerecordname3`, false),
            ];

            const localAssets = {
                'somechecksum': new Asset(`somechecksum`, 42, FileType.fromExtension(`png`), 42, AssetType.ORIG, `test`, `somekey`, `somechecksum`, `https://icloud.com`, `somerecordname`, false),
            };

            const syncEngine = syncEngineFactory();

            const [toBeDeleted, toBeAdded, toBeKept] = syncEngine.getProcessingQueues(remoteAssets, localAssets);
            expect(toBeDeleted.length).toEqual(0);
            expect(toBeAdded.length).toEqual(3);
            expect(toBeKept.length).toEqual(1);
        });

        test(`Add & remove items from existing state`, () => {
            const remoteAssets = [
                new Asset(`somechecksum`, 42, FileType.fromExtension(`png`), 42, AssetType.ORIG, `test`, `somekey`, `somechecksum`, `https://icloud.com`, `somerecordname`, false),
                new Asset(`somechecksum1`, 42, FileType.fromExtension(`png`), 42, AssetType.EDIT, `test1`, `somekey`, `somechecksum1`, `https://icloud.com`, `somerecordname1`, false),
                new Asset(`somechecksum4`, 42, FileType.fromExtension(`png`), 42, AssetType.ORIG, `test4`, `somekey`, `somechecksum4`, `https://icloud.com`, `somerecordname4`, false),
            ];

            const localAssets = {
                'somechecksum2': new Asset(`somechecksum2`, 42, FileType.fromExtension(`png`), 42, AssetType.EDIT, `test2`, `somekey`, `somechecksum2`, `https://icloud.com`, `somerecordname2`, false),
                'somechecksum3': new Asset(`somechecksum3`, 42, FileType.fromExtension(`png`), 42, AssetType.ORIG, `test3`, `somekey`, `somechecksum3`, `https://icloud.com`, `somerecordname3`, false),
                'somechecksum4': new Asset(`somechecksum4`, 42, FileType.fromExtension(`png`), 42, AssetType.ORIG, `test4`, `somekey`, `somechecksum4`, `https://icloud.com`, `somerecordname4`, false),
            };

            const syncEngine = syncEngineFactory();

            const [toBeDeleted, toBeAdded, toBeKept] = syncEngine.getProcessingQueues(remoteAssets, localAssets);
            expect(toBeDeleted.length).toEqual(2);
            expect(toBeAdded.length).toEqual(2);
            expect(toBeKept.length).toEqual(1);
        });

        test(`No change in state`, () => {
            const remoteAssets = [
                new Asset(`somechecksum`, 42, FileType.fromExtension(`png`), 42, AssetType.ORIG, `test`, `somekey`, `somechecksum`, `https://icloud.com`, `somerecordname`, false),
                new Asset(`somechecksum1`, 42, FileType.fromExtension(`png`), 42, AssetType.EDIT, `test1`, `somekey`, `somechecksum1`, `https://icloud.com`, `somerecordname1`, false),
                new Asset(`somechecksum2`, 42, FileType.fromExtension(`png`), 42, AssetType.EDIT, `test2`, `somekey`, `somechecksum2`, `https://icloud.com`, `somerecordname2`, false),
                new Asset(`somechecksum3`, 42, FileType.fromExtension(`png`), 42, AssetType.ORIG, `test3`, `somekey`, `somechecksum3`, `https://icloud.com`, `somerecordname3`, false),
            ];

            const localAssets = {
                'somechecksum': new Asset(`somechecksum`, 42, FileType.fromExtension(`png`), 42, AssetType.ORIG, `test`, `somekey`, `somechecksum`, `https://icloud.com`, `somerecordname`, false),
                'somechecksum1': new Asset(`somechecksum1`, 42, FileType.fromExtension(`png`), 42, AssetType.EDIT, `test1`, `somekey`, `somechecksum1`, `https://icloud.com`, `somerecordname1`, false),
                'somechecksum2': new Asset(`somechecksum2`, 42, FileType.fromExtension(`png`), 42, AssetType.EDIT, `test2`, `somekey`, `somechecksum2`, `https://icloud.com`, `somerecordname2`, false),
                'somechecksum3': new Asset(`somechecksum3`, 42, FileType.fromExtension(`png`), 42, AssetType.ORIG, `test3`, `somekey`, `somechecksum3`, `https://icloud.com`, `somerecordname3`, false),
            };

            const syncEngine = syncEngineFactory();

            const [toBeDeleted, toBeAdded, toBeKept] = syncEngine.getProcessingQueues(remoteAssets, localAssets);
            expect(toBeDeleted.length).toEqual(0);
            expect(toBeAdded.length).toEqual(0);
            expect(toBeKept.length).toEqual(4);
        });

        test(`Only modified changed`, () => {
            const remoteAssets = [
                new Asset(`somechecksum`, 42, FileType.fromExtension(`png`), 43, AssetType.ORIG, `test`, `somekey`, `somechecksum`, `https://icloud.com`, `somerecordname`, false),
                new Asset(`somechecksum1`, 42, FileType.fromExtension(`png`), 43, AssetType.EDIT, `test1`, `somekey`, `somechecksum1`, `https://icloud.com`, `somerecordname1`, false),
                new Asset(`somechecksum2`, 42, FileType.fromExtension(`png`), 42, AssetType.EDIT, `test2`, `somekey`, `somechecksum2`, `https://icloud.com`, `somerecordname2`, false),
                new Asset(`somechecksum3`, 42, FileType.fromExtension(`png`), 42, AssetType.ORIG, `test3`, `somekey`, `somechecksum3`, `https://icloud.com`, `somerecordname3`, false),
            ];

            const localAssets = {
                'somechecksum': new Asset(`somechecksum`, 42, FileType.fromExtension(`png`), 42, AssetType.ORIG, `test`, `somekey`, `somechecksum`, `https://icloud.com`, `somerecordname`, false),
                'somechecksum1': new Asset(`somechecksum1`, 42, FileType.fromExtension(`png`), 42, AssetType.EDIT, `test1`, `somekey`, `somechecksum1`, `https://icloud.com`, `somerecordname1`, false),
                'somechecksum2': new Asset(`somechecksum2`, 42, FileType.fromExtension(`png`), 42, AssetType.EDIT, `test2`, `somekey`, `somechecksum2`, `https://icloud.com`, `somerecordname2`, false),
                'somechecksum3': new Asset(`somechecksum3`, 42, FileType.fromExtension(`png`), 42, AssetType.ORIG, `test3`, `somekey`, `somechecksum3`, `https://icloud.com`, `somerecordname3`, false),
            };

            const syncEngine = syncEngineFactory();

            const [toBeDeleted, toBeAdded, toBeKept] = syncEngine.getProcessingQueues(remoteAssets, localAssets);
            expect(toBeDeleted.length).toEqual(2);
            expect(toBeAdded.length).toEqual(2);
            expect(toBeKept.length).toEqual(2);
        });

        describe(`Hierarchical dependencies`, () => {
            test(`Album moved`, () => {
                const localAlbumEntities = {
                    "folderUUID1": new Album(`folderUUID1`, AlbumType.FOLDER, `folderName1`, ``),
                    "albumUUID1": new Album(`albumUUID1`, AlbumType.ALBUM, `albumName1`, ``),
                    "albumUUID2": new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, `folderUUID1`),
                    "albumUUID3": new Album(`albumUUID3`, AlbumType.ALBUM, `albumName3`, `folderUUID1`),
                    "albumUUID4": new Album(`albumUUID4`, AlbumType.ALBUM, `albumName4`, `folderUUID1`),
                };
                // AlbumUUID2 is moved from folderUUID1 to root
                const toBeAdded = [
                    new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, ``),
                ];
                const toBeDeleted = [
                    new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, `folderUUID1`),
                ];
                const toBeKept = [
                    new Album(`folderUUID1`, AlbumType.FOLDER, `folderName1`, ``),
                    new Album(`albumUUID1`, AlbumType.ALBUM, `albumName1`, ``),
                    new Album(`albumUUID3`, AlbumType.ALBUM, `albumName3`, `folderUUID1`),
                    new Album(`albumUUID4`, AlbumType.ALBUM, `albumName4`, `folderUUID1`),
                ];

                const syncEngine = syncEngineFactory();
                const [processedToBeDeleted, processedToBeAdded, processedToKept] = syncEngine.resolveHierarchicalDependencies([toBeDeleted, toBeAdded, toBeKept], localAlbumEntities);

                expect(processedToBeAdded).toEqual(toBeAdded);
                expect(processedToBeDeleted).toEqual(toBeDeleted);
                expect(processedToKept).toEqual(toBeKept);
            });

            test(`Folder with albums moved`, () => {
                const localAlbumEntities = {
                    "folderUUID1": new Album(`folderUUID1`, AlbumType.FOLDER, `folderName1`, ``),
                    "folderUUID2": new Album(`folderUUID2`, AlbumType.FOLDER, `folderName2`, `folderUUID1`),
                    "albumUUID1": new Album(`albumUUID1`, AlbumType.ALBUM, `albumName1`, ``),
                    "albumUUID2": new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, `folderUUID2`),
                    "albumUUID3": new Album(`albumUUID3`, AlbumType.ALBUM, `albumName3`, `folderUUID2`),
                    "albumUUID4": new Album(`albumUUID4`, AlbumType.ALBUM, `albumName4`, `folderUUID2`),
                };
                // FolderUUID2 (with all albums) is moved from folderUUID1 to root
                const toBeAdded = [
                    new Album(`folderUUID2`, AlbumType.FOLDER, `folderName2`, ``),
                ];
                const toBeDeleted = [
                    new Album(`folderUUID2`, AlbumType.FOLDER, `folderName2`, `folderUUID1`),
                ];
                const toBeKept = [
                    new Album(`folderUUID1`, AlbumType.FOLDER, `folderName1`, ``),
                    new Album(`albumUUID1`, AlbumType.ALBUM, `albumName1`, ``),
                    new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, `folderUUID2`),
                    new Album(`albumUUID3`, AlbumType.ALBUM, `albumName3`, `folderUUID2`),
                    new Album(`albumUUID4`, AlbumType.ALBUM, `albumName4`, `folderUUID2`),
                ];

                const syncEngine = syncEngineFactory();
                const [processedToBeDeleted, processedToBeAdded, processedToKept] = syncEngine.resolveHierarchicalDependencies([toBeDeleted, toBeAdded, toBeKept], localAlbumEntities);

                expect(processedToBeAdded.length).toEqual(4);
                expect(processedToBeAdded).toEqual([
                    new Album(`folderUUID2`, AlbumType.FOLDER, `folderName2`, ``),
                    new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, `folderUUID2`),
                    new Album(`albumUUID3`, AlbumType.ALBUM, `albumName3`, `folderUUID2`),
                    new Album(`albumUUID4`, AlbumType.ALBUM, `albumName4`, `folderUUID2`),
                ]);
                expect(processedToBeDeleted.length).toEqual(4);
                expect(processedToBeDeleted).toEqual([
                    new Album(`folderUUID2`, AlbumType.FOLDER, `folderName2`, `folderUUID1`),
                    new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, `folderUUID2`),
                    new Album(`albumUUID3`, AlbumType.ALBUM, `albumName3`, `folderUUID2`),
                    new Album(`albumUUID4`, AlbumType.ALBUM, `albumName4`, `folderUUID2`),
                ]);
                expect(processedToKept.length).toEqual(2);
                expect(processedToKept).toEqual([
                    new Album(`folderUUID1`, AlbumType.FOLDER, `folderName1`, ``),
                    new Album(`albumUUID1`, AlbumType.ALBUM, `albumName1`, ``),
                ]);
            });

            test(`Folder with folders moved`, () => {
                const localAlbumEntities = {
                    "folderUUID1": new Album(`folderUUID1`, AlbumType.FOLDER, `folderName1`, ``),
                    "folderUUID2": new Album(`folderUUID2`, AlbumType.FOLDER, `folderName2`, `folderUUID1`),
                    "folderUUID3": new Album(`folderUUID3`, AlbumType.FOLDER, `folderName3`, `folderUUID2`),
                    "folderUUID4": new Album(`folderUUID4`, AlbumType.FOLDER, `folderName4`, `folderUUID2`),
                    "albumUUID1": new Album(`albumUUID1`, AlbumType.ALBUM, `albumName1`, ``),
                    "albumUUID2": new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, `folderUUID2`),
                    "albumUUID3": new Album(`albumUUID3`, AlbumType.ALBUM, `albumName3`, `folderUUID3`),
                    "albumUUID4": new Album(`albumUUID4`, AlbumType.ALBUM, `albumName4`, `folderUUID4`),
                };
                // FolderUUID2 (with all albums & folders) is moved from folderUUID1 to root
                const toBeAdded = [
                    new Album(`folderUUID2`, AlbumType.FOLDER, `folderName2`, ``),
                ];
                const toBeDeleted = [
                    new Album(`folderUUID2`, AlbumType.FOLDER, `folderName2`, `folderUUID1`),
                ];
                const toBeKept = [
                    new Album(`folderUUID1`, AlbumType.FOLDER, `folderName1`, ``),
                    new Album(`folderUUID3`, AlbumType.FOLDER, `folderName3`, `folderUUID2`),
                    new Album(`folderUUID4`, AlbumType.FOLDER, `folderName4`, `folderUUID2`),
                    new Album(`albumUUID1`, AlbumType.ALBUM, `albumName1`, ``),
                    new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, `folderUUID2`),
                    new Album(`albumUUID3`, AlbumType.ALBUM, `albumName3`, `folderUUID3`),
                    new Album(`albumUUID4`, AlbumType.ALBUM, `albumName4`, `folderUUID4`),
                ];

                const syncEngine = syncEngineFactory();
                const [processedToBeDeleted, processedToBeAdded, processedToKept] = syncEngine.resolveHierarchicalDependencies([toBeDeleted, toBeAdded, toBeKept], localAlbumEntities);

                expect(processedToBeAdded.length).toEqual(6);
                expect(processedToBeAdded).toEqual([
                    new Album(`folderUUID2`, AlbumType.FOLDER, `folderName2`, ``),
                    new Album(`folderUUID3`, AlbumType.FOLDER, `folderName3`, `folderUUID2`),
                    new Album(`folderUUID4`, AlbumType.FOLDER, `folderName4`, `folderUUID2`),
                    new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, `folderUUID2`),
                    new Album(`albumUUID3`, AlbumType.ALBUM, `albumName3`, `folderUUID3`),
                    new Album(`albumUUID4`, AlbumType.ALBUM, `albumName4`, `folderUUID4`),
                ]);
                expect(processedToBeDeleted.length).toEqual(6);
                expect(processedToBeDeleted).toEqual([
                    new Album(`folderUUID2`, AlbumType.FOLDER, `folderName2`, `folderUUID1`),
                    new Album(`folderUUID3`, AlbumType.FOLDER, `folderName3`, `folderUUID2`),
                    new Album(`folderUUID4`, AlbumType.FOLDER, `folderName4`, `folderUUID2`),
                    new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, `folderUUID2`),
                    new Album(`albumUUID3`, AlbumType.ALBUM, `albumName3`, `folderUUID3`),
                    new Album(`albumUUID4`, AlbumType.ALBUM, `albumName4`, `folderUUID4`),
                ]);
                expect(processedToKept.length).toEqual(2);
                expect(processedToKept).toEqual([
                    new Album(`folderUUID1`, AlbumType.FOLDER, `folderName1`, ``),
                    new Album(`albumUUID1`, AlbumType.ALBUM, `albumName1`, ``),
                ]);
            });

            test(`Folder with albums deleted, albums kept`, () => {
                const localAlbumEntities = {
                    "folderUUID1": new Album(`folderUUID1`, AlbumType.FOLDER, `folderName1`, ``),
                    "albumUUID1": new Album(`albumUUID1`, AlbumType.ALBUM, `albumName1`, ``),
                    "albumUUID2": new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, `folderUUID1`),
                    "albumUUID3": new Album(`albumUUID3`, AlbumType.ALBUM, `albumName3`, `folderUUID1`),
                    "albumUUID4": new Album(`albumUUID4`, AlbumType.ALBUM, `albumName4`, `folderUUID1`),
                };
                // FolderUUID1 is deleted and all albums within are moved from folderUUID1 to root
                const toBeAdded = [
                    new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, ``),
                    new Album(`albumUUID3`, AlbumType.ALBUM, `albumName3`, ``),
                    new Album(`albumUUID4`, AlbumType.ALBUM, `albumName4`, ``),
                ];
                const toBeDeleted = [
                    new Album(`folderUUID1`, AlbumType.FOLDER, `folderName1`, ``),
                    new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, `folderUUID1`),
                    new Album(`albumUUID3`, AlbumType.ALBUM, `albumName3`, `folderUUID1`),
                    new Album(`albumUUID4`, AlbumType.ALBUM, `albumName4`, `folderUUID1`),
                ];
                const toBeKept = [
                    new Album(`albumUUID1`, AlbumType.ALBUM, `albumName1`, ``),
                ];

                const syncEngine = syncEngineFactory();
                const [processedToBeDeleted, processedToBeAdded, processedToKept] = syncEngine.resolveHierarchicalDependencies([toBeDeleted, toBeAdded, toBeKept], localAlbumEntities);

                expect(processedToBeAdded).toEqual(toBeAdded);
                expect(processedToBeDeleted).toEqual(toBeDeleted);
                expect(processedToKept).toEqual(toBeKept);
            });

            test(`Folder with albums deleted, albums deleted`, () => {
                const localAlbumEntities = {
                    "folderUUID1": new Album(`folderUUID1`, AlbumType.FOLDER, `folderName1`, ``),
                    "albumUUID1": new Album(`albumUUID1`, AlbumType.ALBUM, `albumName1`, ``),
                    "albumUUID2": new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, `folderUUID1`),
                    "albumUUID3": new Album(`albumUUID3`, AlbumType.ALBUM, `albumName3`, `folderUUID1`),
                    "albumUUID4": new Album(`albumUUID4`, AlbumType.ALBUM, `albumName4`, `folderUUID1`),
                };
                // FolderUUID1 is deleted and all albums within are also deleted
                const toBeAdded = [];
                const toBeDeleted = [
                    new Album(`folderUUID1`, AlbumType.FOLDER, `folderName1`, ``),
                    new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, `folderUUID1`),
                    new Album(`albumUUID3`, AlbumType.ALBUM, `albumName3`, `folderUUID1`),
                    new Album(`albumUUID4`, AlbumType.ALBUM, `albumName4`, `folderUUID1`),
                ];
                const toBeKept = [
                    new Album(`albumUUID1`, AlbumType.ALBUM, `albumName1`, ``),
                ];

                const syncEngine = syncEngineFactory();
                const [processedToBeDeleted, processedToBeAdded, processedToKept] = syncEngine.resolveHierarchicalDependencies([toBeDeleted, toBeAdded, toBeKept], localAlbumEntities);

                expect(processedToBeAdded).toEqual(toBeAdded);
                expect(processedToBeDeleted).toEqual(toBeDeleted);
                expect(processedToKept).toEqual(toBeKept);
            });

            test(`Folder with folders deleted, nested folder kept`, () => {
                const localAlbumEntities = {
                    "folderUUID1": new Album(`folderUUID1`, AlbumType.FOLDER, `folderName1`, ``),
                    "folderUUID2": new Album(`folderUUID2`, AlbumType.FOLDER, `folderName2`, `folderUUID1`),
                    "folderUUID3": new Album(`folderUUID3`, AlbumType.FOLDER, `folderName3`, `folderUUID2`),
                    "folderUUID4": new Album(`folderUUID4`, AlbumType.FOLDER, `folderName4`, `folderUUID2`),
                    "albumUUID1": new Album(`albumUUID1`, AlbumType.ALBUM, `albumName1`, ``),
                    "albumUUID2": new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, `folderUUID2`),
                    "albumUUID3": new Album(`albumUUID3`, AlbumType.ALBUM, `albumName3`, `folderUUID3`),
                    "albumUUID4": new Album(`albumUUID4`, AlbumType.ALBUM, `albumName4`, `folderUUID4`),
                };
                // FolderUUID2 is deleted and its albums & folder are moved to root
                const toBeAdded = [
                    new Album(`folderUUID3`, AlbumType.FOLDER, `folderName3`, ``),
                    new Album(`folderUUID4`, AlbumType.FOLDER, `folderName4`, ``),
                    new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, ``),
                ];
                const toBeDeleted = [
                    new Album(`folderUUID2`, AlbumType.FOLDER, `folderName2`, `folderUUID1`),
                    new Album(`folderUUID3`, AlbumType.FOLDER, `folderName3`, `folderUUID2`),
                    new Album(`folderUUID4`, AlbumType.FOLDER, `folderName4`, `folderUUID2`),
                    new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, `folderUUID2`),
                ];
                const toBeKept = [
                    new Album(`folderUUID1`, AlbumType.FOLDER, `folderName1`, ``),
                    new Album(`albumUUID1`, AlbumType.ALBUM, `albumName1`, ``),
                    new Album(`albumUUID3`, AlbumType.ALBUM, `albumName3`, `folderUUID3`),
                    new Album(`albumUUID4`, AlbumType.ALBUM, `albumName4`, `folderUUID4`),
                ];

                const syncEngine = syncEngineFactory();
                const [processedToBeDeleted, processedToBeAdded, processedToKept] = syncEngine.resolveHierarchicalDependencies([toBeDeleted, toBeAdded, toBeKept], localAlbumEntities);

                expect(processedToBeAdded).toEqual([
                    new Album(`folderUUID3`, AlbumType.FOLDER, `folderName3`, ``),
                    new Album(`folderUUID4`, AlbumType.FOLDER, `folderName4`, ``),
                    new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, ``),
                    new Album(`albumUUID3`, AlbumType.ALBUM, `albumName3`, `folderUUID3`),
                    new Album(`albumUUID4`, AlbumType.ALBUM, `albumName4`, `folderUUID4`),
                ]);

                expect(processedToBeDeleted).toEqual([
                    new Album(`folderUUID2`, AlbumType.FOLDER, `folderName2`, `folderUUID1`),
                    new Album(`folderUUID3`, AlbumType.FOLDER, `folderName3`, `folderUUID2`),
                    new Album(`folderUUID4`, AlbumType.FOLDER, `folderName4`, `folderUUID2`),
                    new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, `folderUUID2`),
                    new Album(`albumUUID3`, AlbumType.ALBUM, `albumName3`, `folderUUID3`),
                    new Album(`albumUUID4`, AlbumType.ALBUM, `albumName4`, `folderUUID4`),
                ]);

                expect(processedToKept).toEqual([
                    new Album(`folderUUID1`, AlbumType.FOLDER, `folderName1`, ``),
                    new Album(`albumUUID1`, AlbumType.ALBUM, `albumName1`, ``),
                ]);
            });

            test(`Folder with folders deleted, nested folder deleted`, () => {
                const localAlbumEntities = {
                    "folderUUID1": new Album(`folderUUID1`, AlbumType.FOLDER, `folderName1`, ``),
                    "folderUUID2": new Album(`folderUUID2`, AlbumType.FOLDER, `folderName2`, `folderUUID1`),
                    "folderUUID3": new Album(`folderUUID3`, AlbumType.FOLDER, `folderName3`, `folderUUID2`),
                    "folderUUID4": new Album(`folderUUID4`, AlbumType.FOLDER, `folderName4`, `folderUUID2`),
                    "albumUUID1": new Album(`albumUUID1`, AlbumType.ALBUM, `albumName1`, ``),
                    "albumUUID2": new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, `folderUUID2`),
                    "albumUUID3": new Album(`albumUUID3`, AlbumType.ALBUM, `albumName3`, `folderUUID3`),
                    "albumUUID4": new Album(`albumUUID4`, AlbumType.ALBUM, `albumName4`, `folderUUID4`),
                };
                // FolderUUID2, folderUUID3 and folderUUID4 are deleted and its albums are moved to root
                const toBeAdded = [
                    new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, ``),
                    new Album(`albumUUID3`, AlbumType.ALBUM, `albumName3`, ``),
                    new Album(`albumUUID4`, AlbumType.ALBUM, `albumName4`, ``),
                ];
                const toBeDeleted = [
                    new Album(`folderUUID2`, AlbumType.FOLDER, `folderName2`, `folderUUID1`),
                    new Album(`folderUUID3`, AlbumType.FOLDER, `folderName3`, `folderUUID2`),
                    new Album(`folderUUID4`, AlbumType.FOLDER, `folderName4`, `folderUUID2`),
                    new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, `folderUUID2`),
                    new Album(`albumUUID3`, AlbumType.ALBUM, `albumName3`, `folderUUID3`),
                    new Album(`albumUUID4`, AlbumType.ALBUM, `albumName4`, `folderUUID4`),
                ];
                const toBeKept = [
                    new Album(`folderUUID1`, AlbumType.FOLDER, `folderName1`, ``),
                    new Album(`albumUUID1`, AlbumType.ALBUM, `albumName1`, ``),
                ];

                const syncEngine = syncEngineFactory();
                const [processedToBeDeleted, processedToBeAdded, processedToKept] = syncEngine.resolveHierarchicalDependencies([toBeDeleted, toBeAdded, toBeKept], localAlbumEntities);

                expect(processedToBeAdded).toEqual(toBeAdded);
                expect(processedToBeDeleted).toEqual(toBeDeleted);
                expect(processedToKept).toEqual(toBeKept);
            });
        });
    });

    describe(`Handle processing queue`, () => {
        describe(`Handle asset queue`, () => {
            function mockSyncEngineForAssetQueue(syncEngine: SyncEngine): SyncEngine {
                syncEngine.photosLibrary.verifyAsset = jest.fn(() => false);
                syncEngine.photosLibrary.writeAsset = jest.fn(async () => {});
                syncEngine.photosLibrary.deleteAsset = jest.fn(async () => {});
                syncEngine.iCloud.photos.downloadAsset = jest.fn(async () => ({} as AxiosResponse<any, any>));
                return syncEngine;
            }

            test(`Empty processing queue`, async () => {
                const syncEngine = mockSyncEngineForAssetQueue(syncEngineFactory());

                const writeAssetCompleteEvent = jest.fn();
                syncEngine.on(SYNC_ENGINE.EVENTS.WRITE_ASSET_COMPLETED, writeAssetCompleteEvent);

                await syncEngine.writeAssets([[], [], []]);

                expect(syncEngine.photosLibrary.verifyAsset).not.toHaveBeenCalled();
                expect(syncEngine.photosLibrary.writeAsset).not.toHaveBeenCalled();
                expect(syncEngine.photosLibrary.deleteAsset).not.toHaveBeenCalled();
                expect(syncEngine.iCloud.photos.downloadAsset).not.toHaveBeenCalled();
                expect(writeAssetCompleteEvent).not.toHaveBeenCalled();
            });

            test(`Only deleting`, async () => {
                const syncEngine = mockSyncEngineForAssetQueue(syncEngineFactory());

                const writeAssetCompleteEvent = jest.fn();
                syncEngine.on(SYNC_ENGINE.EVENTS.WRITE_ASSET_COMPLETED, writeAssetCompleteEvent);

                const asset1 = new Asset(`somechecksum1`, 42, FileType.fromExtension(`png`), 42, AssetType.EDIT, `test1`, `somekey`, `somechecksum1`, `https://icloud.com`, `somerecordname1`, false);
                const asset2 = new Asset(`somechecksum2`, 42, FileType.fromExtension(`png`), 42, AssetType.EDIT, `test2`, `somekey`, `somechecksum2`, `https://icloud.com`, `somerecordname2`, false);
                const asset3 = new Asset(`somechecksum3`, 42, FileType.fromExtension(`png`), 42, AssetType.ORIG, `test3`, `somekey`, `somechecksum3`, `https://icloud.com`, `somerecordname3`, false);
                const toBeDeleted = [asset1, asset2, asset3];

                await syncEngine.writeAssets([toBeDeleted, [], []]);

                expect(syncEngine.photosLibrary.verifyAsset).not.toHaveBeenCalled();
                expect(syncEngine.photosLibrary.writeAsset).not.toHaveBeenCalled();
                expect(syncEngine.photosLibrary.deleteAsset).toHaveBeenCalledTimes(3);
                expect(syncEngine.photosLibrary.deleteAsset).toHaveBeenNthCalledWith(1, asset1);
                expect(syncEngine.photosLibrary.deleteAsset).toHaveBeenNthCalledWith(2, asset2);
                expect(syncEngine.photosLibrary.deleteAsset).toHaveBeenNthCalledWith(3, asset3);
                expect(syncEngine.iCloud.photos.downloadAsset).not.toHaveBeenCalled();
                expect(writeAssetCompleteEvent).not.toHaveBeenCalled();
            });

            test(`Only adding`, async () => {
                const syncEngine = mockSyncEngineForAssetQueue(syncEngineFactory());

                const writeAssetCompleteEvent = jest.fn();
                syncEngine.on(SYNC_ENGINE.EVENTS.WRITE_ASSET_COMPLETED, writeAssetCompleteEvent);

                const asset1 = new Asset(`somechecksum1`, 42, FileType.fromExtension(`png`), 42, AssetType.EDIT, `test1`, `somekey`, `somechecksum1`, `https://icloud.com`, `somerecordname1`, false);
                const asset2 = new Asset(`somechecksum2`, 42, FileType.fromExtension(`png`), 42, AssetType.EDIT, `test2`, `somekey`, `somechecksum2`, `https://icloud.com`, `somerecordname2`, false);
                const asset3 = new Asset(`somechecksum3`, 42, FileType.fromExtension(`png`), 42, AssetType.ORIG, `test3`, `somekey`, `somechecksum3`, `https://icloud.com`, `somerecordname3`, false);
                const toBeAdded = [asset1, asset2, asset3];

                await syncEngine.writeAssets([[], toBeAdded, []]);

                expect(syncEngine.photosLibrary.verifyAsset).toHaveBeenCalledTimes(3);
                expect(syncEngine.iCloud.photos.downloadAsset).toHaveBeenCalledTimes(3);
                expect(syncEngine.iCloud.photos.downloadAsset).toHaveBeenNthCalledWith(1, asset1);
                expect(syncEngine.iCloud.photos.downloadAsset).toHaveBeenNthCalledWith(2, asset2);
                expect(syncEngine.iCloud.photos.downloadAsset).toHaveBeenNthCalledWith(3, asset3);

                expect(syncEngine.photosLibrary.writeAsset).toHaveBeenCalledTimes(3);
                expect(writeAssetCompleteEvent).toHaveBeenCalledTimes(3);
                expect(writeAssetCompleteEvent).toHaveBeenNthCalledWith(1, `somechecksum1`);
                expect(writeAssetCompleteEvent).toHaveBeenNthCalledWith(2, `somechecksum2`);
                expect(writeAssetCompleteEvent).toHaveBeenNthCalledWith(3, `somechecksum3`);

                expect(syncEngine.photosLibrary.deleteAsset).not.toHaveBeenCalled();
            });

            test(`Only adding - one asset present`, async () => {
                const syncEngine = mockSyncEngineForAssetQueue(syncEngineFactory());
                // Return 'true' on validation once
                syncEngine.photosLibrary.verifyAsset = jest.fn(() => false).mockReturnValueOnce(true).mockReturnValue(false);

                const writeAssetCompleteEvent = jest.fn();
                syncEngine.on(SYNC_ENGINE.EVENTS.WRITE_ASSET_COMPLETED, writeAssetCompleteEvent);

                const asset1 = new Asset(`somechecksum1`, 42, FileType.fromExtension(`png`), 42, AssetType.EDIT, `test1`, `somekey`, `somechecksum1`, `https://icloud.com`, `somerecordname1`, false);
                const asset2 = new Asset(`somechecksum2`, 42, FileType.fromExtension(`png`), 42, AssetType.EDIT, `test2`, `somekey`, `somechecksum2`, `https://icloud.com`, `somerecordname2`, false);
                const toBeAdded = [asset1, asset2];

                await syncEngine.writeAssets([[], toBeAdded, []]);

                expect(syncEngine.photosLibrary.verifyAsset).toHaveBeenCalledTimes(2);
                expect(syncEngine.iCloud.photos.downloadAsset).toHaveBeenCalledTimes(1);
                expect(syncEngine.iCloud.photos.downloadAsset).toHaveBeenNthCalledWith(1, asset2);

                expect(syncEngine.photosLibrary.writeAsset).toHaveBeenCalledTimes(1);
                expect(writeAssetCompleteEvent).toHaveBeenCalledTimes(2);
                expect(writeAssetCompleteEvent).toHaveBeenNthCalledWith(1, `somechecksum1`);
                expect(writeAssetCompleteEvent).toHaveBeenNthCalledWith(2, `somechecksum2`);

                expect(syncEngine.photosLibrary.deleteAsset).not.toHaveBeenCalled();
            });

            test(`Adding & deleting`, async () => {
                const syncEngine = mockSyncEngineForAssetQueue(syncEngineFactory());

                const writeAssetCompleteEvent = jest.fn();
                syncEngine.on(SYNC_ENGINE.EVENTS.WRITE_ASSET_COMPLETED, writeAssetCompleteEvent);

                const asset1 = new Asset(`somechecksum1`, 42, FileType.fromExtension(`png`), 42, AssetType.EDIT, `test1`, `somekey`, `somechecksum1`, `https://icloud.com`, `somerecordname1`, false);
                const asset2 = new Asset(`somechecksum2`, 42, FileType.fromExtension(`png`), 42, AssetType.EDIT, `test2`, `somekey`, `somechecksum2`, `https://icloud.com`, `somerecordname2`, false);
                const asset3 = new Asset(`somechecksum3`, 42, FileType.fromExtension(`png`), 42, AssetType.ORIG, `test3`, `somekey`, `somechecksum3`, `https://icloud.com`, `somerecordname3`, false);
                const asset4 = new Asset(`somechecksum4`, 42, FileType.fromExtension(`png`), 42, AssetType.EDIT, `test4`, `somekey`, `somechecksum4`, `https://icloud.com`, `somerecordname4`, false);
                const asset5 = new Asset(`somechecksum5`, 42, FileType.fromExtension(`png`), 42, AssetType.EDIT, `test5`, `somekey`, `somechecksum5`, `https://icloud.com`, `somerecordname5`, false);
                const asset6 = new Asset(`somechecksum6`, 42, FileType.fromExtension(`png`), 42, AssetType.ORIG, `test6`, `somekey`, `somechecksum6`, `https://icloud.com`, `somerecordname6`, false);
                const toBeAdded = [asset1, asset2, asset3];
                const toBeDeleted = [asset4, asset5, asset6];

                await syncEngine.writeAssets([toBeDeleted, toBeAdded, []]);

                expect(syncEngine.photosLibrary.verifyAsset).toHaveBeenCalledTimes(3);
                expect(syncEngine.iCloud.photos.downloadAsset).toHaveBeenCalledTimes(3);
                expect(syncEngine.iCloud.photos.downloadAsset).toHaveBeenNthCalledWith(1, asset1);
                expect(syncEngine.iCloud.photos.downloadAsset).toHaveBeenNthCalledWith(2, asset2);
                expect(syncEngine.iCloud.photos.downloadAsset).toHaveBeenNthCalledWith(3, asset3);

                expect(syncEngine.photosLibrary.writeAsset).toHaveBeenCalledTimes(3);
                expect(writeAssetCompleteEvent).toHaveBeenCalledTimes(3);
                expect(writeAssetCompleteEvent).toHaveBeenNthCalledWith(1, `somechecksum1`);
                expect(writeAssetCompleteEvent).toHaveBeenNthCalledWith(2, `somechecksum2`);
                expect(writeAssetCompleteEvent).toHaveBeenNthCalledWith(3, `somechecksum3`);

                expect(syncEngine.photosLibrary.deleteAsset).toHaveBeenCalledTimes(3);
                expect(syncEngine.photosLibrary.deleteAsset).toHaveBeenNthCalledWith(1, asset4);
                expect(syncEngine.photosLibrary.deleteAsset).toHaveBeenNthCalledWith(2, asset5);
                expect(syncEngine.photosLibrary.deleteAsset).toHaveBeenNthCalledWith(3, asset6);
            });
        });
        describe(`Handle album queue`, () => {
            test.todo(`Empty processing queue`);
            test.todo(`Only deleting`);
            test.todo(`Only adding`);
            test.todo(`Adding & deleting`);
            describe(`Archive albums`, () => {
                test.todo(`Remote album (locally archived) deleted`);
                test.todo(`Remote album (locally archived) moved`);
                test.todo(`Remote album's content (locally archived) changed`);
            });
        });
    });
});