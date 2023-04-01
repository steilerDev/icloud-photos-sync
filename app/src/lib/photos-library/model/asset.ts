import path from 'path';
import {AssetID} from '../../icloud/icloud-photos/query-parser.js';
import {FileType} from './file-type.js';
import {Stats} from 'fs';
import fs from 'fs/promises';
import {PEntity} from './photos-entity.js';
import {iCPSError} from '../../../app/error/error.js';
import {LIBRARY_ERR} from '../../../app/error/error-codes.js';
import {Zones} from '../../icloud/icloud-photos/query-builder.js';
import {PRIMARY_ASSET_DIR, SHARED_ASSET_DIR} from '../constants.js';

/**
 * Representing the possible asset types
 */
export enum AssetType {
    /**
     * Shows that this is the original file
     */
    ORIG = 0,
    /**
     * Shows that this is the latest edit
     */
    EDIT = 1,
    /**
     * Shows that this is a live photo
     */
    LIVE = 2
}
/**
 * This class represents an Asset in the Photo Library
 */
export class Asset implements PEntity<Asset> {
    /**
     * Checksum of the asset
     */
    fileChecksum: string;
    /**
     * File size in bytes of this asset
     */
    size: number;
    /**
     * Modified timestamp as epoch timestamp (ms since epoch)
     */
    modified: number;
    /**
     * The file type of this asset
     */
    fileType: FileType;
    /**
     * Shows which version of the asset this is
     */
    assetType: AssetType;
    /**
     * The original filename of this asset
     */
    origFilename: string;

    /**
     * The zone this file is belonging to
     */
    zone: Zones;

    /**
     * The wrapping key of this asset (unknown usage, taken from backend, only present if fetched from CPL)
     */
    wrappingKey?: string;
    /**
     * The reference checksum of this asset (unknown usage, taken from backend, only present if fetched from CPL)
     */
    referenceChecksum?: string;
    /**
     * The download URL of this asset (only present if fetched from CPL)
     */
    downloadURL?: string;
    /**
     * Record name of the associated CPL Asset
     */
    recordName?: string;
    /**
     * Flag, if this asset is favorite
     */
    isFavorite?: boolean;

    /**
     * Creates a new Asset object
     * @param fileChecksum -
     * @param size -
     * @param fileType -
     * @param modified -
     * @param zone - Which zone is this asset belonging to
     * @param assetType - If this asset is the original or an edit
     * @param origFilename - The original filename, extracted from the parent object
     * @param wrappingKey -
     * @param referenceChecksum -
     * @param downloadURL -
     */
    constructor(fileChecksum: string, size: number, fileType: FileType, modified: number, zone: Zones, assetType?: AssetType, origFilename?: string, wrappingKey?: string, referenceChecksum?: string, downloadURL?: string, recordName?: string, isFavorite?: boolean) {
        this.fileChecksum = fileChecksum;
        this.size = size;
        this.fileType = fileType;
        this.modified = modified;
        this.zone = zone;
        this.assetType = assetType;
        this.origFilename = origFilename;
        this.wrappingKey = wrappingKey;
        this.referenceChecksum = referenceChecksum;
        this.downloadURL = downloadURL;
        this.recordName = recordName;
        this.isFavorite = isFavorite;
    }

    /**
     * Creates an Asset from the information provided by the backend
     * @param asset - The AssetID object returned from the backend
     * @param fileTypeDescriptor - The assetType string, describing the filetype
     * @param fileTypeExt - The assetTypes's extension as derived from the encoded filename
     * @param modified - The modified date as returned from the backend (in ms since epoch)
     * @param origFilename - The original filename, extracted from the parent object
     * @param assetType - If this asset is the original or an edit
     * @param zone - Specifies the zone this asset is belonging to
     * @returns An Asset based on the backend objects
     */
    static fromCPL(asset: AssetID, fileTypeDescriptor: string, fileTypeExt: string, modified: number, origFilename: string, assetType: AssetType, recordName: string, isFavorite: number, zone: string): Asset {
        return new Asset(
            asset.fileChecksum,
            asset.size,
            FileType.fromAssetType(fileTypeDescriptor, fileTypeExt),
            modified,
            zone === `PrimarySync` ? Zones.Primary : Zones.Shared,
            assetType,
            origFilename,
            asset.wrappingKey,
            asset.referenceChecksum,
            asset.downloadURL,
            recordName,
            isFavorite === 1,
        );
    }

