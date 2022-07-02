/**
 * This class represents a media record within the library
 */

import {RecordState} from '../photos-library.constants.js';
import {Asset} from './asset.js';

export class MediaRecord {
    uuid: string;
    original: Asset;
    current: Asset;
    fileName: string;
    favorite: boolean;
    recordState: RecordState;

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
}