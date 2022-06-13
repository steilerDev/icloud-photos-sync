import {RecordState} from "../photos-library.js";

export enum AlbumType {
    FOLDER = 3,
    ALBUM = 0
}

/**
 * This class represents a photo album within the library
 */
export class Album {
    recordState: RecordState;

    recordName: string;
    albumType: AlbumType;
    albumName: string;
    deleted: boolean;
    /**
     * Record Names of media contained in this album
     */
    mediaRecords: string[];

    /**
     * Record name of parent folder
     */
    parentRecordName: string;

    static parseAlbumFromJson(json: any): Album {
        const newAlbum = new Album();
        if (json.recordName && json.recordName !== `----Project-Root-Folder----` && json.recordName !== `----Root-Folder----`) {
            newAlbum.recordName = json.recordName;
        } else {
            throw new Error(`Unable to construct album from json: RecordName not found or ignored (${JSON.stringify(json)})`);
        }

        if (json.albumName) {
            newAlbum.albumName = json.albumName;
        } else {
            throw new Error(`Unable to construct album from json: AlbumName not found or ignored (${JSON.stringify(json)})`);
        }

        if (json.albumType !== undefined) {
            const parsedType = Number.parseInt(json.albumType, 10);
            if (!isNaN(parsedType) && (parsedType === AlbumType.ALBUM || parsedType === AlbumType.FOLDER)) {
                newAlbum.albumType = json.albumType;
            } else {
                throw new Error(`Unable to construct album (${newAlbum.albumName}) from json: AlbumType has unexpected value ${json.albumType}`);
            }
        } else {
            throw new Error(`Unable to construct album from json: AlbumType not found (${JSON.stringify(json)})`);
        }

        if (json.recordState) {
            newAlbum.recordState = json.recordState;
        } else {
            newAlbum.recordState = RecordState.NEW;
        }

        if (json.deleted && (json.deleted === `true` || json.deleted === `false`)) {
            newAlbum.deleted = json.deleted === `true`;
        } else {
            newAlbum.deleted = false;
        }

        if (json.parentAlbum) {
            newAlbum.parentRecordName = json.parentRecordName;
        } else {
            newAlbum.parentRecordName = undefined;
        }

        return newAlbum;
    }

    /**
     * Parses the album record from a query request. Throws an error if there is a problem
     * @param albumRecord - The album record from the http response body
     * @returns An build album (not persisted yet)
     */
    static parseAlbumFromQuery(albumRecord: any): Album {
        // Mapping request to JSON data for parsing
        const json = {
            recordName: albumRecord.recordName,
            albumType: albumRecord.fields.albumType.value,
            albumName: albumRecord.fields.albumNameEnc?.value,
            deleted: albumRecord.deleted,
            parentId: albumRecord.fields.parentId?.value,
        };

        if (json.albumName) {
            // If album name was set, it is still Base64 encoded, decoding
            json.albumName = Buffer.from(json.albumName, `base64`).toString(`utf8`);
        }

        return Album.parseAlbumFromJson(json);
    }
}