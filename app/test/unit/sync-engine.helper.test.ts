
import {CPLAlbum, CPLAsset, CPLMaster} from '../../src/lib/icloud/icloud-photos/query-parser';
import expectedAssetsAll from "../api/_data/expected.all-cpl-assets.json";
import expectedMastersAll from "../api/_data/expected.all-cpl-masters.json";
import expectedAlbumsAll from "../api/_data/expected.all-cpl-albums.json";
import {describe, test, expect} from '@jest/globals';
import {SyncEngineHelper} from '../../src/lib/sync-engine/helper';
import {getRandomZone, queueIsSorted} from '../_helpers/sync-engine.helper';
import {Asset, AssetType} from '../../src/lib/photos-library/model/asset';
import {FileType} from '../../src/lib/photos-library/model/file-type';
import {Album, AlbumType} from '../../src/lib/photos-library/model/album';
import {PEntity, PLibraryEntities} from '../../src/lib/photos-library/model/photos-entity';
import {prepareResources} from '../_helpers/_general';
import {iCPSEventRuntimeWarning} from '../../src/lib/resources/events-types';

describe(`Processing remote records`, () => {
    test(`Converting Assets - E2E Flow`, () => {
        const cplAssets = expectedAssetsAll.map((pseudoAsset: any) => {
            if (pseudoAsset.resource) {
                pseudoAsset.resource.downloadURL = `https:/icloud.com`;
            }

            return pseudoAsset;
        }) as CPLAsset[];

        const cplMasters = expectedMastersAll.map((pseudoMaster: any) => {
            pseudoMaster.resource.downloadURL = `https:/icloud.com`;
            return pseudoMaster;
        }) as unknown as CPLMaster[];

        const assets = SyncEngineHelper.convertCPLAssets(cplAssets, cplMasters);
        expect(assets.length).toEqual(206); // 202 + 4 edits
        for (const asset of assets) {
            expect(asset.fileChecksum.length).toBeGreaterThan(0);
            expect(asset.size).toBeGreaterThan(0);
            expect(asset.modified).toBeGreaterThan(0);
            expect(asset.fileType).toBeDefined();
            expect(asset.assetType).toBeDefined();
            expect(asset.origFilename.length).toBeGreaterThan(0);
            expect(asset.wrappingKey).toBeDefined();
            expect(asset.wrappingKey?.length).toBeGreaterThan(0);
            expect(asset.referenceChecksum).toBeDefined();
            expect(asset.referenceChecksum?.length).toBeGreaterThan(0);
            expect(asset.downloadURL).toBeDefined();
            expect(asset.downloadURL?.length).toBeGreaterThan(0);
            expect(asset.recordName).toBeDefined();
            expect(asset.recordName?.length).toBeGreaterThan(0);
            expect(asset.isFavorite).toBeDefined();
        }
    });

    test(`Converting Asset - Invalid File Extension`, () => {
        const mockedEventManager = prepareResources()!.event;

        const warnEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.ICLOUD_LOAD_ERROR);

        const cplMasters = [{
            filenameEnc: `emhlbnl1LWx1by13bWZtU054bTl5MC11bnNwbGFzaC5qcGVn`,
            modified: 1660139199098,
            recordName: `ARN5w7b2LvDDhsZ8DnbU3RuZeShX`,
            resourceType: `random.resourceType`,
            resource: {
                fileChecksum: `ARN5w7b2LvDDhsZ8DnbU3RuZeShX`,
                referenceChecksum: `AS/OBaLJzK8dRs8QM97ikJQfJEGI`,
                size: 170384,
                wrappingKey: `NQtpvztdVKKNfrb8lf482g==`,
                downloadURL: `https://icloud.com`,
            },
            zoneName: getRandomZone(),
        } as CPLMaster];

        const cplAssets = [{
            favorite: 0,
            masterRef: `ARN5w7b2LvDDhsZ8DnbU3RuZeShX`,
            modified: 1660139199099,
            recordName: `4E921FD1-74AA-42EE-8601-C3E9B96DA089`,
        } as CPLAsset];

        SyncEngineHelper.convertCPLAssets(cplAssets, cplMasters);

        expect(warnEvent).toHaveBeenCalled();
    });

    test(`Converting Albums - E2E Flow`, () => {
        const cplAlbums = expectedAlbumsAll as CPLAlbum[];

        const albums = SyncEngineHelper.convertCPLAlbums(cplAlbums);
        expect(albums.length).toEqual(8);
        for (const album of albums) {
            expect(album.albumName.length).toBeGreaterThan(0);
            expect(album.uuid.length).toBeGreaterThan(0);
            expect(album.albumType).toBeDefined();
        }
    });
});

