import {AlbumAssets} from '../../photos-library/model/album.js';
import {Asset} from '../../photos-library/model/asset.js';
import * as QueryBuilder from './query-builder.js';

/**
 * Represents a resources returned from the API, called 'asset id' as per API
 */
export class AssetID {
    fileChecksum: string; // 28 chars, probably base64 - 21 bytes / 168 bit
    size: number; // In byte
    wrappingKey: string; // Probably base64
    referenceChecksum: string; // Different from fileChecksum
    downloadURL: string;

    static parseFromQuery(assetId: any): AssetID {
        if (assetId.type === `ASSETID`) {
            const asset = new AssetID();
            asset.fileChecksum = assetId.value.fileChecksum;
            asset.size = assetId.value.size;
            asset.wrappingKey = assetId.value.wrappingKey;
            asset.referenceChecksum = assetId.value.referenceChecksum;
            asset.downloadURL = assetId.value.downloadURL;
            return asset;
        }

        throw new Error(`Unknown type, expected 'ASSETID': ${JSON.stringify(assetId)}`);
    }
}

/**
 * CPLAsset is a single asset shown in Photos.app. This asset is linked to a Master and might include a current resource
 */
export class CPLAsset {
    recordName: string; // UUID
    adjustmentType?: string;
    masterRef: string; // RecordName of CPLMaster aka hash
    resource: AssetID;
    resourceType: string;
    favorite: number; // 1 -> true
    modified: number;

    /**
     * Parses from a record sourced through the API
     * @param cplRecord - The plain JSON object, as returned by the API
     * @throws An exception that tries to indicate the source of error
     */
    static parseFromQuery(cplRecord: any): CPLAsset {
        if (cplRecord.recordType === QueryBuilder.RECORD_TYPES.PHOTO_ASSET_RECORD) {
            const asset = new CPLAsset();
            if (cplRecord.recordName) {
                asset.recordName = cplRecord.recordName;
            } else {
                throw new Error(`recordName not found: ${JSON.stringify(cplRecord)}`);
            }

            // Will all throw an access error if not present
            asset.masterRef = cplRecord.fields[QueryBuilder.DESIRED_KEYS.MASTER_REF].value.recordName;
            asset.favorite = cplRecord.fields[QueryBuilder.DESIRED_KEYS.FAVORITE].value;
            asset.modified = cplRecord.modified.timestamp;

            if (cplRecord.fields[QueryBuilder.DESIRED_KEYS.ADJUSTMENT_TYPE]) {
                asset.adjustmentType = cplRecord.fields[QueryBuilder.DESIRED_KEYS.ADJUSTMENT_TYPE].value;
                if (cplRecord.fields[QueryBuilder.DESIRED_KEYS.JPEG_RESOURCE]) {
                    asset.resource = AssetID.parseFromQuery(cplRecord.fields[QueryBuilder.DESIRED_KEYS.JPEG_RESOURCE]);
                    asset.resourceType = cplRecord.fields[QueryBuilder.DESIRED_KEYS.JPEG_RESOURCE_FILE_TYPE].value;
                } else if (cplRecord.fields[QueryBuilder.DESIRED_KEYS.VIDEO_RESOURCE]) {
                    asset.resource = AssetID.parseFromQuery(cplRecord.fields[QueryBuilder.DESIRED_KEYS.VIDEO_RESOURCE]);
                    asset.resourceType = cplRecord.fields[QueryBuilder.DESIRED_KEYS.VIDEO_RESOURCE_FILE_TYPE].value;
                } else if (asset.adjustmentType !== `com.apple.video.slomo`) {
                    throw new Error(`Neither JPEG nor Video resource found in CPL Asset even though adjustmentType is given ${asset.adjustmentType}`);
                }
            }

            return asset;
        }

        throw new Error(`Record type is not ${QueryBuilder.RECORD_TYPES.PHOTO_ASSET_RECORD}: ${cplRecord.recordType}`);
    }
}

