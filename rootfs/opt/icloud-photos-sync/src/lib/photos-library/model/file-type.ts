const EXT = {
    'public.png': `png`,
    'public.mpeg-4': `mp4`,
    'public.jpeg': `jpeg`,
    'com.apple.quicktime-movie': `mov`,
    'public.heic': `heic`,
    'com.sony.arw-raw-image': `arw`,
};

export class FileType {
    descriptor: string;

    private constructor(descriptor: string) {
        this.descriptor = descriptor;
    }

    static fromAssetType(descriptor: string): FileType {
        if (!EXT[descriptor]) {
            throw new Error(`Unknown filetype descriptor: ${descriptor}`);
        }

        return new FileType(descriptor);
    }

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

    getExtension(): string {
        return `.` + EXT[this.descriptor];
    }

    toJSON(): string {
        return this.descriptor;
    }

    toString(): string {
        return this.descriptor;
    }

    equal(fileType: FileType) {
        return fileType && this.descriptor === fileType.descriptor;
    }
}