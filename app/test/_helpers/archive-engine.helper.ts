import {ArchiveEngine} from '../../src/lib/archive-engine/archive-engine';
import {iCloud} from '../../src/lib/icloud/icloud';
import {PhotosLibrary} from '../../src/lib/photos-library/photos-library';
import {ResourceManager} from '../../src/lib/resource-manager/resource-manager';

export function archiveEngineFactory(_remoteDelete: boolean = true): ArchiveEngine {
    ResourceManager._instance!._resources.remoteDelete = _remoteDelete;
    return new ArchiveEngine(new iCloud(), new PhotosLibrary());
}