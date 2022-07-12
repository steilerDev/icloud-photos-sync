import path from 'path';
import crypto from 'crypto';
import {AssetID} from '../../icloud/icloud-photos/query-parser.js';
import {FileType} from './file-type.js';

export class Asset {
    fileChecksum: string;
    size: number;
    wrappingKey: string;
    referenceChecksum: string;
    downloadURL: string;

    fileType: FileType;

    constructor(fileChecksum: string, size: number, wrappingKey: string, referenceChecksum: string, downloadURL: string, fileType: string) {
        this.fileChecksum = fileChecksum;
        this.size = size;
        this.wrappingKey = wrappingKey;
        this.referenceChecksum = referenceChecksum;
        this.downloadURL = downloadURL;
        this.fileType = new FileType(fileType);
    }

    static fromCPL(asset: AssetID, assetType: string): Asset {
        return new Asset(
            asset.fileChecksum,
            asset.size,
            asset.wrappingKey,
            asset.referenceChecksum,
            asset.downloadURL,
            assetType,
        );
    }

    /**
     * Diffes the two assets, with the remote asset taking precedence
     * @param localAsset - The local asset
     * @param remoteAsset - The asset acquired from the remote API
     * @returns A touple of assets: A list of assets that need to be deleted | A list of assets that need to be created
     */
    static getAssetDiff(localAsset: Asset, remoteAsset: Asset): [Asset[], Asset[]] {
        const toBeDeleted: Asset[] = [];
        const toBeAdded: Asset[] = [];

        if (localAsset) { // Current asset exists locally
            // localAsset.verify()
            if (!localAsset.equal(remoteAsset)) {
                // There has been a change, removing local copy and adding remote
                toBeDeleted.push(localAsset);
                toBeAdded.push(remoteAsset);
            } // Else there has been no change, therefore no need to add / remove
        } else if (remoteAsset) { // There is no local current asset, therefore adding it
            toBeAdded.push(remoteAsset);
        }

        return [toBeDeleted, toBeAdded];
    }

    isObject(): boolean {
        return true;
    }

    equal(asset: Asset): boolean {
        return asset
                && this.fileChecksum === asset.fileChecksum
                && this.size === asset.size
                && this.wrappingKey === asset.wrappingKey
                && this.referenceChecksum === asset.referenceChecksum
                && this.downloadURL === asset.downloadURL
                && this.fileType.equal(asset.fileType);
    }

    getAssetFilePath(folder: string) {
        return path.format({
            dir: folder,
            name: this.getAssetFilename(),
        });
    }

    getAssetFilename(): string {
        return path.format({
            name: Buffer.from(this.fileChecksum, `base64`).toString(`base64url`), // Since checksum seems to be base64 encoded
            ext: this.fileType.getExtension(),
        });
    }

    verifySize(file: Buffer): boolean {
        return file.byteLength === this.size;
    }

    verifyChecksum(file: Buffer): boolean {
        return true;
        /*
        Const hashes = [
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
        }); */
    }

    getDisplayName(): string {
        return this.fileChecksum;
    }
}