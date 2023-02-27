/**
 * This file contains various helper classes, that help parsing responses from the iCloud API
 * These parsers will not try to validate data, only make it easily accessible
 */

import {iCPSError} from '../../../app/error/error.js';
import {AlbumAssets} from '../../photos-library/model/album.js';
import {QUERY_PARSER_ERR} from '../../../app/error/error-codes.js';

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
     * File size in bytes
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

    /**
     * Parses from a record sourced through the API
     * @param assetId - The plain JSON object, as returned by the API
     */
    static parseFromQuery(assetId: unknown): AssetID {
        if (!isAssetIDQuery(assetId)) {
            throw new iCPSError(QUERY_PARSER_ERR.ASSET_ID_FORMAT)
                .addContext(`query`, assetId);
        }

        const asset = new AssetID();
        asset.fileChecksum = assetId.value.fileChecksum;
        asset.size = assetId.value.size;
        asset.wrappingKey = assetId.value.wrappingKey;
        asset.referenceChecksum = assetId.value.referenceChecksum;
        asset.downloadURL = assetId.value.downloadURL;
        return asset;
    }
}

/**
 * Expected query response format for AssetID
 */
type AssetIDQuery = {
    value: {
        fileChecksum: string,
        size: number
        wrappingKey: string
        referenceChecksum: string
        downloadURL: string
    };
    type: string;
}

/**
 * Checks if the provided object is an AssetIDQuery
 * @param obj - The unknown object
 * @returns True if object conforms to AssetIDQuery
 */