    /**
     * Creates an Asset from a given file
     * @param fileName - The file name of the file
     * @param stats - The metadata associated with the file
     * @param zone - Specifies the zone this asset is belonging to
     * @returns An Asset based on the file information
     */
    static fromFile(fileName: string, stats: Stats, zone: Zones): Asset {
        return new Asset(
            Buffer.from(path.basename(fileName, path.extname(fileName)), `base64url`).toString(`base64`),
            stats.size,
            FileType.fromExtension(path.extname(fileName)),
            stats.mtimeMs,
            zone,
        );
    }

    /**
     * Compares the provided asset to this asset instance
     * @param asset - The asset to compare to
     * @returns True if provided asset matches this instance (based on fileChecksum, fileType, size and modified timestamp)
     */
    equal(asset: Asset): boolean {
        return asset
                && this.fileChecksum === asset.fileChecksum
                && this.fileType.equal(asset.fileType)
                && this.size === asset.size
                && this.withinRange(this.modified, asset.modified, 1000);
    }

    /**
     * Should only be called on a 'remote' entity. Will apply the local entity's properties to the remote one
     * @param _localEntity - The local entity
     * @returns This object with the applied properties
     */
    apply(_localEntity: Asset): Asset {
        return this;
    }

    /**
     *
     * @param dataDir - The photos data dir
     * @returns The full asset file path under the provided directory
     */
    getAssetFilePath(dir: string) {
        return path.format({
            "dir": path.join(dir, this.zone === Zones.Primary ? PRIMARY_ASSET_DIR : SHARED_ASSET_DIR),
            "name": this.getAssetFilename(),
        });
    }

    /**
     *
     * @returns A filename safe-encoded UUID of this instance with the correct file extension
     */
    getAssetFilename(): string {
        return path.format({
            "name": Buffer.from(this.fileChecksum, `base64`).toString(`base64url`), // Since checksum seems to be base64 encoded
            "ext": this.fileType.getExtension(),
        });
    }

    /**
     *
     * @returns The human readable / pretty printed filename of this asset, based on the filename of the original file imported.
     */
    getPrettyFilename(): string {
        return path.format({
            "name": this.origFilename + (this.assetType === AssetType.EDIT ? `-edited` : ``) + (this.assetType === AssetType.LIVE ? `-live` : ``),
            "ext": this.fileType.getExtension(),
        });
    }

    /**
     *
     * @returns The UUID of this instance
     */
    getUUID(): string {
        return this.fileChecksum;
    }

    /**
     * Verifies that the object representation matches the given file
     * @param filePath - The path, where the file is expected
     * @returns True if the provided file matches this object representation
     * @throws An error, if verification fails
     */
    async verify(filePath: string): Promise<boolean> {
        let fileStat: Stats;
        try {
            fileStat = await fs.stat(filePath);
        } catch (err) {
            throw new iCPSError(LIBRARY_ERR.ASSET_NOT_FOUND)
                .addCause(err)
                .addMessage(filePath);
        }

        if (fileStat.size !== this.size) {
            throw new iCPSError(LIBRARY_ERR.ASSET_SIZE)
                .addMessage(`${filePath} size ${fileStat.size}, iCloud ${this.size}`);
        }

        if (!this.withinRange(fileStat.mtimeMs, this.modified, 1000)) {
            throw new iCPSError(LIBRARY_ERR.ASSET_MODIFICATION_TIME)
                .addMessage(`${filePath} modification time ${fileStat.mtimeMs}, iCloud ${this.modified}`)
                .addContext(`out-of-range`, fileStat.mtimeMs - this.modified);
        }

        return true;
    }

    /**
     * Checks if one number is within the range of another number
     * @param x - One number
     * @param y - Other number
     * @param range - Range to check
     * @returns true if within range, false otherwise
     */
    private withinRange(x: number, y: number, range: number): boolean {
        return x >= y - range
            && x <= y + range;
    }

    /**
     * Verifies the checksum of this file against the checksum stored in this object
     * This is currently NOT implemented, as the checksum algorithm is unknown.
     * @param file - The read file
     * @returns True if checksum matches
     */
    /*
    private verifyChecksum(file: Buffer): boolean {
        return file !== undefined;
        Const hashes = [
            `BLAKE2b512`,
            `BLAKE2s256`,
            // `MD4`,
            `MD5`,
            `MD6`,
            `MD5-SHA1`,
            //`RIPEMD160`,
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
            // `SHAKE128`,
            // `SHAKE256`,
            `SM3`,
            // `whirlpool`,
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
    } */

    /**
     *
     * @returns A display name for this instance
     */
    getDisplayName(): string {
        return this.fileChecksum;
    }
}
