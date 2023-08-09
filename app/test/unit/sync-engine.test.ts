import mockfs from 'mock-fs';
import {describe, test, jest, expect, afterEach, beforeEach} from '@jest/globals';

import {Asset, AssetType} from '../../src/lib/photos-library/model/asset';
import {FileType} from '../../src/lib/photos-library/model/file-type';
import {Album, AlbumType} from '../../src/lib/photos-library/model/album';
import {fetchAndLoadStateReturnValue, diffStateReturnValue, convertCPLAssetsReturnValue, convertCPLAlbumsReturnValue, loadAssetsReturnValue, loadAlbumsReturnValue, resolveHierarchicalDependenciesReturnValue, fetchAllCPLAssetsMastersReturnValue, fetchAllCPLAlbumsReturnValue, getRandomZone} from '../_helpers/sync-engine.helper';
import {MockedResourceManager, UnknownFunction, prepareResourceManager} from '../_helpers/_general';
import {AxiosError, AxiosResponse} from 'axios';
import PQueue from 'p-queue';
import {ResourceManager} from '../../src/lib/resource-manager/resource-manager';
import {SyncEngineHelper} from '../../src/lib/sync-engine/helper';
import {iCPSEventError, iCPSEventSyncEngine} from '../../src/lib/resource-manager/events';
import {SyncEngine} from '../../src/lib/sync-engine/sync-engine';
import {iCloud} from '../../src/lib/icloud/icloud';
import {PhotosLibrary} from '../../src/lib/photos-library/photos-library';
import {iCPSError} from '../../src/app/error/error';
import {SYNC_ERR} from '../../src/app/error/error-codes';

let mockedResourceManager: MockedResourceManager;
let syncEngine: SyncEngine;

beforeEach(() => {
    mockedResourceManager = prepareResourceManager()!;
    mockfs({});
    syncEngine = new SyncEngine(new iCloud(), new PhotosLibrary());
});

afterEach(() => {
    mockfs.restore();
});

