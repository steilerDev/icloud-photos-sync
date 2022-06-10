import {Model, Sequelize, DataTypes} from "sequelize";

export enum AlbumType {
    FOLDER = 3,
    ALBUM = 0
}

export enum AlbumState {
    EXISTING = 0,
    NEW = 1,
    CHANGED = 2,
    EXPIRED = 3,
    LOCKED = 4
}

/**
 * This class represents a photo album within the library
 */
export class Album extends Model {
    declare recordName: string;
    declare albumType: AlbumType;
    declare albumName: string;
    declare albumState: AlbumState;
    declare deleted: boolean;

    static initAlbums(sequelize: Sequelize) {
        Album.init({
            recordName: {
                type: DataTypes.STRING,
                primaryKey: true,
            },
            albumType: DataTypes.INTEGER,
            albumName: DataTypes.STRING,
            deleted: DataTypes.BOOLEAN,
        }, {sequelize});
    }

    static buildAlbumInstance(recordName: string, albumType: AlbumType, albumName: string, deleted: boolean, parentAlbum?: string): Album {
        const newAlbum = Album.build({
            recordName,
            albumType,
            albumName,
            deleted,
            parentAlbum,
        });

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
            return Album.buildAlbumInstance(recordName, albumType, albumName, deleted, parentId);
        } catch (err) {
            return Album.buildAlbumInstance(recordName, albumType, albumName, deleted);
        }
    }
}