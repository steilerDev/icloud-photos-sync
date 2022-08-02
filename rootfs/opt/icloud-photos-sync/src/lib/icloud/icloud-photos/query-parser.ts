/**
 * This file contains various helper classes, that help parsing responses from the iCloud API
 */

import {AlbumAssets} from '../../photos-library/model/album.js';
import * as QueryBuilder from './query-builder.js';

/**
 * Represents a resources returned from the API, called 'asset id' as per API. Can be found as a record on a CPLAsset or CPLMaster
 */
export class AssetID {
    /**
     * Checksum of the file:
     * 28 chars, probably base64 encoded (21 bytes / 168 bit)
     * Unsure how this is computed
     */
    fileChecksum: string;
    /**
     * Filesize in bytes
     */
    size: number;
    /**
     * Probably base64 encoded
     */
    wrappingKey: string;
    /**
     * An unknown checksum, different form fileChecksum.
     * Probably base64 encoded
     */
    referenceChecksum: string;
    /**
     * The backend URL for this asset
     */
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
    /**
     * UUID of the asset
     */
    recordName: string;
    /**
     * Name of the application that made changes to the file
     */
    adjustmentType?: string;
    /**
     * The hash of a CPLMaster record
     */
    masterRef: string;
    /**
     * The 'current' ressource
     */
    resource: AssetID;
    /**
     * The type of ressource
     */
    resourceType: string;
    /**
     * If the ressource is faved, '1' if 'true'
     */
    favorite: number;
    /**
     * Timestamp in nanoseconds since epoch
     */
    modified: number;

    /**
     * Parses from a record sourced through the API
     * @param cplRecord - The plain JSON object, as returned by the API
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

/**
 * CPLMaster is the original file associated to a CPLAsset. This contains the original filename of the file and an unmodified version of the BLOB
 */
export class CPLMaster {
    /**
     * (Unique?) hash of the file
     */
    recordName: string;
    /**
     *  The master asset attached to this record
     */
    resource: AssetID;
    /**
     * The type of asset attached to this record
     */
    resourceType: string;
    /**
     * Base64 encoded filename
     */
    filenameEnc: String;
    /**
     * Timestamp in nanoseconds since epoch
     */
    modified: number;

    /**
     * Parses from a record sourced through the API
     * @param cplRecord - The plain JSON object, as returned by the API
     */
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

/**
 * CPLAlbum is the represantation of either a folder or an album. It might contains a list of assets.
 */
export class CPLAlbum {
    /**
     * UUID of the album
     */
    recordName: string;
    /**
     * AlbumType represantion (e.g. Album or Folder)
     */
    albumType: number;
    /**
     * Base64 encoded album name
     */
    albumNameEnc: string;
    /**
     * The UUID of the parent folder
     */
    parentId: string;
    /**
     * Timestamp in nanoseconds since epoch
     */
    modified: number;
    /**
     * A list of assets contained in this album
     */
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