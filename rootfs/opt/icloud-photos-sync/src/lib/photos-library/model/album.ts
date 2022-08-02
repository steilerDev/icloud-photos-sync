import {CPLAlbum} from "../../icloud/icloud-photos/query-parser";
import {PEntity} from "./photos-entity";

/**
 * Potential AlbumTypes
 */
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
    /**
     * UUID of this album
     */
    uuid: string;
    /**
     * Album type of this album
     */
    albumType: AlbumType;
    /**
     * The name of this album
     */
    albumName: string;
    /**
     * If this class is loaded from disk, the path will be populated
     */
    albumPath?: string;
    /**
     * Assets, where the key is the uuid & the value the filename
     */
    assets: AlbumAssets;
    /**
     * UUID of parent folder
     */
    parentAlbumUUID: string;

    /**
     * Constructs a new album
     * @param uuid - The UUID of the album
     * @param albumType - The album type of the album
     * @param albumName - The album name of the album
     * @param parentRecordName  - The UUID of the parent album
     * @param albumPath - Optionally, the full path to the album on disk
     */
    constructor(uuid: string, albumType: AlbumType, albumName: string, parentAlbumUUID: string, albumPath?: string) {
        this.uuid = uuid;
        this.albumType = albumType;
        this.albumName = albumName;
        this.parentAlbumUUID = parentAlbumUUID;
        this.albumPath = albumPath;
        this.assets = {};
    }

    /**
     *
     * @returns The display name of this album instance
     */
    getDisplayName(): string {
        return this.albumName;
    }

    /**
     *
     * @returns The UUID of this album instance
     */
    getUUID(): string {
        return this.uuid;
    }

    /**
     * Creates an album form a CPLAlbum instance (as returned from the backend)
     * @param cplAlbum - The album retrieved from the backend
     * @returns An Album based on the CPL object
     */
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

    /**
     *
     * @param album - An album to compare to this instance
     * @returns True if provided album is equal to this instance (based on UUID, AlbumType, AlbumName, Parent UUID & list of associated assets)
     */
    equal(album: Album): boolean {
        return album
            && this.uuid === album.uuid
            && this.albumType === album.albumType
            && this.albumName === album.albumName
            && this.parentAlbumUUID === album.parentAlbumUUID
            && JSON.stringify(Object.keys(this.assets).sort()) === JSON.stringify(Object.keys(album.assets).sort());
    }

    /**
     * Function to extract a plain Album from the PEntity interface
     * @returns - The plain Album object
     */
    unpack(): Album {
        return this;
    }
}