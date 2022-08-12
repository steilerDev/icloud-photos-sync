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

    async archivePath(archivePath: string, assetList: Asset[]) {
        this.logger.debug(`Archiving path ${archivePath}`);
        const albumType = await this.photosLibrary.readAlbumTypeFromPath(archivePath);
        if (albumType !== AlbumType.ALBUM) {
            throw new Error(`Only able to load non-archived albums`);
        }

        // Getting all items within the album
        const albumItems = (await fs.readdir(archivePath, {withFileTypes: true}))
            .filter(item => item.isSymbolicLink());
        // There should be more then one item in the album
        if (albumItems.length === 0) {
            throw new Error(`Folder is empty!`);
        }

        this.logger.debug(`Persisting ${albumItems.length} items`);
        // Iterating over all album items to persist them
        await Promise.allSettled(albumItems.map(item => {
            const itemPath = path.join(archivePath, item.name); // Getting full path to linked item
            return fs.readlink(itemPath) // Checking where the asset file is located
                .then(assetPath => this.persistRemoteAsset(assetPath, itemPath)) // Persisting the asset from the asset folder
                .then(assetPath => this.deleteRemoteAsset(assetPath, assetList))
                .catch(err => this.logger.warn(`Unable to archive item: ${err.message}`));
        }));
    }

    async persistRemoteAsset(assetPath: string, targetItemPath: string): Promise<string> {
        this.logger.debug(`Persisting ${assetPath} to ${targetItemPath}`);
        await fs.copyFile(assetPath, targetItemPath);
        return assetPath;
    }

    async deleteRemoteAsset(assetPath: string, assetList: Asset[]) {
        if (this.noRemoteDelete) {
            return;
        }

        // Get asset UUID to find record name from assetList
        const assetUUID = path.parse(assetPath).name;
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