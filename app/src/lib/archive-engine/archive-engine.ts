import {getLogger} from '../logger.js';
import {AlbumType} from '../photos-library/model/album.js';
import {Asset} from '../photos-library/model/asset.js';
import {PhotosLibrary} from '../photos-library/photos-library.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import {iCloud} from '../icloud/icloud.js';
import {ArchiveApp} from '../../app/icloud-app.js';
import {iCPSError} from '../../app/error/error.js';
import EventEmitter from 'events';
import * as ARCHIVE_ENGINE from './constants.js';
import {HANDLER_EVENT} from '../../app/event/error-handler.js';
import {ARCHIVE_ERR} from '../../app/error/error-codes.js';

export class ArchiveEngine extends EventEmitter {
    /**
     * Default logger for the class
     */
    protected logger = getLogger(this);

    /**
     * True if remote assets should be deleted upon archiving
     */
    remoteDelete: boolean;

    /**
     * The local photos library
     */
    photosLibrary: PhotosLibrary;

    /**
     * The remote iCloud connection
     */
    icloud: iCloud;

    /**
     * Creates a new Archive Engine object
     * @param app - The application holding references to necessary objects (iCloud connection, Photos Library & CLI options)
     */
    constructor(app: ArchiveApp) {
        super();
        this.remoteDelete = app.options.remoteDelete;
        this.icloud = app.icloud;
        this.photosLibrary = app.photosLibrary;
    }

    /**
     * This will archive an Album stored in the given location and delete it's remote representation, if remoteDelete is set
     * @remarks This function expects the asset to be located in the primary zone - shared assets in folders is currently not supported by the api
     * @param archivePath - The path to the local album. The named path is expected.
     * @param assetList - The current remote asset list
     * @returns A Promise, that resolves once the path has been archived
     */
    async archivePath(archivePath: string, assetList: Asset[]) {
        this.logger.debug(`Archiving path ${archivePath}`);
        this.emit(ARCHIVE_ENGINE.EVENTS.ARCHIVE_START, archivePath);

        const albumName = path.basename(archivePath);
        if (albumName.startsWith(`.`)) {
            throw new iCPSError(ARCHIVE_ERR.UUID_PATH);
        }

        const parentFolderPath = path.dirname(archivePath);
        const [archivedAlbum, archivedAlbumPath] = await this.photosLibrary.readFolderFromDisk(albumName, parentFolderPath, ``);
        if (archivedAlbum.albumType !== AlbumType.ALBUM) {
            throw new iCPSError(ARCHIVE_ERR.NON_ALBUM);
        }

        const loadedAlbum = (await this.photosLibrary.loadAlbum(archivedAlbum, archivedAlbumPath)).find(album => album.albumName === albumName);

        if (!loadedAlbum || Object.keys(loadedAlbum.assets).length === 0) {
            throw new iCPSError(ARCHIVE_ERR.LOAD_FAILED);
        }

        const numberOfItems = Object.keys(loadedAlbum.assets).length;
        this.logger.debug(`Persisting ${numberOfItems} items`);
        this.emit(ARCHIVE_ENGINE.EVENTS.PERSISTING_START, numberOfItems);

        // Iterating over all album items to persist them
        const remoteDeleteList = await Promise.all(Object.keys(loadedAlbum.assets).map(async uuidFilename => {
            const assetPath = path.join(this.photosLibrary.primaryAssetDir, uuidFilename);
            const archivedAssetPath = path.join(archivedAlbumPath, loadedAlbum.assets[uuidFilename]);

            try {
                await this.persistAsset(assetPath, archivedAssetPath);
            } catch (err) {
                this.emit(HANDLER_EVENT, new iCPSError(ARCHIVE_ERR.PERSIST_FAILED)
                    .addCause(err)
                    .addContext(`assetPath`, assetPath)
                    .addContext(`archivedAssetPath`, archivedAssetPath),
                );
                return undefined;
            }

            try {
                return this.prepareForRemoteDeletion(assetPath, assetList);
            } catch (err) {
                this.emit(HANDLER_EVENT, err);
                return undefined;
            }
        }));

        // Filtering for unique & undefined entries
        const uniqueDeleteList = [...new Set(remoteDeleteList.filter(obj => obj !== undefined))];
        if (uniqueDeleteList && uniqueDeleteList.length > 0 && this.remoteDelete) {
            try {
                this.emit(ARCHIVE_ENGINE.EVENTS.REMOTE_DELETE, uniqueDeleteList.length);
                await this.icloud.photos.deleteAssets(uniqueDeleteList);
            } catch (err) {
                throw new iCPSError(ARCHIVE_ERR.REMOTE_DELETE_FAILED)
                    .addCause(err);
            }
        }

        this.emit(ARCHIVE_ENGINE.EVENTS.ARCHIVE_DONE);
    }

    /**
     * Persists a locally cached asset in the proper folder - applying original files m & a times accordingly
     * @param assetPath - Path to the assets file path in the Assets folder
     * @param archivedAssetPath - The target path of the asset (with filename)
     * @returns A Promise that resolves, once the file has been copied
     */
    async persistAsset(assetPath: string, archivedAssetPath: string): Promise<void> {
        this.logger.debug(`Persisting ${assetPath} to ${archivedAssetPath}`);
        const fileStat = await fs.stat(assetPath);
        // Const lFileStat = await fs.lstat(archivedAssetPath)
        await fs.unlink(archivedAssetPath);
        await fs.copyFile(assetPath, archivedAssetPath);
        await fs.utimes(archivedAssetPath, fileStat.mtime, fileStat.mtime);
    }

    /**
     * Prepares the asset for deletion
     * @param assetPath - The path to the assets location in the Assets folder
     * @param assetList - A full list of all remote assets
     * @returns A string containing the asset's recordName or undefined, if the asset should not be deleted
     * @throws An ArchiveWarning if loading fails
     */
    prepareForRemoteDeletion(assetPath: string, assetList: Asset[]): string | undefined {
        if (!this.remoteDelete) {
            return undefined;
        }

        // Get asset UUID to find record name from assetList
        const assetUUID = Buffer.from(path.parse(assetPath).name, `base64url`).toString(`base64`);
        const asset = assetList.find(asset => asset.getUUID() === assetUUID);

        if (!asset) {
            throw new iCPSError(ARCHIVE_ERR.NO_REMOTE_ASSET)
                .addMessage(assetUUID)
                .addContext(`assetList`, assetList)
                .setWarning();
        }

        if (!asset.recordName) {
            throw new iCPSError(ARCHIVE_ERR.NO_REMOTE_RECORD_NAME)
                .addMessage(asset.getDisplayName())
                .addContext(`asset`, asset)
                .setWarning();
        }

        if (asset.isFavorite) {
            this.logger.debug(`Not deleting favorite asset ${asset.getDisplayName()}`);
            return undefined;
        }

        this.logger.debug(`Returning asset ${asset.recordName} for deletion`);
        return asset.recordName;
    }
}