describe(`Diffing state`, () => {
    describe(`Asset State`, () => {
        test.each([
            {
                desc: `Add items to empty state`,
                remoteAssets: [
                    new Asset(`somechecksum`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.ORIG, `test`, `somekey`, `somechecksum`, `https://icloud.com`, `somerecordname`, false),
                    new Asset(`somechecksum1`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.EDIT, `test1`, `somekey`, `somechecksum1`, `https://icloud.com`, `somerecordname1`, false),
                    new Asset(`somechecksum2`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.EDIT, `test2`, `somekey`, `somechecksum2`, `https://icloud.com`, `somerecordname2`, false),
                    new Asset(`somechecksum3`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.ORIG, `test3`, `somekey`, `somechecksum3`, `https://icloud.com`, `somerecordname3`, false),
                ],
                localAssets: {},
                expected: {
                    added: 4,
                    deleted: 0,
                    kept: 0,
                },
            }, {
                desc: `Only remove items from existing state`,
                remoteAssets: [],
                localAssets: {
                    somechecksum: new Asset(`somechecksum`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.ORIG, `test`, `somekey`, `somechecksum`, `https://icloud.com`, `somerecordname`, false),
                    somechecksum1: new Asset(`somechecksum1`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.EDIT, `test1`, `somekey`, `somechecksum1`, `https://icloud.com`, `somerecordname1`, false),
                    somechecksum2: new Asset(`somechecksum2`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.EDIT, `test2`, `somekey`, `somechecksum2`, `https://icloud.com`, `somerecordname2`, false),
                    somechecksum3: new Asset(`somechecksum3`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.ORIG, `test3`, `somekey`, `somechecksum3`, `https://icloud.com`, `somerecordname3`, false),
                },
                expected: {
                    added: 0,
                    deleted: 4,
                    kept: 0,
                },
            }, {
                desc: `Only add items to existing state`,
                remoteAssets: [
                    new Asset(`somechecksum`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.ORIG, `test`, `somekey`, `somechecksum`, `https://icloud.com`, `somerecordname`, false),
                    new Asset(`somechecksum1`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.EDIT, `test1`, `somekey`, `somechecksum1`, `https://icloud.com`, `somerecordname1`, false),
                    new Asset(`somechecksum2`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.EDIT, `test2`, `somekey`, `somechecksum2`, `https://icloud.com`, `somerecordname2`, false),
                    new Asset(`somechecksum3`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.ORIG, `test3`, `somekey`, `somechecksum3`, `https://icloud.com`, `somerecordname3`, false),
                ],
                localAssets: {
                    somechecksum: new Asset(`somechecksum`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.ORIG, `test`, `somekey`, `somechecksum`, `https://icloud.com`, `somerecordname`, false),
                },
                expected: {
                    added: 3,
                    deleted: 0,
                    kept: 1,
                },
            }, {
                desc: `Add & remove items from existing state`,
                remoteAssets: [
                    new Asset(`somechecksum`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.ORIG, `test`, `somekey`, `somechecksum`, `https://icloud.com`, `somerecordname`, false),
                    new Asset(`somechecksum1`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.EDIT, `test1`, `somekey`, `somechecksum1`, `https://icloud.com`, `somerecordname1`, false),
                    new Asset(`somechecksum4`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.ORIG, `test4`, `somekey`, `somechecksum4`, `https://icloud.com`, `somerecordname4`, false),
                ],
                localAssets: {
                    somechecksum2: new Asset(`somechecksum2`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.EDIT, `test2`, `somekey`, `somechecksum2`, `https://icloud.com`, `somerecordname2`, false),
                    somechecksum3: new Asset(`somechecksum3`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.ORIG, `test3`, `somekey`, `somechecksum3`, `https://icloud.com`, `somerecordname3`, false),
                    somechecksum4: new Asset(`somechecksum4`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.ORIG, `test4`, `somekey`, `somechecksum4`, `https://icloud.com`, `somerecordname4`, false),
                },
                expected: {
                    added: 2,
                    deleted: 2,
                    kept: 1,
                },
            }, {
                desc: `No change in state`,
                remoteAssets: [
                    new Asset(`somechecksum`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.ORIG, `test`, `somekey`, `somechecksum`, `https://icloud.com`, `somerecordname`, false),
                    new Asset(`somechecksum1`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.EDIT, `test1`, `somekey`, `somechecksum1`, `https://icloud.com`, `somerecordname1`, false),
                    new Asset(`somechecksum2`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.EDIT, `test2`, `somekey`, `somechecksum2`, `https://icloud.com`, `somerecordname2`, false),
                    new Asset(`somechecksum3`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.ORIG, `test3`, `somekey`, `somechecksum3`, `https://icloud.com`, `somerecordname3`, false),
                ],
                localAssets: {
                    somechecksum: new Asset(`somechecksum`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.ORIG, `test`, `somekey`, `somechecksum`, `https://icloud.com`, `somerecordname`, false),
                    somechecksum1: new Asset(`somechecksum1`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.EDIT, `test1`, `somekey`, `somechecksum1`, `https://icloud.com`, `somerecordname1`, false),
                    somechecksum2: new Asset(`somechecksum2`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.EDIT, `test2`, `somekey`, `somechecksum2`, `https://icloud.com`, `somerecordname2`, false),
                    somechecksum3: new Asset(`somechecksum3`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.ORIG, `test3`, `somekey`, `somechecksum3`, `https://icloud.com`, `somerecordname3`, false),
                },
                expected: {
                    added: 0,
                    deleted: 0,
                    kept: 4,
                },
            }, {
                desc: `Only modified changed`,
                remoteAssets: [
                    new Asset(`somechecksum`, 42, FileType.fromExtension(`png`), 1420, getRandomZone(), AssetType.ORIG, `test`, `somekey`, `somechecksum`, `https://icloud.com`, `somerecordname`, false),
                    new Asset(`somechecksum1`, 42, FileType.fromExtension(`png`), 1420, getRandomZone(), AssetType.EDIT, `test1`, `somekey`, `somechecksum1`, `https://icloud.com`, `somerecordname1`, false),
                    new Asset(`somechecksum2`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.EDIT, `test2`, `somekey`, `somechecksum2`, `https://icloud.com`, `somerecordname2`, false),
                    new Asset(`somechecksum3`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.ORIG, `test3`, `somekey`, `somechecksum3`, `https://icloud.com`, `somerecordname3`, false),
                ],
                localAssets: {
                    somechecksum: new Asset(`somechecksum`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.ORIG, `test`, `somekey`, `somechecksum`, `https://icloud.com`, `somerecordname`, false),
                    somechecksum1: new Asset(`somechecksum1`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.EDIT, `test1`, `somekey`, `somechecksum1`, `https://icloud.com`, `somerecordname1`, false),
                    somechecksum2: new Asset(`somechecksum2`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.EDIT, `test2`, `somekey`, `somechecksum2`, `https://icloud.com`, `somerecordname2`, false),
                    somechecksum3: new Asset(`somechecksum3`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.ORIG, `test3`, `somekey`, `somechecksum3`, `https://icloud.com`, `somerecordname3`, false),
                },
                expected: {
                    added: 2,
                    deleted: 2,
                    kept: 2,
                },
            }, {
                desc: `Only content changed`,
                remoteAssets: [
                    new Asset(`somechecksum`, 43, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.ORIG, `test`, `somekey`, `somechecksum`, `https://icloud.com`, `somerecordname`, false),
                    new Asset(`somechecksum1`, 43, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.EDIT, `test1`, `somekey`, `somechecksum1`, `https://icloud.com`, `somerecordname1`, false),
                    new Asset(`somechecksum2`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.EDIT, `test2`, `somekey`, `somechecksum2`, `https://icloud.com`, `somerecordname2`, false),
                    new Asset(`somechecksum3`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.ORIG, `test3`, `somekey`, `somechecksum3`, `https://icloud.com`, `somerecordname3`, false),
                ],
                localAssets: {
                    somechecksum: new Asset(`somechecksum`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.ORIG, `test`, `somekey`, `somechecksum`, `https://icloud.com`, `somerecordname`, false),
                    somechecksum1: new Asset(`somechecksum1`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.EDIT, `test1`, `somekey`, `somechecksum1`, `https://icloud.com`, `somerecordname1`, false),
                    somechecksum2: new Asset(`somechecksum2`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.EDIT, `test2`, `somekey`, `somechecksum2`, `https://icloud.com`, `somerecordname2`, false),
                    somechecksum3: new Asset(`somechecksum3`, 42, FileType.fromExtension(`png`), 42, getRandomZone(), AssetType.ORIG, `test3`, `somekey`, `somechecksum3`, `https://icloud.com`, `somerecordname3`, false),
                },
                expected: {
                    added: 2,
                    deleted: 2,
                    kept: 2,
                },
            },
        ])(`$desc`, ({remoteAssets, localAssets, expected}) => {
            const [toBeDeleted, toBeAdded, toBeKept] = SyncEngineHelper.getProcessingQueues(remoteAssets as Asset[], localAssets as PLibraryEntities<Asset>);
            expect(toBeDeleted.length).toEqual(expected.deleted);
            expect(toBeAdded.length).toEqual(expected.added);
            expect(toBeKept.length).toEqual(expected.kept);
        });
    });

    describe(`Album state`, () => {
        test(`Add items to empty state`, () => {
            const remoteAlbums = [
                new Album(`somechecksum1`, AlbumType.ALBUM, `testAlbum1`, ``),
                new Album(`somechecksum2`, AlbumType.ALBUM, `testAlbum2`, ``),
                new Album(`somechecksum3`, AlbumType.ALBUM, `testAlbum3`, ``),
                new Album(`somechecksum4`, AlbumType.ALBUM, `testAlbum4`, ``),
            ];
            const localAlbums: PLibraryEntities<Album> = {};

            const [toBeDeleted, toBeAdded, toBeKept] = SyncEngineHelper.getProcessingQueues(remoteAlbums, localAlbums);
            expect(toBeDeleted.length).toEqual(0);
            expect(toBeAdded.length).toEqual(4);
            expect(toBeKept.length).toEqual(0);
        });

        test(`Only remove items from existing state`, () => {
            const remoteAlbums: PEntity<Album>[] = [];

            const localAlbums = {
                somechecksum1: new Album(`somechecksum1`, AlbumType.ALBUM, `testAlbum1`, ``),
                somechecksum2: new Album(`somechecksum2`, AlbumType.ALBUM, `testAlbum2`, ``),
                somechecksum3: new Album(`somechecksum3`, AlbumType.ALBUM, `testAlbum3`, ``),
                somechecksum4: new Album(`somechecksum4`, AlbumType.ALBUM, `testAlbum4`, ``),
            };

            const [toBeDeleted, toBeAdded, toBeKept] = SyncEngineHelper.getProcessingQueues(remoteAlbums, localAlbums);
            expect(toBeDeleted.length).toEqual(4);
            expect(toBeAdded.length).toEqual(0);
            expect(toBeKept.length).toEqual(0);
        });

        test(`Only add items to existing state`, () => {
            const remoteAlbums = [
                new Album(`somechecksum1`, AlbumType.ALBUM, `testAlbum1`, ``),
                new Album(`somechecksum2`, AlbumType.ALBUM, `testAlbum2`, ``),
                new Album(`somechecksum3`, AlbumType.ALBUM, `testAlbum3`, ``),
                new Album(`somechecksum4`, AlbumType.ALBUM, `testAlbum4`, ``),
            ];

            const localAlbums = {
                somechecksum1: new Album(`somechecksum1`, AlbumType.ALBUM, `testAlbum1`, ``),
            };

            const [toBeDeleted, toBeAdded, toBeKept] = SyncEngineHelper.getProcessingQueues(remoteAlbums, localAlbums);
            expect(toBeDeleted.length).toEqual(0);
            expect(toBeAdded.length).toEqual(3);
            expect(toBeKept.length).toEqual(1);
        });

        test(`Add & remove items from existing state`, () => {
            const remoteAlbums = [
                new Album(`somechecksum1`, AlbumType.ALBUM, `testAlbum1`, ``),
                new Album(`somechecksum2`, AlbumType.ALBUM, `testAlbum2`, ``),
                new Album(`somechecksum4`, AlbumType.ALBUM, `testAlbum4`, ``),
            ];

            const localAlbums = {
                somechecksum3: new Album(`somechecksum3`, AlbumType.ALBUM, `testAlbum3`, ``),
                somechecksum4: new Album(`somechecksum4`, AlbumType.ALBUM, `testAlbum4`, ``),
                somechecksum5: new Album(`somechecksum5`, AlbumType.ALBUM, `testAlbum5`, ``),
            };

            const [toBeDeleted, toBeAdded, toBeKept] = SyncEngineHelper.getProcessingQueues(remoteAlbums, localAlbums);
            expect(toBeDeleted.length).toEqual(2);
            expect(toBeAdded.length).toEqual(2);
            expect(toBeKept.length).toEqual(1);
        });

        test(`No change in state`, () => {
            const remoteAlbums = [
                new Album(`somechecksum1`, AlbumType.ALBUM, `testAlbum1`, ``),
                new Album(`somechecksum2`, AlbumType.ALBUM, `testAlbum2`, ``),
                new Album(`somechecksum3`, AlbumType.ALBUM, `testAlbum3`, ``),
                new Album(`somechecksum4`, AlbumType.ALBUM, `testAlbum4`, ``),
            ];

            const localAlbums = {
                somechecksum1: new Album(`somechecksum1`, AlbumType.ALBUM, `testAlbum1`, ``),
                somechecksum2: new Album(`somechecksum2`, AlbumType.ALBUM, `testAlbum2`, ``),
                somechecksum3: new Album(`somechecksum3`, AlbumType.ALBUM, `testAlbum3`, ``),
                somechecksum4: new Album(`somechecksum4`, AlbumType.ALBUM, `testAlbum4`, ``),
            };

            const [toBeDeleted, toBeAdded, toBeKept] = SyncEngineHelper.getProcessingQueues(remoteAlbums, localAlbums);
            expect(toBeDeleted.length).toEqual(0);
            expect(toBeAdded.length).toEqual(0);
            expect(toBeKept.length).toEqual(4);
        });

        test(`Album assets changed`, () => {
            // LocalAlbum1 and localAlbum4 are missing assets
            const remoteAlbum1 = new Album(`somechecksum1`, AlbumType.ALBUM, `testAlbum1`, ``);
            remoteAlbum1.assets = {
                'assetChecksum1.png': `fileName1.png`,
                'assetChecksum2.png': `fileName2.png`,
                'assetChecksum3.png': `fileName3.png`,
                'assetChecksum4.png': `fileName4.png`,
            };
            const remoteAlbum2 = new Album(`somechecksum2`, AlbumType.ALBUM, `testAlbum2`, ``);
            remoteAlbum2.assets = {
                'assetChecksum1.png': `fileName1.png`,
                'assetChecksum2.png': `fileName2.png`,
                'assetChecksum3.png': `fileName3.png`,
                'assetChecksum4.png': `fileName4.png`,
            };
            const remoteAlbum3 = new Album(`somechecksum3`, AlbumType.ALBUM, `testAlbum3`, ``);
            remoteAlbum3.assets = {
                'assetChecksum1.png': `fileName1.png`,
                'assetChecksum2.png': `fileName2.png`,
                'assetChecksum3.png': `fileName3.png`,
                'assetChecksum4.png': `fileName4.png`,
            };
            const remoteAlbum4 = new Album(`somechecksum4`, AlbumType.ALBUM, `testAlbum4`, ``);
            remoteAlbum4.assets = {
                'assetChecksum1.png': `fileName1.png`,
                'assetChecksum2.png': `fileName2.png`,
                'assetChecksum3.png': `fileName3.png`,
                'assetChecksum4.png': `fileName4.png`,
            };

            const localAlbum1 = new Album(`somechecksum1`, AlbumType.ALBUM, `testAlbum1`, ``);
            localAlbum1.assets = {
                'assetChecksum1.png': `fileName1.png`,
            };
            const localAlbum2 = new Album(`somechecksum2`, AlbumType.ALBUM, `testAlbum2`, ``);
            localAlbum2.assets = {
                'assetChecksum1.png': `fileName1.png`,
                'assetChecksum2.png': `fileName2.png`,
                'assetChecksum3.png': `fileName3.png`,
                'assetChecksum4.png': `fileName4.png`,
            };
            const localAlbum3 = new Album(`somechecksum3`, AlbumType.ALBUM, `testAlbum3`, ``);
            localAlbum3.assets = {
                'assetChecksum1.png': `fileName1.png`,
                'assetChecksum2.png': `fileName2.png`,
                'assetChecksum3.png': `fileName3.png`,
                'assetChecksum4.png': `fileName4.png`,
            };
            const localAlbum4 = new Album(`somechecksum4`, AlbumType.ALBUM, `testAlbum4`, ``);
            localAlbum4.assets = {
                'assetChecksum1.png': `fileName1.png`,
                'assetChecksum2.png': `fileName2.png`,
            };

            const remoteAlbums = [
                remoteAlbum1,
                remoteAlbum2,
                remoteAlbum3,
                remoteAlbum4,
            ];

            const localAlbums = {
                somechecksum1: localAlbum1,
                somechecksum2: localAlbum2,
                somechecksum3: localAlbum3,
                somechecksum4: localAlbum4,
            };

            const [toBeDeleted, toBeAdded, toBeKept] = SyncEngineHelper.getProcessingQueues(remoteAlbums, localAlbums);
            expect(toBeDeleted.length).toEqual(2);
            expect(toBeAdded.length).toEqual(2);
            expect(toBeKept.length).toEqual(2);
        });

        test(`Archived album's content is ignored`, () => {
            // LocalAlbum1 is archived and should not be changed
            const remoteAlbum1 = new Album(`somechecksum1`, AlbumType.ALBUM, `testAlbum1`, ``);
            remoteAlbum1.assets = {
                'assetChecksum1.png': `fileName1.png`,
                'assetChecksum2.png': `fileName2.png`,
                'assetChecksum3.png': `fileName3.png`,
                'assetChecksum4.png': `fileName4.png`,
            };
            const remoteAlbum2 = new Album(`somechecksum2`, AlbumType.ALBUM, `testAlbum2`, ``);
            remoteAlbum2.assets = {
                'assetChecksum1.png': `fileName1.png`,
                'assetChecksum2.png': `fileName2.png`,
                'assetChecksum3.png': `fileName3.png`,
                'assetChecksum4.png': `fileName4.png`,
            };
            const remoteAlbum3 = new Album(`somechecksum3`, AlbumType.ALBUM, `testAlbum3`, ``);
            remoteAlbum3.assets = {
                'assetChecksum1.png': `fileName1.png`,
                'assetChecksum2.png': `fileName2.png`,
                'assetChecksum3.png': `fileName3.png`,
                'assetChecksum4.png': `fileName4.png`,
            };
            const remoteAlbum4 = new Album(`somechecksum4`, AlbumType.ALBUM, `testAlbum4`, ``);
            remoteAlbum4.assets = {
                'assetChecksum1.png': `fileName1.png`,
                'assetChecksum2.png': `fileName2.png`,
                'assetChecksum3.png': `fileName3.png`,
                'assetChecksum4.png': `fileName4.png`,
            };

            const localAlbum1 = new Album(`somechecksum1`, AlbumType.ARCHIVED, `testAlbum1`, ``);
            localAlbum1.assets = {};
            const localAlbum2 = new Album(`somechecksum2`, AlbumType.ALBUM, `testAlbum2`, ``);
            localAlbum2.assets = {
                'assetChecksum1.png': `fileName1.png`,
                'assetChecksum2.png': `fileName2.png`,
                'assetChecksum3.png': `fileName3.png`,
                'assetChecksum4.png': `fileName4.png`,
            };
            const localAlbum3 = new Album(`somechecksum3`, AlbumType.ALBUM, `testAlbum3`, ``);
            localAlbum3.assets = {
                'assetChecksum1.png': `fileName1.png`,
                'assetChecksum2.png': `fileName2.png`,
                'assetChecksum3.png': `fileName3.png`,
                'assetChecksum4.png': `fileName4.png`,
            };
            const localAlbum4 = new Album(`somechecksum4`, AlbumType.ALBUM, `testAlbum4`, ``);
            localAlbum4.assets = {
                'assetChecksum1.png': `fileName1.png`,
                'assetChecksum2.png': `fileName2.png`,
                'assetChecksum3.png': `fileName3.png`,
                'assetChecksum4.png': `fileName4.png`,
            };

            const remoteAlbums = [
                remoteAlbum1,
                remoteAlbum2,
                remoteAlbum3,
                remoteAlbum4,
            ];

            const localAlbums = {
                somechecksum1: localAlbum1,
                somechecksum2: localAlbum2,
                somechecksum3: localAlbum3,
                somechecksum4: localAlbum4,
            };

            const [toBeDeleted, toBeAdded, toBeKept] = SyncEngineHelper.getProcessingQueues(remoteAlbums, localAlbums);
            expect(toBeDeleted.length).toEqual(0);
            expect(toBeAdded.length).toEqual(0);
            expect(toBeKept.length).toEqual(4);
        });

        describe(`Hierarchical dependencies`, () => {
            test(`Album moved`, () => {
                const localAlbumEntities = {
                    folderUUID1: new Album(`folderUUID1`, AlbumType.FOLDER, `folderName1`, ``),
                    albumUUID1: new Album(`albumUUID1`, AlbumType.ALBUM, `albumName1`, ``),
                    albumUUID2: new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, `folderUUID1`),
                    albumUUID3: new Album(`albumUUID3`, AlbumType.ALBUM, `albumName3`, `folderUUID1`),
                    albumUUID4: new Album(`albumUUID4`, AlbumType.ALBUM, `albumName4`, `folderUUID1`),
                };
                // AlbumUUID2 is moved from folderUUID1 to root
                const toBeAdded = [
                    new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, ``),
                ];
                const toBeDeleted = [
                    new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, `folderUUID1`),
                ];
                const toBeKept = [
                    new Album(`folderUUID1`, AlbumType.FOLDER, `folderName1`, ``),
                    new Album(`albumUUID1`, AlbumType.ALBUM, `albumName1`, ``),
                    new Album(`albumUUID3`, AlbumType.ALBUM, `albumName3`, `folderUUID1`),
                    new Album(`albumUUID4`, AlbumType.ALBUM, `albumName4`, `folderUUID1`),
                ];

                const [processedToBeDeleted, processedToBeAdded, processedToKept] = SyncEngineHelper.resolveHierarchicalDependencies([toBeDeleted, toBeAdded, toBeKept], localAlbumEntities);

                expect(processedToBeAdded).toEqual(toBeAdded);
                expect(processedToBeDeleted).toEqual(toBeDeleted);
                expect(processedToKept).toEqual(toBeKept);
            });

            test(`Folder with albums moved`, () => {
                const localAlbumEntities = {
                    folderUUID1: new Album(`folderUUID1`, AlbumType.FOLDER, `folderName1`, ``),
                    folderUUID2: new Album(`folderUUID2`, AlbumType.FOLDER, `folderName2`, `folderUUID1`),
                    albumUUID1: new Album(`albumUUID1`, AlbumType.ALBUM, `albumName1`, ``),
                    albumUUID2: new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, `folderUUID2`),
                    albumUUID3: new Album(`albumUUID3`, AlbumType.ALBUM, `albumName3`, `folderUUID2`),
                    albumUUID4: new Album(`albumUUID4`, AlbumType.ALBUM, `albumName4`, `folderUUID2`),
                };
                // FolderUUID2 (with all albums) is moved from folderUUID1 to root
                const toBeAdded = [
                    new Album(`folderUUID2`, AlbumType.FOLDER, `folderName2`, ``),
                ];
                const toBeDeleted = [
                    new Album(`folderUUID2`, AlbumType.FOLDER, `folderName2`, `folderUUID1`),
                ];
                const toBeKept = [
                    new Album(`folderUUID1`, AlbumType.FOLDER, `folderName1`, ``),
                    new Album(`albumUUID1`, AlbumType.ALBUM, `albumName1`, ``),
                    new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, `folderUUID2`),
                    new Album(`albumUUID3`, AlbumType.ALBUM, `albumName3`, `folderUUID2`),
                    new Album(`albumUUID4`, AlbumType.ALBUM, `albumName4`, `folderUUID2`),
                ];

                const [processedToBeDeleted, processedToBeAdded, processedToKept] = SyncEngineHelper.resolveHierarchicalDependencies([toBeDeleted, toBeAdded, toBeKept], localAlbumEntities);

                expect(processedToBeAdded.length).toEqual(4);
                expect(processedToBeAdded).toEqual([
                    new Album(`folderUUID2`, AlbumType.FOLDER, `folderName2`, ``),
                    new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, `folderUUID2`),
                    new Album(`albumUUID3`, AlbumType.ALBUM, `albumName3`, `folderUUID2`),
                    new Album(`albumUUID4`, AlbumType.ALBUM, `albumName4`, `folderUUID2`),
                ]);
                expect(processedToBeDeleted.length).toEqual(4);
                expect(processedToBeDeleted).toEqual([
                    new Album(`folderUUID2`, AlbumType.FOLDER, `folderName2`, `folderUUID1`),
                    new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, `folderUUID2`),
                    new Album(`albumUUID3`, AlbumType.ALBUM, `albumName3`, `folderUUID2`),
                    new Album(`albumUUID4`, AlbumType.ALBUM, `albumName4`, `folderUUID2`),
                ]);
                expect(processedToKept.length).toEqual(2);
                expect(processedToKept).toEqual([
                    new Album(`folderUUID1`, AlbumType.FOLDER, `folderName1`, ``),
                    new Album(`albumUUID1`, AlbumType.ALBUM, `albumName1`, ``),
                ]);
            });

            test(`Folder with folders moved`, () => {
                const localAlbumEntities = {
                    folderUUID1: new Album(`folderUUID1`, AlbumType.FOLDER, `folderName1`, ``),
                    folderUUID2: new Album(`folderUUID2`, AlbumType.FOLDER, `folderName2`, `folderUUID1`),
                    folderUUID3: new Album(`folderUUID3`, AlbumType.FOLDER, `folderName3`, `folderUUID2`),
                    folderUUID4: new Album(`folderUUID4`, AlbumType.FOLDER, `folderName4`, `folderUUID2`),
                    albumUUID1: new Album(`albumUUID1`, AlbumType.ALBUM, `albumName1`, ``),
                    albumUUID2: new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, `folderUUID2`),
                    albumUUID3: new Album(`albumUUID3`, AlbumType.ALBUM, `albumName3`, `folderUUID3`),
                    albumUUID4: new Album(`albumUUID4`, AlbumType.ALBUM, `albumName4`, `folderUUID4`),
                };
                // FolderUUID2 (with all albums & folders) is moved from folderUUID1 to root
                const toBeAdded = [
                    new Album(`folderUUID2`, AlbumType.FOLDER, `folderName2`, ``),
                ];
                const toBeDeleted = [
                    new Album(`folderUUID2`, AlbumType.FOLDER, `folderName2`, `folderUUID1`),
                ];
                const toBeKept = [
                    new Album(`folderUUID1`, AlbumType.FOLDER, `folderName1`, ``),
                    new Album(`folderUUID3`, AlbumType.FOLDER, `folderName3`, `folderUUID2`),
                    new Album(`folderUUID4`, AlbumType.FOLDER, `folderName4`, `folderUUID2`),
                    new Album(`albumUUID1`, AlbumType.ALBUM, `albumName1`, ``),
                    new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, `folderUUID2`),
                    new Album(`albumUUID3`, AlbumType.ALBUM, `albumName3`, `folderUUID3`),
                    new Album(`albumUUID4`, AlbumType.ALBUM, `albumName4`, `folderUUID4`),
                ];

                const [processedToBeDeleted, processedToBeAdded, processedToKept] = SyncEngineHelper.resolveHierarchicalDependencies([toBeDeleted, toBeAdded, toBeKept], localAlbumEntities);

                expect(processedToBeAdded.length).toEqual(6);
                expect(processedToBeAdded).toEqual([
                    new Album(`folderUUID2`, AlbumType.FOLDER, `folderName2`, ``),
                    new Album(`folderUUID3`, AlbumType.FOLDER, `folderName3`, `folderUUID2`),
                    new Album(`folderUUID4`, AlbumType.FOLDER, `folderName4`, `folderUUID2`),
                    new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, `folderUUID2`),
                    new Album(`albumUUID3`, AlbumType.ALBUM, `albumName3`, `folderUUID3`),
                    new Album(`albumUUID4`, AlbumType.ALBUM, `albumName4`, `folderUUID4`),
                ]);
                expect(processedToBeDeleted.length).toEqual(6);
                expect(processedToBeDeleted).toEqual([
                    new Album(`folderUUID2`, AlbumType.FOLDER, `folderName2`, `folderUUID1`),
                    new Album(`folderUUID3`, AlbumType.FOLDER, `folderName3`, `folderUUID2`),
                    new Album(`folderUUID4`, AlbumType.FOLDER, `folderName4`, `folderUUID2`),
                    new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, `folderUUID2`),
                    new Album(`albumUUID3`, AlbumType.ALBUM, `albumName3`, `folderUUID3`),
                    new Album(`albumUUID4`, AlbumType.ALBUM, `albumName4`, `folderUUID4`),
                ]);
                expect(processedToKept.length).toEqual(2);
                expect(processedToKept).toEqual([
                    new Album(`folderUUID1`, AlbumType.FOLDER, `folderName1`, ``),
                    new Album(`albumUUID1`, AlbumType.ALBUM, `albumName1`, ``),
                ]);
            });

            test(`Folder with albums deleted, albums kept`, () => {
                const localAlbumEntities = {
                    folderUUID1: new Album(`folderUUID1`, AlbumType.FOLDER, `folderName1`, ``),
                    albumUUID1: new Album(`albumUUID1`, AlbumType.ALBUM, `albumName1`, ``),
                    albumUUID2: new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, `folderUUID1`),
                    albumUUID3: new Album(`albumUUID3`, AlbumType.ALBUM, `albumName3`, `folderUUID1`),
                    albumUUID4: new Album(`albumUUID4`, AlbumType.ALBUM, `albumName4`, `folderUUID1`),
                };
                // FolderUUID1 is deleted and all albums within are moved from folderUUID1 to root
                const toBeAdded = [
                    new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, ``),
                    new Album(`albumUUID3`, AlbumType.ALBUM, `albumName3`, ``),
                    new Album(`albumUUID4`, AlbumType.ALBUM, `albumName4`, ``),
                ];
                const toBeDeleted = [
                    new Album(`folderUUID1`, AlbumType.FOLDER, `folderName1`, ``),
                    new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, `folderUUID1`),
                    new Album(`albumUUID3`, AlbumType.ALBUM, `albumName3`, `folderUUID1`),
                    new Album(`albumUUID4`, AlbumType.ALBUM, `albumName4`, `folderUUID1`),
                ];
                const toBeKept = [
                    new Album(`albumUUID1`, AlbumType.ALBUM, `albumName1`, ``),
                ];

                const [processedToBeDeleted, processedToBeAdded, processedToKept] = SyncEngineHelper.resolveHierarchicalDependencies([toBeDeleted, toBeAdded, toBeKept], localAlbumEntities);

                expect(processedToBeAdded).toEqual(toBeAdded);
                expect(processedToBeDeleted).toEqual(toBeDeleted);
                expect(processedToKept).toEqual(toBeKept);
            });

            test(`Folder with albums deleted, albums deleted`, () => {
                const localAlbumEntities = {
                    folderUUID1: new Album(`folderUUID1`, AlbumType.FOLDER, `folderName1`, ``),
                    albumUUID1: new Album(`albumUUID1`, AlbumType.ALBUM, `albumName1`, ``),
                    albumUUID2: new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, `folderUUID1`),
                    albumUUID3: new Album(`albumUUID3`, AlbumType.ALBUM, `albumName3`, `folderUUID1`),
                    albumUUID4: new Album(`albumUUID4`, AlbumType.ALBUM, `albumName4`, `folderUUID1`),
                };
                // FolderUUID1 is deleted and all albums within are also deleted
                const toBeAdded = [];
                const toBeDeleted = [
                    new Album(`folderUUID1`, AlbumType.FOLDER, `folderName1`, ``),
                    new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, `folderUUID1`),
                    new Album(`albumUUID3`, AlbumType.ALBUM, `albumName3`, `folderUUID1`),
                    new Album(`albumUUID4`, AlbumType.ALBUM, `albumName4`, `folderUUID1`),
                ];
                const toBeKept = [
                    new Album(`albumUUID1`, AlbumType.ALBUM, `albumName1`, ``),
                ];

                const [processedToBeDeleted, processedToBeAdded, processedToKept] = SyncEngineHelper.resolveHierarchicalDependencies([toBeDeleted, toBeAdded, toBeKept], localAlbumEntities);

                expect(processedToBeAdded).toEqual(toBeAdded);
                expect(processedToBeDeleted).toEqual(toBeDeleted);
                expect(processedToKept).toEqual(toBeKept);
            });

            test(`Folder with folders deleted, nested folder kept`, () => {
                const localAlbumEntities = {
                    folderUUID1: new Album(`folderUUID1`, AlbumType.FOLDER, `folderName1`, ``),
                    folderUUID2: new Album(`folderUUID2`, AlbumType.FOLDER, `folderName2`, `folderUUID1`),
                    folderUUID3: new Album(`folderUUID3`, AlbumType.FOLDER, `folderName3`, `folderUUID2`),
                    folderUUID4: new Album(`folderUUID4`, AlbumType.FOLDER, `folderName4`, `folderUUID2`),
                    albumUUID1: new Album(`albumUUID1`, AlbumType.ALBUM, `albumName1`, ``),
                    albumUUID2: new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, `folderUUID2`),
                    albumUUID3: new Album(`albumUUID3`, AlbumType.ALBUM, `albumName3`, `folderUUID3`),
                    albumUUID4: new Album(`albumUUID4`, AlbumType.ALBUM, `albumName4`, `folderUUID4`),
                };
                // FolderUUID2 is deleted and its albums & folder are moved to root
                const toBeAdded = [
                    new Album(`folderUUID3`, AlbumType.FOLDER, `folderName3`, ``),
                    new Album(`folderUUID4`, AlbumType.FOLDER, `folderName4`, ``),
                    new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, ``),
                ];
                const toBeDeleted = [
                    new Album(`folderUUID2`, AlbumType.FOLDER, `folderName2`, `folderUUID1`),
                    new Album(`folderUUID3`, AlbumType.FOLDER, `folderName3`, `folderUUID2`),
                    new Album(`folderUUID4`, AlbumType.FOLDER, `folderName4`, `folderUUID2`),
                    new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, `folderUUID2`),
                ];
                const toBeKept = [
                    new Album(`folderUUID1`, AlbumType.FOLDER, `folderName1`, ``),
                    new Album(`albumUUID1`, AlbumType.ALBUM, `albumName1`, ``),
                    new Album(`albumUUID3`, AlbumType.ALBUM, `albumName3`, `folderUUID3`),
                    new Album(`albumUUID4`, AlbumType.ALBUM, `albumName4`, `folderUUID4`),
                ];

                const [processedToBeDeleted, processedToBeAdded, processedToKept] = SyncEngineHelper.resolveHierarchicalDependencies([toBeDeleted, toBeAdded, toBeKept], localAlbumEntities);

                expect(processedToBeAdded).toEqual([
                    new Album(`folderUUID3`, AlbumType.FOLDER, `folderName3`, ``),
                    new Album(`folderUUID4`, AlbumType.FOLDER, `folderName4`, ``),
                    new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, ``),
                    new Album(`albumUUID3`, AlbumType.ALBUM, `albumName3`, `folderUUID3`),
                    new Album(`albumUUID4`, AlbumType.ALBUM, `albumName4`, `folderUUID4`),
                ]);

                expect(processedToBeDeleted).toEqual([
                    new Album(`folderUUID2`, AlbumType.FOLDER, `folderName2`, `folderUUID1`),
                    new Album(`folderUUID3`, AlbumType.FOLDER, `folderName3`, `folderUUID2`),
                    new Album(`folderUUID4`, AlbumType.FOLDER, `folderName4`, `folderUUID2`),
                    new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, `folderUUID2`),
                    new Album(`albumUUID3`, AlbumType.ALBUM, `albumName3`, `folderUUID3`),
                    new Album(`albumUUID4`, AlbumType.ALBUM, `albumName4`, `folderUUID4`),
                ]);

                expect(processedToKept).toEqual([
                    new Album(`folderUUID1`, AlbumType.FOLDER, `folderName1`, ``),
                    new Album(`albumUUID1`, AlbumType.ALBUM, `albumName1`, ``),
                ]);
            });

            test(`Folder with folders deleted, nested folder deleted`, () => {
                const localAlbumEntities = {
                    folderUUID1: new Album(`folderUUID1`, AlbumType.FOLDER, `folderName1`, ``),
                    folderUUID2: new Album(`folderUUID2`, AlbumType.FOLDER, `folderName2`, `folderUUID1`),
                    folderUUID3: new Album(`folderUUID3`, AlbumType.FOLDER, `folderName3`, `folderUUID2`),
                    folderUUID4: new Album(`folderUUID4`, AlbumType.FOLDER, `folderName4`, `folderUUID2`),
                    albumUUID1: new Album(`albumUUID1`, AlbumType.ALBUM, `albumName1`, ``),
                    albumUUID2: new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, `folderUUID2`),
                    albumUUID3: new Album(`albumUUID3`, AlbumType.ALBUM, `albumName3`, `folderUUID3`),
                    albumUUID4: new Album(`albumUUID4`, AlbumType.ALBUM, `albumName4`, `folderUUID4`),
                };
                // FolderUUID2, folderUUID3 and folderUUID4 are deleted and its albums are moved to root
                const toBeAdded = [
                    new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, ``),
                    new Album(`albumUUID3`, AlbumType.ALBUM, `albumName3`, ``),
                    new Album(`albumUUID4`, AlbumType.ALBUM, `albumName4`, ``),
                ];
                const toBeDeleted = [
                    new Album(`folderUUID2`, AlbumType.FOLDER, `folderName2`, `folderUUID1`),
                    new Album(`folderUUID3`, AlbumType.FOLDER, `folderName3`, `folderUUID2`),
                    new Album(`folderUUID4`, AlbumType.FOLDER, `folderName4`, `folderUUID2`),
                    new Album(`albumUUID2`, AlbumType.ALBUM, `albumName2`, `folderUUID2`),
                    new Album(`albumUUID3`, AlbumType.ALBUM, `albumName3`, `folderUUID3`),
                    new Album(`albumUUID4`, AlbumType.ALBUM, `albumName4`, `folderUUID4`),
                ];
                const toBeKept = [
                    new Album(`folderUUID1`, AlbumType.FOLDER, `folderName1`, ``),
                    new Album(`albumUUID1`, AlbumType.ALBUM, `albumName1`, ``),
                ];

                const [processedToBeDeleted, processedToBeAdded, processedToKept] = SyncEngineHelper.resolveHierarchicalDependencies([toBeDeleted, toBeAdded, toBeKept], localAlbumEntities);

                expect(processedToBeAdded).toEqual(toBeAdded);
                expect(processedToBeDeleted).toEqual(toBeDeleted);
                expect(processedToKept).toEqual(toBeKept);
            });
        });
    });
});