describe(`Coordination`, () => {
    describe(`Sync`, () => {
        test(`Successful on first try`, async () => {
            const startEvent = mockedResourceManager.spyOnEvent(iCPSEventSyncEngine.START);
            syncEngine.fetchAndLoadState = jest.fn<typeof syncEngine.fetchAndLoadState>()
                .mockResolvedValue(fetchAndLoadStateReturnValue);
            syncEngine.diffState = jest.fn<typeof syncEngine.diffState>()
                .mockResolvedValue(diffStateReturnValue);
            syncEngine.writeState = jest.fn<typeof syncEngine.writeState>()
                .mockResolvedValue();
            const doneEvent = mockedResourceManager.spyOnEvent(iCPSEventSyncEngine.DONE);
            const retryEvent = mockedResourceManager.spyOnEvent(iCPSEventSyncEngine.RETRY);
            const handlerEvent = mockedResourceManager.spyOnEvent(iCPSEventError.HANDLER_EVENT);

            await syncEngine.sync();

            expect(startEvent).toHaveBeenCalledTimes(1);
            expect(syncEngine.fetchAndLoadState).toHaveBeenCalledTimes(1);
            expect(syncEngine.diffState).toHaveBeenCalledWith(...fetchAndLoadStateReturnValue);
            expect(syncEngine.writeState).toHaveBeenCalledWith(...diffStateReturnValue);
            expect(doneEvent).toHaveBeenCalledTimes(1);
            expect(retryEvent).not.toHaveBeenCalled();
            expect(handlerEvent).not.toHaveBeenCalled();
        });

        test(`Reach maximum retries`, async () => {
            ResourceManager.instance._resources.maxRetries = 4;

            const startEvent = mockedResourceManager.spyOnEvent(iCPSEventSyncEngine.START);
            const retryEvent = mockedResourceManager.spyOnEvent(iCPSEventSyncEngine.RETRY);
            const handlerEvent = mockedResourceManager.spyOnEvent(iCPSEventError.HANDLER_EVENT);
            syncEngine.fetchAndLoadState = jest.fn<typeof syncEngine.fetchAndLoadState>()
                .mockResolvedValue(fetchAndLoadStateReturnValue);
            syncEngine.diffState = jest.fn<typeof syncEngine.diffState>()
                .mockResolvedValue(diffStateReturnValue);

            const error = new Error(`Bad Request - 421`) as unknown as AxiosError;
            error.name = `AxiosError`;
            error.code = `ERR_BAD_REQUEST`;
            error.response = {
                status: 421,
            } as unknown as AxiosResponse;
            syncEngine.writeState = jest.fn<typeof syncEngine.writeState>()
                .mockRejectedValueOnce(error)
                .mockRejectedValueOnce(error)
                .mockRejectedValueOnce(error)
                .mockRejectedValueOnce(error)
                .mockResolvedValue();

            syncEngine.prepareRetry = jest.fn<typeof syncEngine.prepareRetry>();

            await expect(syncEngine.sync()).rejects.toEqual(new Error(`Sync did not complete successfully within expected amount of tries`));

            expect(startEvent).toHaveBeenCalled();
            expect(retryEvent).toHaveBeenCalledTimes(4);
            expect(handlerEvent).toHaveBeenCalledTimes(4);
            expect(syncEngine.fetchAndLoadState).toHaveBeenCalledTimes(4);
            expect(syncEngine.diffState).toHaveBeenCalledTimes(4);
            expect(syncEngine.diffState).toHaveBeenNthCalledWith(1, ...fetchAndLoadStateReturnValue);
            expect(syncEngine.diffState).toHaveBeenNthCalledWith(2, ...fetchAndLoadStateReturnValue);
            expect(syncEngine.diffState).toHaveBeenNthCalledWith(3, ...fetchAndLoadStateReturnValue);
            expect(syncEngine.diffState).toHaveBeenNthCalledWith(4, ...fetchAndLoadStateReturnValue);
            expect(syncEngine.writeState).toHaveBeenCalledTimes(4);
            expect(syncEngine.writeState).toHaveBeenNthCalledWith(1, ...diffStateReturnValue);
            expect(syncEngine.writeState).toHaveBeenNthCalledWith(2, ...diffStateReturnValue);
            expect(syncEngine.writeState).toHaveBeenNthCalledWith(3, ...diffStateReturnValue);
            expect(syncEngine.writeState).toHaveBeenNthCalledWith(4, ...diffStateReturnValue);
            expect(syncEngine.prepareRetry).toHaveBeenCalledTimes(4);
        });

        test.each([
            {
                error: new AxiosError(`Bad Response`, `ERR_BAD_RESPONSE`),
                expectedError: new iCPSError(SYNC_ERR.NETWORK),
                desc: `Network error`,
            }, {
                error: new Error(`Unknown error`),
                expectedError: new iCPSError(SYNC_ERR.UNKNOWN),
                desc: `Unknown error`,
            },
        ])(`Perform retry - $desc`, async ({error, expectedError}) => {
            const startEvent = mockedResourceManager.spyOnEvent(iCPSEventSyncEngine.START);
            const retryEvent = mockedResourceManager.spyOnEvent(iCPSEventSyncEngine.RETRY);
            const handlerEvent = mockedResourceManager.spyOnEvent(iCPSEventError.HANDLER_EVENT);
            syncEngine.fetchAndLoadState = jest.fn<typeof syncEngine.fetchAndLoadState>()
                .mockResolvedValue(fetchAndLoadStateReturnValue);
            syncEngine.diffState = jest.fn<typeof syncEngine.diffState>()
                .mockResolvedValue(diffStateReturnValue);
            syncEngine.writeState = jest.fn<typeof syncEngine.writeState>()
                .mockRejectedValueOnce(error)
                .mockResolvedValueOnce();
            syncEngine.prepareRetry = jest.fn<typeof syncEngine.prepareRetry>();
            const doneEvent = mockedResourceManager.spyOnEvent(iCPSEventSyncEngine.DONE);

            await syncEngine.sync();

            expect(startEvent).toHaveBeenCalled();
            expect(retryEvent).toHaveBeenCalledWith(1);
            expect(handlerEvent).toHaveBeenCalledWith(expectedError);
            expect(syncEngine.fetchAndLoadState).toHaveBeenCalledTimes(2);
            expect(syncEngine.diffState).toHaveBeenCalledTimes(2);
            expect(syncEngine.diffState).toHaveBeenNthCalledWith(1, ...fetchAndLoadStateReturnValue);
            expect(syncEngine.diffState).toHaveBeenNthCalledWith(2, ...fetchAndLoadStateReturnValue);
            expect(syncEngine.writeState).toHaveBeenCalledTimes(2);
            expect(syncEngine.writeState).toHaveBeenNthCalledWith(1, ...diffStateReturnValue);
            expect(syncEngine.writeState).toHaveBeenNthCalledWith(2, ...diffStateReturnValue);
            expect(syncEngine.prepareRetry).toHaveBeenCalledTimes(1);
            expect(doneEvent).toHaveBeenCalledTimes(1);
        });

        test.each([
            {
                queue: undefined,
                msg: `Undefined queue`,
            },
            {
                queue: new PQueue(),
                msg: `Empty queue`,
            },
            {
                queue: (() => {
                    const queue = new PQueue({concurrency: 2, autoStart: true});
                    for (let i = 0; i < 10; i++) {
                        queue.add(() => new Promise(resolve => setTimeout(resolve, 40)));
                    }

                    return queue;
                })(),
                msg: `Non-Empty queue`,
            },
            {
                queue: (() => {
                    const queue = new PQueue({concurrency: 2, autoStart: true});
                    for (let i = 0; i < 10; i++) {
                        queue.add(() => new Promise(resolve => setTimeout(resolve, 40)));
                    }

                    return queue;
                })(),
                msg: `Started queue`,
            },
        ])(`Prepare Retry - $msg`, async ({queue}) => {
            syncEngine.downloadQueue = queue as unknown as PQueue;
            syncEngine.icloud.setupAccount = jest.fn<typeof syncEngine.icloud.setupAccount>()
                .mockResolvedValue();
            syncEngine.icloud.getReady = jest.fn<typeof syncEngine.icloud.getReady>()
                .mockResolvedValue();

            await syncEngine.prepareRetry();

            expect.assertions(queue ? 2 : 0);
            // Expect(syncEngine.icloud.setupAccount).toHaveBeenCalledTimes(1);
            if (syncEngine.downloadQueue) {
                expect(syncEngine.downloadQueue.size).toEqual(0);
                expect(syncEngine.downloadQueue.pending).toEqual(0);
            }
        });
    });

    test(`Fetch & Load State`, async () => {
        const fetchNLoadEvent = mockedResourceManager.spyOnEvent(iCPSEventSyncEngine.FETCH_N_LOAD);

        const convertCPLAlbumsOriginal = SyncEngineHelper.convertCPLAlbums;
        const convertCPLAssetsOriginal = SyncEngineHelper.convertCPLAssets;

        syncEngine.icloud.photos.fetchAllCPLAssetsMasters = jest.fn<typeof syncEngine.icloud.photos.fetchAllCPLAssetsMasters>()
            .mockResolvedValue(fetchAllCPLAssetsMastersReturnValue);
        SyncEngineHelper.convertCPLAssets = jest.fn<typeof SyncEngineHelper.convertCPLAssets>()
            .mockReturnValue(convertCPLAssetsReturnValue);

        syncEngine.icloud.photos.fetchAllCPLAlbums = jest.fn<typeof syncEngine.icloud.photos.fetchAllCPLAlbums>()
            .mockResolvedValue(fetchAllCPLAlbumsReturnValue);
        SyncEngineHelper.convertCPLAlbums = jest.fn<typeof SyncEngineHelper.convertCPLAlbums>()
            .mockReturnValue(convertCPLAlbumsReturnValue);

        syncEngine.photosLibrary.loadAssets = jest.fn<typeof syncEngine.photosLibrary.loadAssets>()
            .mockResolvedValue(loadAssetsReturnValue);

        syncEngine.photosLibrary.loadAlbums = jest.fn<typeof syncEngine.photosLibrary.loadAlbums>()
            .mockResolvedValue(loadAlbumsReturnValue);

        const fetchNLoadCompletedEvent = mockedResourceManager.spyOnEvent(iCPSEventSyncEngine.FETCH_N_LOAD_COMPLETED);

        const result = await syncEngine.fetchAndLoadState();

        expect(fetchNLoadEvent).toHaveBeenCalledTimes(1);
        expect(syncEngine.icloud.photos.fetchAllCPLAssetsMasters).toHaveBeenCalledTimes(1);
        expect(SyncEngineHelper.convertCPLAssets).toHaveBeenCalledTimes(1);
        expect(SyncEngineHelper.convertCPLAssets).toHaveBeenCalledWith(...fetchAllCPLAssetsMastersReturnValue);
        expect(syncEngine.icloud.photos.fetchAllCPLAlbums).toHaveBeenCalledTimes(1);
        expect(SyncEngineHelper.convertCPLAlbums).toHaveBeenCalledTimes(1);
        expect(SyncEngineHelper.convertCPLAlbums).toHaveBeenCalledWith(fetchAllCPLAlbumsReturnValue);
        expect(syncEngine.photosLibrary.loadAssets).toHaveBeenCalledTimes(1);
        expect(syncEngine.photosLibrary.loadAlbums).toHaveBeenCalledTimes(1);
        expect(fetchNLoadCompletedEvent).toHaveBeenCalledTimes(1);
        expect(fetchNLoadCompletedEvent).toHaveBeenCalledWith(1, 1, 1, 1);
        expect(result).toEqual([convertCPLAssetsReturnValue, convertCPLAlbumsReturnValue, loadAssetsReturnValue, loadAlbumsReturnValue]);

        SyncEngineHelper.convertCPLAlbums = convertCPLAlbumsOriginal;
        SyncEngineHelper.convertCPLAssets = convertCPLAssetsOriginal;
    });

    test(`Diff state`, async () => {
        const getProcessingQueuesOriginal = SyncEngineHelper.getProcessingQueues;
        const resolveHierarchicalDependenciesOriginal = SyncEngineHelper.resolveHierarchicalDependencies;

        const diffStartEvent = mockedResourceManager.spyOnEvent(iCPSEventSyncEngine.DIFF);
        SyncEngineHelper.getProcessingQueues = jest.fn<typeof SyncEngineHelper.getProcessingQueues<any>>()
            .mockReturnValue([[], [], []]);
        SyncEngineHelper.resolveHierarchicalDependencies = jest.fn<typeof SyncEngineHelper.resolveHierarchicalDependencies>()
            .mockReturnValue(resolveHierarchicalDependenciesReturnValue);
        const diffCompletedEvent = mockedResourceManager.spyOnEvent(iCPSEventSyncEngine.DIFF_COMPLETED);

        const result = await syncEngine.diffState(...fetchAndLoadStateReturnValue);

        expect(diffStartEvent).toHaveBeenCalledTimes(1);
        expect(SyncEngineHelper.getProcessingQueues).toBeCalledTimes(2);
        expect(SyncEngineHelper.getProcessingQueues).toHaveBeenNthCalledWith(1, fetchAndLoadStateReturnValue[0], fetchAndLoadStateReturnValue[2]);
        expect(SyncEngineHelper.getProcessingQueues).toHaveBeenNthCalledWith(2, fetchAndLoadStateReturnValue[1], fetchAndLoadStateReturnValue[3]);
        expect(SyncEngineHelper.resolveHierarchicalDependencies).toHaveBeenCalledTimes(1);
        expect(diffCompletedEvent).toHaveBeenCalledTimes(1);
        expect(result).toEqual([[[], [], []], resolveHierarchicalDependenciesReturnValue]);

        SyncEngineHelper.getProcessingQueues = getProcessingQueuesOriginal;
        SyncEngineHelper.resolveHierarchicalDependencies = resolveHierarchicalDependenciesOriginal;
    });

    test(`Write state`, async () => {
        syncEngine.writeAssets = jest.fn<typeof syncEngine.writeAssets>()
            .mockResolvedValue();
        syncEngine.writeAlbums = jest.fn<typeof syncEngine.writeAlbums>()
            .mockResolvedValue();

        const writeEvent = mockedResourceManager.spyOnEvent(iCPSEventSyncEngine.WRITE);
        const writeAssetsEvent = mockedResourceManager.spyOnEvent(iCPSEventSyncEngine.WRITE_ASSETS);
        const writeAssetsCompletedEvent = mockedResourceManager.spyOnEvent(iCPSEventSyncEngine.WRITE_ASSETS_COMPLETED);
        const writeAlbumsEvent = mockedResourceManager.spyOnEvent(iCPSEventSyncEngine.WRITE_ALBUMS);
        const writeAlbumCompletedEvent = mockedResourceManager.spyOnEvent(iCPSEventSyncEngine.WRITE_ALBUMS_COMPLETED);
        const writeCompletedEvent = mockedResourceManager.spyOnEvent(iCPSEventSyncEngine.WRITE_COMPLETED);

        await syncEngine.writeState(...diffStateReturnValue);

        expect(writeEvent).toHaveBeenCalledTimes(1);
        expect(writeAssetsEvent).toHaveBeenCalledTimes(1);
        expect(writeAssetsEvent).toHaveBeenCalledWith(1, 1, 1);
        expect(syncEngine.writeAssets).toHaveBeenCalledTimes(1);
        expect(syncEngine.writeAssets).toHaveBeenCalledWith(diffStateReturnValue[0]);
        expect(writeAssetsCompletedEvent).toHaveBeenCalledTimes(1);
        expect(writeAlbumsEvent).toHaveBeenCalledTimes(1);
        expect(writeAlbumsEvent).toHaveBeenCalledWith(1, 1, 1);
        expect(syncEngine.writeAlbums).toHaveBeenCalledTimes(1);
        expect(syncEngine.writeAlbums).toHaveBeenCalledWith(diffStateReturnValue[1]);
        expect(writeAlbumCompletedEvent).toHaveBeenCalledTimes(1);
        expect(writeCompletedEvent).toHaveBeenCalledTimes(1);
    });
});

