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
 * This type is mapping the filename in the asset folder, to the filename how the asset should be presented to the user
 * Key: Asset.getAssetFilename, Value: Asset.getPrettyFilename
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
     * @returns A valid filename, that will be used to store the album on disk
     */
    getSanitizedFilename(): string {
        return this.albumName.replaceAll(`/`, `_`);
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
            cplAlbum.parentId ? cplAlbum.parentId : ``,
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
            && this.getSanitizedFilename() === album.getSanitizedFilename()
            && this.parentAlbumUUID === album.parentAlbumUUID
            && this.assetsEqual(album.assets);
    }

    assetsEqual(assets: AlbumAssets) {
        // Assets might be undefined
        const thisAssets = this.assets ? this.assets : {};
        const otherAssets = assets ? assets : {};
        return JSON.stringify(Object.keys(thisAssets).sort()) === JSON.stringify(Object.keys(otherAssets).sort());
    }

    /**
     * Function to extract a plain Album from the PEntity interface
     * @returns - The plain Album object
     */
    unpack(): Album {
        return this;
    }

    /**
     * Check if a given album is in the chain of ancestors
     * @param potentialAncestor - The potential ancesotr for the given album
     * @param fullState - The full directory state
     * @returns True if potentialAncestor is part of this album's directory tree
     */
    hasAncestor(potentialAncestor: Album, fullQueue: Album[]): boolean {
        if (this.parentAlbumUUID === ``) { // If this is a root album, the potentialAncestor cannot be a ancestor
            return false;
        }

        if (potentialAncestor.getUUID() === this.parentAlbumUUID) { // If the ancestor is the parent, return true
            return true;
        }

        // Find actual parent
        const parent = fullQueue.find(album => album.getUUID() === this.parentAlbumUUID);
        // If there is a parent, check if it has the ancestor
        if (parent) {
            return parent.hasAncestor(potentialAncestor, fullQueue);
        }

        return false;
    }
}