export class CPLMaster {
    recordName: string; // Hash
    resource: AssetID;
    resourceType: string;
    filenameEnc: String;
    modified: number;

    static parseFromQuery(cplRecord: any): CPLMaster {
        if (cplRecord.recordType === QueryBuilder.RECORD_TYPES.PHOTO_MASTER_RECORD) {
            const master = new CPLMaster();
            if (cplRecord.recordName) {
                master.recordName = cplRecord.recordName;
            } else {
                throw new Error(`recordName not found: ${JSON.stringify(cplRecord)}`);
            }

            master.resource = AssetID.parseFromQuery(cplRecord.fields[QueryBuilder.DESIRED_KEYS.ORIGINAL_RESOURCE]);
            master.resourceType = cplRecord.fields[QueryBuilder.DESIRED_KEYS.ORIGINAL_RESOURCE_FILE_TYPE].value; // Orig could also be JPEG to save storage
            master.filenameEnc = cplRecord.fields[QueryBuilder.DESIRED_KEYS.ENCODED_FILE_NAME].value;
            master.modified = cplRecord.modified.timestamp;
            return master;
        }

        throw new Error(`Record type is not ${QueryBuilder.RECORD_TYPES.PHOTO_MASTER_RECORD}: ${cplRecord.recordType}`);
    }
}

export class CPLAlbum {
    recordName: string; // UUID

    albumType: number;
    albumNameEnc: string;
    parentId: string;
    modified: number;

    assets: Promise<AlbumAssets>;

    static parseFromQuery(cplRecord: any, assets?: Promise<AlbumAssets>): CPLAlbum {
        if (cplRecord.recordType === QueryBuilder.RECORD_TYPES.PHOTO_ALBUM_RECORD) {
            const album = new CPLAlbum();
            if (cplRecord.recordName) {
                album.recordName = cplRecord.recordName;
            } else {
                throw new Error(`recordName not found: ${JSON.stringify(cplRecord)}`);
            }

            album.albumType = cplRecord.fields[QueryBuilder.DESIRED_KEYS.ALBUM_TYPE].value;
            album.albumNameEnc = cplRecord.fields[QueryBuilder.DESIRED_KEYS.ENCODED_ALBUM_NAME].value;
            album.parentId = cplRecord.fields[QueryBuilder.DESIRED_KEYS.PARENT_ID]?.value;
            album.modified = cplRecord.modified.timestamp;
            album.assets = assets;

            return album;
        }

        throw new Error(`Record type is not ${QueryBuilder.RECORD_TYPES.PHOTO_ALBUM_RECORD}: ${cplRecord.recordType}`);
    }
}

/**
 * Transforms a matching CPLAsset/CPLMaster pair to an array of associated assets
 * @param asset - The given asset
 * @param master - The given master
 * @returns An array of all containing assets
 */
export function cpl2Assets(asset?: CPLAsset, master?: CPLMaster): Asset[] {
    const assets: Asset[] = [];

    if (master?.resource && master?.resourceType) {
        assets.push(Asset.fromCPL(master.resource, master.resourceType, master.modified));
    }

    if (asset?.resource && asset?.resourceType) {
        assets.push(Asset.fromCPL(asset.resource, asset.resourceType, asset.modified));
    }

    return assets;
}

export function cplArray2Assets(cplAssets: CPLAsset[], cplMasters: CPLMaster[]): Asset[] {
    // Indexing master records for easier retrieval later
    const cplMasterRecords = {};
    cplMasters.forEach(masterRecord => {
        cplMasterRecords[masterRecord.recordName] = masterRecord;
    });
    const remoteAssets: Asset[] = [];
    cplAssets.forEach(cplAsset => {
        // Get CPLMaster for CPLAsset (if possible)
        remoteAssets.push(...cpl2Assets(cplAsset, cplMasterRecords[cplAsset.masterRef]));
    });
    return remoteAssets;
}