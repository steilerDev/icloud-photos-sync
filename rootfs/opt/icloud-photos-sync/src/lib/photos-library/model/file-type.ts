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

    constructor(descriptor: string) {
        if (!EXT[descriptor]) {
            throw new Error(`Unknown filetype descriptor: ${descriptor}`);
        }

        this.descriptor = descriptor;
    }

    getExtension(): string {
        return `.` + EXT[this.descriptor];
    }

    toJSON(): string {
        return this.descriptor;
    }

    equal(fileType: FileType) {
        return fileType && this.descriptor === fileType.descriptor;
    }
}