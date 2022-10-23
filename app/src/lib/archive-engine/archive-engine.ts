import {OptionValues} from 'commander';
import {getLogger} from '../logger.js';
import {AlbumType} from '../photos-library/model/album.js';
import {Asset} from '../photos-library/model/asset.js';
import {PhotosLibrary} from '../photos-library/photos-library.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import {iCloud} from '../icloud/icloud.js';

export class ArchiveEngine {
    /**
     * Default logger for the class
     */
    protected logger = getLogger(this);

    noRemoteDelete: boolean;
    photosLibrary: PhotosLibrary;
    icloud: iCloud;

    constructor(cliOpts: OptionValues, photosLibrary: PhotosLibrary, icloud: iCloud) {
        this.noRemoteDelete = cliOpts.noRemoteDelete;
        this.icloud = icloud;
        this.photosLibrary = photosLibrary;
    }

    /**
     * This will archive an Album stored in the given location and delete it's remote representation, unless noRemoteDelete is set
     * @param archivePath - The path to the local album. The named path is expected.
     * @param assetList - The current remote asset list
     * @returns A Promise, that resolves once the path has been archived
     */
    async archivePath(archivePath: string, assetList: Asset[]) {
        this.logger.debug(`Archiving path ${archivePath}`);

        const albumName = path.basename(archivePath);
        if (albumName.startsWith(`.`)) {
            throw new Error(`UUID path selected, use named path only`);
        }

        const parentFolderPath = path.dirname(archivePath);
        const [archivedAlbum, archivedAlbumPath] = await this.photosLibrary.readFolderFromDisk(albumName, parentFolderPath, ``);
        if (archivedAlbum.albumType !== AlbumType.ALBUM) {
            throw new Error(`Only able to archive non-archived albums`);
        }

        const loadedAlbum = (await this.photosLibrary.loadAlbum(archivedAlbum, archivedAlbumPath)).find(album => album.albumName === albumName);

        if (!loadedAlbum) {
            throw new Error(`Unable to load album`);
        }

        if (Object.keys(loadedAlbum.assets).length === 0) {
            throw new Error(`Folder is empty!`);
        }

        this.logger.debug(`Persisting ${Object.keys(loadedAlbum.assets).length} items`);
        // Iterating over all album items to persist them
        return Promise.all(Object.keys(loadedAlbum.assets).map(async uuidFilename => {
            const assetPath = path.join(this.photosLibrary.assetDir, uuidFilename);
            const archivedAssetPath = path.join(archivedAlbumPath, loadedAlbum.assets[uuidFilename]);

            return this.persistAsset(assetPath, archivedAssetPath)
                .then(() => this.deleteRemoteAsset(assetPath, assetList))
                .catch(err => {
                    this.logger.warn(`Unable to archive item: ${err.message}`);
                });
        }));
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
        if (this.noRemoteDelete) {
            return;
        }

        // Get asset UUID to find record name from assetList
        const assetUUID = Buffer.from(path.parse(assetPath).name, `base64url`).toString(`base64`);
        const asset = assetList.find(asset => asset.getUUID() === assetUUID);

        if (!asset) {
            throw new Error(`Unable to find asset with UUID ${assetUUID}`);
        }

        if (!asset.recordName) {
            throw new Error(`Unable to get record name for asset ${asset.getDisplayName()}`);
        }

        if (asset.isFavorite) {
            return this.logger.debug(`Not deleting fav'ed asset ${asset.getDisplayName()}`);
        }

        this.logger.debug(`Deleting asset ${asset.recordName}`);
        return this.icloud.photos.deleteAsset(asset.recordName);
    }
}