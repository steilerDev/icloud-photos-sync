import path from 'path';
import {AssetID} from '../../icloud/icloud-photos/query-parser.js';
import {FileType} from './file-type.js';
import {Stats} from 'fs';

export class Asset {
    fileChecksum: string;
    size: number;
    modified: number;
    fileType: FileType;
    wrappingKey?: string;
    referenceChecksum?: string;
    downloadURL?: string;

    private constructor(fileChecksum: string, size: number, fileType: FileType, modified: number, wrappingKey?: string, referenceChecksum?: string, downloadURL?: string) {
        this.fileChecksum = fileChecksum;
        this.size = size;
        this.fileType = fileType;
        this.modified = modified;
        this.wrappingKey = wrappingKey;
        this.referenceChecksum = referenceChecksum;
        this.downloadURL = downloadURL;
    }

    /**
     *
     * @param asset - The AssetID object returned from the backend
     * @param assetType - The assetType string, describing the filetype
     * @param modified - The modified date as returned from the backend (converted to epoch time in this function, as it is returned in milliseconds)
     * @returns
     */
    static fromCPL(asset: AssetID, assetType: string, modified: number): Asset {
        return new Asset(
            asset.fileChecksum,
            asset.size,
            FileType.fromAssetType(assetType),
            Math.floor(modified / 1000),
            asset.wrappingKey,
            asset.referenceChecksum,
            asset.downloadURL,
        );
    }

    static fromFile(fileName: string, stats: Stats): Asset {
        return new Asset(
            Buffer.from(path.basename(fileName, path.extname(fileName)), `base64url`).toString(`base64`),
            stats.size,
            FileType.fromExtension(path.extname(fileName)),
            Math.floor(stats.mtimeMs / 1000),
        );
    }

    /**
     * Diffes the two assets, with the remote asset taking precedence
     * @param localAsset - The local asset
     * @param remoteAsset - The asset acquired from the remote API
     * @returns A touple of assets: A list of assets that need to be deleted | A list of assets that need to be created
     */
    static getAssetDiff(localAsset: Asset, remoteAsset: Asset): [Asset, Asset] {
        let toBeDeleted: Asset;
        let toBeAdded: Asset;

        if (localAsset) { // Current asset exists locally
            // localAsset.verify()
            if (!localAsset.equal(remoteAsset)) {
                // There has been a change, removing local copy and adding remote
                toBeDeleted = localAsset;
                toBeAdded = remoteAsset;
            }
        } else if (remoteAsset) { // There is no local current asset, therefore adding it
            toBeAdded = remoteAsset;
        }

        return [toBeDeleted, toBeAdded];
    }

    isObject(): boolean {
        return true;
    }

    equal(asset: Asset): boolean {
        return asset
                && this.fileChecksum === asset.fileChecksum
                && this.fileType.equal(asset.fileType)
                && this.size === asset.size
                && this.modified === asset.modified;
    }

    getAssetFilePath(dir: string) {
        return path.format({
            dir,
            name: this.getAssetFilename(),
        });
    }

    getAssetFilename(): string {
        return path.format({
            name: Buffer.from(this.fileChecksum, `base64`).toString(`base64url`), // Since checksum seems to be base64 encoded
            ext: this.fileType.getExtension(),
        });
    }

    getUUID(): string {
        return this.fileChecksum;
    }

    verify(file: Buffer): boolean {
        return this.verifyChecksum(file) && this.verifySize(file);
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