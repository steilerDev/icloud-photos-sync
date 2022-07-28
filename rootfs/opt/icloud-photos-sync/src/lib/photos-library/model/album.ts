import {CPLAlbum} from "../../icloud/icloud-photos/query-parser";
import {DiffFlag} from "../constants";
import {PEntity} from "./photos-entity";

export enum AlbumType {
    FOLDER = 3,
    ALBUM = 0,
    ARCHIVED = 99
}

/**
 * Key: getUUID, Value: Filename
 */
export type AlbumAssets = {
    [key: string]: string
}

/**
 * This class represents a photo album within the library
 */
export class Album implements PEntity<Album> {
    uuid: string;
    albumType: AlbumType;
    albumName: string;
    albumPath?: string;
    /**
     * Assets, where the key is the uuid & the value the filename
     */
    assets: AlbumAssets;

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

    static async fromCPL(cplAlbum: CPLAlbum): Promise<Album> {
        const album = new Album(
            cplAlbum.recordName,
            cplAlbum.albumType,
            Buffer.from(cplAlbum.albumNameEnc, `base64`).toString(`utf8`),
            cplAlbum.parentId,
        );
        album.assets = await cplAlbum.assets;
        return album;
    }

    /**
     * Creates a dummy album that is used to load all other albums from disk
     * @param photoDataDir - The folder path of all albums
     * @returns The dummy album
     */
    static getRootAlbum(photoDataDir: string): Album {
        return new Album(``, AlbumType.FOLDER, `iCloud Photos Library`, ``, photoDataDir);
    }

    static getAlbumDiff(localAlbum: Album, remoteAlbum: Album): DiffFlag {
        return `deleted`;
    }

    equal(album: Album): boolean {
        return album
            && this.uuid === album.uuid
            && this.albumType === album.albumType
            && this.albumName === album.albumName
            && this.parentAlbumUUID === album.parentAlbumUUID
            && JSON.stringify(Object.keys(this.assets).sort()) === JSON.stringify(Object.keys(album.assets).sort());
    }

    unpack(): Album {
        return this;
    }
}