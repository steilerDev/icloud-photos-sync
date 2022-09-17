import { iCloud } from "../../src/lib/icloud/icloud";
import { iCloudPhotos } from "../../src/lib/icloud/icloud-photos/icloud-photos";
import { PhotosLibrary } from "../../src/lib/photos-library/photos-library";
import { SyncEngine } from "../../src/lib/sync-engine/sync-engine";
import { appDataDir } from "./config";

export function syncEngineFactory(): SyncEngine {
    const syncEngine = new SyncEngine(
        {
            "downloadThreads": 10,
            "maxRetry": -1,
        },
        new iCloud({
            "username": `steilerdev@web.de`,
            "password": `some-pass`,
            "trustToken": `token`,
            "dataDir": appDataDir,
        }),
        new PhotosLibrary({
            "dataDir": appDataDir,
        }),
    );
    syncEngine.iCloud.photos = new iCloudPhotos(syncEngine.iCloud.auth);
    return syncEngine;
}