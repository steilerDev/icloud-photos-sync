import {PhotosLibrary} from "../../src/lib/photos-library/photos-library";
import {appWithOptions} from "./app-factory.helper";

import {appDataDir} from './_config';

/**
 * Creates a Photo Library object pointing to the default location
 * @returns The newly created library object
 */
export function photosLibraryFactory(): PhotosLibrary {
    const opts = {
        "dataDir": appDataDir,
    };
    return new PhotosLibrary(appWithOptions(opts));
}