import {getLogger} from '../logger.js';
import {AlbumType} from '../photos-library/model/album.js';
import {Asset} from '../photos-library/model/asset.js';
import {PhotosLibrary} from '../photos-library/photos-library.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import {iCloud} from '../icloud/icloud.js';
import {ArchiveApp} from '../../app/icloud-app.js';
import {ErrorHandler} from '../../app/error/handler.js';
import {ArchiveError} from '../../app/error/types.js';
import EventEmitter from 'events';
import * as ARCHIVE_ENGINE from './constants.js';

export class ArchiveEngine extends EventEmitter {
    /**
     * Default logger for the class
     */
    protected logger = getLogger(this);

    remoteDelete: boolean;
    photosLibrary: PhotosLibrary;
    icloud: iCloud;
    errorHandler: ErrorHandler;

    /**
     * Creates a new Archive Engine object
     * @param app - The application holding references to necessary objects (iCloud connection, Photos Library & CLI options)
     */
    constructor(app: ArchiveApp) {
        super();
        this.remoteDelete = app.options.remoteDelete;
        this.errorHandler = app.errorHandler;
        this.icloud = app.icloud;
        this.photosLibrary = app.photosLibrary;
    }

    /**
     * This will archive an Album stored in the given location and delete it's remote representation, unless noRemoteDelete is set
     * @param archivePath - The path to the local album. The named path is expected.
     * @param assetList - The current remote asset list
     * @returns A Promise, that resolves once the path has been archived
     */
    async archivePath(archivePath: string, assetList: Asset[]): Promise<any> {
        this.logger.debug(`Archiving path ${archivePath}`);
        this.emit(ARCHIVE_ENGINE.EVENTS.ARCHIVE_START, archivePath);

        const albumName = path.basename(archivePath);
        if (albumName.startsWith(`.`)) {
            throw new ArchiveError(`UUID path selected, use named path only`, `FATAL`);
        }

        const parentFolderPath = path.dirname(archivePath);
        const [archivedAlbum, archivedAlbumPath] = await this.photosLibrary.readFolderFromDisk(albumName, parentFolderPath, ``);
        if (archivedAlbum.albumType !== AlbumType.ALBUM) {
            throw new ArchiveError(`Only able to archive non-archived albums`, `FATAL`);
        }

        const loadedAlbum = (await this.photosLibrary.loadAlbum(archivedAlbum, archivedAlbumPath)).find(album => album.albumName === albumName);

        if (!loadedAlbum) {
            throw new ArchiveError(`Unable to load album`, `FATAL`);
        }

        if (Object.keys(loadedAlbum.assets).length === 0) {
            throw new ArchiveError(`Folder is empty!`, `FATAL`);
        }

        const numberOfItems = Object.keys(loadedAlbum.assets).length;
        this.logger.debug(`Persisting ${numberOfItems} items`);
        this.emit(ARCHIVE_ENGINE.EVENTS.PERSISTING_START, numberOfItems);
        // Iterating over all album items to persist them
        await Promise.all(Object.keys(loadedAlbum.assets).map(async uuidFilename => {
            const assetPath = path.join(this.photosLibrary.assetDir, uuidFilename);
            const archivedAssetPath = path.join(archivedAlbumPath, loadedAlbum.assets[uuidFilename]);

            return this.persistAsset(assetPath, archivedAssetPath)
                .then(() => this.deleteRemoteAsset(assetPath, assetList))
                .catch(err => {
                    this.errorHandler.handle(new ArchiveError(err, `WARN`));
                });
        }));

        this.emit(ARCHIVE_ENGINE.EVENTS.ARCHIVE_DONE);
    }

    /**
     * Persists a locally cached asset in the proper folder
     * @param assetPath - Path to the assets file path in the Assets folder
     * @param archivedAssetPath - The target path of the asset (with filename)
     * @returns A Promise that resolves, once the file has been copied
     */
    async persistAsset(assetPath: string, archivedAssetPath: string): Promise<void> {
        this.logger.debug(`Persisting ${assetPath} to ${archivedAssetPath}`);
        return fs.unlink(archivedAssetPath).then(() => fs.copyFile(assetPath, archivedAssetPath));
    }

    /**
     * Deletes the associated assets on the iCloud backend, given their local assetPath
     * @param assetPath - The path to the assets location in the Assets folder
     * @param assetList - A full list of all remote assets
     * @returns A Promise, that resolves, once the remote asset has been deleted
     */
    async deleteRemoteAsset(assetPath: string, assetList: Asset[]) {
        if (!this.remoteDelete) {
            return;
        }

        // Get asset UUID to find record name from assetList
        const assetUUID = Buffer.from(path.parse(assetPath).name, `base64url`).toString(`base64`);
        const asset = assetList.find(asset => asset.getUUID() === assetUUID);

        if (!asset) {
            throw new ArchiveError(`Unable to find asset with UUID ${assetUUID}`, `FATAL`).addContext(`assetList`, assetList);
        }

        if (!asset.recordName) {
            throw new ArchiveError(`Unable to get record name for asset ${asset.getDisplayName()}`, `FATAL`).addContext(`asset`, asset);
        }

        if (asset.isFavorite) {
            return this.logger.debug(`Not deleting fav'ed asset ${asset.getDisplayName()}`);
        }

        this.logger.debug(`Deleting asset ${asset.recordName}`);
        return this.icloud.photos.deleteAsset(asset.recordName);
    }
}