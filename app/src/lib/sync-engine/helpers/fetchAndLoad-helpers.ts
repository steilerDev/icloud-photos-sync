import path from "path";
import {SYNC_ERR} from "../../../app/error/error-codes.js";
import {iCPSError} from "../../../app/error/error.js";
import {CPLAlbum, CPLAsset, CPLMaster} from "../../icloud/icloud-photos/query-parser.js";
import {Album} from "../../photos-library/model/album.js";
import {Asset, AssetType} from "../../photos-library/model/asset.js";

/**
 * Matches CPLAsset/CPLMaster pairs and parses their associated Asset(s)
 * @param cplAssets - The given asset
 * @param cplMasters - The given master
 * @returns An array of all containing assets
 */
export function convertCPLAssets(cplAssets: CPLAsset[], cplMasters: CPLMaster[]): Asset[] {
    const cplMasterRecords = {};
    cplMasters.forEach(masterRecord => {
        cplMasterRecords[masterRecord.recordName] = masterRecord;
    });
    const remoteAssets: Asset[] = [];
    cplAssets.forEach(asset => {
        const master: CPLMaster = cplMasterRecords[asset.masterRef];
        try {
            const parsedOrigFilename = path.parse(Buffer.from(master.filenameEnc, `base64`).toString());

            const origFilename = parsedOrigFilename.name;
            const origExt = parsedOrigFilename.ext;

            if (master?.resource && master?.resourceType) {
                remoteAssets.push(Asset.fromCPL(master.resource, master.resourceType, origExt, master.modified, origFilename, AssetType.ORIG, asset.recordName, asset.favorite, master.zoneName));
            }

            if (asset?.resource && asset?.resourceType) {
                remoteAssets.push(Asset.fromCPL(asset.resource, asset.resourceType, origExt, asset.modified, origFilename, AssetType.EDIT, asset.recordName, asset.favorite, asset.zoneName));
            }
        } catch (err) {
            // In case missing filetype descriptor is thrown, adding asset context to error
            throw new iCPSError(SYNC_ERR.CONVERSION)
                .addCause(err)
                .addContext(`cplAsset`, asset)
                .addContext(`cplMaster`, master);
        }
    });
    return remoteAssets;
}

/**
 * Transforms a CPLAlbum into an array of Albums
 * @param cplAlbums - The given CPL Album
 * @returns Once settled, a completely populated Album array
 */
export function convertCPLAlbums(cplAlbums: CPLAlbum[]) : Album[] {
    const remoteAlbums: Album[] = [];
    for (const cplAlbum of cplAlbums) {
        remoteAlbums.push(Album.fromCPL(cplAlbum));
    }

    return remoteAlbums;
}