describe(`Handle processing queue`, () => {
    describe(`Handle asset queue`, () => {
        let writeAssetCompleteEvent: jest.Mock<UnknownFunction>;

        beforeEach(() => {
            syncEngine.photosLibrary.writeAsset = jest.fn<typeof syncEngine.photosLibrary.writeAsset>()
                .mockResolvedValue();
            syncEngine.photosLibrary.deleteAsset = jest.fn<typeof syncEngine.photosLibrary.deleteAsset>()
                .mockResolvedValue();
            syncEngine.icloud.photos.downloadAsset = jest.fn<typeof syncEngine.icloud.photos.downloadAsset>()
                .mockResolvedValue({} as any);

            writeAssetCompleteEvent = mockedResourceManager.spyOnEvent(iCPSEventSyncEngine.WRITE_ASSET_COMPLETED);
        });

        test(`Empty processing queue`, async () => {
            await syncEngine.writeAssets([[], [], []]);

            expect(syncEngine.photosLibrary.writeAsset).not.toHaveBeenCalled();
            expect(syncEngine.photosLibrary.deleteAsset).not.toHaveBeenCalled();
            expect(syncEngine.icloud.photos.downloadAsset).not.toHaveBeenCalled();
            expect(writeAssetCompleteEvent).not.toHaveBeenCalled();
        });

        test(`Only deleting`, async () => {
            const asset1 = new Asset(`somechecksum1`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.EDIT, `test1`, `somekey`, `somechecksum1`, `https://icloud.com`, `somerecordname1`, false);
            const asset2 = new Asset(`somechecksum2`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.EDIT, `test2`, `somekey`, `somechecksum2`, `https://icloud.com`, `somerecordname2`, false);
            const asset3 = new Asset(`somechecksum3`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.ORIG, `test3`, `somekey`, `somechecksum3`, `https://icloud.com`, `somerecordname3`, false);
            const toBeDeleted = [asset1, asset2, asset3];

            await syncEngine.writeAssets([toBeDeleted, [], []]);

            expect(syncEngine.photosLibrary.writeAsset).not.toHaveBeenCalled();
            expect(syncEngine.photosLibrary.deleteAsset).toHaveBeenCalledTimes(3);
            expect(syncEngine.photosLibrary.deleteAsset).toHaveBeenNthCalledWith(1, asset1);
            expect(syncEngine.photosLibrary.deleteAsset).toHaveBeenNthCalledWith(2, asset2);
            expect(syncEngine.photosLibrary.deleteAsset).toHaveBeenNthCalledWith(3, asset3);
            expect(syncEngine.icloud.photos.downloadAsset).not.toHaveBeenCalled();
            expect(writeAssetCompleteEvent).not.toHaveBeenCalled();
        });

        test(`Only adding`, async () => {
            const asset1 = new Asset(`somechecksum1`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.EDIT, `test1`, `somekey`, `somechecksum1`, `https://icloud.com`, `somerecordname1`, false);
            const asset2 = new Asset(`somechecksum2`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.EDIT, `test2`, `somekey`, `somechecksum2`, `https://icloud.com`, `somerecordname2`, false);
            const asset3 = new Asset(`somechecksum3`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.ORIG, `test3`, `somekey`, `somechecksum3`, `https://icloud.com`, `somerecordname3`, false);
            const toBeAdded = [asset1, asset2, asset3];

            await syncEngine.writeAssets([[], toBeAdded, []]);

            expect(syncEngine.icloud.photos.downloadAsset).toHaveBeenCalledTimes(3);
            expect(syncEngine.icloud.photos.downloadAsset).toHaveBeenNthCalledWith(1, asset1);
            expect(syncEngine.icloud.photos.downloadAsset).toHaveBeenNthCalledWith(2, asset2);
            expect(syncEngine.icloud.photos.downloadAsset).toHaveBeenNthCalledWith(3, asset3);

            expect(syncEngine.photosLibrary.writeAsset).toHaveBeenCalledTimes(3);
            expect(writeAssetCompleteEvent).toHaveBeenCalledTimes(3);
            expect(writeAssetCompleteEvent).toHaveBeenNthCalledWith(1, `somechecksum1`);
            expect(writeAssetCompleteEvent).toHaveBeenNthCalledWith(2, `somechecksum2`);
            expect(writeAssetCompleteEvent).toHaveBeenNthCalledWith(3, `somechecksum3`);

            expect(syncEngine.photosLibrary.deleteAsset).not.toHaveBeenCalled();
        });

        test(`Adding & deleting`, async () => {
            const asset1 = new Asset(`somechecksum1`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.EDIT, `test1`, `somekey`, `somechecksum1`, `https://icloud.com`, `somerecordname1`, false);
            const asset2 = new Asset(`somechecksum2`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.EDIT, `test2`, `somekey`, `somechecksum2`, `https://icloud.com`, `somerecordname2`, false);
            const asset3 = new Asset(`somechecksum3`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.ORIG, `test3`, `somekey`, `somechecksum3`, `https://icloud.com`, `somerecordname3`, false);
            const asset4 = new Asset(`somechecksum4`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.EDIT, `test4`, `somekey`, `somechecksum4`, `https://icloud.com`, `somerecordname4`, false);
            const asset5 = new Asset(`somechecksum5`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.EDIT, `test5`, `somekey`, `somechecksum5`, `https://icloud.com`, `somerecordname5`, false);
            const asset6 = new Asset(`somechecksum6`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.ORIG, `test6`, `somekey`, `somechecksum6`, `https://icloud.com`, `somerecordname6`, false);
            const toBeAdded = [asset1, asset2, asset3];
            const toBeDeleted = [asset4, asset5, asset6];

            await syncEngine.writeAssets([toBeDeleted, toBeAdded, []]);

            expect(syncEngine.icloud.photos.downloadAsset).toHaveBeenCalledTimes(3);
            expect(syncEngine.icloud.photos.downloadAsset).toHaveBeenNthCalledWith(1, asset1);
            expect(syncEngine.icloud.photos.downloadAsset).toHaveBeenNthCalledWith(2, asset2);
            expect(syncEngine.icloud.photos.downloadAsset).toHaveBeenNthCalledWith(3, asset3);

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
        beforeEach(() => {
            syncEngine.photosLibrary.cleanArchivedOrphans = jest.fn<typeof syncEngine.photosLibrary.cleanArchivedOrphans>()
                .mockResolvedValue();
            syncEngine.photosLibrary.stashArchivedAlbum = jest.fn<typeof syncEngine.photosLibrary.stashArchivedAlbum>()
                .mockReturnValue({} as any);
            syncEngine.photosLibrary.retrieveStashedAlbum = jest.fn<typeof syncEngine.photosLibrary.retrieveStashedAlbum>()
                .mockReturnValue({} as any);
            syncEngine.photosLibrary.writeAlbum = jest.fn<typeof syncEngine.photosLibrary.writeAlbum>()
                .mockReturnValue();
            syncEngine.photosLibrary.deleteAlbum = jest.fn<typeof syncEngine.photosLibrary.deleteAlbum>()
                .mockReturnValue();
        });

        test(`Empty processing queue`, async () => {
            await syncEngine.writeAlbums([[], [], []]);

            expect(syncEngine.photosLibrary.cleanArchivedOrphans).toHaveBeenCalled();
            expect(syncEngine.photosLibrary.stashArchivedAlbum).not.toHaveBeenCalled();
            expect(syncEngine.photosLibrary.retrieveStashedAlbum).not.toHaveBeenCalled();
            expect(syncEngine.photosLibrary.writeAlbum).not.toHaveBeenCalled();
            expect(syncEngine.photosLibrary.deleteAlbum).not.toHaveBeenCalled();
        });

        test(`Only deleting`, async () => {
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
            // Needs to be called from the furthest node
            expect(syncEngine.photosLibrary.deleteAlbum).toHaveBeenNthCalledWith(1, albumChildChild);
            expect(syncEngine.photosLibrary.deleteAlbum).toHaveBeenNthCalledWith(2, albumChild);
            expect(syncEngine.photosLibrary.deleteAlbum).toHaveBeenNthCalledWith(3, albumParent);
        });

        test(`Only adding`, async () => {
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
            // Needs to be called from the furthest node
            expect(syncEngine.photosLibrary.writeAlbum).toHaveBeenNthCalledWith(1, albumParent);
            expect(syncEngine.photosLibrary.writeAlbum).toHaveBeenNthCalledWith(2, albumChild);
            expect(syncEngine.photosLibrary.writeAlbum).toHaveBeenNthCalledWith(3, albumChildChild);
        });

        test(`Adding & deleting`, async () => {
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
            // Needs to be called from the furthest node
            expect(syncEngine.photosLibrary.deleteAlbum).toHaveBeenNthCalledWith(1, removeAlbumChildChild);
            expect(syncEngine.photosLibrary.deleteAlbum).toHaveBeenNthCalledWith(2, removeAlbumChild);
            expect(syncEngine.photosLibrary.deleteAlbum).toHaveBeenNthCalledWith(3, removeAlbumParent);

            expect(syncEngine.photosLibrary.writeAlbum).toHaveBeenCalledTimes(3);
            // Needs to be called from the closest node
            expect(syncEngine.photosLibrary.writeAlbum).toHaveBeenNthCalledWith(1, addAlbumParent);
            expect(syncEngine.photosLibrary.writeAlbum).toHaveBeenNthCalledWith(2, addAlbumChild);
            expect(syncEngine.photosLibrary.writeAlbum).toHaveBeenNthCalledWith(3, addAlbumChildChild);
        });

        test(`Adding - HANDLER_EVENT fired on error`, async () => {
            const handlerEvent = mockedResourceManager.spyOnHandlerEvent();

            const addAlbumParent = new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``);
            const addAlbumChild = new Album(`someUUID1-1`, AlbumType.ALBUM, `someAlbumName2`, `someUUID1`);
            const addAlbumChildChild = new Album(`someUUID1-1-1`, AlbumType.ALBUM, `someAlbumName3`, `someUUID1-1`);

            syncEngine.photosLibrary.writeAlbum = jest.fn<typeof syncEngine.photosLibrary.writeAlbum>()
                .mockImplementationOnce(() => {
                    throw new Error(`Unable to write album`);
                });

            // The order here does not matter
            await syncEngine.writeAlbums([[], [addAlbumChild, addAlbumParent, addAlbumChildChild], []]);

            expect(syncEngine.photosLibrary.cleanArchivedOrphans).toHaveBeenCalled();
            expect(syncEngine.photosLibrary.stashArchivedAlbum).not.toHaveBeenCalled();
            expect(syncEngine.photosLibrary.retrieveStashedAlbum).not.toHaveBeenCalled();

            expect(syncEngine.photosLibrary.deleteAlbum).toHaveBeenCalledTimes(0);

            expect(syncEngine.photosLibrary.writeAlbum).toHaveBeenCalledTimes(3);
            // Needs to be called from the closest node
            expect(syncEngine.photosLibrary.writeAlbum).toHaveBeenNthCalledWith(1, addAlbumParent);
            expect(syncEngine.photosLibrary.writeAlbum).toHaveBeenNthCalledWith(2, addAlbumChild);
            expect(syncEngine.photosLibrary.writeAlbum).toHaveBeenNthCalledWith(3, addAlbumChildChild);

            expect(handlerEvent).toHaveBeenCalledWith(new Error(`Unable to add album`));
        });

        test(`Deleting - HANDLER_EVENT fired on error`, async () => {
            const handlerEvent = mockedResourceManager.spyOnHandlerEvent();

            const removeAlbumParent = new Album(`someUUID2`, AlbumType.ALBUM, `someAlbumName4`, ``);
            const removeAlbumChild = new Album(`someUUID2-1`, AlbumType.ALBUM, `someAlbumName5`, `someUUID2`);
            const removeAlbumChildChild = new Album(`someUUID2-1-1`, AlbumType.ALBUM, `someAlbumName6`, `someUUID2-1`);

            syncEngine.photosLibrary.deleteAlbum = jest.fn<typeof syncEngine.photosLibrary.deleteAlbum>()
                .mockImplementationOnce(() => {
                    throw new Error(`Unable to delete album`);
                });

            // The order here does not matter
            await syncEngine.writeAlbums([[removeAlbumChild, removeAlbumParent, removeAlbumChildChild], [], []]);

            expect(syncEngine.photosLibrary.cleanArchivedOrphans).toHaveBeenCalled();
            expect(syncEngine.photosLibrary.stashArchivedAlbum).not.toHaveBeenCalled();
            expect(syncEngine.photosLibrary.retrieveStashedAlbum).not.toHaveBeenCalled();

            expect(syncEngine.photosLibrary.deleteAlbum).toHaveBeenCalledTimes(3);
            // Needs to be called from the furthest node
            expect(syncEngine.photosLibrary.deleteAlbum).toHaveBeenNthCalledWith(1, removeAlbumChildChild);
            expect(syncEngine.photosLibrary.deleteAlbum).toHaveBeenNthCalledWith(2, removeAlbumChild);
            expect(syncEngine.photosLibrary.deleteAlbum).toHaveBeenNthCalledWith(3, removeAlbumParent);

            expect(syncEngine.photosLibrary.writeAlbum).toHaveBeenCalledTimes(0);

            expect(handlerEvent).toHaveBeenCalledWith(new Error(`Unable to delete album`));
        });

        describe(`Archive albums`, () => {
            test(`Remote album (locally archived) deleted`, async () => {
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
                // Needs to be called from the furthest node
                expect(syncEngine.photosLibrary.deleteAlbum).toHaveBeenNthCalledWith(1, albumChild);
                expect(syncEngine.photosLibrary.deleteAlbum).toHaveBeenNthCalledWith(2, albumParent);
            });

            test(`Remote album (locally archived) moved`, async () => {
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

            test(`Retrieving from stash - ERROR_HANDLE fired on error`, async () => {
                const album1 = new Album(`someUUID1`, AlbumType.ARCHIVED, `someAlbumName1`, ``);
                const album2 = new Album(`someUUID2`, AlbumType.ARCHIVED, `someAlbumName2`, ``);

                const handlerEvent = mockedResourceManager.spyOnHandlerEvent();
                syncEngine.photosLibrary.retrieveStashedAlbum = jest.fn<typeof syncEngine.photosLibrary.retrieveStashedAlbum>()
                    .mockImplementationOnce(() => {
                        throw new Error(`Unable to retrieve album`);
                    });

                syncEngine.writeAlbums([[], [album1, album2], []]);

                expect(syncEngine.photosLibrary.retrieveStashedAlbum).toHaveBeenCalledTimes(2);
                expect(syncEngine.photosLibrary.retrieveStashedAlbum).toHaveBeenNthCalledWith(1, album1);
                expect(syncEngine.photosLibrary.retrieveStashedAlbum).toHaveBeenNthCalledWith(2, album2);

                expect(syncEngine.photosLibrary.writeAlbum).not.toHaveBeenCalled();

                expect(handlerEvent).toHaveBeenCalledWith(new Error(`Unable to retrieve stashed archived album`));
            });

            test(`Stash - ERROR_HANDLE fired on error`, async () => {
                const album1 = new Album(`someUUID1`, AlbumType.ARCHIVED, `someAlbumName1`, ``);
                const album2 = new Album(`someUUID2`, AlbumType.ARCHIVED, `someAlbumName2`, ``);

                const handlerEvent = mockedResourceManager.spyOnHandlerEvent();
                syncEngine.photosLibrary.stashArchivedAlbum = jest.fn<typeof syncEngine.photosLibrary.stashArchivedAlbum>()
                    .mockImplementationOnce(() => {
                        throw new Error(`Unable to retrieve album`);
                    });

                syncEngine.writeAlbums([[album1, album2], [], []]);

                expect(syncEngine.photosLibrary.stashArchivedAlbum).toHaveBeenCalledTimes(2);
                expect(syncEngine.photosLibrary.stashArchivedAlbum).toHaveBeenNthCalledWith(1, album2);
                expect(syncEngine.photosLibrary.stashArchivedAlbum).toHaveBeenNthCalledWith(2, album1);

                expect(syncEngine.photosLibrary.writeAlbum).not.toHaveBeenCalled();

                expect(handlerEvent).toHaveBeenCalledWith(new Error(`Unable to stash archived album`));
            });
        });
    });
});