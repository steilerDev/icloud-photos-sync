import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import {RecordState} from '../photos-library.constants.js';
import {pEvent} from 'p-event';

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
}

export class Asset {
    fileChecksum: string;
    size: number;
    wrappingKey: string;
    referenceChecksum: string;
    downloadURL: string;

    fileType: FileType;

    recordState: RecordState;

    assetName: string;

    static parseAssetFromJson(json: any): Asset {
        const newAsset = new Asset();

        if (json.assetName) {
            newAsset.assetName = json.assetName;
        } else {
            throw new Error(`Unable to construct asset from json: AssetName not found (${JSON.stringify(json)})`);
        }

        if (json.fileChecksum) {
            newAsset.fileChecksum = json.fileChecksum;
        } else {
            throw new Error(`Unable to construct asset from json: File Checksum not found (${JSON.stringify(json)})`);
        }

        if (`${json.size}` && !isNaN(parseInt(json.size, 10))) {
            newAsset.size = parseInt(json.size, 10);
        } else {
            throw new Error(`Unable to construct asset from json: Size not found (${JSON.stringify(json)})`);
        }

        if (json.wrappingKey) {
            newAsset.wrappingKey = json.wrappingKey;
        } else {
            throw new Error(`Unable to construct asset from json: Wrapping Key not found (${JSON.stringify(json)})`);
        }

        if (json.referenceChecksum) {
            newAsset.referenceChecksum = json.referenceChecksum;
        } else {
            throw new Error(`Unable to construct asset from json: Reference Checksum not found (${JSON.stringify(json)})`);
        }

        if (json.downloadURL) {
            newAsset.downloadURL = json.downloadURL;
        } else {
            throw new Error(`Unable to construct asset from json: Download URL not found (${JSON.stringify(json)})`);
        }

        if (json.recordState) {
            newAsset.recordState = json.recordState;
        } else {
            newAsset.recordState = RecordState.NEW;
        }

        if (json.fileType) {
            newAsset.fileType = new FileType(json.fileType);
        } else {
            throw new Error(`Unable to construct asset from json: FileType not found (${JSON.stringify(json)})`);
        }

        return newAsset;
    }

    getAssetFilePath(folder: string) {
        return path.format({
            dir: folder,
            name: this.getAssetFilename(),
        });
    }

    getAssetFilename(edited: boolean = false): string {
        return path.format({
            name: edited ? this.assetName + `.edited` : this.assetName,
            ext: this.fileType.getExtension(),
        });
    }

    async write(targetFolder: string, data: any): Promise<void> {
        const writeStream = fs.createWriteStream(this.getAssetFilePath(targetFolder));

        data.pipe(writeStream);
        return pEvent(writeStream, `close`);
    }

    /**
     * Verifies a local file against this asset record
     * @param folder - The storage folder of the file
     * @returns True, if file
     */
    verify(folder: string): boolean {
        try {
            const location = this.getAssetFilePath(folder);
            if (fs.existsSync(location)) {
                const file = fs.readFileSync(location);
                return this.verifySize(file) && this.verifyChecksum(file);
            }

            return false;
        } catch (err) {
            return false;
        }
    }

    verifySize(file: Buffer): boolean {
        return file.byteLength === this.size;
    }

    verifyChecksum(file: Buffer): boolean {
        return true;
        const hashes = [
            `BLAKE2b512`,
            `BLAKE2s256`,
            //          `MD4`,
            `MD5`,
            `MD6`,
            `MD5-SHA1`,
            //           `RIPEMD160`,
            `SHA1`,
            `SHA224`,
            `SHA256`,
            `SHA3-224`,
            `SHA3-256`,
            `SHA3-384`,
            `SHA3-512`,
            `SHA384`,
            `SHA512`,
            `SHA512-224`,
            `SHA512-256`,
            //           `SHAKE128`,
            //          `SHAKE256`,
            `SM3`,
            //            `whirlpool`,
        ];
        const encodings = [
        //    `ascii`,
        //    `utf8`,
        //    `utf-8`,
        //    `utf16le`,
        //    `ucs2`,
        //    `ucs-2`,
            `base64`,
            `base64url`,
            //    `latin1`,
            //    `binary`,
            // `hex`,
        ];
        const key = Buffer.from(this.wrappingKey);// , `base64`);
        hashes.forEach(hash => {
            encodings.forEach(encoding => {
                if (Buffer.isEncoding(encoding)) {
                    try {
                        const hmacChecksum = crypto.createHmac(hash, key)
                            .update(file)
                            .digest()
                            .toString(encoding);

                        const checksum = crypto.createHash(hash)
                            .update(file)
                            .digest()
                            .toString(encoding);

                        if (checksum.includes(this.fileChecksum)) {
                            console.log(`MATCH:     ${checksum} - ${hash}/${encoding}`);
                        } else {
                            console.log(`NO match:  ${checksum} - ${hash}/${encoding}`);
                        }

                        if (hmacChecksum.includes(this.fileChecksum)) {
                            console.log(`MATCH:     ${hmacChecksum} - ${hash}/${encoding}`);
                        } else {
                            console.log(`NO match:  ${hmacChecksum} - ${hash}/${encoding}`);
                        }
                    } catch (error) {
                        console.log(`Problem with ${encoding} + ${hash}: ${error.message}`);
                    }
                }
            });
        });
    }
}