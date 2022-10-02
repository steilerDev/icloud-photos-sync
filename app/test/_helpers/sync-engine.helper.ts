import {jest} from '@jest/globals';
import {AxiosResponse} from 'axios';
import {iCloud} from "../../src/lib/icloud/icloud";
import {iCloudPhotos} from "../../src/lib/icloud/icloud-photos/icloud-photos";
import {Album} from '../../src/lib/photos-library/model/album';
import {PhotosLibrary} from "../../src/lib/photos-library/photos-library";
import {SyncEngine} from "../../src/lib/sync-engine/sync-engine";
import * as Config from "./_config";

export function syncEngineFactory(): SyncEngine {
    const syncEngine = new SyncEngine(
        {
            "downloadThreads": 10,
            "maxRetries": -1,
        },
        new iCloud({
            "username": Config.username,
            "password": Config.password,
            "trustToken": Config.trustToken,
            "dataDir": Config.appDataDir,
        }),
        new PhotosLibrary({
            "dataDir": Config.appDataDir,
        }),
    );
    syncEngine.iCloud.photos = new iCloudPhotos(syncEngine.iCloud.auth);
    return syncEngine;
}

export function mockSyncEngineForAssetQueue(syncEngine: SyncEngine): SyncEngine {
    syncEngine.photosLibrary.verifyAsset = jest.fn(() => false);
    syncEngine.photosLibrary.writeAsset = jest.fn(async () => {});
    syncEngine.photosLibrary.deleteAsset = jest.fn(async () => {});
    syncEngine.iCloud.photos.downloadAsset = jest.fn(async () => ({} as AxiosResponse<any, any>));
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