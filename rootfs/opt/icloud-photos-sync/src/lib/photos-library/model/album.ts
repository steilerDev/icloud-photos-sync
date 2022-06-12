export enum AlbumType {
    FOLDER = 3,
    ALBUM = 0
}

export enum AlbumState {
    STALE = 0,
    NEW = 1,
    CHANGED = 2,
    EXPIRED = 3,
    LOCKED = 4
}

/**
 * This class represents a photo album within the library
 */
export class Album {
    recordName: string;
    albumType: AlbumType;
    albumName: string;
    albumState: AlbumState;
    deleted: boolean;
    /**
     * Record Names of media contained in this album
     */
    mediaRecords: string[];

    /**
     * Record name of parent folder
     */
    parentRecordName: string;

    constructor(recordName?: string, albumType?: AlbumType, albumName?: string, deleted?: boolean, parentRecordName?: string, albumState: AlbumState = AlbumState.NEW) {
        this.recordName = recordName;
        this.albumType = albumType;
        this.albumName = albumName;
        this.albumState = albumState;
        this.deleted = deleted;
        this.parentRecordName = parentRecordName;
    }

    static parseAlbumFromJson(json: any): Album {
        const newAlbum = new Album();
        if (json.recordName) {
            newAlbum.recordName = json.recordName;
        } else {
            throw new Error(`Unable to construct album from json: RecordName not found (${json})`);
        }

        if (json.albumType) {
            newAlbum.albumType = json.albumType;
        } else {
            throw new Error(`Unable to construct album from json: AlbumType not found (${json})`);
        }

        if (json.albumName) {
            newAlbum.albumName = json.albumName;
        } else {
            throw new Error(`Unable to construct album from json: AlbumName not found (${json})`);
        }

        if (json.albumState) {
            newAlbum.albumState = json.albumState;
        } else {
            throw new Error(`Unable to construct album from json: AlbumState not found (${json})`);
        }

        if (json.deleted) {
            newAlbum.deleted = json.deleted;
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
    static parseAlbumFromRequest(albumRecord: any): Album {
        let recordName: string;
        try {
            recordName = albumRecord.recordName;
        } catch (err) {
            throw new Error(`Unable to find record name for album: ${JSON.stringify(albumRecord)}`);
        }

        if ((recordName === `----Project-Root-Folder----` || recordName === `----Root-Folder----`)) {
            throw new Error(`Ignoring special folders ('Project Root Folder' & 'Root Folder')`);
        }

        let albumName: string;
        try {
            albumName = albumRecord.fields.albumNameEnc.value;
            albumName = Buffer.from(albumName, `base64`).toString(`utf8`);
        } catch (err) {
            throw new Error(`Unable to parse album name for album: ${JSON.stringify(albumRecord)}`);
        }

        let albumType: number;
        try {
            albumType = albumRecord.fields.albumType.value;
        } catch (err) {
            throw new Error(`Unable to find album type for album: ${albumName}`);
        }

        if (!(albumType === AlbumType.ALBUM || albumType === AlbumType.FOLDER)) {
            throw new Error(`Ignoring special folder ${albumName} (type ${albumType})`);
        }

        let deletedString: string;
        try {
            deletedString = albumRecord.deleted;
        } catch (err) {
            throw new Error(`Unable to find delete state for album: ${albumName}`);
        }

        if (!deletedString && (deletedString === `true` || deletedString === `false`)) {
            throw new Error(`Unable to parse deleted state for album: ${albumName}`);
        }

        const deleted = deletedString === `true`;

        let parentId: string;
        try {
            parentId = albumRecord.fields.parentId.value;
            return new Album(recordName, albumType, albumName, deleted, parentId);
        } catch (err) {
            return new Album(recordName, albumType, albumName, deleted);
        }
    }
}