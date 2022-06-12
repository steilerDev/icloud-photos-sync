import log from 'loglevel';
import {EventEmitter} from 'events';
import {iCloud} from '../icloud/icloud.js';
import {PhotosLibrary} from '../photos-library/photos-library.js';
import {Album, AlbumType} from '../photos-library/model/album.js';

/**
 * This class handles the photos sync
 */
export class SyncEngine extends EventEmitter {
    /**
     * Default logger for the class
     */
    logger: log.Logger = log.getLogger(`Sync-Engine`);

    iCloud: iCloud;

    db: PhotosLibrary;

    constructor(iCloud: iCloud, db: PhotosLibrary) {
        super();
        this.iCloud = iCloud;
        this.db = db;
    }

    async fetchState() {
        this.logger.debug(`Fetching remote iCloud state`);
        const iCloudFolderStructure = await this.fetchFolderStructure();
    }

    async syncFolderStructure() {
        this.logger.debug(`Syncing folder structure`);
        const iCloudFolderStructure = await this.fetchFolderStructure();
        this.logger.debug(`Fetched folder structure from iCloud, comparing to folder structure in database`);
        if (this.db.isEmpty) {
            this.logger.debug(`Database currently empty, populating with iCloud state`);
            this.db.library.albums = iCloudFolderStructure;
        } else {
            // ICloudFolderStructure.
            // Diffk
        }
    }

    /**
     * Fetching folder structure from iCloud
     * @returns Current iCloud folder structure
     */
    async fetchFolderStructure(): Promise<Album[]> {
        this.logger.debug(`Fetching remote folder structure`);
        // Albums are stored here
        const parsedFolders: Album[] = [];
        try {
            // Getting root folders
            const folders = await this.iCloud.photos.fetchAllAlbumRecords();
            while (folders.length > 0) {
                try {
                    const parsedFolder: Album = Album.parseAlbumFromRequest(folders.shift());
                    this.logger.debug(`Parsed folder: ${parsedFolder.albumName} (type ${parsedFolder.albumType})`);
                    parsedFolders.push(parsedFolder);

                    // If album is a folder, there is stuff in there, adding it to the queue
                    if (parsedFolder.albumType === AlbumType.FOLDER) {
                        this.logger.debug(`Adding child folders of ${parsedFolder.albumName} to the processing queue`);
                        const nestedFolders = await this.iCloud.photos.fetchAllAlbumRecordsByParentId(parsedFolder.recordName);
                        folders.push(...nestedFolders);
                    } else if (parsedFolder.albumType === AlbumType.ALBUM) {
                        this.logger.debug(`Adding pictures to folder ${parsedFolder.albumName}`);
                        const pictures = await this.fetchPicturesForAlbum(parsedFolder.recordName);
                        parsedFolder.mediaRecords = pictures;
                    }
                } catch (err) {
                    this.logger.warn(err.message);
                }
            }
        } catch (err) {
            throw new Error(`Unable to fetch folder structure: ${err}`);
        }

        return parsedFolders;
    }

    async fetchPicturesForAlbum(parentId: string): Promise<string[]> {
        const parsedPictures: string[] = [];
        try {
            const pictureRecords = await this.iCloud.photos.fetchAllPictureRecordsByParentId(parentId);
            const pictureRecordNames = pictureRecords.map(picture => picture.recordName);
            this.logger.debug(`Got ${pictureRecordNames.length} picture records for ${parentId}`);
            // {"query":{"recordType":"CPLContainerRelationLiveByPosition","filterBy":[{"fieldName":"startRank","comparator":"EQUALS","fieldValue":{"value":0,"type":"INT64"}},{"fieldName":"direction","comparator":"EQUALS","fieldValue":{"value":"ASCENDING","type":"STRING"}},{"fieldName":"parentId","comparator":"EQUALS","fieldValue":{"value":"D4F02F70-C805-499B-99D0-5E337710EF47","type":"STRING"}}]},"zoneID":{"zoneName":"PrimarySync","ownerRecordName":"_e8a2d278a868306ca55d7fc05a299b73","zoneType":"REGULAR_CUSTOM_ZONE"},"desiredKeys":["addedDate","adjustmentRenderType","adjustmentType","assetDate","assetHDRType","assetSubtype","assetSubtypeV2","burstFlags","burstFlagsExt","burstId","captionEnc","codec","containerId","customRenderedValue","dataClassType","dateExpunged","duration","filenameEnc","importedBy","isDeleted","isExpunged","isFavorite","isHidden","isKeyAsset","itemId","itemType","locationEnc","locationLatitude","locationLongitude","locationV2Enc","masterRef","mediaMetaDataEnc","mediaMetaDataType","orientation","originalOrientation","position","recordChangeTag","recordName","recordType","remappedRef","resJPEGFullFileType","resJPEGFullFingerprint","resJPEGFullHeight","resJPEGFullRes","resJPEGFullWidth","resJPEGLargeFileType","resJPEGLargeFingerprint","resJPEGLargeHeight","resJPEGLargeRes","resJPEGLargeWidth","resJPEGMedFileType","resJPEGMedFingerprint","resJPEGMedHeight","resJPEGMedRes","resJPEGMedWidth","resJPEGThumbFileType","resJPEGThumbFingerprint","resJPEGThumbHeight","resJPEGThumbRes","resJPEGThumbWidth","resOriginalAltFileType","resOriginalAltFingerprint","resOriginalAltHeight","resOriginalAltRes","resOriginalAltWidth","resOriginalFileType","resOriginalFingerprint","resOriginalHeight","resOriginalRes","resOriginalVidComplFileType","resOriginalVidComplFingerprint","resOriginalVidComplHeight","resOriginalVidComplRes","resOriginalVidComplWidth","resOriginalWidth","resSidecarFileType","resSidecarFingerprint","resSidecarHeight","resSidecarRes","resSidecarWidth","resVidFullFileType","resVidFullFingerprint","resVidFullHeight","resVidFullRes","resVidFullWidth","resVidHDRMedRes","resVidMedFileType","resVidMedFingerprint","resVidMedHeight","resVidMedRes","resVidMedWidth","resVidSmallFileType","resVidSmallFingerprint","resVidSmallHeight","resVidSmallRes","resVidSmallWidth","timeZoneOffset","vidComplDispScale","vidComplDispValue","vidComplDurScale","vidComplDurValue","vidComplVisibilityState","videoFrameRate","zoneID"],"resultsLimit":75}
        } catch (err) {
            throw new Error(`Unable to get photos for album (${parentId}): ${err.message}`);
        }

        return parsedPictures;
    }

