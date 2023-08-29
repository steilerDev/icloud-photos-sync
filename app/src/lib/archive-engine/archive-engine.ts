import {AlbumType} from '../photos-library/model/album.js';
import {Asset} from '../photos-library/model/asset.js';
import {PhotosLibrary} from '../photos-library/photos-library.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import {iCloud} from '../icloud/icloud.js';
import {iCPSError} from '../../app/error/error.js';
import {ARCHIVE_ERR} from '../../app/error/error-codes.js';
import {Resources} from '../resources/main.js';
import {iCPSEventArchiveEngine, iCPSEventRuntimeWarning} from '../resources/events-types.js';

export class ArchiveEngine {
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
     * @param icloud - The iCloud connection
     * @param photosLibrary - The local photos library
     */
    constructor(icloud: iCloud, photosLibrary: PhotosLibrary) {
        this.icloud = icloud;
        this.photosLibrary = photosLibrary;
    }

    /**
     * This will archive an Album stored in the given location and delete it's remote representation, if remoteDelete is set
     * @remarks This function expects the asset to be located in the primary zone - shared assets in folders is currently not supported by the api
     * @param archivePath - The path to the local album. The named path is expected.
     * @param assetList - The current remote asset list
     * @returns A Promise, that resolves once the path has been archived
     */
    async archivePath(archivePath: string, assetList: Asset[]) {
        Resources.logger(this).debug(`Archiving path ${archivePath}`);
        Resources.emit(iCPSEventArchiveEngine.ARCHIVE_START, archivePath);

        if (assetList.length === 0) {
            throw new iCPSError(ARCHIVE_ERR.NO_ASSETS);
        }

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
        Resources.logger(this).debug(`Persisting ${numberOfItems} items`);
        Resources.emit(iCPSEventArchiveEngine.PERSISTING_START, numberOfItems);

        // Iterating over all album items to persist them
        const remoteDeleteList = await Promise.all(Object.keys(loadedAlbum.assets).map(async uuidFilename => {
            const assetPath = path.join(this.photosLibrary.primaryAssetDir, uuidFilename);
            const archivedAssetPath = path.join(archivedAlbumPath, loadedAlbum.assets[uuidFilename]);

            try {
                await this.persistAsset(assetPath, archivedAssetPath);
                return this.prepareForRemoteDeletion(assetPath, assetList);
            } catch (err) {
                Resources.emit(iCPSEventRuntimeWarning.ARCHIVE_ASSET_ERROR, new iCPSError(ARCHIVE_ERR.PERSIST_FAILED)
                    .addCause(err)
                    .addContext(`assetPath`, assetPath)
                    .addContext(`archivedAssetPath`, archivedAssetPath),
                );
                return undefined;
            }
        }));

        // Filtering for unique & undefined entries
        const uniqueDeleteList = [...new Set(remoteDeleteList.filter(obj => obj !== undefined))];
        if (uniqueDeleteList && uniqueDeleteList.length > 0 && Resources.manager().remoteDelete) {
            try {
                Resources.emit(iCPSEventArchiveEngine.REMOTE_DELETE, uniqueDeleteList.length);
                await this.icloud.photos.deleteAssets(uniqueDeleteList);
            } catch (err) {
                throw new iCPSError(ARCHIVE_ERR.REMOTE_DELETE_FAILED)
                    .addCause(err);
            }
        }

        Resources.emit(iCPSEventArchiveEngine.ARCHIVE_DONE);
    }

    /**
     * Persists a locally cached asset in the proper folder - applying original files m & a times accordingly
     * @param assetPath - Path to the assets file path in the Assets folder
     * @param archivedAssetPath - The target path of the asset (with filename)
     * @returns A Promise that resolves, once the file has been copied
     */
    async persistAsset(assetPath: string, archivedAssetPath: string): Promise<void> {
        Resources.logger(this).debug(`Persisting ${assetPath} to ${archivedAssetPath}`);
        try {
            const fileStat = await fs.stat(assetPath);
            // Const lFileStat = await fs.lstat(archivedAssetPath)
            await fs.unlink(archivedAssetPath);
            await fs.copyFile(assetPath, archivedAssetPath);
            await fs.utimes(archivedAssetPath, fileStat.mtime, fileStat.mtime);
        } catch (err) {
            new iCPSError(ARCHIVE_ERR.PERSIST_FAILED)
                .addCause(err)
                .addContext(`assetPath`, assetPath)
                .addContext(`archivedAssetPath`, archivedAssetPath);
        }
    }

    /**
     * Prepares the asset for deletion
     * @param assetPath - The path to the assets location in the Assets folder
     * @param assetList - A full list of all remote assets
     * @returns A string containing the asset's recordName or undefined, if the asset should not be deleted
     * @throws An ArchiveWarning if loading fails
     */
    prepareForRemoteDeletion(assetPath: string, assetList: Asset[]): string | undefined {
        if (!Resources.manager().remoteDelete) {
            return undefined;
        }

        // Get asset UUID to find record name from assetList
        const assetUUID = Buffer.from(path.parse(assetPath).name, `base64url`).toString(`base64`);
        const asset = assetList.find(asset => asset.getUUID() === assetUUID);

        if (!asset) {
            throw new iCPSError(ARCHIVE_ERR.NO_REMOTE_ASSET)
                .addMessage(assetUUID)
                .addContext(`assetList`, assetList);
        }

        if (!asset.recordName) {
            throw new iCPSError(ARCHIVE_ERR.NO_REMOTE_RECORD_NAME)
                .addMessage(asset.getDisplayName())
                .addContext(`asset`, asset);
        }

        if (asset.isFavorite) {
            Resources.logger(this).debug(`Not deleting favorite asset ${asset.getDisplayName()}`);
            return undefined;
        }

        Resources.logger(this).debug(`Returning asset ${asset.recordName} for deletion`);
        return asset.recordName;
    }
}