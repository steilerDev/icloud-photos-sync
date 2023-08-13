import mockfs from 'mock-fs';
import * as fs from 'fs';
import {jest} from '@jest/globals';
import {CPLAlbum, CPLAsset, CPLMaster} from "../../src/lib/icloud/icloud-photos/query-parser";
import * as Config from './_config';
import path from "path";
import {ResourceManager} from "../../src/lib/resource-manager/resource-manager";
import {Resources} from '../../src/lib/resource-manager/main';

export function prepareResourceManagerForApiTests(): ResourceManager {
    Resources._instance = undefined as any;

    ResourceManager.prototype.readResourceFile = jest.fn<typeof ResourceManager.prototype.readResourceFile>()
        .mockReturnValue({
            libraryVersion: 1,
        });

    ResourceManager.prototype.writeResourceFile = jest.fn<typeof ResourceManager.prototype.writeResourceFile>()
        .mockReturnValue();

    const instance = Resources.setup({
        ...Config.defaultConfig,
        failOnMfa: true,
    });

    instance._resources.username = process.env.TEST_APPLE_ID_USER!;
    instance._resources.password = process.env.TEST_APPLE_ID_PWD!;
    instance._resources.trustToken = process.env.TEST_TRUST_TOKEN!;

    return instance;
}

/**
 * Helper to compare objects, that have string property 'recordName'
 * Function used to determine the order of the elements, based on the property 'recordName'.
 * @param a - One object
 * @param b - Other object
 * @returns  Returns a negative value if the first argument is less than the second argument, zero if they're equal, and a positive value otherwise.
 */
export function sortByRecordName(a: any, b: any): number {
    [].sort();
    return a.recordName.localeCompare(b.recordName);
}

/**
 * Post processes the CPLMaster data returned from the iCloud API. Removes all non-testable data.
 * @param a - The object received from the API
 * @returns The post-processed object
 */
export function postProcessMasterData(a: CPLMaster): any {
    return {
        filenameEnc: a.filenameEnc,
        modified: a.modified,
        recordName: a.recordName,
        resourceType: a.resourceType,
        resource: {
            fileChecksum: a.resource.fileChecksum,
            referenceChecksum: a.resource.referenceChecksum,
            size: a.resource.size,
            wrappingKey: a.resource.wrappingKey,
        },
    };
}

/**
 * Post processes the CPLAsset data returned from the iCloud API. Removes all non-testable data.
 * @param a - The object received from the API
 * @returns The post-processed object
 */
export function postProcessAssetData(a: CPLAsset): any {
    const asset: any = {
        favorite: a.favorite,
        masterRef: a.masterRef,
        modified: a.modified,
        recordName: a.recordName,
    };
    if (a.resource) {
        asset.adjustmentType = a.adjustmentType;
        asset.resourceType = a.resourceType;
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
 * Post processes the CPLAlbum data returned from the iCloud API. Removes all non-testable data and waits for all promises to settle.
 * @param a - The object received from the API
 * @returns The post-processed object
 */
export async function postProcessAlbumData(a: CPLAlbum): Promise<any> {
    return {
        albumNameEnc: a.albumNameEnc,
        albumType: a.albumType,
        assets: a.assets,
        modified: a.modified,
        parentId: a.parentId,
        recordName: a.recordName,
    };
}

/**
 * Writes json data to disk for future comparison
 * @param data - The data to write
 * @param pathExt - The path extension to the local project path
 */
export function writeTestData(data: any, pathExt: string) {
    const basePath = `/home/coder/project/icloud-photos-sync/app/test/_data`;
    mockfs.bypass(() => fs.writeFileSync(path.join(basePath, `${pathExt}.json`), JSON.stringify(data)));
}