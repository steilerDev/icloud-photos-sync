import {iCPSError} from "../../../app/error/error.js";
import {LIBRARY_ERR} from "../../../app/error/error-codes.js";

/**
 * Mapping of backend provided filetype description (key) and actual file extension (value)
 * Incomplete list, due to lack of documentation
 */
const EXT = {
    'public.png': `png`,
    'public.mpeg-4': `mp4`,
    'public.jpeg': `jpeg`,
    'com.apple.quicktime-movie': `mov`,
    'public.heic': `heic`,
    'com.sony.arw-raw-image': `arw`,
    'org.webmproject.webp': `webp`,
    'com.compuserve.gif': `gif`,
    'com.adobe.raw-image': `dng`,
    'public.tiff': `tiff`,
    'public.jpeg-2000': `jp2`,
    'com.truevision.tga-image': `tga`,
    'com.sgi.sgi-image': `sgi`,
    'com.adobe.photoshop-image': `psd`,
    'public.pbm': `pbm`,
    'public.heif': `heif`,
    'com.microsoft.bmp': `bmp`,
    'public.mpeg': `mpg`,
    'com.apple.m4v-video': `m4v`,
    'public.3gpp': `3gp`,
    'public.mpeg-2-video': `m2v`,
    'com.fuji.raw-image': `raf`,
    'com.canon.cr2-raw-image': `cr2`,
    'com.panasonic.rw2-raw-image': `rw2`,
    'com.nikon.nrw-raw-image': `nrw`,
    'com.pentax.raw-image': `pef`,
    'com.nikon.raw-image': `nef`,
    'com.olympus.raw-image': `orf`,
    'public.avi': `avi`,
    'com.adobe.pdf': `pdf`,
};

/**
 * This class represents the type of file a given asset has
 */
export class FileType {
    /**
     * The descriptor, as provided by the backend
     */
    descriptor: string;

    /**
     * Constructs a new FileType
     * @param descriptor - The descriptor as provided by the backend
     */
    private constructor(descriptor: string) {
        this.descriptor = descriptor;
    }

    /**
     * Creates the file type from the backend
     * @param descriptor - The descriptor as provided by the backend
     * @param ext - The extension as provided by the encoded filename
     * @returns The newly created FileType
     * @throws An Error, if the provided descriptor is unknown to the script
     */
    static fromAssetType(descriptor: string, ext: string): FileType {
        if (!EXT[descriptor]) {
            throw new iCPSError(LIBRARY_ERR.UNKNOWN_FILETYPE_DESCRIPTOR)
                .addMessage(`${descriptor} (with potential extension ${ext})`);
        }

        return new FileType(descriptor);
    }

    /**
     * Creates a file type from a file extension
     * @param ext - The file extension of the file
     * @returns The newly created FileType
     * @throws An error, if the provided extension is unknown to the script
     */
    static fromExtension(ext: string): FileType {
        if (ext.startsWith(`.`)) {
            ext = ext.substring(1);
        }

        const descriptor = Object.keys(EXT).find(key => EXT[key] === ext);
        if (!descriptor) {
            throw new iCPSError(LIBRARY_ERR.UNKNOWN_FILETYPE_EXTENSION)
                .addMessage(ext);
        }

        return new FileType(descriptor);
    }

    /**
     *
     * @returns The FileType as a file extension
     */
    getExtension(): string {
        return `.` + EXT[this.descriptor];
    }

    /**
     * Compares the given FileType to this instance
     * @param fileType - A FileType to compare this instance to
     * @returns True, if the given FileType is equal to this instance
     */
    equal(fileType: FileType) {
        return fileType && this.descriptor === fileType.descriptor;
    }
}