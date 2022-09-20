import {PhotosLibrary} from "../../src/lib/photos-library/photos-library";
import {appDataDir} from './config';

/**
 * Creates a Photo Library object pointing to the default location
 * @returns The newly created library object
 */
export function photosLibraryFactory(): PhotosLibrary {
    const opts = {
        "dataDir": appDataDir,
    };
    return new PhotosLibrary(opts);
}