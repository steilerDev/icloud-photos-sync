
export enum AlbumType {
    FOLDER = 3,
    ALBUM = 0
}

/**
 * This class represents a photo album within the library
 */
export class Album {
    uuid: string;
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

    constructor(uuid: string, albumType: AlbumType, albumName: string, deleted: boolean, mediaRecords: string[], parentRecordName: string) {
        this.uuid = uuid;
        this.albumType = albumType;
        this.albumName = albumName;
        this.deleted = deleted;
        this.mediaRecords = mediaRecords;
        this.parentRecordName = parentRecordName;
    }

    getDisplayName(): string {
        return this.albumName;
    }
}