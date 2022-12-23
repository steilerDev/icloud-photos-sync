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
     * @returns The newly created FileType
     * @throws An Error, if the provided descriptor is unknown to the script
     */
    static fromAssetType(descriptor: string): FileType {
        if (!EXT[descriptor]) {
            throw new Error(`Unknown filetype descriptor: ${descriptor}`);
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
            throw new Error(`Unknown filetype extension: ${ext}`);
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