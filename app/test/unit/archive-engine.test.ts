import mockfs from 'mock-fs';
import {describe, test, beforeEach, afterEach, expect, jest} from '@jest/globals';
import * as Config from '../_helpers/_config';
import {PRIMARY_ASSET_DIR, ARCHIVE_DIR} from '../../src/lib/photos-library/constants';
import path from 'path';
import {Asset, AssetType} from '../../src/lib/photos-library/model/asset';
import {FileType} from '../../src/lib/photos-library/model/file-type';
import fs from 'fs';
import {MockedEventManager, MockedResourceManager, prepareResources} from '../_helpers/_general';
import {Zones} from '../../src/lib/icloud/icloud-photos/query-builder';
import {iCPSEventArchiveEngine, iCPSEventRuntimeWarning} from '../../src/lib/resources/events-types';
import {ArchiveEngine} from '../../src/lib/archive-engine/archive-engine';
import {iCloud} from '../../src/lib/icloud/icloud';
import {PhotosLibrary} from '../../src/lib/photos-library/photos-library';

let mockedResourceManager: MockedResourceManager;
let mockedEventManager: MockedEventManager;
let archiveEngine: ArchiveEngine;

beforeEach(() => {
    mockfs();
    const instances = prepareResources(true, {
        ...Config.defaultConfig,
        remoteDelete: true,
    })!;
    mockedResourceManager = instances.manager;
    mockedEventManager = instances.event;

    archiveEngine = new ArchiveEngine(new iCloud(), new PhotosLibrary());
});

afterEach(() => {
    mockfs.restore();
});

