import mockfs from 'mock-fs';
import {describe, test, jest, expect, afterEach, beforeEach} from '@jest/globals';
import {CPLAlbum, CPLAsset, CPLMaster} from '../../src/lib/icloud/icloud-photos/query-parser';
import {SyncEngine} from '../../src/lib/sync-engine/sync-engine';
import expectedAssetsAll from "../_data/api.expected.all-cpl-assets.json";
import expectedMastersAll from "../_data/api.expected.all-cpl-masters.json";
import expectedAlbumsAll from "../_data/api.expected.all-cpl-albums.json";
import {Asset, AssetType} from '../../src/lib/photos-library/model/asset';
import {FileType} from '../../src/lib/photos-library/model/file-type';
import {PEntity, PLibraryEntities} from '../../src/lib/photos-library/model/photos-entity';
import {Album, AlbumType} from '../../src/lib/photos-library/model/album';
import * as SYNC_ENGINE from '../../src/lib/sync-engine/constants';
import {syncEngineFactory, mockSyncEngineForAssetQueue, queueIsSorted, mockSyncEngineForAlbumQueue} from '../_helpers/sync-engine.helper';
import {compareQueueElements} from '../../src/lib/sync-engine/helpers/write-albums-helper';
import {spyOnEvent} from '../_helpers/_general';

beforeEach(() => {
    mockfs({});
});

afterEach(() => {
    mockfs.restore();
});

