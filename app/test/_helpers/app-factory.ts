import {iCloudApp} from "../../src/app/icloud-app";
import {iCloud} from "../../src/lib/icloud/icloud";
import {PhotosLibrary} from "../../src/lib/photos-library/photos-library";

/**
 * Creates an iCloudApp object populated for testing
 * @param options - CLI options
 * @param photosLibrary - an initiated photosLibrary for handoff
 * @param icloud  - an initiated icloud object for handoff
 * @returns The iCloudApp object
 */
export function appWithOptions<T extends iCloudApp>(options: any, photosLibrary?: PhotosLibrary, icloud?: iCloud): T {
    const app = {
        options,
    };

    if (photosLibrary) {
        const photosLibraryVarName = "photosLibrary"
        app[photosLibraryVarName] = photosLibrary;
    }

    if (icloud) {
        const icloudVarName = "icloud"
        app[icloudVarName] = icloud;
    }

    return app as T;
}