describe.each([{
    zone: Zones.Primary,
    ASSET_DIR: PRIMARY_ASSET_DIR,
}, {
    zone: Zones.Shared,
    ASSET_DIR: PRIMARY_ASSET_DIR, // @remarks this should be SHARED_ASSET_DIR
}])(`Archive Engine $zone`, ({zone, ASSET_DIR}) => {
    describe(`Archive Path`, () => {
        test(`Valid path`, async () => {
            const albumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
            const albumUUIDPath = `.${albumUUID}`;
            const albumName = `Random`;

            const asset1 = new Asset(`Aa7/yox97ecSUNmVw0xP4YzIDDKf`, 4, FileType.fromExtension(`jpeg`), 10, zone, AssetType.ORIG, `stephen-leonardi-xx6ZyOeyJtI-unsplash`);
            asset1.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1843`;
            const asset2 = new Asset(`AaGv15G3Cp9LPMQQfFZiHRryHgjU`, 5, FileType.fromExtension(`jpeg`), 10, zone, AssetType.ORIG, `steve-johnson-gkfvdCEbUbQ-unsplash`);
            asset2.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1888`;
            const asset3 = new Asset(`Aah0dUnhGFNWjAeqKEkB/SNLNpFf`, 6, FileType.fromExtension(`jpeg`), 10, zone, AssetType.ORIG, `steve-johnson-T12spiHYons-unsplash`);
            asset3.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1999`;

            mockfs({
                [Config.defaultConfig.dataDir]: {
                    [ASSET_DIR]: {
                        [asset1.getAssetFilename()]: Buffer.from([1, 1, 1, 1]),
                        [asset2.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1]),
                        [asset3.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1, 1]),
                    },
                    [ARCHIVE_DIR]: {},
                    [albumUUIDPath]: {
                        [asset1.getPrettyFilename()]: mockfs.symlink({
                            path: `../${ASSET_DIR}/${asset1.getAssetFilename()}`,
                        }),
                        [asset2.getPrettyFilename()]: mockfs.symlink({
                            path: `../${ASSET_DIR}/${asset2.getAssetFilename()}`,
                        }),
                        [asset3.getPrettyFilename()]: mockfs.symlink({
                            path: `../${ASSET_DIR}/${asset3.getAssetFilename()}`,
                        }),
                    },
                    [albumName]: mockfs.symlink({
                        path: albumUUIDPath,
                    }),
                },
            });

            const startEvent = mockedEventManager.spyOnEvent(iCPSEventArchiveEngine.ARCHIVE_START);
            const persistEvent = mockedEventManager.spyOnEvent(iCPSEventArchiveEngine.PERSISTING_START);
            const remoteDeleteEvent = mockedEventManager.spyOnEvent(iCPSEventArchiveEngine.REMOTE_DELETE);
            const finishEvent = mockedEventManager.spyOnEvent(iCPSEventArchiveEngine.ARCHIVE_DONE);

            archiveEngine.persistAsset = jest.fn(() => Promise.resolve());
            archiveEngine.prepareForRemoteDeletion = jest.fn(() => `a`)
                .mockReturnValueOnce(asset1.recordName)
                .mockReturnValueOnce(asset2.recordName)
                .mockReturnValueOnce(asset3.recordName);
            archiveEngine.icloud.photos.deleteAssets = jest.fn(() => Promise.resolve());

            await archiveEngine.archivePath(`/opt/icloud-photos-library/Random`, [asset1, asset2, asset3]);

            expect(archiveEngine.persistAsset).toHaveBeenCalledTimes(3);
            expect(archiveEngine.persistAsset).toHaveBeenCalledWith(path.join(Config.defaultConfig.dataDir, ASSET_DIR, asset1.getAssetFilename()), path.join(Config.defaultConfig.dataDir, albumUUIDPath, asset1.getPrettyFilename()));
            expect(archiveEngine.persistAsset).toHaveBeenCalledWith(path.join(Config.defaultConfig.dataDir, ASSET_DIR, asset2.getAssetFilename()), path.join(Config.defaultConfig.dataDir, albumUUIDPath, asset2.getPrettyFilename()));
            expect(archiveEngine.persistAsset).toHaveBeenCalledWith(path.join(Config.defaultConfig.dataDir, ASSET_DIR, asset3.getAssetFilename()), path.join(Config.defaultConfig.dataDir, albumUUIDPath, asset3.getPrettyFilename()));

            expect(archiveEngine.prepareForRemoteDeletion).toHaveBeenCalledTimes(3);
            expect(archiveEngine.prepareForRemoteDeletion).toHaveBeenCalledWith(path.join(Config.defaultConfig.dataDir, ASSET_DIR, asset1.getAssetFilename()), [asset1, asset2, asset3]);
            expect(archiveEngine.prepareForRemoteDeletion).toHaveBeenCalledWith(path.join(Config.defaultConfig.dataDir, ASSET_DIR, asset2.getAssetFilename()), [asset1, asset2, asset3]);
            expect(archiveEngine.prepareForRemoteDeletion).toHaveBeenCalledWith(path.join(Config.defaultConfig.dataDir, ASSET_DIR, asset3.getAssetFilename()), [asset1, asset2, asset3]);

            expect(archiveEngine.icloud.photos.deleteAssets).toHaveBeenCalledWith([
                asset1.recordName,
                asset2.recordName,
                asset3.recordName,
            ]);

            expect(startEvent).toHaveBeenCalled();
            expect(persistEvent).toHaveBeenCalledWith(3);
            expect(remoteDeleteEvent).toHaveBeenCalledWith(3);
            expect(finishEvent).toHaveBeenCalled();
        });

        test(`Valid path with edits`, async () => {
            const albumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
            const albumUUIDPath = `.${albumUUID}`;
            const albumName = `Random`;

            const asset1 = new Asset(`Aa7/yox97ecSUNmVw0xP4YzIDDKf`, 4, FileType.fromExtension(`jpeg`), 10, zone, AssetType.ORIG, `stephen-leonardi-xx6ZyOeyJtI-unsplash`);
            asset1.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1843`;
            const asset1Edit = new Asset(`Aa7/yox97ecSUNmVw0xP4YzIDDKd`, 4, FileType.fromExtension(`jpeg`), 10, zone, AssetType.EDIT, `stephen-leonardi-xx6ZyOeyJtI-unsplash`);
            asset1Edit.recordName = asset1.recordName;
            const asset2 = new Asset(`AaGv15G3Cp9LPMQQfFZiHRryHgjU`, 5, FileType.fromExtension(`jpeg`), 10, zone, AssetType.ORIG, `steve-johnson-gkfvdCEbUbQ-unsplash`);
            asset2.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1888`;
            const asset3 = new Asset(`Aah0dUnhGFNWjAeqKEkB/SNLNpFf`, 6, FileType.fromExtension(`jpeg`), 10, zone, AssetType.ORIG, `steve-johnson-T12spiHYons-unsplash`);
            asset3.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1999`;

            mockfs({
                [Config.defaultConfig.dataDir]: {
                    [ASSET_DIR]: {
                        [asset1.getAssetFilename()]: Buffer.from([1, 1, 1, 1]),
                        [asset1Edit.getAssetFilename()]: Buffer.from([1, 1, 1, 1]),
                        [asset2.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1]),
                        [asset3.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1, 1]),
                    },
                    [ARCHIVE_DIR]: {},
                    [albumUUIDPath]: {
                        [asset1.getPrettyFilename()]: mockfs.symlink({
                            path: `../${ASSET_DIR}/${asset1.getAssetFilename()}`,
                        }),
                        [asset1Edit.getPrettyFilename()]: mockfs.symlink({
                            path: `../${ASSET_DIR}/${asset1Edit.getAssetFilename()}`,
                        }),
                        [asset2.getPrettyFilename()]: mockfs.symlink({
                            path: `../${ASSET_DIR}/${asset2.getAssetFilename()}`,
                        }),
                        [asset3.getPrettyFilename()]: mockfs.symlink({
                            path: `../${ASSET_DIR}/${asset3.getAssetFilename()}`,
                        }),
                    },
                    [albumName]: mockfs.symlink({
                        path: albumUUIDPath,
                    }),
                },
            });

            const startEvent = mockedEventManager.spyOnEvent(iCPSEventArchiveEngine.ARCHIVE_START);
            const persistEvent = mockedEventManager.spyOnEvent(iCPSEventArchiveEngine.PERSISTING_START);
            const remoteDeleteEvent = mockedEventManager.spyOnEvent(iCPSEventArchiveEngine.REMOTE_DELETE);
            const finishEvent = mockedEventManager.spyOnEvent(iCPSEventArchiveEngine.ARCHIVE_DONE);
            const errorEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.ARCHIVE_ASSET_ERROR);

            archiveEngine.persistAsset = jest.fn(() => Promise.resolve());
            archiveEngine.prepareForRemoteDeletion = jest.fn(() => `a`)
                .mockReturnValueOnce(asset1.recordName)
                .mockReturnValueOnce(asset1Edit.recordName)
                .mockReturnValueOnce(asset2.recordName)
                .mockReturnValueOnce(asset3.recordName);
            archiveEngine.icloud.photos.deleteAssets = jest.fn(() => Promise.resolve());

            await archiveEngine.archivePath(`/opt/icloud-photos-library/Random`, [asset1, asset1Edit, asset2, asset3]);

            expect(errorEvent).not.toHaveBeenCalled();
            expect(archiveEngine.persistAsset).toHaveBeenCalledTimes(4);
            expect(archiveEngine.persistAsset).toHaveBeenCalledWith(path.join(Config.defaultConfig.dataDir, ASSET_DIR, asset1.getAssetFilename()), path.join(Config.defaultConfig.dataDir, albumUUIDPath, asset1.getPrettyFilename()));
            expect(archiveEngine.persistAsset).toHaveBeenCalledWith(path.join(Config.defaultConfig.dataDir, ASSET_DIR, asset1Edit.getAssetFilename()), path.join(Config.defaultConfig.dataDir, albumUUIDPath, asset1Edit.getPrettyFilename()));
            expect(archiveEngine.persistAsset).toHaveBeenCalledWith(path.join(Config.defaultConfig.dataDir, ASSET_DIR, asset2.getAssetFilename()), path.join(Config.defaultConfig.dataDir, albumUUIDPath, asset2.getPrettyFilename()));
            expect(archiveEngine.persistAsset).toHaveBeenCalledWith(path.join(Config.defaultConfig.dataDir, ASSET_DIR, asset3.getAssetFilename()), path.join(Config.defaultConfig.dataDir, albumUUIDPath, asset3.getPrettyFilename()));

            expect(archiveEngine.prepareForRemoteDeletion).toHaveBeenCalledTimes(4);
            expect(archiveEngine.prepareForRemoteDeletion).toHaveBeenCalledWith(path.join(Config.defaultConfig.dataDir, ASSET_DIR, asset1.getAssetFilename()), [asset1, asset1Edit, asset2, asset3]);
            expect(archiveEngine.prepareForRemoteDeletion).toHaveBeenCalledWith(path.join(Config.defaultConfig.dataDir, ASSET_DIR, asset1Edit.getAssetFilename()), [asset1, asset1Edit, asset2, asset3]);
            expect(archiveEngine.prepareForRemoteDeletion).toHaveBeenCalledWith(path.join(Config.defaultConfig.dataDir, ASSET_DIR, asset2.getAssetFilename()), [asset1, asset1Edit, asset2, asset3]);
            expect(archiveEngine.prepareForRemoteDeletion).toHaveBeenCalledWith(path.join(Config.defaultConfig.dataDir, ASSET_DIR, asset3.getAssetFilename()), [asset1, asset1Edit, asset2, asset3]);

            expect(archiveEngine.icloud.photos.deleteAssets).toHaveBeenCalledWith([
                asset1.recordName,
                asset2.recordName,
                asset3.recordName,
            ]);

            expect(startEvent).toHaveBeenCalled();
            expect(persistEvent).toHaveBeenCalledWith(4);
            expect(remoteDeleteEvent).toHaveBeenCalledWith(3);
            expect(finishEvent).toHaveBeenCalled();
        });

        describe(`Invalid path`, () => {
            test(`UUID Path`, async () => {
                const albumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
                const albumUUIDPath = `.${albumUUID}`;
                const albumName = `Random`;

                const asset1 = new Asset(`Aa7/yox97ecSUNmVw0xP4YzIDDKf`, 4, FileType.fromExtension(`jpeg`), 10, zone, AssetType.ORIG, `stephen-leonardi-xx6ZyOeyJtI-unsplash`);
                asset1.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1843`;
                const asset2 = new Asset(`AaGv15G3Cp9LPMQQfFZiHRryHgjU`, 5, FileType.fromExtension(`jpeg`), 10, zone, AssetType.ORIG, `steve-johnson-gkfvdCEbUbQ-unsplash`);
                asset2.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1888`;
                const asset3 = new Asset(`Aah0dUnhGFNWjAeqKEkB/SNLNpFf`, 6, FileType.fromExtension(`jpeg`), 10, zone, AssetType.ORIG, `steve-johnson-T12spiHYons-unsplash`);
                asset3.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1999`;

                mockfs({
                    [Config.defaultConfig.dataDir]: {
                        [ASSET_DIR]: {
                            [asset1.getAssetFilename()]: Buffer.from([1, 1, 1, 1]),
                            [asset2.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1]),
                            [asset3.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1, 1]),
                        },
                        [ARCHIVE_DIR]: {},
                        [albumUUIDPath]: {
                            [asset1.getPrettyFilename()]: mockfs.symlink({
                                path: `../${ASSET_DIR}/${asset1.getAssetFilename()}`,
                            }),
                            [asset2.getPrettyFilename()]: mockfs.symlink({
                                path: `../${ASSET_DIR}/${asset2.getAssetFilename()}`,
                            }),
                            [asset3.getPrettyFilename()]: mockfs.symlink({
                                path: `../${ASSET_DIR}/${asset3.getAssetFilename()}`,
                            }),
                        },
                        [albumName]: mockfs.symlink({
                            path: albumUUIDPath,
                        }),
                    },
                });

                const startEvent = mockedEventManager.spyOnEvent(iCPSEventArchiveEngine.ARCHIVE_START);

                archiveEngine.persistAsset = jest.fn(() => Promise.resolve());
                archiveEngine.prepareForRemoteDeletion = jest.fn(() => `a`);
                archiveEngine.icloud.photos.deleteAssets = jest.fn(() => Promise.resolve());

                await expect(archiveEngine.archivePath(`/opt/icloud-photos-library/.cc40a239-2beb-483e-acee-e897db1b818a`, [asset1, asset2, asset3])).rejects.toThrow(/^UUID path selected, use named path only$/);

                expect(archiveEngine.persistAsset).not.toHaveBeenCalled();
                expect(archiveEngine.prepareForRemoteDeletion).not.toHaveBeenCalled();
                expect(archiveEngine.icloud.photos.deleteAssets).not.toHaveBeenCalled();

                expect(startEvent).toHaveBeenCalled();
            });

            test(`Folder path`, async () => {
                const albumUUID1 = `cc40a239-2beb-483e-acee-e897db1b818a`;
                const albumUUIDPath1 = `.${albumUUID1}`;
                const albumName1 = `Random1`;
                const albumUUID2 = `cc40a239-2beb-483e-acee-e897db1b818a`;
                const albumUUIDPath2 = `.${albumUUID2}`;
                const albumName2 = `Random2`;

                const asset1 = new Asset(`Aa7/yox97ecSUNmVw0xP4YzIDDKf`, 4, FileType.fromExtension(`jpeg`), 10, zone, AssetType.ORIG, `stephen-leonardi-xx6ZyOeyJtI-unsplash`);
                asset1.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1843`;
                const asset2 = new Asset(`AaGv15G3Cp9LPMQQfFZiHRryHgjU`, 5, FileType.fromExtension(`jpeg`), 10, zone, AssetType.ORIG, `steve-johnson-gkfvdCEbUbQ-unsplash`);
                asset2.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1888`;
                const asset3 = new Asset(`Aah0dUnhGFNWjAeqKEkB/SNLNpFf`, 6, FileType.fromExtension(`jpeg`), 10, zone, AssetType.ORIG, `steve-johnson-T12spiHYons-unsplash`);
                asset3.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1999`;

                mockfs({
                    [Config.defaultConfig.dataDir]: {
                        [ASSET_DIR]: {
                            [asset1.getAssetFilename()]: Buffer.from([1, 1, 1, 1]),
                            [asset2.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1]),
                            [asset3.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1, 1]),
                        },
                        [ARCHIVE_DIR]: {},
                        [albumUUIDPath1]: {
                            [albumUUIDPath2]: {
                                [asset1.getPrettyFilename()]: mockfs.symlink({
                                    path: `../../${ASSET_DIR}/${asset1.getAssetFilename()}`,
                                }),
                                [asset2.getPrettyFilename()]: mockfs.symlink({
                                    path: `../../${ASSET_DIR}/${asset2.getAssetFilename()}`,
                                }),
                                [asset3.getPrettyFilename()]: mockfs.symlink({
                                    path: `../../${ASSET_DIR}/${asset3.getAssetFilename()}`,
                                }),
                            },
                            [albumName2]: mockfs.symlink({
                                path: albumUUIDPath2,
                            }),
                        },
                        [albumName1]: mockfs.symlink({
                            path: albumUUIDPath1,
                        }),
                    },
                });

                const startEvent = mockedEventManager.spyOnEvent(iCPSEventArchiveEngine.ARCHIVE_START);

                archiveEngine.persistAsset = jest.fn(() => Promise.resolve());
                archiveEngine.prepareForRemoteDeletion = jest.fn(() => `a`);
                archiveEngine.icloud.photos.deleteAssets = jest.fn(() => Promise.resolve());

                await expect(archiveEngine.archivePath(`/opt/icloud-photos-library/Random1`, [asset1, asset2, asset3])).rejects.toThrow(/^Only able to archive non-archived albums$/);

                expect(archiveEngine.persistAsset).not.toHaveBeenCalled();
                expect(archiveEngine.prepareForRemoteDeletion).not.toHaveBeenCalled();
                expect(archiveEngine.icloud.photos.deleteAssets).not.toHaveBeenCalled();

                expect(startEvent).toHaveBeenCalled();
            });

            test(`Empty path`, async () => {
                const albumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
                const albumUUIDPath = `.${albumUUID}`;
                const albumName = `Random`;

                const asset1 = new Asset(`Aa7/yox97ecSUNmVw0xP4YzIDDKf`, 4, FileType.fromExtension(`jpeg`), 10, zone, AssetType.ORIG, `stephen-leonardi-xx6ZyOeyJtI-unsplash`);
                asset1.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1843`;
                const asset2 = new Asset(`AaGv15G3Cp9LPMQQfFZiHRryHgjU`, 5, FileType.fromExtension(`jpeg`), 10, zone, AssetType.ORIG, `steve-johnson-gkfvdCEbUbQ-unsplash`);
                asset2.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1888`;
                const asset3 = new Asset(`Aah0dUnhGFNWjAeqKEkB/SNLNpFf`, 6, FileType.fromExtension(`jpeg`), 10, zone, AssetType.ORIG, `steve-johnson-T12spiHYons-unsplash`);
                asset3.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1999`;

                mockfs({
                    [Config.defaultConfig.dataDir]: {
                        [ASSET_DIR]: {
                            [asset1.getAssetFilename()]: Buffer.from([1, 1, 1, 1]),
                            [asset2.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1]),
                            [asset3.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1, 1]),
                        },
                        [ARCHIVE_DIR]: {},
                        [albumUUIDPath]: {},
                        [albumName]: mockfs.symlink({
                            path: albumUUIDPath,
                        }),
                    },
                });

                const startEvent = mockedEventManager.spyOnEvent(iCPSEventArchiveEngine.ARCHIVE_START);

                archiveEngine.persistAsset = jest.fn(() => Promise.resolve());
                archiveEngine.prepareForRemoteDeletion = jest.fn(() => `a`);
                archiveEngine.icloud.photos.deleteAssets = jest.fn(() => Promise.resolve());

                await expect(archiveEngine.archivePath(`${Config.defaultConfig.dataDir}/${albumName}`, [asset1, asset2, asset3])).rejects.toThrow(/^Unable to load album$/);

                expect(archiveEngine.persistAsset).not.toHaveBeenCalled();
                expect(archiveEngine.prepareForRemoteDeletion).not.toHaveBeenCalled();
                expect(archiveEngine.icloud.photos.deleteAssets).not.toHaveBeenCalled();

                expect(startEvent).toHaveBeenCalled();
            });

            test(`Throws error, if no assets are available`, async () => {
                const startEvent = mockedEventManager.spyOnEvent(iCPSEventArchiveEngine.ARCHIVE_START);

                archiveEngine.persistAsset = jest.fn(() => Promise.resolve());
                archiveEngine.prepareForRemoteDeletion = jest.fn(() => undefined);
                archiveEngine.icloud.photos.deleteAssets = jest.fn(() => Promise.resolve());

                await expect(archiveEngine.archivePath(`${Config.defaultConfig.dataDir}/Random`, [])).rejects.toThrow(/^No remote assets available$/);

                expect(archiveEngine.persistAsset).not.toHaveBeenCalled();
                expect(archiveEngine.prepareForRemoteDeletion).not.toHaveBeenCalled();
                expect(archiveEngine.icloud.photos.deleteAssets).not.toHaveBeenCalled();

                expect(startEvent).toHaveBeenCalled();
            });
        });

        test(`Persist asset throws error`, async () => {
            const albumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
            const albumUUIDPath = `.${albumUUID}`;
            const albumName = `Random`;

            const asset1 = new Asset(`Aa7/yox97ecSUNmVw0xP4YzIDDKf`, 4, FileType.fromExtension(`jpeg`), 10, zone, AssetType.ORIG, `stephen-leonardi-xx6ZyOeyJtI-unsplash`);
            asset1.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1843`;
            const asset2 = new Asset(`AaGv15G3Cp9LPMQQfFZiHRryHgjU`, 5, FileType.fromExtension(`jpeg`), 10, zone, AssetType.ORIG, `steve-johnson-gkfvdCEbUbQ-unsplash`);
            asset2.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1888`;
            const asset3 = new Asset(`Aah0dUnhGFNWjAeqKEkB/SNLNpFf`, 6, FileType.fromExtension(`jpeg`), 10, zone, AssetType.ORIG, `steve-johnson-T12spiHYons-unsplash`);
            asset3.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1999`;

            mockfs({
                [Config.defaultConfig.dataDir]: {
                    [ASSET_DIR]: {
                        [asset1.getAssetFilename()]: Buffer.from([1, 1, 1, 1]),
                        [asset2.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1]),
                        [asset3.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1, 1]),
                    },
                    [ARCHIVE_DIR]: {},
                    [albumUUIDPath]: {
                        [asset1.getPrettyFilename()]: mockfs.symlink({
                            path: `../${ASSET_DIR}/${asset1.getAssetFilename()}`,
                        }),
                        [asset2.getPrettyFilename()]: mockfs.symlink({
                            path: `../${ASSET_DIR}/${asset2.getAssetFilename()}`,
                        }),
                        [asset3.getPrettyFilename()]: mockfs.symlink({
                            path: `../${ASSET_DIR}/${asset3.getAssetFilename()}`,
                        }),
                    },
                    [albumName]: mockfs.symlink({
                        path: albumUUIDPath,
                    }),
                },
            });

            const startEvent = mockedEventManager.spyOnEvent(iCPSEventArchiveEngine.ARCHIVE_START);
            const persistEvent = mockedEventManager.spyOnEvent(iCPSEventArchiveEngine.PERSISTING_START);
            const remoteDeleteEvent = mockedEventManager.spyOnEvent(iCPSEventArchiveEngine.REMOTE_DELETE);
            const finishEvent = mockedEventManager.spyOnEvent(iCPSEventArchiveEngine.ARCHIVE_DONE);
            const errorEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.ARCHIVE_ASSET_ERROR);

            archiveEngine.persistAsset = jest.fn(() => Promise.resolve())
                .mockRejectedValueOnce(`Persisting failed`)
                .mockResolvedValueOnce()
                .mockResolvedValueOnce();
            archiveEngine.prepareForRemoteDeletion = jest.fn(() => `a`)
                .mockReturnValueOnce(asset1.recordName)
                .mockReturnValueOnce(asset2.recordName)
                .mockReturnValueOnce(asset3.recordName);
            archiveEngine.icloud.photos.deleteAssets = jest.fn(() => Promise.resolve());

            await archiveEngine.archivePath(`/opt/icloud-photos-library/Random`, [asset1, asset2, asset3]);

            expect(archiveEngine.persistAsset).toHaveBeenCalledTimes(3);
            expect(archiveEngine.persistAsset).toHaveBeenCalledWith(path.join(Config.defaultConfig.dataDir, ASSET_DIR, asset1.getAssetFilename()), path.join(Config.defaultConfig.dataDir, albumUUIDPath, asset1.getPrettyFilename()));
            expect(archiveEngine.persistAsset).toHaveBeenCalledWith(path.join(Config.defaultConfig.dataDir, ASSET_DIR, asset2.getAssetFilename()), path.join(Config.defaultConfig.dataDir, albumUUIDPath, asset2.getPrettyFilename()));
            expect(archiveEngine.persistAsset).toHaveBeenCalledWith(path.join(Config.defaultConfig.dataDir, ASSET_DIR, asset3.getAssetFilename()), path.join(Config.defaultConfig.dataDir, albumUUIDPath, asset3.getPrettyFilename()));

            expect(archiveEngine.prepareForRemoteDeletion).toHaveBeenCalledTimes(2);

            // Call Array should hold only two items, not all three
            expect(((archiveEngine.icloud.photos.deleteAssets as jest.Mock).mock.calls[0][0] as []).length).toBe(2);

            expect(startEvent).toHaveBeenCalled();
            expect(persistEvent).toHaveBeenCalledWith(3);
            expect(remoteDeleteEvent).toHaveBeenCalledWith(2);
            expect(finishEvent).toHaveBeenCalled();

            expect(errorEvent).toHaveBeenCalledWith(new Error(`Unable to persist asset`), path.join(Config.defaultConfig.dataDir, ASSET_DIR, asset1.getAssetFilename()));
        });

        test(`Prepare remote delete throws error`, async () => {
            const albumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
            const albumUUIDPath = `.${albumUUID}`;
            const albumName = `Random`;

            const asset1 = new Asset(`Aa7/yox97ecSUNmVw0xP4YzIDDKf`, 4, FileType.fromExtension(`jpeg`), 10, zone, AssetType.ORIG, `stephen-leonardi-xx6ZyOeyJtI-unsplash`);
            asset1.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1843`;
            const asset2 = new Asset(`AaGv15G3Cp9LPMQQfFZiHRryHgjU`, 5, FileType.fromExtension(`jpeg`), 10, zone, AssetType.ORIG, `steve-johnson-gkfvdCEbUbQ-unsplash`);
            asset2.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1888`;
            const asset3 = new Asset(`Aah0dUnhGFNWjAeqKEkB/SNLNpFf`, 6, FileType.fromExtension(`jpeg`), 10, zone, AssetType.ORIG, `steve-johnson-T12spiHYons-unsplash`);
            asset3.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1999`;

            mockfs({
                [Config.defaultConfig.dataDir]: {
                    [ASSET_DIR]: {
                        [asset1.getAssetFilename()]: Buffer.from([1, 1, 1, 1]),
                        [asset2.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1]),
                        [asset3.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1, 1]),
                    },
                    [ARCHIVE_DIR]: {},
                    [albumUUIDPath]: {
                        [asset1.getPrettyFilename()]: mockfs.symlink({
                            path: `../${ASSET_DIR}/${asset1.getAssetFilename()}`,
                        }),
                        [asset2.getPrettyFilename()]: mockfs.symlink({
                            path: `../${ASSET_DIR}/${asset2.getAssetFilename()}`,
                        }),
                        [asset3.getPrettyFilename()]: mockfs.symlink({
                            path: `../${ASSET_DIR}/${asset3.getAssetFilename()}`,
                        }),
                    },
                    [albumName]: mockfs.symlink({
                        path: albumUUIDPath,
                    }),
                },
            });

            const startEvent = mockedEventManager.spyOnEvent(iCPSEventArchiveEngine.ARCHIVE_START);
            const persistEvent = mockedEventManager.spyOnEvent(iCPSEventArchiveEngine.PERSISTING_START);
            const remoteDeleteEvent = mockedEventManager.spyOnEvent(iCPSEventArchiveEngine.REMOTE_DELETE);
            const finishEvent = mockedEventManager.spyOnEvent(iCPSEventArchiveEngine.ARCHIVE_DONE);
            const errorEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.ARCHIVE_ASSET_ERROR);

            archiveEngine.persistAsset = jest.fn(() => Promise.resolve());
            archiveEngine.prepareForRemoteDeletion = jest.fn(() => `a`)
                .mockImplementationOnce(() => {
                    throw new Error(`Unable to find asset`);
                })
                .mockReturnValueOnce(asset2.recordName)
                .mockReturnValueOnce(asset3.recordName);
            archiveEngine.icloud.photos.deleteAssets = jest.fn(() => Promise.resolve());

            await archiveEngine.archivePath(`/opt/icloud-photos-library/Random`, [asset1, asset2, asset3]);

            expect(archiveEngine.persistAsset).toHaveBeenCalledTimes(3);
            expect(archiveEngine.persistAsset).toHaveBeenCalledWith(path.join(Config.defaultConfig.dataDir, ASSET_DIR, asset1.getAssetFilename()), path.join(Config.defaultConfig.dataDir, albumUUIDPath, asset1.getPrettyFilename()));
            expect(archiveEngine.persistAsset).toHaveBeenCalledWith(path.join(Config.defaultConfig.dataDir, ASSET_DIR, asset2.getAssetFilename()), path.join(Config.defaultConfig.dataDir, albumUUIDPath, asset2.getPrettyFilename()));
            expect(archiveEngine.persistAsset).toHaveBeenCalledWith(path.join(Config.defaultConfig.dataDir, ASSET_DIR, asset3.getAssetFilename()), path.join(Config.defaultConfig.dataDir, albumUUIDPath, asset3.getPrettyFilename()));

            expect(archiveEngine.prepareForRemoteDeletion).toHaveBeenCalledTimes(3);
            expect(archiveEngine.prepareForRemoteDeletion).toHaveBeenCalledWith(path.join(Config.defaultConfig.dataDir, ASSET_DIR, asset1.getAssetFilename()), [asset1, asset2, asset3]);
            expect(archiveEngine.prepareForRemoteDeletion).toHaveBeenCalledWith(path.join(Config.defaultConfig.dataDir, ASSET_DIR, asset2.getAssetFilename()), [asset1, asset2, asset3]);
            expect(archiveEngine.prepareForRemoteDeletion).toHaveBeenCalledWith(path.join(Config.defaultConfig.dataDir, ASSET_DIR, asset3.getAssetFilename()), [asset1, asset2, asset3]);

            expect(startEvent).toHaveBeenCalled();
            expect(persistEvent).toHaveBeenCalledWith(3);
            expect(remoteDeleteEvent).toHaveBeenCalledWith(2);
            expect(finishEvent).toHaveBeenCalled();

            expect(errorEvent).toHaveBeenCalledWith(new Error(`Unable to persist asset`), path.join(Config.defaultConfig.dataDir, ASSET_DIR, asset1.getAssetFilename()));
        });

        test(`Delete assets throws error`, async () => {
            const albumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
            const albumUUIDPath = `.${albumUUID}`;
            const albumName = `Random`;

            const asset1 = new Asset(`Aa7/yox97ecSUNmVw0xP4YzIDDKf`, 4, FileType.fromExtension(`jpeg`), 10, zone, AssetType.ORIG, `stephen-leonardi-xx6ZyOeyJtI-unsplash`);
            asset1.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1843`;
            const asset2 = new Asset(`AaGv15G3Cp9LPMQQfFZiHRryHgjU`, 5, FileType.fromExtension(`jpeg`), 10, zone, AssetType.ORIG, `steve-johnson-gkfvdCEbUbQ-unsplash`);
            asset2.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1888`;
            const asset3 = new Asset(`Aah0dUnhGFNWjAeqKEkB/SNLNpFf`, 6, FileType.fromExtension(`jpeg`), 10, zone, AssetType.ORIG, `steve-johnson-T12spiHYons-unsplash`);
            asset3.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1999`;

            mockfs({
                [Config.defaultConfig.dataDir]: {
                    [ASSET_DIR]: {
                        [asset1.getAssetFilename()]: Buffer.from([1, 1, 1, 1]),
                        [asset2.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1]),
                        [asset3.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1, 1]),
                    },
                    [ARCHIVE_DIR]: {},
                    [albumUUIDPath]: {
                        [asset1.getPrettyFilename()]: mockfs.symlink({
                            path: `../${ASSET_DIR}/${asset1.getAssetFilename()}`,
                        }),
                        [asset2.getPrettyFilename()]: mockfs.symlink({
                            path: `../${ASSET_DIR}/${asset2.getAssetFilename()}`,
                        }),
                        [asset3.getPrettyFilename()]: mockfs.symlink({
                            path: `../${ASSET_DIR}/${asset3.getAssetFilename()}`,
                        }),
                    },
                    [albumName]: mockfs.symlink({
                        path: albumUUIDPath,
                    }),
                },
            });

            const startEvent = mockedEventManager.spyOnEvent(iCPSEventArchiveEngine.ARCHIVE_START);
            const persistEvent = mockedEventManager.spyOnEvent(iCPSEventArchiveEngine.PERSISTING_START);
            const remoteDeleteEvent = mockedEventManager.spyOnEvent(iCPSEventArchiveEngine.REMOTE_DELETE);
            const finishEvent = mockedEventManager.spyOnEvent(iCPSEventArchiveEngine.ARCHIVE_DONE);

            archiveEngine.persistAsset = jest.fn(() => Promise.resolve());
            archiveEngine.prepareForRemoteDeletion = jest.fn(() => `a`)
                .mockReturnValueOnce(asset1.recordName)
                .mockReturnValueOnce(asset2.recordName)
                .mockReturnValueOnce(asset3.recordName);
            archiveEngine.icloud.photos.deleteAssets = jest.fn(() => Promise.reject());

            await expect(archiveEngine.archivePath(`/opt/icloud-photos-library/Random`, [asset1, asset2, asset3])).rejects.toThrow(/^Unable to delete remote assets$/);

            expect(archiveEngine.persistAsset).toHaveBeenCalledTimes(3);
            expect(archiveEngine.persistAsset).toHaveBeenCalledWith(path.join(Config.defaultConfig.dataDir, ASSET_DIR, asset1.getAssetFilename()), path.join(Config.defaultConfig.dataDir, albumUUIDPath, asset1.getPrettyFilename()));
            expect(archiveEngine.persistAsset).toHaveBeenCalledWith(path.join(Config.defaultConfig.dataDir, ASSET_DIR, asset2.getAssetFilename()), path.join(Config.defaultConfig.dataDir, albumUUIDPath, asset2.getPrettyFilename()));
            expect(archiveEngine.persistAsset).toHaveBeenCalledWith(path.join(Config.defaultConfig.dataDir, ASSET_DIR, asset3.getAssetFilename()), path.join(Config.defaultConfig.dataDir, albumUUIDPath, asset3.getPrettyFilename()));

            expect(archiveEngine.prepareForRemoteDeletion).toHaveBeenCalledTimes(3);
            expect(archiveEngine.prepareForRemoteDeletion).toHaveBeenCalledWith(path.join(Config.defaultConfig.dataDir, ASSET_DIR, asset1.getAssetFilename()), [asset1, asset2, asset3]);
            expect(archiveEngine.prepareForRemoteDeletion).toHaveBeenCalledWith(path.join(Config.defaultConfig.dataDir, ASSET_DIR, asset2.getAssetFilename()), [asset1, asset2, asset3]);
            expect(archiveEngine.prepareForRemoteDeletion).toHaveBeenCalledWith(path.join(Config.defaultConfig.dataDir, ASSET_DIR, asset3.getAssetFilename()), [asset1, asset2, asset3]);

            expect(startEvent).toHaveBeenCalled();
            expect(persistEvent).toHaveBeenCalledWith(3);
            expect(remoteDeleteEvent).toHaveBeenCalledWith(3);
            expect(finishEvent).not.toHaveBeenCalled();
        });
    });

    test(`Persist Asset`, async () => {
        const albumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
        const albumUUIDPath = `.${albumUUID}`;
        const albumName = `Random`;

        const asset1 = new Asset(`Aa7/yox97ecSUNmVw0xP4YzIDDKf`, 4, FileType.fromExtension(`jpeg`), Date.now() - 10000, zone, AssetType.ORIG, `stephen-leonardi-xx6ZyOeyJtI-unsplash`);
        asset1.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1843`;
        const asset2 = new Asset(`AaGv15G3Cp9LPMQQfFZiHRryHgjU`, 5, FileType.fromExtension(`jpeg`), Date.now() - 15000, zone, AssetType.ORIG, `steve-johnson-gkfvdCEbUbQ-unsplash`);
        asset2.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1888`;
        const asset3 = new Asset(`Aah0dUnhGFNWjAeqKEkB/SNLNpFf`, 6, FileType.fromExtension(`jpeg`), Date.now() - 18000, zone, AssetType.ORIG, `steve-johnson-T12spiHYons-unsplash`);
        asset3.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1999`;

        mockfs({
            [Config.defaultConfig.dataDir]: {
                [ASSET_DIR]: {
                    [asset1.getAssetFilename()]: mockfs.file({
                        content: Buffer.from([1, 1, 1, 1]),
                        ctime: new Date(asset1.modified),
                        mtime: new Date(asset1.modified),
                    }),
                    [asset2.getAssetFilename()]: mockfs.file({
                        content: Buffer.from([1, 1, 1, 1, 1]),
                        ctime: new Date(asset2.modified),
                        mtime: new Date(asset2.modified),
                    }),
                    [asset3.getAssetFilename()]: mockfs.file({
                        content: Buffer.from([1, 1, 1, 1, 1, 1]),
                        ctime: new Date(asset3.modified),
                        mtime: new Date(asset3.modified),
                    }),
                },
                [ARCHIVE_DIR]: {},
                [albumUUIDPath]: {
                    [asset1.getPrettyFilename()]: mockfs.symlink({
                        path: `../${ASSET_DIR}/${asset1.getAssetFilename()}`,
                    }),
                    [asset2.getPrettyFilename()]: mockfs.symlink({
                        path: `../${ASSET_DIR}/${asset2.getAssetFilename()}`,
                    }),
                    [asset3.getPrettyFilename()]: mockfs.symlink({
                        path: `../${ASSET_DIR}/${asset3.getAssetFilename()}`,
                    }),
                },
                [albumName]: mockfs.symlink({
                    path: albumUUIDPath,
                }),
            },
        });

        await archiveEngine.persistAsset(path.join(Config.defaultConfig.dataDir, ASSET_DIR, asset1.getAssetFilename()), path.join(Config.defaultConfig.dataDir, albumUUIDPath, asset1.getPrettyFilename()));
        await archiveEngine.persistAsset(path.join(Config.defaultConfig.dataDir, ASSET_DIR, asset2.getAssetFilename()), path.join(Config.defaultConfig.dataDir, albumUUIDPath, asset2.getPrettyFilename()));
        await archiveEngine.persistAsset(path.join(Config.defaultConfig.dataDir, ASSET_DIR, asset3.getAssetFilename()), path.join(Config.defaultConfig.dataDir, albumUUIDPath, asset3.getPrettyFilename()));

        const asset1AssetStats = fs.lstatSync(path.join(Config.defaultConfig.dataDir, ASSET_DIR, asset1.getAssetFilename()));
        const asset1ArchivedStats = fs.lstatSync(path.join(Config.defaultConfig.dataDir, albumUUIDPath, asset1.getPrettyFilename()));
        expect(asset1AssetStats.isFile()).toBeTruthy();
        expect(asset1ArchivedStats.mtimeMs).toEqual(asset1.modified);
        expect(asset1ArchivedStats.isFile()).toBeTruthy();
        expect(asset1ArchivedStats.mtimeMs).toEqual(asset1.modified);

        const asset2AssetStats = fs.lstatSync(path.join(Config.defaultConfig.dataDir, ASSET_DIR, asset2.getAssetFilename()));
        const asset2ArchivedStats = fs.lstatSync(path.join(Config.defaultConfig.dataDir, albumUUIDPath, asset2.getPrettyFilename()));
        expect(asset2AssetStats.isFile()).toBeTruthy();
        expect(asset2ArchivedStats.mtimeMs).toEqual(asset2.modified);
        expect(asset2ArchivedStats.isFile()).toBeTruthy();
        expect(asset2ArchivedStats.mtimeMs).toEqual(asset2.modified);

        const asset3AssetStats = fs.lstatSync(path.join(Config.defaultConfig.dataDir, ASSET_DIR, asset3.getAssetFilename()));
        const asset3ArchivedStats = fs.lstatSync(path.join(Config.defaultConfig.dataDir, albumUUIDPath, asset3.getPrettyFilename()));
        expect(asset3AssetStats.isFile()).toBeTruthy();
        expect(asset3ArchivedStats.mtimeMs).toEqual(asset3.modified);
        expect(asset3ArchivedStats.isFile()).toBeTruthy();
        expect(asset3ArchivedStats.mtimeMs).toEqual(asset3.modified);
    });

    describe(`Delete remote asset`, () => {
        test(`Delete remote asset`, () => {
            const asset1 = new Asset(`Aa7/yox97ecSUNmVw0xP4YzIDDKf`, 4, FileType.fromExtension(`jpeg`), 10, zone, AssetType.ORIG, `stephen-leonardi-xx6ZyOeyJtI-unsplash`);
            asset1.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1843`;
            const asset2 = new Asset(`AaGv15G3Cp9LPMQQfFZiHRryHgjU`, 5, FileType.fromExtension(`jpeg`), 10, zone, AssetType.ORIG, `steve-johnson-gkfvdCEbUbQ-unsplash`);
            asset2.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1888`;
            const asset3 = new Asset(`Aah0dUnhGFNWjAeqKEkB/SNLNpFf`, 6, FileType.fromExtension(`jpeg`), 10, zone, AssetType.ORIG, `steve-johnson-T12spiHYons-unsplash`);
            asset3.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1999`;

            const result1 = archiveEngine.prepareForRemoteDeletion(path.join(Config.defaultConfig.dataDir, ASSET_DIR, asset1.getAssetFilename()), [asset1, asset2, asset3]);
            const result2 = archiveEngine.prepareForRemoteDeletion(path.join(Config.defaultConfig.dataDir, ASSET_DIR, asset2.getAssetFilename()), [asset1, asset2, asset3]);
            const result3 = archiveEngine.prepareForRemoteDeletion(path.join(Config.defaultConfig.dataDir, ASSET_DIR, asset3.getAssetFilename()), [asset1, asset2, asset3]);

            expect(result1).toEqual(asset1.recordName);
            expect(result2).toEqual(asset2.recordName);
            expect(result3).toEqual(asset3.recordName);
        });

        test(`Unable to find remote asset`, () => {
            const albumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
            const albumUUIDPath = `.${albumUUID}`;
            const albumName = `Random`;

            const asset1 = new Asset(`Aa7/yox97ecSUNmVw0xP4YzIDDKf`, 4, FileType.fromExtension(`jpeg`), 10, zone, AssetType.ORIG, `stephen-leonardi-xx6ZyOeyJtI-unsplash`);
            asset1.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1843`;
            const asset2 = new Asset(`AaGv15G3Cp9LPMQQfFZiHRryHgjU`, 5, FileType.fromExtension(`jpeg`), 10, zone, AssetType.ORIG, `steve-johnson-gkfvdCEbUbQ-unsplash`);
            asset2.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1888`;
            const asset3 = new Asset(`Aah0dUnhGFNWjAeqKEkB/SNLNpFf`, 6, FileType.fromExtension(`jpeg`), 10, zone, AssetType.ORIG, `steve-johnson-T12spiHYons-unsplash`);
            asset3.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1999`;

            mockfs({
                [Config.defaultConfig.dataDir]: {
                    [ASSET_DIR]: {
                        [asset1.getAssetFilename()]: Buffer.from([1, 1, 1, 1]),
                        [asset2.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1]),
                        [asset3.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1, 1]),
                    },
                    [ARCHIVE_DIR]: {},
                    [albumUUIDPath]: {
                        [asset1.getPrettyFilename()]: mockfs.symlink({
                            path: `../${ASSET_DIR}/${asset1.getAssetFilename()}`,
                        }),
                        [asset2.getPrettyFilename()]: mockfs.symlink({
                            path: `../${ASSET_DIR}/${asset2.getAssetFilename()}`,
                        }),
                        [asset3.getPrettyFilename()]: mockfs.symlink({
                            path: `../${ASSET_DIR}/${asset3.getAssetFilename()}`,
                        }),
                    },
                    [albumName]: mockfs.symlink({
                        path: albumUUIDPath,
                    }),
                },
            });

            expect(() => archiveEngine.prepareForRemoteDeletion(path.join(Config.defaultConfig.dataDir, ASSET_DIR, asset1.getAssetFilename()), [asset2, asset3])).toThrow(/^Unable to find remote asset$/);
        });

        test(`Unable to find remote asset's record name`, () => {
            const albumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
            const albumUUIDPath = `.${albumUUID}`;
            const albumName = `Random`;

            const asset1 = new Asset(`Aa7/yox97ecSUNmVw0xP4YzIDDKf`, 4, FileType.fromExtension(`jpeg`), 10, zone, AssetType.ORIG, `stephen-leonardi-xx6ZyOeyJtI-unsplash`);
            const asset2 = new Asset(`AaGv15G3Cp9LPMQQfFZiHRryHgjU`, 5, FileType.fromExtension(`jpeg`), 10, zone, AssetType.ORIG, `steve-johnson-gkfvdCEbUbQ-unsplash`);
            asset2.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1888`;
            const asset3 = new Asset(`Aah0dUnhGFNWjAeqKEkB/SNLNpFf`, 6, FileType.fromExtension(`jpeg`), 10, zone, AssetType.ORIG, `steve-johnson-T12spiHYons-unsplash`);
            asset3.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1999`;

            mockfs({
                [Config.defaultConfig.dataDir]: {
                    [ASSET_DIR]: {
                        [asset1.getAssetFilename()]: Buffer.from([1, 1, 1, 1]),
                        [asset2.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1]),
                        [asset3.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1, 1]),
                    },
                    [ARCHIVE_DIR]: {},
                    [albumUUIDPath]: {
                        [asset1.getPrettyFilename()]: mockfs.symlink({
                            path: `../${ASSET_DIR}/${asset1.getAssetFilename()}`,
                        }),
                        [asset2.getPrettyFilename()]: mockfs.symlink({
                            path: `../${ASSET_DIR}/${asset2.getAssetFilename()}`,
                        }),
                        [asset3.getPrettyFilename()]: mockfs.symlink({
                            path: `../${ASSET_DIR}/${asset3.getAssetFilename()}`,
                        }),
                    },
                    [albumName]: mockfs.symlink({
                        path: albumUUIDPath,
                    }),
                },
            });

            expect(() => archiveEngine.prepareForRemoteDeletion(path.join(Config.defaultConfig.dataDir, ASSET_DIR, asset1.getAssetFilename()), [asset1, asset2, asset3])).toThrow(/^Unable to get record name$/);
        });

        test(`Don't delete asset if flag is set`, () => {
            mockedResourceManager._resources.remoteDelete = false;

            const albumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
            const albumUUIDPath = `.${albumUUID}`;
            const albumName = `Random`;

            const asset1 = new Asset(`Aa7/yox97ecSUNmVw0xP4YzIDDKf`, 4, FileType.fromExtension(`jpeg`), 10, zone, AssetType.ORIG, `stephen-leonardi-xx6ZyOeyJtI-unsplash`);
            const asset2 = new Asset(`AaGv15G3Cp9LPMQQfFZiHRryHgjU`, 5, FileType.fromExtension(`jpeg`), 10, zone, AssetType.ORIG, `steve-johnson-gkfvdCEbUbQ-unsplash`);
            asset2.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1888`;
            const asset3 = new Asset(`Aah0dUnhGFNWjAeqKEkB/SNLNpFf`, 6, FileType.fromExtension(`jpeg`), 10, zone, AssetType.ORIG, `steve-johnson-T12spiHYons-unsplash`);
            asset3.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1999`;

            mockfs({
                [Config.defaultConfig.dataDir]: {
                    [ASSET_DIR]: {
                        [asset1.getAssetFilename()]: Buffer.from([1, 1, 1, 1]),
                        [asset2.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1]),
                        [asset3.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1, 1]),
                    },
                    [ARCHIVE_DIR]: {},
                    [albumUUIDPath]: {
                        [asset1.getPrettyFilename()]: mockfs.symlink({
                            path: `../${ASSET_DIR}/${asset1.getAssetFilename()}`,
                        }),
                        [asset2.getPrettyFilename()]: mockfs.symlink({
                            path: `../${ASSET_DIR}/${asset2.getAssetFilename()}`,
                        }),
                        [asset3.getPrettyFilename()]: mockfs.symlink({
                            path: `../${ASSET_DIR}/${asset3.getAssetFilename()}`,
                        }),
                    },
                    [albumName]: mockfs.symlink({
                        path: albumUUIDPath,
                    }),
                },
            });

            const result = archiveEngine.prepareForRemoteDeletion(path.join(Config.defaultConfig.dataDir, ASSET_DIR, asset1.getAssetFilename()), [asset1, asset2, asset3]);
            expect(result).toBeUndefined();
        });

        test(`Don't delete favored asset`, () => {
            const albumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
            const albumUUIDPath = `.${albumUUID}`;
            const albumName = `Random`;

            const asset1 = new Asset(`Aa7/yox97ecSUNmVw0xP4YzIDDKf`, 4, FileType.fromExtension(`jpeg`), 10, zone, AssetType.ORIG, `stephen-leonardi-xx6ZyOeyJtI-unsplash`);
            asset1.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1843`;
            asset1.isFavorite = true;
            const asset2 = new Asset(`AaGv15G3Cp9LPMQQfFZiHRryHgjU`, 5, FileType.fromExtension(`jpeg`), 10, zone, AssetType.ORIG, `steve-johnson-gkfvdCEbUbQ-unsplash`);
            asset2.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1888`;
            const asset3 = new Asset(`Aah0dUnhGFNWjAeqKEkB/SNLNpFf`, 6, FileType.fromExtension(`jpeg`), 10, zone, AssetType.ORIG, `steve-johnson-T12spiHYons-unsplash`);
            asset3.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1999`;

            mockfs({
                [Config.defaultConfig.dataDir]: {
                    [ASSET_DIR]: {
                        [asset1.getAssetFilename()]: Buffer.from([1, 1, 1, 1]),
                        [asset2.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1]),
                        [asset3.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1, 1]),
                    },
                    [ARCHIVE_DIR]: {},
                    [albumUUIDPath]: {
                        [asset1.getPrettyFilename()]: mockfs.symlink({
                            path: `../${ASSET_DIR}/${asset1.getAssetFilename()}`,
                        }),
                        [asset2.getPrettyFilename()]: mockfs.symlink({
                            path: `../${ASSET_DIR}/${asset2.getAssetFilename()}`,
                        }),
                        [asset3.getPrettyFilename()]: mockfs.symlink({
                            path: `../${ASSET_DIR}/${asset3.getAssetFilename()}`,
                        }),
                    },
                    [albumName]: mockfs.symlink({
                        path: albumUUIDPath,
                    }),
                },
            });

            const result = archiveEngine.prepareForRemoteDeletion(path.join(Config.defaultConfig.dataDir, ASSET_DIR, asset1.getAssetFilename()), [asset1, asset2, asset3]);
            expect(result).toBeUndefined();
        });
    });
});