describe(`Sort queue`, () => {
    const defaultFullQueue = [
        new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``),
        new Album(`someUUID1-1`, AlbumType.ALBUM, `someAlbumName1.1`, `someUUID1`),
        new Album(`someUUID1-1-1`, AlbumType.ALBUM, `someAlbumName1.1.1`, `someUUID1-1`),
        new Album(`someUUID1-1-2`, AlbumType.ALBUM, `someAlbumName1.1.2`, `someUUID1-2`),
        new Album(`someUUID1-2`, AlbumType.ALBUM, `someAlbumName1.2`, `someUUID1`),
        new Album(`someUUID1-3`, AlbumType.ALBUM, `someAlbumName1.3`, `someUUID1`),
        new Album(`someUUID2`, AlbumType.ALBUM, `someAlbumName2`, ``),
        new Album(`someUUID3`, AlbumType.ALBUM, `someAlbumName3`, ``),
        new Album(`someUUID3-1`, AlbumType.ALBUM, `someAlbumName3.1`, `someUUID3`),
        new Album(`someUUID3-2`, AlbumType.ALBUM, `someAlbumName3.2`, `someUUID3`),
        new Album(`someUUID3-2-1`, AlbumType.ALBUM, `someAlbumName3.2.1`, `someUUID3-2`),
    ];

    test.each([
        {
            queue: [],
            desc: `Empty queue`,
        }, {
            queue: [
                new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``),
                new Album(`someUUID1-1`, AlbumType.ALBUM, `someAlbumName1.1`, `someUUID1`),
                new Album(`someUUID1-1-1`, AlbumType.ALBUM, `someAlbumName1.1.1`, `someUUID1-1`),
                new Album(`someUUID1-1-2`, AlbumType.ALBUM, `someAlbumName1.1.2`, `someUUID1-1`),
                new Album(`someUUID1-2`, AlbumType.ALBUM, `someAlbumName1.2`, `someUUID1`),
                new Album(`someUUID1-3`, AlbumType.ALBUM, `someAlbumName1.3`, `someUUID1`),
                new Album(`someUUID2`, AlbumType.ALBUM, `someAlbumName2`, ``),
                new Album(`someUUID3`, AlbumType.ALBUM, `someAlbumName3`, ``),
                new Album(`someUUID3-1`, AlbumType.ALBUM, `someAlbumName3.1`, `someUUID3`),
                new Album(`someUUID3-2`, AlbumType.ALBUM, `someAlbumName3.2`, `someUUID3`),
            ],
            desc: `Sorted queue`,
        }, {
            queue: [
                new Album(`someUUID1-2`, AlbumType.ALBUM, `someAlbumName1.2`, `someUUID1`),
                new Album(`someUUID1-1-1`, AlbumType.ALBUM, `someAlbumName1.1.1`, `someUUID1-1`),
                new Album(`someUUID1-1`, AlbumType.ALBUM, `someAlbumName1.1`, `someUUID1`),
                new Album(`someUUID1-3`, AlbumType.ALBUM, `someAlbumName1.3`, `someUUID1`),
                new Album(`someUUID3-1`, AlbumType.ALBUM, `someAlbumName3.1`, `someUUID3`),
                new Album(`someUUID2`, AlbumType.ALBUM, `someAlbumName2`, ``),
                new Album(`someUUID1-1-2`, AlbumType.ALBUM, `someAlbumName1.1.2`, `someUUID1-1`),
                new Album(`someUUID3-2`, AlbumType.ALBUM, `someAlbumName3.2`, `someUUID3`),
                new Album(`someUUID3`, AlbumType.ALBUM, `someAlbumName3`, ``),
                new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``),
            ],
            desc: `Unsorted queue`,
        }, {
            queue: [
                new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``),
                new Album(`someUUID1-1`, AlbumType.ALBUM, `someAlbumName1.1`, `someUUID1`),
                new Album(`someUUID1-1-1`, AlbumType.ALBUM, `someAlbumName1.1.1`, `someUUID1-1`),
                new Album(`someUUID1-1-2`, AlbumType.ALBUM, `someAlbumName1.1.2`, `someUUID1-1`),
                new Album(`someUUID4-1-1`, AlbumType.ALBUM, `someAlbumName4.1.1`, `someUUID4-1`),
                new Album(`someUUID1-2`, AlbumType.ALBUM, `someAlbumName1.2`, `someUUID1`),
                new Album(`someUUID1-3`, AlbumType.ALBUM, `someAlbumName1.3`, `someUUID1`),
                new Album(`someUUID2`, AlbumType.ALBUM, `someAlbumName2`, ``),
                new Album(`someUUID3`, AlbumType.ALBUM, `someAlbumName3`, ``),
                new Album(`someUUID3-1`, AlbumType.ALBUM, `someAlbumName3.1`, `someUUID3`),
                new Album(`someUUID3-2`, AlbumType.ALBUM, `someAlbumName3.2`, `someUUID3`),
                new Album(`someUUID4-1`, AlbumType.ALBUM, `someAlbumName4.1`, `someUUID4`),
            ],
            desc: `Unsorted queue (missing ancestor link)`,
        },
    ])(`$desc`, ({queue}) => {
        const sortedQueue = SyncEngineHelper.sortQueue(queue);

        expect(sortedQueue).toBeDefined();
        expect(queueIsSorted(sortedQueue)).toBeTruthy();
        expect(sortedQueue.length).toEqual(queue.length);
    });

    describe(`Distance to root`, () => {
        test.each([
            {
                a: new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``),
                expectedDistance: 0,
            },
            {
                a: new Album(`someUUID1-1`, AlbumType.ALBUM, `someAlbumName1.1`, `someUUID1`),
                expectedDistance: 1,
            },
            {
                a: new Album(`someUUID1-1-1`, AlbumType.ALBUM, `someAlbumName1.1.1`, `someUUID1-1`),
                expectedDistance: 2,
            },
        ])(`Calculating distance to root - Expecting $expectedDistance`, ({a, expectedDistance}) => {
            expect(Album.distanceToRoot(a, defaultFullQueue)).toEqual(expectedDistance);
        });

        test(`Calculating distance to root - Broken Link`, () => {
            const brokenQueue = [
                new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``),
                new Album(`someUUID1-1-1`, AlbumType.ALBUM, `someAlbumName1.1.1`, `someUUID1-1`),
                new Album(`someUUID1-1-2`, AlbumType.ALBUM, `someAlbumName1.1.2`, `someUUID1-2`),
            ];
            expect(() => Album.distanceToRoot(new Album(`someUUID1-1-2`, AlbumType.ALBUM, `someAlbumName1.1.2`, `someUUID1-2`), brokenQueue)).toThrow(/^Unable to determine distance to root, no link to root!$/);
        });
    });

    describe(`Album compare function`, () => {
        test.each([
            {
                a: new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``),
                b: new Album(`someUUID1-1`, AlbumType.ALBUM, `someAlbumName1.1`, `someUUID1`),
            },
            {
                a: new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``),
                b: new Album(`someUUID1-1-1`, AlbumType.ALBUM, `someAlbumName1.1.1`, `someUUID1-1`),
            },
            {
                a: new Album(`someUUID1-2`, AlbumType.ALBUM, `someAlbumName1`, `someUUID1`),
                b: new Album(`someUUID1-1-1`, AlbumType.ALBUM, `someAlbumName1.1`, `someUUID1-1`),
            },
            {
                a: new Album(`someUUID1-2`, AlbumType.ALBUM, `someAlbumName1`, `someUUID1`),
                b: new Album(`someUUID3-2-1`, AlbumType.ALBUM, `someAlbumName3.2.1`, `someUUID3-2`),
            },
        ])(`Compare function returns negative value - %#`, ({a, b}) => {
            const result = SyncEngineHelper.compareQueueElements(defaultFullQueue, a, b);
            expect(result).toBeLessThan(0);
        });

        test.each([
            {
                a: new Album(`someUUID1-1`, AlbumType.ALBUM, `someAlbumName1.1`, `someUUID1`),
                b: new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``),
            },
            {
                a: new Album(`someUUID1-1-1`, AlbumType.ALBUM, `someAlbumName1.1.1`, `someUUID1-1`),
                b: new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``),
            },
            {
                a: new Album(`someUUID1-1-1`, AlbumType.ALBUM, `someAlbumName1.1`, `someUUID1-1`),
                b: new Album(`someUUID1-2`, AlbumType.ALBUM, `someAlbumName1`, `someUUID1`),
            },
            {
                a: new Album(`someUUID3-2-1`, AlbumType.ALBUM, `someAlbumName3.2.1`, `someUUID3-2`),
                b: new Album(`someUUID1-2`, AlbumType.ALBUM, `someAlbumName1`, `someUUID1`),
            },
        ])(`Compare function returns positive value - %#`, ({a, b}) => {
            const result = SyncEngineHelper.compareQueueElements(defaultFullQueue, a, b);
            expect(result).toBeGreaterThan(0);
        });

        test(`Compare function is reflexive`, () => {
            const album = new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``);
            const result = SyncEngineHelper.compareQueueElements([album], album, album);
            expect(result).toEqual(0);
        });

        test.each([
            {
                a: new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``),
                b: new Album(`someUUID1-1`, AlbumType.ALBUM, `someAlbumName1.1`, `someUUID1`),
            },
            {
                a: new Album(`someUUID1-1`, AlbumType.ALBUM, `someAlbumName1.1`, `someUUID1`),
                b: new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``),
            },
            {
                a: new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``),
                b: new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``),
            },
        ])(`Compare Function is symmetric - %#`, ({a, b}) => {
            const result1 = SyncEngineHelper.compareQueueElements(defaultFullQueue, a, b);
            const result2 = SyncEngineHelper.compareQueueElements(defaultFullQueue, b, a);
            expect.assertions(1);
            if (result1 < 0) {
                expect(result2).toBeGreaterThan(0);
            } else if (result1 > 0) {
                expect(result2).toBeLessThan(0);
            } else if (result1 === 0) {
                expect(result2).toEqual(0);
            }
        });

        test.each([
            {
                a: new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``),
                b: new Album(`someUUID1-1`, AlbumType.ALBUM, `someAlbumName1.1`, `someUUID1`),
                c: new Album(`someUUID1-1-1`, AlbumType.ALBUM, `someAlbumName1.1.1`, `someUUID1-1`),
            },
            {
                a: new Album(`someUUID1-1-1`, AlbumType.ALBUM, `someAlbumName1.1.1`, `someUUID1-1`),
                b: new Album(`someUUID1-1`, AlbumType.ALBUM, `someAlbumName1.1`, `someUUID1`),
                c: new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``),
            },
            {
                a: new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``),
                b: new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``),
                c: new Album(`someUUID1`, AlbumType.ALBUM, `someAlbumName1`, ``),
            },
        ])(`Compare Function is reflexive - %#`, ({a, b, c}) => {
            const result1 = SyncEngineHelper.compareQueueElements(defaultFullQueue, a, b);
            const result2 = SyncEngineHelper.compareQueueElements(defaultFullQueue, b, c);
            const result3 = SyncEngineHelper.compareQueueElements(defaultFullQueue, a, c);
            expect.assertions(1);
            if (result1 > 0 && result2 > 0) {
                expect(result3).toBeGreaterThan(0);
            } else if (result1 < 0 && result2 < 0) {
                expect(result3).toBeLessThan(0);
            } else if (result1 === 0 && result2 === 0) {
                expect(result3).toEqual(0);
            }
        });
    });
});