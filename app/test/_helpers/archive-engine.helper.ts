import {ArchiveEngine} from '../../src/lib/archive-engine/archive-engine';
import {iCloud} from '../../src/lib/icloud/icloud';
import {iCloudPhotos} from '../../src/lib/icloud/icloud-photos/icloud-photos';
import {PhotosLibrary} from '../../src/lib/photos-library/photos-library';
import {appWithOptions} from './app-factory';
import {iCloudAuthFactory} from './icloud-auth.helper';
import * as Config from './_config';

export function archiveEngineFactory(_noRemoteDelete: boolean = false): ArchiveEngine {
    const engine = new ArchiveEngine(
        appWithOptions({
            'noRemoteDelete': _noRemoteDelete,
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
    engine.icloud.photos = new iCloudPhotos(iCloudAuthFactory());
    return engine;
}