describe(`Unit Tests - Sync Engine`, () => {

    describe(`Coordination`, () => {
        describe(`Sync`, () => {
            test.todo(`Succesfull on first try`)
            test.todo(`Recoverable failure`)
            test.todo(`Fatal Failure`)
        })
        test.todo(`Fetch & Load State`)
        test.todo(`Diff state`)
        test.todo(`Write state`)
    })

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
        describe(`Asset state`, () => {
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
        });

        describe(`Album state`, () => {
            test(`Add items to empty state`, () => {
                const remoteAlbums = [
                    new Album(`somechecksum1`, AlbumType.ALBUM, `testAlbum1`, ``),
                    new Album(`somechecksum2`, AlbumType.ALBUM, `testAlbum2`, ``),
                    new Album(`somechecksum3`, AlbumType.ALBUM, `testAlbum3`, ``),
                    new Album(`somechecksum4`, AlbumType.ALBUM, `testAlbum4`, ``),
                ];
                const localAlbums: PLibraryEntities<Album> = {};

                const syncEngine = syncEngineFactory();

                const [toBeDeleted, toBeAdded, toBeKept] = syncEngine.getProcessingQueues(remoteAlbums, localAlbums);
                expect(toBeDeleted.length).toEqual(0);
                expect(toBeAdded.length).toEqual(4);
                expect(toBeKept.length).toEqual(0);
            });

            test(`Only remove items from existing state`, () => {
                const remoteAlbums: PEntity<Album>[] = [];

                const localAlbums = {
                    'somechecksum1': new Album(`somechecksum1`, AlbumType.ALBUM, `testAlbum1`, ``),
                    'somechecksum2': new Album(`somechecksum2`, AlbumType.ALBUM, `testAlbum2`, ``),
                    'somechecksum3': new Album(`somechecksum3`, AlbumType.ALBUM, `testAlbum3`, ``),
                    'somechecksum4': new Album(`somechecksum4`, AlbumType.ALBUM, `testAlbum4`, ``),
                };

                const syncEngine = syncEngineFactory();

                const [toBeDeleted, toBeAdded, toBeKept] = syncEngine.getProcessingQueues(remoteAlbums, localAlbums);
                expect(toBeDeleted.length).toEqual(4);
                expect(toBeAdded.length).toEqual(0);
                expect(toBeKept.length).toEqual(0);
            });

            test(`Only add items to existing state`, () => {
                const remoteAlbums = [
                    new Album(`somechecksum1`, AlbumType.ALBUM, `testAlbum1`, ``),
                    new Album(`somechecksum2`, AlbumType.ALBUM, `testAlbum2`, ``),
                    new Album(`somechecksum3`, AlbumType.ALBUM, `testAlbum3`, ``),
                    new Album(`somechecksum4`, AlbumType.ALBUM, `testAlbum4`, ``),
                ];

                const localAlbums = {
                    'somechecksum1': new Album(`somechecksum1`, AlbumType.ALBUM, `testAlbum1`, ``),
                };

                const syncEngine = syncEngineFactory();

                const [toBeDeleted, toBeAdded, toBeKept] = syncEngine.getProcessingQueues(remoteAlbums, localAlbums);
                expect(toBeDeleted.length).toEqual(0);
                expect(toBeAdded.length).toEqual(3);
                expect(toBeKept.length).toEqual(1);
            });

            test(`Add & remove items from existing state`, () => {
                const remoteAlbums = [
                    new Album(`somechecksum1`, AlbumType.ALBUM, `testAlbum1`, ``),
                    new Album(`somechecksum2`, AlbumType.ALBUM, `testAlbum2`, ``),
                    new Album(`somechecksum4`, AlbumType.ALBUM, `testAlbum4`, ``),
                ];

                const localAlbums = {
                    'somechecksum3': new Album(`somechecksum3`, AlbumType.ALBUM, `testAlbum3`, ``),
                    'somechecksum4': new Album(`somechecksum4`, AlbumType.ALBUM, `testAlbum4`, ``),
                    'somechecksum5': new Album(`somechecksum5`, AlbumType.ALBUM, `testAlbum5`, ``),
                };

                const syncEngine = syncEngineFactory();

                const [toBeDeleted, toBeAdded, toBeKept] = syncEngine.getProcessingQueues(remoteAlbums, localAlbums);
                expect(toBeDeleted.length).toEqual(2);
                expect(toBeAdded.length).toEqual(2);
                expect(toBeKept.length).toEqual(1);
            });

            test(`No change in state`, () => {
                const remoteAlbums = [
                    new Album(`somechecksum1`, AlbumType.ALBUM, `testAlbum1`, ``),
                    new Album(`somechecksum2`, AlbumType.ALBUM, `testAlbum2`, ``),
                    new Album(`somechecksum3`, AlbumType.ALBUM, `testAlbum3`, ``),
                    new Album(`somechecksum4`, AlbumType.ALBUM, `testAlbum4`, ``),
                ];

                const localAlbums = {
                    'somechecksum1': new Album(`somechecksum1`, AlbumType.ALBUM, `testAlbum1`, ``),
                    'somechecksum2': new Album(`somechecksum2`, AlbumType.ALBUM, `testAlbum2`, ``),
                    'somechecksum3': new Album(`somechecksum3`, AlbumType.ALBUM, `testAlbum3`, ``),
                    'somechecksum4': new Album(`somechecksum4`, AlbumType.ALBUM, `testAlbum4`, ``),
                };

                const syncEngine = syncEngineFactory();

                const [toBeDeleted, toBeAdded, toBeKept] = syncEngine.getProcessingQueues(remoteAlbums, localAlbums);
                expect(toBeDeleted.length).toEqual(0);
                expect(toBeAdded.length).toEqual(0);
                expect(toBeKept.length).toEqual(4);
            });

            test.skip(`Only content changed`, () => {
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
    });

    describe(`Handle processing queue`, () => {
        describe(`Handle asset queue`, () => {
            test(`Empty processing queue`, async () => {
                const syncEngine = mockSyncEngineForAssetQueue(syncEngineFactory());

                const writeAssetCompleteEvent = spyOnEvent(syncEngine, SYNC_ENGINE.EVENTS.WRITE_ASSET_COMPLETED);

                await syncEngine.writeAssets([[], [], []]);

                expect(syncEngine.photosLibrary.verifyAsset).not.toHaveBeenCalled();
                expect(syncEngine.photosLibrary.writeAsset).not.toHaveBeenCalled();
                expect(syncEngine.photosLibrary.deleteAsset).not.toHaveBeenCalled();
                expect(syncEngine.iCloud.photos.downloadAsset).not.toHaveBeenCalled();
                expect(writeAssetCompleteEvent).not.toHaveBeenCalled();
            });

            test(`Only deleting`, async () => {
                const syncEngine = mockSyncEngineForAssetQueue(syncEngineFactory());

                const writeAssetCompleteEvent = spyOnEvent(syncEngine, SYNC_ENGINE.EVENTS.WRITE_ASSET_COMPLETED);

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

                const writeAssetCompleteEvent = spyOnEvent(syncEngine, SYNC_ENGINE.EVENTS.WRITE_ASSET_COMPLETED);

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

                const writeAssetCompleteEvent = spyOnEvent(syncEngine, SYNC_ENGINE.EVENTS.WRITE_ASSET_COMPLETED);

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

                const writeAssetCompleteEvent = spyOnEvent(syncEngine, SYNC_ENGINE.EVENTS.WRITE_ASSET_COMPLETED);

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
            describe(`Sort queue`, () => {
                const defaultFullQueue = [
                    new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``),
                    new Album(`someUUID1-1`, AlbumType.ALBUM, `someAlbumName1.1`, `someUUID1`),
                    new Album(`someUUID1-1-1`, AlbumType.ALBUM, `someAlbumName1.1.1`, `someUUID1-1`),
                    new Album(`someUUID1-1-2`, AlbumType.ALBUM, `someAlbumName1.1.2`, `someUUID1-2`),
                    new Album(`someUUID1-2`, AlbumType.ALBUM, `someAlbumName1.2`, `someUUID1`),
                    new Album(`someUUID1-3`, AlbumType.ALBUM, `someAlbumName1.3`, `someUUID1`),
                    new Album(`someUUID2`, AlbumType.ALBUM, `someAlbumName2`, ``),
                    new Album(`someUUID3`, AlbumType.ALBUM, `someAlbumName3`, ``),
                    new Album(`someUUID3-1`, AlbumType.ALBUM, `someAlbumName3.1`, `someUUID3`),
                    new Album(`someUUID3-2`, AlbumType.ALBUM, `someAlbumName3.2`, `someUUID3`),
                    new Album(`someUUID3-2-1`, AlbumType.ALBUM, `someAlbumName3.2.1`, `someUUID3-2`),
                ];

                test.each([
                    {
                        "queue": [],
                        "desc": `Empty queue`,
                    }, {
                        "queue": [
                            new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``),
                            new Album(`someUUID1-1`, AlbumType.ALBUM, `someAlbumName1.1`, `someUUID1`),
                            new Album(`someUUID1-1-1`, AlbumType.ALBUM, `someAlbumName1.1.1`, `someUUID1-1`),
                            new Album(`someUUID1-1-2`, AlbumType.ALBUM, `someAlbumName1.1.2`, `someUUID1-1`),
                            new Album(`someUUID1-2`, AlbumType.ALBUM, `someAlbumName1.2`, `someUUID1`),
                            new Album(`someUUID1-3`, AlbumType.ALBUM, `someAlbumName1.3`, `someUUID1`),
                            new Album(`someUUID2`, AlbumType.ALBUM, `someAlbumName2`, ``),
                            new Album(`someUUID3`, AlbumType.ALBUM, `someAlbumName3`, ``),
                            new Album(`someUUID3-1`, AlbumType.ALBUM, `someAlbumName3.1`, `someUUID3`),
                            new Album(`someUUID3-2`, AlbumType.ALBUM, `someAlbumName3.2`, `someUUID3`),
                        ],
                        "desc": `Sorted queue`,
                    }, {
                        "queue": [
                            new Album(`someUUID1-2`, AlbumType.ALBUM, `someAlbumName1.2`, `someUUID1`),
                            new Album(`someUUID1-1-1`, AlbumType.ALBUM, `someAlbumName1.1.1`, `someUUID1-1`),
                            new Album(`someUUID1-1`, AlbumType.ALBUM, `someAlbumName1.1`, `someUUID1`),
                            new Album(`someUUID1-3`, AlbumType.ALBUM, `someAlbumName1.3`, `someUUID1`),
                            new Album(`someUUID3-1`, AlbumType.ALBUM, `someAlbumName3.1`, `someUUID3`),
                            new Album(`someUUID2`, AlbumType.ALBUM, `someAlbumName2`, ``),
                            new Album(`someUUID1-1-2`, AlbumType.ALBUM, `someAlbumName1.1.2`, `someUUID1-1`),
                            new Album(`someUUID3-2`, AlbumType.ALBUM, `someAlbumName3.2`, `someUUID3`),
                            new Album(`someUUID3`, AlbumType.ALBUM, `someAlbumName3`, ``),
                            new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``),
                        ],
                        "desc": `Unsorted queue`,
                    }, {
                        "queue": [
                            new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``),
                            new Album(`someUUID1-1`, AlbumType.ALBUM, `someAlbumName1.1`, `someUUID1`),
                            new Album(`someUUID1-1-1`, AlbumType.ALBUM, `someAlbumName1.1.1`, `someUUID1-1`),
                            new Album(`someUUID1-1-2`, AlbumType.ALBUM, `someAlbumName1.1.2`, `someUUID1-1`),
                            new Album(`someUUID4-1-1`, AlbumType.ALBUM, `someAlbumName4.1.1`, `someUUID4-1`),
                            new Album(`someUUID1-2`, AlbumType.ALBUM, `someAlbumName1.2`, `someUUID1`),
                            new Album(`someUUID1-3`, AlbumType.ALBUM, `someAlbumName1.3`, `someUUID1`),
                            new Album(`someUUID2`, AlbumType.ALBUM, `someAlbumName2`, ``),
                            new Album(`someUUID3`, AlbumType.ALBUM, `someAlbumName3`, ``),
                            new Album(`someUUID3-1`, AlbumType.ALBUM, `someAlbumName3.1`, `someUUID3`),
                            new Album(`someUUID3-2`, AlbumType.ALBUM, `someAlbumName3.2`, `someUUID3`),
                            new Album(`someUUID4-1`, AlbumType.ALBUM, `someAlbumName4.1`, `someUUID4`),
                        ],
                        "desc": `Unsorted queue (missing ancestor link)`,
                    },
                ])(`$desc`, ({queue}) => {
                    const syncEngine = syncEngineFactory();

                    const sortedQueue = syncEngine.sortQueue(queue);

                    expect(sortedQueue).toBeDefined();
                    expect(queueIsSorted(sortedQueue)).toBeTruthy();
                    expect(sortedQueue.length).toEqual(queue.length);
                });

                describe(`Distance to root`, () => {
                    test.each([
                        {
                            "a": new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``),
                            "expectedDistance": 0,
                        },
                        {
                            "a": new Album(`someUUID1-1`, AlbumType.ALBUM, `someAlbumName1.1`, `someUUID1`),
                            "expectedDistance": 1,
                        },
                        {
                            "a": new Album(`someUUID1-1-1`, AlbumType.ALBUM, `someAlbumName1.1.1`, `someUUID1-1`),
                            "expectedDistance": 2,
                        },
                    ])(`Calculating distance to root - Expecting $expectedDistance`, ({a, expectedDistance}) => {
                        expect(Album.distanceToRoot(a, defaultFullQueue)).toEqual(expectedDistance);
                    });

                    test(`Calculating distance to root - Broken Link`, () => {
                        const brokenQueue = [
                            new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``),
                            new Album(`someUUID1-1-1`, AlbumType.ALBUM, `someAlbumName1.1.1`, `someUUID1-1`),
                            new Album(`someUUID1-1-2`, AlbumType.ALBUM, `someAlbumName1.1.2`, `someUUID1-2`),
                        ];
                        expect(() => Album.distanceToRoot(new Album(`someUUID1-1-2`, AlbumType.ALBUM, `someAlbumName1.1.2`, `someUUID1-2`), brokenQueue)).toThrowError(`Unable to determine distance to root, no link to root!`);
                    });
                });

                describe(`Album compare function`, () => {
                    test.each([
                        {
                            "a": new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``),
                            "b": new Album(`someUUID1-1`, AlbumType.ALBUM, `someAlbumName1.1`, `someUUID1`),
                        },
                        {
                            "a": new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``),
                            "b": new Album(`someUUID1-1-1`, AlbumType.ALBUM, `someAlbumName1.1.1`, `someUUID1-1`),
                        },
                        {
                            "a": new Album(`someUUID1-2`, AlbumType.ALBUM, `someAlbumName1`, `someUUID1`),
                            "b": new Album(`someUUID1-1-1`, AlbumType.ALBUM, `someAlbumName1.1`, `someUUID1-1`),
                        },
                        {
                            "a": new Album(`someUUID1-2`, AlbumType.ALBUM, `someAlbumName1`, `someUUID1`),
                            "b": new Album(`someUUID3-2-1`, AlbumType.ALBUM, `someAlbumName3.2.1`, `someUUID3-2`),
                        },
                    ])(`Compare function returns negative value - %#`, ({a, b}) => {
                        const result = compareQueueElements(defaultFullQueue, a, b);
                        expect(result).toBeLessThan(0);
                    });

                    test.each([
                        {
                            "a": new Album(`someUUID1-1`, AlbumType.ALBUM, `someAlbumName1.1`, `someUUID1`),
                            "b": new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``),
                        },
                        {
                            "a": new Album(`someUUID1-1-1`, AlbumType.ALBUM, `someAlbumName1.1.1`, `someUUID1-1`),
                            "b": new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``),
                        },
                        {
                            "a": new Album(`someUUID1-1-1`, AlbumType.ALBUM, `someAlbumName1.1`, `someUUID1-1`),
                            "b": new Album(`someUUID1-2`, AlbumType.ALBUM, `someAlbumName1`, `someUUID1`),
                        },
                        {
                            "a": new Album(`someUUID3-2-1`, AlbumType.ALBUM, `someAlbumName3.2.1`, `someUUID3-2`),
                            "b": new Album(`someUUID1-2`, AlbumType.ALBUM, `someAlbumName1`, `someUUID1`),
                        },
                    ])(`Compare function returns positive value - %#`, ({a, b}) => {
                        const result = compareQueueElements(defaultFullQueue, a, b);
                        expect(result).toBeGreaterThan(0);
                    });

                    test(`Compare function is reflexive`, () => {
                        const album = new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``);
                        const result = compareQueueElements([album], album, album);
                        expect(result).toEqual(0);
                    });

                    test.each([
                        {
                            "a": new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``),
                            "b": new Album(`someUUID1-1`, AlbumType.ALBUM, `someAlbumName1.1`, `someUUID1`),
                        },
                        {
                            "a": new Album(`someUUID1-1`, AlbumType.ALBUM, `someAlbumName1.1`, `someUUID1`),
                            "b": new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``),
                        },
                        {
                            "a": new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``),
                            "b": new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``),
                        },
                    ])(`Compare Function is symmetric - %#`, ({a, b}) => {
                        const result1 = compareQueueElements(defaultFullQueue, a, b);
                        const result2 = compareQueueElements(defaultFullQueue, b, a);
                        expect.assertions(1);
                        if (result1 < 0) {
                            expect(result2).toBeGreaterThan(0);
                        } else if (result1 > 0) {
                            expect(result2).toBeLessThan(0);
                        } else if (result1 === 0) {
                            expect(result2).toEqual(0);
                        }
                    });

                    test.each([
                        {
                            "a": new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``),
                            "b": new Album(`someUUID1-1`, AlbumType.ALBUM, `someAlbumName1.1`, `someUUID1`),
                            "c": new Album(`someUUID1-1-1`, AlbumType.ALBUM, `someAlbumName1.1.1`, `someUUID1-1`),
                        },
                        {
                            "a": new Album(`someUUID1-1-1`, AlbumType.ALBUM, `someAlbumName1.1.1`, `someUUID1-1`),
                            "b": new Album(`someUUID1-1`, AlbumType.ALBUM, `someAlbumName1.1`, `someUUID1`),
                            "c": new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``),
                        },
                        {
                            "a": new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``),
                            "b": new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``),
                            "c": new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``),
                        },
                    ])(`Compare Function is reflexive - %#`, ({a, b, c}) => {
                        const result1 = compareQueueElements(defaultFullQueue, a, b);
                        const result2 = compareQueueElements(defaultFullQueue, b, c);
                        const result3 = compareQueueElements(defaultFullQueue, a, c);
                        expect.assertions(1);
                        if (result1 > 0 && result2 > 0) {
                            expect(result3).toBeGreaterThan(0);
                        } else if (result1 < 0 && result2 < 0) {
                            expect(result3).toBeLessThan(0);
                        } else if (result1 === 0 && result2 === 0) {
                            expect(result3).toEqual(0);
                        }
                    });
                });
            });

            test(`Empty processing queue`, async () => {
                const syncEngine = mockSyncEngineForAlbumQueue(syncEngineFactory());

                await syncEngine.writeAlbums([[], [], []]);

                expect(syncEngine.photosLibrary.cleanArchivedOrphans).toHaveBeenCalled();
                expect(syncEngine.photosLibrary.stashArchivedAlbum).not.toHaveBeenCalled();
                expect(syncEngine.photosLibrary.retrieveStashedAlbum).not.toHaveBeenCalled();
                expect(syncEngine.photosLibrary.writeAlbum).not.toHaveBeenCalled();
                expect(syncEngine.photosLibrary.deleteAlbum).not.toHaveBeenCalled();
            });

            test(`Only deleting`, async () => {
                const syncEngine = mockSyncEngineForAlbumQueue(syncEngineFactory());

                const albumParent = new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``);
                const albumChild = new Album(`someUUID1-1`, AlbumType.ALBUM, `someAlbumName2`, `someUUID1`);
                const albumChildChild = new Album(`someUUID1-1-1`, AlbumType.ALBUM, `someAlbumName3`, `someUUID1-1`);
                // The order here does not matter
                await syncEngine.writeAlbums([[albumChild, albumChildChild, albumParent], [], []]);

                expect(syncEngine.photosLibrary.cleanArchivedOrphans).toHaveBeenCalled();
                expect(syncEngine.photosLibrary.stashArchivedAlbum).not.toHaveBeenCalled();
                expect(syncEngine.photosLibrary.retrieveStashedAlbum).not.toHaveBeenCalled();
                expect(syncEngine.photosLibrary.writeAlbum).not.toHaveBeenCalled();
                expect(syncEngine.photosLibrary.deleteAlbum).toHaveBeenCalledTimes(3);
                // Needs to be called from the furthes node
                expect(syncEngine.photosLibrary.deleteAlbum).toHaveBeenNthCalledWith(1, albumChildChild);
                expect(syncEngine.photosLibrary.deleteAlbum).toHaveBeenNthCalledWith(2, albumChild);
                expect(syncEngine.photosLibrary.deleteAlbum).toHaveBeenNthCalledWith(3, albumParent);
            });

            test(`Only adding`, async () => {
                const syncEngine = mockSyncEngineForAlbumQueue(syncEngineFactory());

                const albumParent = new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``);
                const albumChild = new Album(`someUUID1-1`, AlbumType.ALBUM, `someAlbumName2`, `someUUID1`);
                const albumChildChild = new Album(`someUUID1-1-1`, AlbumType.ALBUM, `someAlbumName3`, `someUUID1-1`);
                // The order here does not matter
                await syncEngine.writeAlbums([[], [albumChild, albumChildChild, albumParent], []]);

                expect(syncEngine.photosLibrary.cleanArchivedOrphans).toHaveBeenCalled();
                expect(syncEngine.photosLibrary.stashArchivedAlbum).not.toHaveBeenCalled();
                expect(syncEngine.photosLibrary.retrieveStashedAlbum).not.toHaveBeenCalled();
                expect(syncEngine.photosLibrary.deleteAlbum).not.toHaveBeenCalled();
                expect(syncEngine.photosLibrary.writeAlbum).toHaveBeenCalledTimes(3);
                // Needs to be called from the furthes node
                expect(syncEngine.photosLibrary.writeAlbum).toHaveBeenNthCalledWith(1, albumParent);
                expect(syncEngine.photosLibrary.writeAlbum).toHaveBeenNthCalledWith(2, albumChild);
                expect(syncEngine.photosLibrary.writeAlbum).toHaveBeenNthCalledWith(3, albumChildChild);
            });

            test(`Adding & deleting`, async () => {
                const syncEngine = mockSyncEngineForAlbumQueue(syncEngineFactory());

                const addAlbumParent = new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``);
                const addAlbumChild = new Album(`someUUID1-1`, AlbumType.ALBUM, `someAlbumName2`, `someUUID1`);
                const addAlbumChildChild = new Album(`someUUID1-1-1`, AlbumType.ALBUM, `someAlbumName3`, `someUUID1-1`);
                const removeAlbumParent = new Album(`someUUID2`, AlbumType.ALBUM, `someAlbumName4`, ``);
                const removeAlbumChild = new Album(`someUUID2-1`, AlbumType.ALBUM, `someAlbumName5`, `someUUID2`);
                const removeAlbumChildChild = new Album(`someUUID2-1-1`, AlbumType.ALBUM, `someAlbumName6`, `someUUID2-1`);
                // The order here does not matter
                await syncEngine.writeAlbums([[removeAlbumChild, removeAlbumParent, removeAlbumChildChild], [addAlbumChild, addAlbumParent, addAlbumChildChild], []]);

                expect(syncEngine.photosLibrary.cleanArchivedOrphans).toHaveBeenCalled();
                expect(syncEngine.photosLibrary.stashArchivedAlbum).not.toHaveBeenCalled();
                expect(syncEngine.photosLibrary.retrieveStashedAlbum).not.toHaveBeenCalled();

                expect(syncEngine.photosLibrary.deleteAlbum).toHaveBeenCalledTimes(3);
                // Needs to be called from the furthes node
                expect(syncEngine.photosLibrary.deleteAlbum).toHaveBeenNthCalledWith(1, removeAlbumChildChild);
                expect(syncEngine.photosLibrary.deleteAlbum).toHaveBeenNthCalledWith(2, removeAlbumChild);
                expect(syncEngine.photosLibrary.deleteAlbum).toHaveBeenNthCalledWith(3, removeAlbumParent);

                expect(syncEngine.photosLibrary.writeAlbum).toHaveBeenCalledTimes(3);
                // Needs to be called from the closest node
                expect(syncEngine.photosLibrary.writeAlbum).toHaveBeenNthCalledWith(1, addAlbumParent);
                expect(syncEngine.photosLibrary.writeAlbum).toHaveBeenNthCalledWith(2, addAlbumChild);
                expect(syncEngine.photosLibrary.writeAlbum).toHaveBeenNthCalledWith(3, addAlbumChildChild);
            });

            describe(`Archive albums`, () => {
                test(`Remote album (locally archived) deleted`, async () => {
                    const syncEngine = mockSyncEngineForAlbumQueue(syncEngineFactory());

                    const albumParent = new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``);
                    const albumChild = new Album(`someUUID1-1`, AlbumType.ALBUM, `someAlbumName2`, `someUUID1`);
                    const albumChildChild = new Album(`someUUID1-1-1`, AlbumType.ARCHIVED, `someAlbumName3`, `someUUID1-1`);
                    // The order here does not matter
                    await syncEngine.writeAlbums([[albumChild, albumChildChild, albumParent], [], []]);

                    expect(syncEngine.photosLibrary.cleanArchivedOrphans).toHaveBeenCalled();
                    expect(syncEngine.photosLibrary.retrieveStashedAlbum).not.toHaveBeenCalled();
                    expect(syncEngine.photosLibrary.writeAlbum).not.toHaveBeenCalled();

                    expect(syncEngine.photosLibrary.stashArchivedAlbum).toHaveBeenCalledTimes(1);
                    expect(syncEngine.photosLibrary.stashArchivedAlbum).toHaveBeenNthCalledWith(1, albumChildChild);

                    expect(syncEngine.photosLibrary.deleteAlbum).toHaveBeenCalledTimes(2);
                    // Needs to be called from the furthes node
                    expect(syncEngine.photosLibrary.deleteAlbum).toHaveBeenNthCalledWith(1, albumChild);
                    expect(syncEngine.photosLibrary.deleteAlbum).toHaveBeenNthCalledWith(2, albumParent);
                });

                test(`Remote album (locally archived) moved`, async () => {
                    const syncEngine = mockSyncEngineForAlbumQueue(syncEngineFactory());

                    const removedAlbumParent = new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``);
                    const removedAlbumChild = new Album(`someUUID1-1`, AlbumType.ALBUM, `someAlbumName2`, `someUUID1`);
                    const removedAlbumChildChild = new Album(`someUUID1-1-1`, AlbumType.ARCHIVED, `someAlbumName3`, `someUUID1-1`);
                    const newAlbum = removedAlbumChildChild;
                    // The order here does not matter
                    await syncEngine.writeAlbums([[removedAlbumParent, removedAlbumChild, removedAlbumChildChild], [newAlbum], []]);

                    expect(syncEngine.photosLibrary.cleanArchivedOrphans).toHaveBeenCalled();

                    expect(syncEngine.photosLibrary.deleteAlbum).toHaveBeenCalledTimes(2);
                    expect(syncEngine.photosLibrary.deleteAlbum).toHaveBeenNthCalledWith(1, removedAlbumChild);
                    expect(syncEngine.photosLibrary.deleteAlbum).toHaveBeenNthCalledWith(2, removedAlbumParent);

                    expect(syncEngine.photosLibrary.stashArchivedAlbum).toHaveBeenCalledTimes(1);
                    expect(syncEngine.photosLibrary.stashArchivedAlbum).toHaveBeenNthCalledWith(1, removedAlbumChildChild);

                    expect(syncEngine.photosLibrary.retrieveStashedAlbum).toHaveBeenCalledTimes(1);
                    expect(syncEngine.photosLibrary.retrieveStashedAlbum).toHaveBeenNthCalledWith(1, newAlbum);

                    expect(syncEngine.photosLibrary.writeAlbum).not.toHaveBeenCalled();
                });
            });
        });
    });
});