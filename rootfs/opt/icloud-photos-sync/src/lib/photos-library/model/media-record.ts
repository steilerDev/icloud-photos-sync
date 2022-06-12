/**
 * This class represents a media record within the library
 */

import * as QueryBuilder from '../../icloud/photos/icloud.photos.query-builder.js';

// Export enum ItemType {
//    VIDEO = `com.apple.quicktime-movie`,
//    PHOTO = `public.png`
// }

export class FileType {
    descriptor: string;

    constructor(descriptor: string) {
        this.descriptor = descriptor;
        console.error(`Found filetype ${descriptor}`);
    }

    //    GetItemType(): ItemType {

//    }
}

export class Asset {
    fileChecksum: string;
    size: number;
    wrappingKey: string;
    referenceChecksum: string;
    downloadURL: string;

    static parseAssetFromJson(json: any): Asset {
        const newAsset = new Asset();

        if (json.fileChecksum) {
            newAsset.fileChecksum = json.fileChecksum;
        } else {
            throw new Error(`Unable to construct asset from json: File Checksum not found (${JSON.stringify(json)})`);
        }

        if (`${json.size}` && !isNaN(parseInt(json.size, 10))) {
            newAsset.size = parseInt(json.size, 10);
        } else {
            throw new Error(`Unable to construct asset from json: Size not found (${JSON.stringify(json)})`);
        }

        if (json.wrappingKey) {
            newAsset.wrappingKey = json.wrappingKey;
        } else {
            throw new Error(`Unable to construct asset from json: Wrapping Key not found (${JSON.stringify(json)})`);
        }

        if (json.referenceChecksum) {
            newAsset.referenceChecksum = json.referenceChecksum;
        } else {
            throw new Error(`Unable to construct asset from json: Reference Checksum not found (${JSON.stringify(json)})`);
        }

        if (json.downloadURL) {
            newAsset.downloadURL = json.downloadURL;
        } else {
            throw new Error(`Unable to construct asset from json: Download URL not found (${JSON.stringify(json)})`);
        }

        return newAsset;
    }
}

export class MediaRecord {
    recordName: string;
    original: Asset;
    originalFileType: FileType;
    editedJPEG: Asset;
    editedJPEGFileType: FileType;
    editedVideo: Asset;
    editedVideoFileType: FileType;
    fileName: string;
    deleted: boolean;
    favorite: boolean;

    static parseMediaRecordFromJson(json: any): MediaRecord {
        const newRecord = new MediaRecord();
        if (json.recordName) {
            newRecord.recordName = json.recordName;
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

        if (json.originalFileType) {
            newRecord.originalFileType = new FileType(json.originalFileType);
        } else {
            throw new Error(`Unable to construct record from json: Original FileType not found (${JSON.stringify(json)})`);
        }

        if (json.editedJPEG) {
            newRecord.editedJPEG = Asset.parseAssetFromJson(json.editedJPEG);
            if (json.editedJPEGFileType) {
                newRecord.editedJPEGFileType = new FileType(json.editedJPEGFileType);
            } else {
                throw new Error(`Unable to construct record from json: Found edited jpeg, but not file type (${JSON.stringify(json)})`);
            }
        } else {
            newRecord.editedJPEG = undefined;
        }

        if (json.editedVideo) {
            newRecord.editedVideo = Asset.parseAssetFromJson(json.editedVideo);
            if (json.editedVideoFileType) {
                newRecord.editedVideoFileType = new FileType(json.editedVideoFileType);
            } else {
                throw new Error(`Unable to construct record from json: Found edited video, but not file type (${JSON.stringify(json)})`);
            }
        } else {
            newRecord.editedVideo = undefined;
        }

        if (`${json.favorite}` && (json.favorite === 0 || json.favorite === 1)) {
            newRecord.favorite = json.favorite === 1;
        } else {
            newRecord.favorite = false;
        }

        if (json.deleted && (json.deleted === `true` || json.deleted === `false`)) {
            newRecord.deleted = json.deleted === `true`;
        } else {
            newRecord.deleted = false;
        }

        return newRecord;
    }

    static parseMediaRecordFromQuery(mediaRecord: any): MediaRecord {
        // Mapping request to JSON data for parsing
        const json = {
            recordName: mediaRecord.recordName,
            original: mediaRecord.fields[QueryBuilder.DESIRED_KEYS.ORIGINAL_RESSOURCE]?.value,
            originalFileType: mediaRecord.fields[QueryBuilder.DESIRED_KEYS.ORIGINAL_RESSOURCE_FILE_TYPE]?.value,
            editedJPEG: mediaRecord.fields[QueryBuilder.DESIRED_KEYS.EDITED_JPEG_RESSOURCE]?.value,
            editedJPEGFileType: mediaRecord.fields[QueryBuilder.DESIRED_KEYS.EDITED_JPEG_RESSOURCE_FILE_TYPE]?.value,
            editedVideo: mediaRecord.fields[QueryBuilder.DESIRED_KEYS.EDITED_VIDEO_RESSOURCE]?.value,
            editedVideoFileType: mediaRecord.fields[QueryBuilder.DESIRED_KEYS.EDITED_VIDEO_RESSOURCE_FILE_TYPE]?.value,
            fileName: mediaRecord.fields[QueryBuilder.DESIRED_KEYS.ENCODED_FILE_NAME]?.value,
            favorite: mediaRecord.fields[QueryBuilder.DESIRED_KEYS.FAVORITE]?.value,
            deleted: mediaRecord.deleted,

        };
        if (json.fileName) {
            // If album name was set, it is still Base64 encoded, decoding
            json.fileName = Buffer.from(json.fileName, `base64`).toString(`utf8`);
        }

        return MediaRecord.parseMediaRecordFromJson(json);
    }
}