function isAssetIDQuery(obj: unknown): obj is AssetIDQuery {
    return (obj as AssetIDQuery).value.fileChecksum !== undefined
        && (obj as AssetIDQuery).value.size !== undefined
        && (obj as AssetIDQuery).value.wrappingKey !== undefined
        && (obj as AssetIDQuery).value.referenceChecksum !== undefined
        && (obj as AssetIDQuery).value.downloadURL !== undefined
        && (obj as AssetIDQuery).type !== undefined
        && (obj as AssetIDQuery).type === `ASSETID`;
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
     * The 'current' resource
     */
    resource: AssetID;
    /**
     * The type of resource
     */
    resourceType: string;
    /**
     * If the resource is favorite, '1' if 'true'
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
    static parseFromQuery(cplRecord: unknown): CPLAsset {
        if (!isCPLAssetQuery(cplRecord)) {
            throw new iCPSError(QUERY_PARSER_ERR.CPLASSET_FORMAT)
                .addContext(`query`, cplRecord);
        }

        const asset = new CPLAsset();
        asset.recordName = cplRecord.recordName;
        asset.masterRef = cplRecord.fields.masterRef.value.recordName;
        asset.favorite = cplRecord.fields.isFavorite?.value ?? 0;
        asset.modified = cplRecord.modified.timestamp;

        if (cplRecord.fields.adjustmentType?.value) {
            asset.adjustmentType = cplRecord.fields.adjustmentType.value;
            if (cplRecord.fields.resJPEGFullRes) {
                asset.resource = AssetID.parseFromQuery(cplRecord.fields.resJPEGFullRes);
                asset.resourceType = cplRecord.fields.resJPEGFullFileType.value;
            } else if (cplRecord.fields.resVidFullRes) {
                asset.resource = AssetID.parseFromQuery(cplRecord.fields.resVidFullRes);
                asset.resourceType = cplRecord.fields.resVidFullFileType.value;
            }
        }

        return asset;
    }
}

/**
 * Expected query result for CPLAsset
 */
type CPLAssetQuery = {
    recordType: string
    recordName: string,
    modified: {
        timestamp: number
    }
    fields: {
        masterRef: {
            value: {
                recordName: string
            }
        },
        isFavorite?: {
            value: number
        }
        adjustmentType?: {
            value: string
        }
        // Set if adjustmentType exists
        resJPEGFullRes?: AssetIDQuery
        resJPEGFullFileType?: {
            value: string
        },
        // Set if adjustmentType exists
        resVidFullRes?: AssetIDQuery
        resVidFullFileType?: {
            value: string
        }
    }

}

/**
 * Checks if the provided object is a CPLAsset Query
 * @param obj - The unknown object
 * @returns True if object conforms to CPLAssetQuery
 */
function isCPLAssetQuery(obj: unknown): obj is CPLAssetQuery {
    return (obj as CPLAssetQuery).recordType === `CPLAsset`
        && (obj as CPLAssetQuery).recordName !== undefined
        && (obj as CPLAssetQuery).fields.masterRef?.value.recordName !== undefined
        && (obj as CPLAssetQuery).recordName !== undefined
        && (obj as CPLAssetQuery).modified?.timestamp !== undefined
        && (
            (obj as CPLAssetQuery).fields.adjustmentType?.value === undefined // Adjustment Type is optional, but if it is provided one of the below needs to be true
            || (obj as CPLAssetQuery).fields.adjustmentType?.value === `com.apple.video.slomo` // No additional asset for Slo-Mo videos
            || ((obj as CPLAssetQuery).fields.resJPEGFullRes !== undefined && isAssetIDQuery((obj as CPLAssetQuery).fields.resJPEGFullRes) && (obj as CPLAssetQuery).fields.resJPEGFullFileType?.value !== undefined)
            || ((obj as CPLAssetQuery).fields.resVidFullRes !== undefined && isAssetIDQuery((obj as CPLAssetQuery).fields.resVidFullRes) && (obj as CPLAssetQuery).fields.resVidFullFileType?.value !== undefined)
        );
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

    // Can optionally have the following keys (indicating that this is a live photo, the following keys hold the information about the 'video' part of this):
    // resOriginalVidComplRes -> AssetID
    // resOriginalVidComplFileType -> Filetyp (seems to always be com.apple.quicktime-movie)
    //
    // Asset logic should stay same, folder linking might be an issue

    // Can optionally have the following key (indicating it was edited)
    // mediaMetaDataEnc
    // unknown base64 format, eg:
    // "YnBsaXN0MDDbAQIDBAUGBwgJCgsMWGhpamtsurtlaFZ7RXhpZn1We1RJRkZ9WERQSVdpZHRoW1Byb2ZpbGVOYW1lW1BpeGVsSGVpZ2h0WkNvbG9yTW9kZWxce01ha2VyQXBwbGV9VURlcHRoWlBpeGVsV2lkdGhbT3JpZW50YXRpb25ZRFBJSGVpZ2h03xAjDQ4PEBESExQVFhcYGRobHB0eHyAhIiMkJSYnKCkqKywtLi8wMzQ1Njc8PT4/QEFCQ0RGPEdISUdKR0tQMVFSU1RVVjxXMVtFeGlmVmVyc2lvblVGbGFzaFlMZW5zTW9kZWxfEBNPZmZzZXRUaW1lRGlnaXRpemVkXxASU3Vic2VjVGltZU9yaWdpbmFsXxARTGVuc1NwZWNpZmljYXRpb25cRXhwb3N1cmVNb2RlWExlbnNNYWtlV0ZOdW1iZXJfEBJPZmZzZXRUaW1lT3JpZ2luYWxfEA9QaXhlbFlEaW1lbnNpb25dQXBlcnR1cmVWYWx1ZV8QEUV4cG9zdXJlQmlhc1ZhbHVlXE1ldGVyaW5nTW9kZV8QD0lTT1NwZWVkUmF0aW5nc18QEVNodXR0ZXJTcGVlZFZhbHVlXxAQU2NlbmVDYXB0dXJlVHlwZV5DdXN0b21SZW5kZXJlZFtGb2NhbExlbmd0aF8QEERhdGVUaW1lT3JpZ2luYWxZU2NlbmVUeXBlXxAPRmxhc2hQaXhWZXJzaW9uWkNvbG9yU3BhY2VbU3ViamVjdEFyZWFfEA9QaXhlbFhEaW1lbnNpb25dU2Vuc2luZ01ldGhvZF8QEkZvY2FsTGVuSW4zNW1tRmlsbV8QE1N1YnNlY1RpbWVEaWdpdGl6ZWRaT2Zmc2V0VGltZV8QD0JyaWdodG5lc3NWYWx1ZV8QEURhdGVUaW1lRGlnaXRpemVkXxAXQ29tcG9uZW50c0NvbmZpZ3VyYXRpb25cV2hpdGVCYWxhbmNlXEV4cG9zdXJlVGltZV8QD0V4cG9zdXJlUHJvZ3JhbaMxMjEQAhADEBhfECZpUGhvbmUgMTMgbWluaSBiYWNrIGNhbWVyYSA1LjFtbSBmLzEuNlYrMDI6MDBTMzk4pDg5OjsiQKMzMyJAozMzIj/MzM0iP8zMzRAAVUFwcGxlIz/5mZmZmZmaViswMjowMBEIcCM/9bLD2dbPrSMAAAAAAAAAABAFoUUQICNAF2Z8t1vCrxABI0AUZmZmZmZmXxATMjAyMjowOToxMyAxNDoxMjowOKJHPKRMTU5PEQd+EQQ1EQd8EQKmEQ8AEB1TMzk4ViswMjowMCNAEjGxbIkPQF8QEzIwMjI6MDk6MTMgMTQ6MTI6MDikRzEyPCM/kae5YRp7ltlZWltcXQpeX2BhMWJjZGVkZmdcSG9zdENvbXB1dGVyXlJlc29sdXRpb25Vbml0WFNvZnR3YXJlWERhdGVUaW1lW1hSZXNvbHV0aW9uW1lSZXNvbHV0aW9uVU1vZGVsVE1ha2VeaVBob25lIDEzIG1pbmlUMTYuMF8QEzIwMjI6MDk6MTMgMTQ6MTI6MDgjQFIAAAAAAAAQBl5pUGhvbmUgMTMgbWluaVVBcHBsZSJCkAAAXxARc1JHQiBJRUM2MTk2Ni0yLjERCHBTUkdC3xApbW5vcHFyc3R1dnd4eXp7fH1+f4CBgoOEhYaHiImKi4yNjo+QkZKTlJWWnzw8PKKjPKRHpaanRzw8pKtHrDw8r7CxPEeyMrO2tzwxpDw8uDy5R1EzUjEyUjY5UTRSMTNRNVE2UjMxUjE0UTdSMjNSMzJROFIxNlIyNVI1MVI2MFI0M1I1MlIzNVI3MFI1M1I0NVI1NFIzN1I2M1I0NlI1NVIzOFI2NFI0N1IzOVI2NVI3NFI1OFI2N1I1OVExUjY4UTJSMjDUl5iZmpucnZ5VZmxhZ3NVdmFsdWVZdGltZXNjYWxlVWVwb2NoEAETAAArfSkBU54SO5rKABAAoqChIj9BAAAiP0UAABC4EM4QBBJCAACAXxAkMzVFN0JFQUUtQUM0RS00RTk0LTlDM0MtRDNFNThEQkYxMkU3o6ipqiI9DxrBIr9COXAivyku4V8QJDJGREI3MDQ1LTRGQTktNEE0Ny1BNjgyLTc1MTM4MERBQzBENKKtrhAcEhAAAC0RFgERBr4QjhAI07SSlJu1tVEwIgAAAAAQaSJCKt98EA5PEQIAGACHAHUAhQCLAH4AbgBxAIgA+ABAAXIBmQGDAV0BvgC5ALYAdACBAIIAawBjAFYAcwDsAEMBfQHTAB0ASwBXADYC6wB0AH4AegBjAGMAPgA0ALwASgE4AQ8AGQAMADUAOAL9AHYAfgB2AF0ARABGAGIAOwDfABcBJgAbAAkAJAA+AugAcgB+AHQAWQA5AEoAcADXAHwAqwBhACcAEQAqAHMCAQFpAHsAcwBYADkAVwBsAOoAhgFvAGcAFwBOAG8AswIbAWYAdwBxAFsANwBhAGgAzgCAAQMBTgA6AY4B8QAQAhYBfQB0AG4AXAA/AEAAagCwAIMBJAGhAOgB2wHbAI0BBQGZAHEAbABcAEYAQwBXAJEAigEFAfUA0QHHAQsBuwH3ALgAbwBrAF0ATQBMAFMAfAB+ATYB1gCkAbMBpgFDAwMB1wBvAGwAYQBXAFAAfgCBAHQBlwB1AUsBrgGnAWoDEQH2AG4AbgBoAGUAWgCtAPgABQGYANgBUwGVAZ4BcwMhARgBbABwAHAAdABuAAMBSwF9AcYB1wGMAVsBkwGVAzgBMQFrAHMAdgCGAN8A2gECAs4B0QHHAY8BRAGJAYkDUgFSAWsAawCeABcCkgLbAn0CpQEUAZ8BdQEzAXsBhAM9AoQBfAC1AD0CEQKpAtoC9AHLAfwAZwFHASoBbAEQCBEPAAAIAB8AJgAtADYAQgBOAFkAZgBsAHcAgwCNANYA4gDoAPIBCAEdATEBPgFHAU8BZAF2AYQBmAGlAbcBywHeAe0B+QIMAhYCKAIzAj8CUQJfAnQCigKVAqcCuwLVAuIC7wMBAwUDBwMJAwsDNAM7Az8DRANJA04DUwNYA1oDYANpA3ADcwN8A4UDhwOJA4sDlAOWA58DtQO4A70DwAPDA8YDyQPMA84D0gPZA+ID+AP9BAYEGQQmBDUEPgRHBFMEXwRlBGoEeQR+BJQEnQSfBK4EtAS5BM0E0ATUBSkFKwUuBTEFMwU2BTgFOgU9BUAFQgVFBUgFSgVNBVAFUwVWBVkFXAVfBWIFZQVoBWsFbgVxBXQFdwV6BX0FgAWDBYYFiQWMBY8FkgWUBZcFmQWcBaUFqwWxBbsFwQXDBcwF0QXTBdYF2wXgBeIF5AXmBesGEgYWBhsGIAYlBkwGTwZRBlYGWQZcBl4GYAZnBmkGbgZwBnUGdwh7CH0AAAAAAAACAQAAAAAAAAC8AAAAAAAAAAAAAAAAAAAIgA=="

    /**
     * Parses from a record sourced through the API
     * @param cplRecord - The plain JSON object, as returned by the API
     */
    static parseFromQuery(cplRecord: unknown): CPLMaster {
        if (!isCPLMasterQuery(cplRecord)) {
            throw new iCPSError(QUERY_PARSER_ERR.CPLMASTER_FORMAT)
                .addContext(`query`, cplRecord);
        }

        const master = new CPLMaster();
        master.recordName = cplRecord.recordName;
        master.modified = cplRecord.modified.timestamp;
        master.resource = AssetID.parseFromQuery(cplRecord.fields.resOriginalRes);
        master.resourceType = cplRecord.fields.resOriginalFileType.value; // Orig could also be JPEG to save storage
        master.filenameEnc = cplRecord.fields.filenameEnc.value;
        return master;
    }
}

/**
 * Expected query result for CPLMaster
 */
type CPLMasterQuery = {
    recordType: string
    recordName: string
    modified: {
        timestamp: number
    }
    fields: {
        resOriginalRes: AssetID
        resOriginalFileType: {
            value: string
        }
        filenameEnc: {
            value: string
        }
    }
}

/**
 * Checks if the provided object is a CPLMaster Query
 * @param obj - The unknown object
 * @returns True if object conforms to CPLMasterQuery
 */
function isCPLMasterQuery(obj: unknown): obj is CPLMasterQuery {
    return (obj as CPLMasterQuery).recordType === `CPLMaster`
        && (obj as CPLMasterQuery).recordName !== undefined
        && (obj as CPLMasterQuery).modified.timestamp !== undefined
        && (obj as CPLMasterQuery).fields.resOriginalRes !== undefined && isAssetIDQuery((obj as CPLMasterQuery).fields.resOriginalRes)
        && (obj as CPLMasterQuery).fields.resOriginalFileType.value !== undefined
        && (obj as CPLMasterQuery).fields.filenameEnc.value !== undefined;
}

/**
 * CPLAlbum is the representation of either a folder or an album. It might contains a list of assets.
 */
export class CPLAlbum {
    /**
     * UUID of the album
     */
    recordName: string;
    /**
     * AlbumType representation (e.g. Album or Folder)
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
    assets?: AlbumAssets;

    static parseFromQuery(cplRecord: unknown, assets?: AlbumAssets): CPLAlbum {
        if (!isCPLAlbumQuery(cplRecord)) {
            throw new iCPSError(QUERY_PARSER_ERR.CPLALBUM_FORMAT)
                .addContext(`query`, cplRecord);
        }

        const album = new CPLAlbum();
        album.recordName = cplRecord.recordName;
        album.modified = cplRecord.modified.timestamp;
        album.albumType = cplRecord.fields.albumType.value;
        album.albumNameEnc = cplRecord.fields.albumNameEnc.value;
        album.parentId = cplRecord.fields.parentId?.value;
        album.assets = assets;
        return album;
    }
}

/**
 * Expected query result for CPLAlbum
 */
 type CPLAlbumQuery = {
    recordType: string
    recordName: string
    modified: {
        timestamp: number
    }
    fields: {
        albumType: {
            value: number
        }
        albumNameEnc: {
            value: string
        }
        parentId?: {
            value: string
        }
    }
}

/**
 * Checks if the provided object is a CPLAlbum Query
 * @param obj - The unknown object
 * @returns True if object conforms to CPLAlbumQuery
 */
function isCPLAlbumQuery(obj: unknown): obj is CPLAlbumQuery {
    return (obj as CPLAlbumQuery).recordType === `CPLAlbum`
        && (obj as CPLAlbumQuery).recordName !== undefined
        && (obj as CPLAlbumQuery).modified.timestamp !== undefined
        && (obj as CPLAlbumQuery).fields.albumType.value !== undefined
        && (obj as CPLAlbumQuery).fields.albumNameEnc.value !== undefined;
}