
export enum AlbumType {
    FOLDER = 3,
    ALBUM = 0,
    ARCHIVED = 99
}

/**
 * Key -> UUID, Value -> Filename
 */
export type AlbumAsset = {
    [key: string]: string
}

/**
 * This class represents a photo album within the library
 */
export class Album {
    uuid: string;
    albumType: AlbumType;
    albumName: string;
    albumPath?: string;
    /**
     * Assets, where the key is the uuid & the value the filename
     */
    assets: AlbumAsset;

    /**
     * Record name of parent folder
     */
    parentAlbumUUID: string;

    constructor(uuid: string, albumType: AlbumType, albumName: string, parentRecordName: string, albumPath?: string) {
        this.uuid = uuid;
        this.albumType = albumType;
        this.albumName = albumName;
        this.parentAlbumUUID = parentRecordName;
        this.albumPath = albumPath;
        this.assets = {};
    }

    getDisplayName(): string {
        return this.albumName;
    }

    getUUID(): string {
        return this.uuid;
    }
}