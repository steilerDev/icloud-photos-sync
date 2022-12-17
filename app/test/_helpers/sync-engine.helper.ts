import {jest} from '@jest/globals';
import {AxiosResponse} from 'axios';
import {iCloud} from "../../src/lib/icloud/icloud";
import {iCloudPhotos} from "../../src/lib/icloud/icloud-photos/icloud-photos";
import {CPLAlbum, CPLAsset, CPLMaster} from '../../src/lib/icloud/icloud-photos/query-parser';
import {Album, AlbumType} from '../../src/lib/photos-library/model/album';
import {Asset} from '../../src/lib/photos-library/model/asset';
import {FileType} from '../../src/lib/photos-library/model/file-type';
import {PLibraryEntities, PLibraryProcessingQueues} from '../../src/lib/photos-library/model/photos-entity';
import {PhotosLibrary} from "../../src/lib/photos-library/photos-library";
import {SyncEngine} from "../../src/lib/sync-engine/sync-engine";
import {appWithOptions} from './app-factory';
import * as Config from "./_config";

export function syncEngineFactory(): SyncEngine {
    const syncEngine = new SyncEngine(
        appWithOptions({
            "downloadThreads": 10,
            "maxRetries": -1,
        },
        new PhotosLibrary(appWithOptions({
            "dataDir": Config.appDataDir,
        })),
        new iCloud(appWithOptions({
            "username": Config.username,
            "password": Config.password,
            "trustToken": Config.trustToken,
            "dataDir": Config.appDataDir,
        })),
        ),
    );
    syncEngine.icloud.photos = new iCloudPhotos(syncEngine.icloud.auth);
    return syncEngine;
}

export function mockSyncEngineForAssetQueue(syncEngine: SyncEngine): SyncEngine {
    syncEngine.photosLibrary.verifyAsset = jest.fn(() => false);
    syncEngine.photosLibrary.writeAsset = jest.fn(async () => {});
    syncEngine.photosLibrary.deleteAsset = jest.fn(async () => {});
    syncEngine.icloud.photos.downloadAsset = jest.fn(async () => ({} as AxiosResponse<any, any>));
    return syncEngine;
}

export function mockSyncEngineForAlbumQueue(syncEngine: SyncEngine): SyncEngine {
    syncEngine.photosLibrary.cleanArchivedOrphans = jest.fn(() => Promise.resolve());
    syncEngine.photosLibrary.stashArchivedAlbum = jest.fn(_album => {});
    syncEngine.photosLibrary.retrieveStashedAlbum = jest.fn(_album => {});
    syncEngine.photosLibrary.writeAlbum = jest.fn(_album => {});
    syncEngine.photosLibrary.deleteAlbum = jest.fn(_album => {});

    return syncEngine;
}

/**
 * This function checks, if the provided album queue is 'in order'
 * Order is defined as follows: For every album in the array, its parent's index is always smaller than the index of the album (parent is 'in front' of all of its children)
 * @param albumQueue - The album queue to check
 * @returns True if for every album in the array, its parent's index is always smaller than the index of the album (parent is 'in front' of all of its children)
 */
export function queueIsSorted(albumQueue: Album[]): boolean {
    return albumQueue.every((currentAlbum, index) => {
        if (currentAlbum.parentAlbumUUID === ``) { // If the album is in the root folder, it can be ignored
            return true;
        } // Album has a parent

        return albumQueue // FindIndex will return -1 if there is no match, we hope that there is no match
            .slice(index) // Reducing search space, since we need to check if the parent is 'behind' the current album
            .findIndex(potentialParentAlbum => currentAlbum.parentAlbumUUID === potentialParentAlbum.getUUID()) === -1; // Get the index of the album
    });
}

export const fetchAndLoadStateReturnValue = [
    [new Asset(`someChecksum`, 50, FileType.fromExtension(`png`), 10)],
    [new Album(`someUUID`, AlbumType.ALBUM, `someAlbumName`, ``)],
    {'someChecksum': new Asset(`someChecksum`, 50, FileType.fromExtension(`png`), 10)},
    {'someUUID': new Album(`someUUID`, AlbumType.ALBUM, `someAlbumName`, ``)},
] as [Asset[], Album[], PLibraryEntities<Asset>, PLibraryEntities<Album>];

export const diffStateReturnValue = [
    [
        [new Asset(`someChecksum1`, 50, FileType.fromExtension(`png`), 10)],
        [new Asset(`someChecksum2`, 60, FileType.fromExtension(`png`), 20)],
        [new Asset(`someChecksum3`, 70, FileType.fromExtension(`png`), 30)],
    ], [
        [new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``)],
        [new Album(`someUUID2`, AlbumType.ALBUM, `someAlbumName2`, ``)],
        [new Album(`someUUID3`, AlbumType.ALBUM, `someAlbumName3`, ``)],
    ],
] as [PLibraryProcessingQueues<Asset>, PLibraryProcessingQueues<Album>];

export const fetchAllPictureRecordsReturnValue = [
    [new CPLAsset()],
    [new CPLMaster()],
] as [CPLAsset[], CPLMaster[]];

export const convertCPLAssetsReturnValue = [
    new Asset(`someChecksum`, 50, FileType.fromExtension(`png`), 10),
] as Asset[];

export const fetchAllAlbumRecordsReturnValue = [
    new CPLAlbum(),
] as CPLAlbum[];

export const convertCPLAlbumsReturnValue = [
    new Album(`someUUID`, AlbumType.ALBUM, `someAlbumName`, ``),
] as Album[];

export const loadAssetsReturnValue = {
    'someChecksum': new Asset(`someChecksum`, 50, FileType.fromExtension(`png`), 10),
} as PLibraryEntities<Asset>;

export const loadAlbumsReturnValue = {
    'someUUID': new Album(`someUUID`, AlbumType.ALBUM, `someAlbumName`, ``),
} as PLibraryEntities<Album>;

export const getProcessingQueuesReturnValue = [[], [], []];
export const resolveHierarchicalDependenciesReturnValue = [[], [], []] as PLibraryProcessingQueues<Album>;