import path from "path";
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
        const origFilenameWithExt = Buffer.from(master.filenameEnc, `base64`).toString();
        const origFilename = path.parse(origFilenameWithExt).name;
        if (master?.resource && master?.resourceType) {
            remoteAssets.push(Asset.fromCPL(master.resource, master.resourceType, master.modified, origFilename, AssetType.ORIG));
        }

        if (asset?.resource && asset?.resourceType) {
            remoteAssets.push(Asset.fromCPL(asset.resource, asset.resourceType, asset.modified, origFilename, AssetType.EDIT));
        }
    });
    return remoteAssets;
}

/**
 * Transforms a CPLAlbum into an array of Albums
 * @param cplAlbums - The given CPL Album
 * @returns Once settled, a completely populated Album array
 */
export async function convertCPLAlbums(cplAlbums: CPLAlbum[]) : Promise<Album[]> {
    const remoteAlbums: Album[] = [];
    for (const cplAlbum of cplAlbums) {
        remoteAlbums.push(await Album.fromCPL(cplAlbum));
    }

    return remoteAlbums;
}