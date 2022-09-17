import { PhotosLibrary } from "../../src/lib/photos-library/photos-library";
import {appDataDir} from './config'

/**
 * Creates a Photo Library object pointing to the default location
 * @returns 
 */
export function photosLibraryFactory(): PhotosLibrary {
    const opts = {
        "dataDir": appDataDir,
    };
    return new PhotosLibrary(opts);
}