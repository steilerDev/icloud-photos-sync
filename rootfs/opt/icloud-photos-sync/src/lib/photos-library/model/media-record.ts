/**
 * This class represents a media record within the library
 */

import {CPLAsset, CPLMaster} from '../../icloud/icloud-photos/query-parser.js';
import {Asset} from './asset.js';

export class MediaRecord {
    uuid: string;
    fileName: string;
    favorite: boolean;

    original: Asset;
    current: Asset;

    constructor(uuid: string, fileName: string, favorite: boolean, original: Asset, current: Asset) {
        this.uuid = uuid;
        this.fileName = fileName;
        this.favorite = favorite;
        this.original = original;
        this.current = current;
    }

    static fromCPL(asset: CPLAsset, master: CPLMaster): MediaRecord {
        let original: Asset;
        if (master.resource && master.resourceType) {
            original = Asset.fromCPL(master.resource, master.resourceType, master.modified);
        }

        let current: Asset;
        if (asset.resource && asset.resourceType) {
            current = Asset.fromCPL(asset.resource, asset.resourceType, asset.modified);
        }

        return new MediaRecord(
            asset.recordName,
            Buffer.from(master.filenameEnc, `base64`).toString(),
            asset.favorite === 1,
            original,
            current,
        );
    }

    /**
     * This function creates a processable diff of the current local record and a remote record which represents the desired state
     * @param asset - The remote CPLAsset to apply
     * @param master - The remote CPLMaster to apply
     * @returns A touple consisting of: An array that includes all local assets that need to be delted | An array that includes all remote assets that need to be downloaded | The updated MediaRecord
     */
    getDiff(asset: CPLAsset, master: CPLMaster): [Asset[], Asset[], MediaRecord] {
        const toBeDeleted: Asset[] = [];
        const toBeAdded: Asset[] = [];
        const remoteMediaRecord = MediaRecord.fromCPL(asset, master);

        // Creating diff for 'current' asset
        const currentDiff = Asset.getAssetDiff(this.current, remoteMediaRecord.current);
        toBeDeleted.push(...currentDiff[0]);
        toBeAdded.push(...currentDiff[1]);

        // Creating diff for 'original' asset
        const originalDiff = Asset.getAssetDiff(this.original, remoteMediaRecord.original);
        toBeDeleted.push(...originalDiff[0]);
        toBeAdded.push(...originalDiff[1]);

        return [toBeDeleted, toBeAdded, remoteMediaRecord];
    }

    getAllAssets(): Asset[] {
        const assets: Asset[] = [];
        if (this.current) {
            assets.push(this.current);
        }

        if (this.original) {
            assets.push(this.original);
        }

        return assets;
    }

    getAssetCount(): number {
        return (this.current ? 1 : 0) + (this.original ? 1 : 0);
    }

    getDisplayName(): string {
        return this.uuid;
    }
}