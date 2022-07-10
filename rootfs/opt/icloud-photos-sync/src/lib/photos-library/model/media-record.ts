/**
 * This class represents a media record within the library
 */

import {CPLAsset, CPLMaster} from '../../icloud/photos/query-parser.js';
import {Asset} from './asset.js';

export class MediaRecord {
    uuid: string;
    original: Asset;
    current: Asset;
    fileName: string;
    favorite: boolean;
    modified: number;

    static fromCPL(asset: CPLAsset, master: CPLMaster): MediaRecord {
        const newRecord = new MediaRecord();
        newRecord.uuid = asset.recordName;

        if (master.resource && master.resourceType) {
            newRecord.original = Asset.fromCPL(master.resource, master.resourceType);
        }

        if (asset.resource && asset.resourceType) {
            newRecord.current = Asset.fromCPL(asset.resource, asset.resourceType);
        }

        newRecord.fileName = Buffer.from(master.filenameEnc, `base64`).toString();
        newRecord.favorite = asset.favorite === 1;
        newRecord.modified = asset.modified > master.modified ? asset.modified : master.modified;

        return newRecord;
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

    static parseMediaRecordFromJson(json: any): MediaRecord {
        const newRecord = new MediaRecord();
        if (json.uuid) {
            newRecord.uuid = json.recordName;
        } else {
            throw new Error(`Unable to construct record from json: RecordName not found (${JSON.stringify(json)})`);
        }

        if (json.fileName) {
            newRecord.fileName = json.fileName;
        } else {
            throw new Error(`Unable to construct record from json: FileName not found (${JSON.stringify(json)})`);
        }

        if (json.original) {
            newRecord.original = Asset.parseAssetFromJson(json.original);
        } else {
            throw new Error(`Unable to construct record from json: Original Asset not found (${JSON.stringify(json)})`);
        }

        try {
            newRecord.current = Asset.parseAssetFromJson(json.current);
        } catch (err) {
            newRecord.current = undefined;
        }

        if (`${json.favorite}`) {
            newRecord.favorite = json.favorite;
        } else {
            newRecord.favorite = false;
        }

        return newRecord;
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
}