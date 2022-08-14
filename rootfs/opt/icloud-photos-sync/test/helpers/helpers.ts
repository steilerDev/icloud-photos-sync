import {CPLAlbum, CPLAsset, CPLMaster} from "../../src/lib/icloud/icloud-photos/query-parser";
import * as fs from 'fs';
import path from "path";

/**
 * Helper to compare objects, that have string property 'recordName'
 * @param a
 * @param b
 * @returns
 */
export function sortByRecordName(a: any, b: any): number {
    return a.recordName.localeCompare(b.recordName);
}

/**
 * This function will filter variable data (that we cannot test), in order to make test possible
 * @param a
 * @returns
 */
export function postProcessMasterData(a: CPLMaster): any {
    return {
        filenameEnc: a.filenameEnc,
        modified: a.modified,
        recordName: a.recordName,
        resource: {
            fileChecksum: a.resource.fileChecksum,
            referenceChecksum: a.resource.referenceChecksum,
            size: a.resource.size,
            wrappingKey: a.resource.wrappingKey,
            resourceType: a.resourceType,
        },
    };
}

export function postProcessAssetData(a: CPLAsset): any {
    const asset = {
        adjustmentType: a.adjustmentType,
        favorite: a.favorite,
        masterRef: a.masterRef,
        modified: a.modified,
        recordName: a.recordName,
        resourceType: a.resourceType,
        resource: {},
    };
    if (a.resource) {
        asset.resource = {
            fileChecksum: a.resource.fileChecksum,
            referenceChecksum: a.resource.referenceChecksum,
            size: a.resource.size,
            wrappingKey: a.resource.wrappingKey,
        };
    }

    return asset;
}

/**
 * Post processes data received from the backend, waiting for all promises to settle
 * @param a - The object to post-process
 * @returns Processed object
 */
export async function postProcessAlbumData(a: CPLAlbum): Promise<any> {
    return {
        albumNameEnc: a.albumNameEnc,
        albumType: a.albumType,
        assets: await a?.assets,
        modified: a.modified,
        parentId: a.parentId,
        recordName: a.recordName,
    }
}

/**
 * Writes json data to disk for future comparison
 * @param data - The data to write
 * @param pathExt - The path extension to the local project path
 */
export function writeTestData(data: any, pathExt: string) {
    const basePath = `/home/coder/project/icloud-photos-sync/rootfs/opt/icloud-photos-sync`;
    fs.writeFileSync(path.join(basePath, `${pathExt}.json`), JSON.stringify(data));
}