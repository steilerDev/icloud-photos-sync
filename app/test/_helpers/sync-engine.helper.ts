import {jest} from '@jest/globals';
import {AxiosResponse} from 'axios';
import {iCloud} from "../../src/lib/icloud/icloud";
import {iCloudPhotos} from "../../src/lib/icloud/icloud-photos/icloud-photos";
import {PhotosLibrary} from "../../src/lib/photos-library/photos-library";
import {SyncEngine} from "../../src/lib/sync-engine/sync-engine";
import * as Config from "./_config";

export function syncEngineFactory(): SyncEngine {
    const syncEngine = new SyncEngine(
        {
            "downloadThreads": 10,
            "maxRetry": -1,
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