    // Async fetchAllPictures(): Promise<MediaRecord[]> {

    // Get all pictures count, query {"query":{"recordType":"HyperionIndexCountLookup","filterBy":{"fieldName":"indexCountID","comparator":"IN","fieldValue":{"value":["CPLAssetByAddedDate"],"type":"STRING_LIST"}}},"zoneID":{"zoneName":"PrimarySync","ownerRecordName":"_e8a2d278a868306ca55d7fc05a299b73","zoneType":"REGULAR_CUSTOM_ZONE"}}
    // Get all pictures {"query":{"recordType":"CPLAssetAndMasterByAssetDateWithoutHiddenOrDeleted","filterBy":[{"fieldName":"startRank","comparator":"EQUALS","fieldValue":{"value":16,"type":"INT64"}},{"fieldName":"direction","comparator":"EQUALS","fieldValue":{"value":"DESCENDING","type":"STRING"}}]},"zoneID":{"zoneName":"PrimarySync","ownerRecordName":"_e8a2d278a868306ca55d7fc05a299b73","zoneType":"REGULAR_CUSTOM_ZONE"},"desiredKeys":["addedDate","adjustmentRenderType","adjustmentType","assetDate","assetHDRType","assetSubtype","assetSubtypeV2","burstFlags","burstFlagsExt","burstId","captionEnc","codec","customRenderedValue","dataClassType","dateExpunged","duration","filenameEnc","importedBy","isDeleted","isExpunged","isFavorite","isHidden","itemType","locationEnc","locationLatitude","locationLongitude","locationV2Enc","masterRef","mediaMetaDataEnc","mediaMetaDataType","orientation","originalOrientation","recordChangeTag","recordName","recordType","remappedRef","resJPEGFullFileType","resJPEGFullFingerprint","resJPEGFullHeight","resJPEGFullRes","resJPEGFullWidth","resJPEGLargeFileType","resJPEGLargeFingerprint","resJPEGLargeHeight","resJPEGLargeRes","resJPEGLargeWidth","resJPEGMedFileType","resJPEGMedFingerprint","resJPEGMedHeight","resJPEGMedRes","resJPEGMedWidth","resJPEGThumbFileType","resJPEGThumbFingerprint","resJPEGThumbHeight","resJPEGThumbRes","resJPEGThumbWidth","resOriginalAltFileType","resOriginalAltFingerprint","resOriginalAltHeight","resOriginalAltRes","resOriginalAltWidth","resOriginalFileType","resOriginalFingerprint","resOriginalHeight","resOriginalRes","resOriginalVidComplFileType","resOriginalVidComplFingerprint","resOriginalVidComplHeight","resOriginalVidComplRes","resOriginalVidComplWidth","resOriginalWidth","resSidecarFileType","resSidecarFingerprint","resSidecarHeight","resSidecarRes","resSidecarWidth","resVidFullFileType","resVidFullFingerprint","resVidFullHeight","resVidFullRes","resVidFullWidth","resVidHDRMedRes","resVidMedFileType","resVidMedFingerprint","resVidMedHeight","resVidMedRes","resVidMedWidth","resVidSmallFileType","resVidSmallFingerprint","resVidSmallHeight","resVidSmallRes","resVidSmallWidth","timeZoneOffset","vidComplDispScale","vidComplDispValue","vidComplDurScale","vidComplDurValue","vidComplVisibilityState","videoFrameRate","zoneID"],"resultsLimit":34}
    // Filter for CPLMaster
    // }
}