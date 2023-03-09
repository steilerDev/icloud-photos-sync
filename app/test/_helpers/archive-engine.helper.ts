import {ArchiveEngine} from '../../src/lib/archive-engine/archive-engine';
import {iCloud} from '../../src/lib/icloud/icloud';
import {PhotosLibrary} from '../../src/lib/photos-library/photos-library';
import {appWithOptions} from './app-factory.helper';
import * as Config from './_config';

export function archiveEngineFactory(_remoteDelete: boolean = true): ArchiveEngine {
    return new ArchiveEngine(
        appWithOptions({
            'remoteDelete': _remoteDelete,
        },
        new PhotosLibrary(appWithOptions({
            "dataDir": Config.appDataDir,
        })),
        new iCloud(appWithOptions({
            "username": Config.username,
            "password": Config.password,
            "trustToken": Config.trustToken,
            "dataDir": Config.appDataDir,
            "metadataRate": Config.metadataRate,
        })),
        ),
    );
}