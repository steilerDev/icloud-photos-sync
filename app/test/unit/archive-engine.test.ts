import mockfs from 'mock-fs';
import {describe, test, afterEach, expect, jest} from '@jest/globals';
import {archiveEngineFactory} from '../_helpers/archive-engine.helper';
import {appDataDir as photosDataDir} from '../_helpers/_config';
import {ASSET_DIR, ARCHIVE_DIR} from '../../src/lib/photos-library/constants';
import path from 'path';
import {Asset, AssetType} from '../../src/lib/photos-library/model/asset';
import {FileType} from '../../src/lib/photos-library/model/file-type';
import fs from 'fs';
import {spyOnEvent} from '../_helpers/_general';
import * as ARCHIVE_ENGINE from '../../src/lib/archive-engine/constants';
import {HANDLER_EVENT} from '../../src/app/error/handler';
import {ArchiveError, SyncError} from '../../src/app/error/types';

describe(`Unit Tests - Archive Engine`, () => {
    afterEach(() => {
        mockfs.restore();
    });

    describe(`Archive Path`, () => {
        test(`Valid path`, async () => {
            const albumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
            const albumUUIDPath = `.${albumUUID}`;
            const albumName = `Random`;

            const asset1 = new Asset(`Aa7/yox97ecSUNmVw0xP4YzIDDKf`, 4, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `stephen-leonardi-xx6ZyOeyJtI-unsplash`);
            asset1.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1843`;
            const asset2 = new Asset(`AaGv15G3Cp9LPMQQfFZiHRryHgjU`, 5, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `steve-johnson-gkfvdCEbUbQ-unsplash`);
            asset2.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1888`;
            const asset3 = new Asset(`Aah0dUnhGFNWjAeqKEkB/SNLNpFf`, 6, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `steve-johnson-T12spiHYons-unsplash`);
            asset3.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1999`;

            mockfs({
                [photosDataDir]: {
                    [ASSET_DIR]: {
                        [asset1.getAssetFilename()]: Buffer.from([1, 1, 1, 1]),
                        [asset2.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1]),
                        [asset3.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1, 1]),
                    },
                    [ARCHIVE_DIR]: {},
                    [albumUUIDPath]: {
                        [asset1.getPrettyFilename()]: mockfs.symlink({
                            "path": `../${ASSET_DIR}/${asset1.getAssetFilename()}`,
                        }),
                        [asset2.getPrettyFilename()]: mockfs.symlink({
                            "path": `../${ASSET_DIR}/${asset2.getAssetFilename()}`,
                        }),
                        [asset3.getPrettyFilename()]: mockfs.symlink({
                            "path": `../${ASSET_DIR}/${asset3.getAssetFilename()}`,
                        }),
                    },
                    [albumName]: mockfs.symlink({
                        "path": albumUUIDPath,
                    }),
                },
            });

            const archiveEngine = archiveEngineFactory();
            const startEvent = spyOnEvent(archiveEngine, ARCHIVE_ENGINE.EVENTS.ARCHIVE_START);
            const persistEvent = spyOnEvent(archiveEngine, ARCHIVE_ENGINE.EVENTS.PERSISTING_START);
            const remoteDeleteEvent = spyOnEvent(archiveEngine, ARCHIVE_ENGINE.EVENTS.REMOTE_DELETE);
            const finishEvent = spyOnEvent(archiveEngine, ARCHIVE_ENGINE.EVENTS.ARCHIVE_DONE);

            archiveEngine.persistAsset = jest.fn(() => Promise.resolve());
            archiveEngine.prepareForRemoteDeletion = jest.fn(() => `a`)
                .mockReturnValueOnce(asset1.recordName)
                .mockReturnValueOnce(asset2.recordName)
                .mockReturnValueOnce(asset3.recordName);
            archiveEngine.icloud.photos.deleteAssets = jest.fn(() => Promise.resolve());

            await archiveEngine.archivePath(`/opt/icloud-photos-library/Random`, [asset1, asset2, asset3]);

            expect(archiveEngine.persistAsset).toHaveBeenCalledTimes(3);
            expect(archiveEngine.persistAsset).toHaveBeenCalledWith(path.join(photosDataDir, ASSET_DIR, asset1.getAssetFilename()), path.join(photosDataDir, albumUUIDPath, asset1.getPrettyFilename()));
            expect(archiveEngine.persistAsset).toHaveBeenCalledWith(path.join(photosDataDir, ASSET_DIR, asset2.getAssetFilename()), path.join(photosDataDir, albumUUIDPath, asset2.getPrettyFilename()));
            expect(archiveEngine.persistAsset).toHaveBeenCalledWith(path.join(photosDataDir, ASSET_DIR, asset3.getAssetFilename()), path.join(photosDataDir, albumUUIDPath, asset3.getPrettyFilename()));

            expect(archiveEngine.prepareForRemoteDeletion).toHaveBeenCalledTimes(3);
            expect(archiveEngine.prepareForRemoteDeletion).toHaveBeenCalledWith(path.join(photosDataDir, ASSET_DIR, asset1.getAssetFilename()), [asset1, asset2, asset3]);
            expect(archiveEngine.prepareForRemoteDeletion).toHaveBeenCalledWith(path.join(photosDataDir, ASSET_DIR, asset2.getAssetFilename()), [asset1, asset2, asset3]);
            expect(archiveEngine.prepareForRemoteDeletion).toHaveBeenCalledWith(path.join(photosDataDir, ASSET_DIR, asset3.getAssetFilename()), [asset1, asset2, asset3]);

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

            const asset1 = new Asset(`Aa7/yox97ecSUNmVw0xP4YzIDDKf`, 4, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `stephen-leonardi-xx6ZyOeyJtI-unsplash`);
            asset1.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1843`;
            const asset1Edit = new Asset(`Aa7/yox97ecSUNmVw0xP4YzIDDKd`, 4, FileType.fromExtension(`jpeg`), 10, AssetType.EDIT, `stephen-leonardi-xx6ZyOeyJtI-unsplash`);
            asset1Edit.recordName = asset1.recordName;
            const asset2 = new Asset(`AaGv15G3Cp9LPMQQfFZiHRryHgjU`, 5, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `steve-johnson-gkfvdCEbUbQ-unsplash`);
            asset2.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1888`;
            const asset3 = new Asset(`Aah0dUnhGFNWjAeqKEkB/SNLNpFf`, 6, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `steve-johnson-T12spiHYons-unsplash`);
            asset3.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1999`;

            mockfs({
                [photosDataDir]: {
                    [ASSET_DIR]: {
                        [asset1.getAssetFilename()]: Buffer.from([1, 1, 1, 1]),
                        [asset1Edit.getAssetFilename()]: Buffer.from([1, 1, 1, 1]),
                        [asset2.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1]),
                        [asset3.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1, 1]),
                    },
                    [ARCHIVE_DIR]: {},
                    [albumUUIDPath]: {
                        [asset1.getPrettyFilename()]: mockfs.symlink({
                            "path": `../${ASSET_DIR}/${asset1.getAssetFilename()}`,
                        }),
                        [asset1Edit.getPrettyFilename()]: mockfs.symlink({
                            "path": `../${ASSET_DIR}/${asset1Edit.getAssetFilename()}`,
                        }),
                        [asset2.getPrettyFilename()]: mockfs.symlink({
                            "path": `../${ASSET_DIR}/${asset2.getAssetFilename()}`,
                        }),
                        [asset3.getPrettyFilename()]: mockfs.symlink({
                            "path": `../${ASSET_DIR}/${asset3.getAssetFilename()}`,
                        }),
                    },
                    [albumName]: mockfs.symlink({
                        "path": albumUUIDPath,
                    }),
                },
            });

            const archiveEngine = archiveEngineFactory();
            const startEvent = spyOnEvent(archiveEngine, ARCHIVE_ENGINE.EVENTS.ARCHIVE_START);
            const persistEvent = spyOnEvent(archiveEngine, ARCHIVE_ENGINE.EVENTS.PERSISTING_START);
            const remoteDeleteEvent = spyOnEvent(archiveEngine, ARCHIVE_ENGINE.EVENTS.REMOTE_DELETE);
            const finishEvent = spyOnEvent(archiveEngine, ARCHIVE_ENGINE.EVENTS.ARCHIVE_DONE);
            const errorEvent = spyOnEvent(archiveEngine, HANDLER_EVENT);

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
            expect(archiveEngine.persistAsset).toHaveBeenCalledWith(path.join(photosDataDir, ASSET_DIR, asset1.getAssetFilename()), path.join(photosDataDir, albumUUIDPath, asset1.getPrettyFilename()));
            expect(archiveEngine.persistAsset).toHaveBeenCalledWith(path.join(photosDataDir, ASSET_DIR, asset1Edit.getAssetFilename()), path.join(photosDataDir, albumUUIDPath, asset1Edit.getPrettyFilename()));
            expect(archiveEngine.persistAsset).toHaveBeenCalledWith(path.join(photosDataDir, ASSET_DIR, asset2.getAssetFilename()), path.join(photosDataDir, albumUUIDPath, asset2.getPrettyFilename()));
            expect(archiveEngine.persistAsset).toHaveBeenCalledWith(path.join(photosDataDir, ASSET_DIR, asset3.getAssetFilename()), path.join(photosDataDir, albumUUIDPath, asset3.getPrettyFilename()));

            expect(archiveEngine.prepareForRemoteDeletion).toHaveBeenCalledTimes(4);
            expect(archiveEngine.prepareForRemoteDeletion).toHaveBeenCalledWith(path.join(photosDataDir, ASSET_DIR, asset1.getAssetFilename()), [asset1, asset1Edit, asset2, asset3]);
            expect(archiveEngine.prepareForRemoteDeletion).toHaveBeenCalledWith(path.join(photosDataDir, ASSET_DIR, asset1Edit.getAssetFilename()), [asset1, asset1Edit, asset2, asset3]);
            expect(archiveEngine.prepareForRemoteDeletion).toHaveBeenCalledWith(path.join(photosDataDir, ASSET_DIR, asset2.getAssetFilename()), [asset1, asset1Edit, asset2, asset3]);
            expect(archiveEngine.prepareForRemoteDeletion).toHaveBeenCalledWith(path.join(photosDataDir, ASSET_DIR, asset3.getAssetFilename()), [asset1, asset1Edit, asset2, asset3]);

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

                const asset1 = new Asset(`Aa7/yox97ecSUNmVw0xP4YzIDDKf`, 4, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `stephen-leonardi-xx6ZyOeyJtI-unsplash`);
                asset1.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1843`;
                const asset2 = new Asset(`AaGv15G3Cp9LPMQQfFZiHRryHgjU`, 5, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `steve-johnson-gkfvdCEbUbQ-unsplash`);
                asset2.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1888`;
                const asset3 = new Asset(`Aah0dUnhGFNWjAeqKEkB/SNLNpFf`, 6, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `steve-johnson-T12spiHYons-unsplash`);
                asset3.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1999`;

                mockfs({
                    [photosDataDir]: {
                        [ASSET_DIR]: {
                            [asset1.getAssetFilename()]: Buffer.from([1, 1, 1, 1]),
                            [asset2.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1]),
                            [asset3.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1, 1]),
                        },
                        [ARCHIVE_DIR]: {},
                        [albumUUIDPath]: {
                            [asset1.getPrettyFilename()]: mockfs.symlink({
                                "path": `../${ASSET_DIR}/${asset1.getAssetFilename()}`,
                            }),
                            [asset2.getPrettyFilename()]: mockfs.symlink({
                                "path": `../${ASSET_DIR}/${asset2.getAssetFilename()}`,
                            }),
                            [asset3.getPrettyFilename()]: mockfs.symlink({
                                "path": `../${ASSET_DIR}/${asset3.getAssetFilename()}`,
                            }),
                        },
                        [albumName]: mockfs.symlink({
                            "path": albumUUIDPath,
                        }),
                    },
                });

                const archiveEngine = archiveEngineFactory();
                const startEvent = spyOnEvent(archiveEngine, ARCHIVE_ENGINE.EVENTS.ARCHIVE_START);

                archiveEngine.persistAsset = jest.fn(() => Promise.resolve());
                archiveEngine.prepareForRemoteDeletion = jest.fn(() => `a`);
                archiveEngine.icloud.photos.deleteAssets = jest.fn(() => Promise.resolve());

                await expect(archiveEngine.archivePath(`/opt/icloud-photos-library/.cc40a239-2beb-483e-acee-e897db1b818a`, [asset1, asset2, asset3])).rejects.toThrowError(`UUID path selected, use named path only`);

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

                const asset1 = new Asset(`Aa7/yox97ecSUNmVw0xP4YzIDDKf`, 4, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `stephen-leonardi-xx6ZyOeyJtI-unsplash`);
                asset1.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1843`;
                const asset2 = new Asset(`AaGv15G3Cp9LPMQQfFZiHRryHgjU`, 5, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `steve-johnson-gkfvdCEbUbQ-unsplash`);
                asset2.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1888`;
                const asset3 = new Asset(`Aah0dUnhGFNWjAeqKEkB/SNLNpFf`, 6, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `steve-johnson-T12spiHYons-unsplash`);
                asset3.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1999`;

                mockfs({
                    [photosDataDir]: {
                        [ASSET_DIR]: {
                            [asset1.getAssetFilename()]: Buffer.from([1, 1, 1, 1]),
                            [asset2.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1]),
                            [asset3.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1, 1]),
                        },
                        [ARCHIVE_DIR]: {},
                        [albumUUIDPath1]: {
                            [albumUUIDPath2]: {
                                [asset1.getPrettyFilename()]: mockfs.symlink({
                                    "path": `../../${ASSET_DIR}/${asset1.getAssetFilename()}`,
                                }),
                                [asset2.getPrettyFilename()]: mockfs.symlink({
                                    "path": `../../${ASSET_DIR}/${asset2.getAssetFilename()}`,
                                }),
                                [asset3.getPrettyFilename()]: mockfs.symlink({
                                    "path": `../../${ASSET_DIR}/${asset3.getAssetFilename()}`,
                                }),
                            },
                            [albumName2]: mockfs.symlink({
                                "path": albumUUIDPath2,
                            }),
                        },
                        [albumName1]: mockfs.symlink({
                            "path": albumUUIDPath1,
                        }),
                    },
                });

                const archiveEngine = archiveEngineFactory();
                const startEvent = spyOnEvent(archiveEngine, ARCHIVE_ENGINE.EVENTS.ARCHIVE_START);

                archiveEngine.persistAsset = jest.fn(() => Promise.resolve());
                archiveEngine.prepareForRemoteDeletion = jest.fn(() => `a`);
                archiveEngine.icloud.photos.deleteAssets = jest.fn(() => Promise.resolve());

                await expect(archiveEngine.archivePath(`/opt/icloud-photos-library/Random1`, [asset1, asset2, asset3])).rejects.toThrowError(`Only able to archive non-archived albums`);

                expect(archiveEngine.persistAsset).not.toHaveBeenCalled();
                expect(archiveEngine.prepareForRemoteDeletion).not.toHaveBeenCalled();
                expect(archiveEngine.icloud.photos.deleteAssets).not.toHaveBeenCalled();

                expect(startEvent).toHaveBeenCalled();
            });

            test(`Empty path`, async () => {
                const albumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
                const albumUUIDPath = `.${albumUUID}`;
                const albumName = `Random`;

                const asset1 = new Asset(`Aa7/yox97ecSUNmVw0xP4YzIDDKf`, 4, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `stephen-leonardi-xx6ZyOeyJtI-unsplash`);
                asset1.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1843`;
                const asset2 = new Asset(`AaGv15G3Cp9LPMQQfFZiHRryHgjU`, 5, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `steve-johnson-gkfvdCEbUbQ-unsplash`);
                asset2.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1888`;
                const asset3 = new Asset(`Aah0dUnhGFNWjAeqKEkB/SNLNpFf`, 6, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `steve-johnson-T12spiHYons-unsplash`);
                asset3.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1999`;

                mockfs({
                    [photosDataDir]: {
                        [ASSET_DIR]: {
                            [asset1.getAssetFilename()]: Buffer.from([1, 1, 1, 1]),
                            [asset2.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1]),
                            [asset3.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1, 1]),
                        },
                        [ARCHIVE_DIR]: {},
                        [albumUUIDPath]: {},
                        [albumName]: mockfs.symlink({
                            "path": albumUUIDPath,
                        }),
                    },
                });

                const archiveEngine = archiveEngineFactory();
                const startEvent = spyOnEvent(archiveEngine, ARCHIVE_ENGINE.EVENTS.ARCHIVE_START);

                archiveEngine.persistAsset = jest.fn(() => Promise.resolve());
                archiveEngine.prepareForRemoteDeletion = jest.fn(() => `a`);
                archiveEngine.icloud.photos.deleteAssets = jest.fn(() => Promise.resolve());

                await expect(archiveEngine.archivePath(`${photosDataDir}/${albumName}`, [asset1, asset2, asset3])).rejects.toThrowError(`Unable to load album`);

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

            const asset1 = new Asset(`Aa7/yox97ecSUNmVw0xP4YzIDDKf`, 4, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `stephen-leonardi-xx6ZyOeyJtI-unsplash`);
            asset1.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1843`;
            const asset2 = new Asset(`AaGv15G3Cp9LPMQQfFZiHRryHgjU`, 5, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `steve-johnson-gkfvdCEbUbQ-unsplash`);
            asset2.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1888`;
            const asset3 = new Asset(`Aah0dUnhGFNWjAeqKEkB/SNLNpFf`, 6, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `steve-johnson-T12spiHYons-unsplash`);
            asset3.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1999`;

            mockfs({
                [photosDataDir]: {
                    [ASSET_DIR]: {
                        [asset1.getAssetFilename()]: Buffer.from([1, 1, 1, 1]),
                        [asset2.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1]),
                        [asset3.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1, 1]),
                    },
                    [ARCHIVE_DIR]: {},
                    [albumUUIDPath]: {
                        [asset1.getPrettyFilename()]: mockfs.symlink({
                            "path": `../${ASSET_DIR}/${asset1.getAssetFilename()}`,
                        }),
                        [asset2.getPrettyFilename()]: mockfs.symlink({
                            "path": `../${ASSET_DIR}/${asset2.getAssetFilename()}`,
                        }),
                        [asset3.getPrettyFilename()]: mockfs.symlink({
                            "path": `../${ASSET_DIR}/${asset3.getAssetFilename()}`,
                        }),
                    },
                    [albumName]: mockfs.symlink({
                        "path": albumUUIDPath,
                    }),
                },
            });

            const archiveEngine = archiveEngineFactory();
            const startEvent = spyOnEvent(archiveEngine, ARCHIVE_ENGINE.EVENTS.ARCHIVE_START);
            const persistEvent = spyOnEvent(archiveEngine, ARCHIVE_ENGINE.EVENTS.PERSISTING_START);
            const remoteDeleteEvent = spyOnEvent(archiveEngine, ARCHIVE_ENGINE.EVENTS.REMOTE_DELETE);
            const finishEvent = spyOnEvent(archiveEngine, ARCHIVE_ENGINE.EVENTS.ARCHIVE_DONE);
            const handlerEvent = spyOnEvent(archiveEngine, HANDLER_EVENT);

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
            expect(archiveEngine.persistAsset).toHaveBeenCalledWith(path.join(photosDataDir, ASSET_DIR, asset1.getAssetFilename()), path.join(photosDataDir, albumUUIDPath, asset1.getPrettyFilename()));
            expect(archiveEngine.persistAsset).toHaveBeenCalledWith(path.join(photosDataDir, ASSET_DIR, asset2.getAssetFilename()), path.join(photosDataDir, albumUUIDPath, asset2.getPrettyFilename()));
            expect(archiveEngine.persistAsset).toHaveBeenCalledWith(path.join(photosDataDir, ASSET_DIR, asset3.getAssetFilename()), path.join(photosDataDir, albumUUIDPath, asset3.getPrettyFilename()));

            expect(archiveEngine.prepareForRemoteDeletion).toHaveBeenCalledTimes(2);

            // Call Array should hold only two items, not all three
            expect(((archiveEngine.icloud.photos.deleteAssets as jest.Mock).mock.calls[0][0] as []).length).toBe(2);

            expect(startEvent).toHaveBeenCalled();
            expect(persistEvent).toHaveBeenCalledWith(3);
            expect(remoteDeleteEvent).toHaveBeenCalledWith(2);
            expect(finishEvent).toHaveBeenCalled();

            expect(handlerEvent).toHaveBeenCalledWith(new SyncError(`Unable to persist asset`, `WARN`));
        });

        test(`Prepare remote delete throws error`, async () => {
            const albumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
            const albumUUIDPath = `.${albumUUID}`;
            const albumName = `Random`;

            const asset1 = new Asset(`Aa7/yox97ecSUNmVw0xP4YzIDDKf`, 4, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `stephen-leonardi-xx6ZyOeyJtI-unsplash`);
            asset1.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1843`;
            const asset2 = new Asset(`AaGv15G3Cp9LPMQQfFZiHRryHgjU`, 5, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `steve-johnson-gkfvdCEbUbQ-unsplash`);
            asset2.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1888`;
            const asset3 = new Asset(`Aah0dUnhGFNWjAeqKEkB/SNLNpFf`, 6, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `steve-johnson-T12spiHYons-unsplash`);
            asset3.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1999`;

            mockfs({
                [photosDataDir]: {
                    [ASSET_DIR]: {
                        [asset1.getAssetFilename()]: Buffer.from([1, 1, 1, 1]),
                        [asset2.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1]),
                        [asset3.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1, 1]),
                    },
                    [ARCHIVE_DIR]: {},
                    [albumUUIDPath]: {
                        [asset1.getPrettyFilename()]: mockfs.symlink({
                            "path": `../${ASSET_DIR}/${asset1.getAssetFilename()}`,
                        }),
                        [asset2.getPrettyFilename()]: mockfs.symlink({
                            "path": `../${ASSET_DIR}/${asset2.getAssetFilename()}`,
                        }),
                        [asset3.getPrettyFilename()]: mockfs.symlink({
                            "path": `../${ASSET_DIR}/${asset3.getAssetFilename()}`,
                        }),
                    },
                    [albumName]: mockfs.symlink({
                        "path": albumUUIDPath,
                    }),
                },
            });

            const archiveEngine = archiveEngineFactory();
            const startEvent = spyOnEvent(archiveEngine, ARCHIVE_ENGINE.EVENTS.ARCHIVE_START);
            const persistEvent = spyOnEvent(archiveEngine, ARCHIVE_ENGINE.EVENTS.PERSISTING_START);
            const remoteDeleteEvent = spyOnEvent(archiveEngine, ARCHIVE_ENGINE.EVENTS.REMOTE_DELETE);
            const finishEvent = spyOnEvent(archiveEngine, ARCHIVE_ENGINE.EVENTS.ARCHIVE_DONE);
            const handlerEvent = spyOnEvent(archiveEngine, HANDLER_EVENT);

            archiveEngine.persistAsset = jest.fn(() => Promise.resolve());
            archiveEngine.prepareForRemoteDeletion = jest.fn(() => `a`)
                .mockImplementationOnce(() => {
                    throw new ArchiveError(`Unable to find asset`, `WARN`);
                })
                .mockReturnValueOnce(asset2.recordName)
                .mockReturnValueOnce(asset3.recordName);
            archiveEngine.icloud.photos.deleteAssets = jest.fn(() => Promise.resolve());

            await archiveEngine.archivePath(`/opt/icloud-photos-library/Random`, [asset1, asset2, asset3]);

            expect(archiveEngine.persistAsset).toHaveBeenCalledTimes(3);
            expect(archiveEngine.persistAsset).toHaveBeenCalledWith(path.join(photosDataDir, ASSET_DIR, asset1.getAssetFilename()), path.join(photosDataDir, albumUUIDPath, asset1.getPrettyFilename()));
            expect(archiveEngine.persistAsset).toHaveBeenCalledWith(path.join(photosDataDir, ASSET_DIR, asset2.getAssetFilename()), path.join(photosDataDir, albumUUIDPath, asset2.getPrettyFilename()));
            expect(archiveEngine.persistAsset).toHaveBeenCalledWith(path.join(photosDataDir, ASSET_DIR, asset3.getAssetFilename()), path.join(photosDataDir, albumUUIDPath, asset3.getPrettyFilename()));

            expect(archiveEngine.prepareForRemoteDeletion).toHaveBeenCalledTimes(3);
            expect(archiveEngine.prepareForRemoteDeletion).toHaveBeenCalledWith(path.join(photosDataDir, ASSET_DIR, asset1.getAssetFilename()), [asset1, asset2, asset3]);
            expect(archiveEngine.prepareForRemoteDeletion).toHaveBeenCalledWith(path.join(photosDataDir, ASSET_DIR, asset2.getAssetFilename()), [asset1, asset2, asset3]);
            expect(archiveEngine.prepareForRemoteDeletion).toHaveBeenCalledWith(path.join(photosDataDir, ASSET_DIR, asset3.getAssetFilename()), [asset1, asset2, asset3]);

            expect(startEvent).toHaveBeenCalled();
            expect(persistEvent).toHaveBeenCalledWith(3);
            expect(remoteDeleteEvent).toHaveBeenCalledWith(2);
            expect(finishEvent).toHaveBeenCalled();

            expect(handlerEvent).toHaveBeenCalledWith(new SyncError(`Unable to find asset`, `WARN`));
        });

        test(`Delete assets throws error`, async () => {
            const albumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
            const albumUUIDPath = `.${albumUUID}`;
            const albumName = `Random`;

            const asset1 = new Asset(`Aa7/yox97ecSUNmVw0xP4YzIDDKf`, 4, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `stephen-leonardi-xx6ZyOeyJtI-unsplash`);
            asset1.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1843`;
            const asset2 = new Asset(`AaGv15G3Cp9LPMQQfFZiHRryHgjU`, 5, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `steve-johnson-gkfvdCEbUbQ-unsplash`);
            asset2.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1888`;
            const asset3 = new Asset(`Aah0dUnhGFNWjAeqKEkB/SNLNpFf`, 6, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `steve-johnson-T12spiHYons-unsplash`);
            asset3.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1999`;

            mockfs({
                [photosDataDir]: {
                    [ASSET_DIR]: {
                        [asset1.getAssetFilename()]: Buffer.from([1, 1, 1, 1]),
                        [asset2.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1]),
                        [asset3.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1, 1]),
                    },
                    [ARCHIVE_DIR]: {},
                    [albumUUIDPath]: {
                        [asset1.getPrettyFilename()]: mockfs.symlink({
                            "path": `../${ASSET_DIR}/${asset1.getAssetFilename()}`,
                        }),
                        [asset2.getPrettyFilename()]: mockfs.symlink({
                            "path": `../${ASSET_DIR}/${asset2.getAssetFilename()}`,
                        }),
                        [asset3.getPrettyFilename()]: mockfs.symlink({
                            "path": `../${ASSET_DIR}/${asset3.getAssetFilename()}`,
                        }),
                    },
                    [albumName]: mockfs.symlink({
                        "path": albumUUIDPath,
                    }),
                },
            });

            const archiveEngine = archiveEngineFactory();
            const startEvent = spyOnEvent(archiveEngine, ARCHIVE_ENGINE.EVENTS.ARCHIVE_START);
            const persistEvent = spyOnEvent(archiveEngine, ARCHIVE_ENGINE.EVENTS.PERSISTING_START);
            const remoteDeleteEvent = spyOnEvent(archiveEngine, ARCHIVE_ENGINE.EVENTS.REMOTE_DELETE);
            const finishEvent = spyOnEvent(archiveEngine, ARCHIVE_ENGINE.EVENTS.ARCHIVE_DONE);

            archiveEngine.persistAsset = jest.fn(() => Promise.resolve());
            archiveEngine.prepareForRemoteDeletion = jest.fn(() => `a`)
                .mockReturnValueOnce(asset1.recordName)
                .mockReturnValueOnce(asset2.recordName)
                .mockReturnValueOnce(asset3.recordName);
            archiveEngine.icloud.photos.deleteAssets = jest.fn(() => Promise.reject());

            await expect(archiveEngine.archivePath(`/opt/icloud-photos-library/Random`, [asset1, asset2, asset3])).rejects.toThrowError(`Unable to delete remote assets`);

            expect(archiveEngine.persistAsset).toHaveBeenCalledTimes(3);
            expect(archiveEngine.persistAsset).toHaveBeenCalledWith(path.join(photosDataDir, ASSET_DIR, asset1.getAssetFilename()), path.join(photosDataDir, albumUUIDPath, asset1.getPrettyFilename()));
            expect(archiveEngine.persistAsset).toHaveBeenCalledWith(path.join(photosDataDir, ASSET_DIR, asset2.getAssetFilename()), path.join(photosDataDir, albumUUIDPath, asset2.getPrettyFilename()));
            expect(archiveEngine.persistAsset).toHaveBeenCalledWith(path.join(photosDataDir, ASSET_DIR, asset3.getAssetFilename()), path.join(photosDataDir, albumUUIDPath, asset3.getPrettyFilename()));

            expect(archiveEngine.prepareForRemoteDeletion).toHaveBeenCalledTimes(3);
            expect(archiveEngine.prepareForRemoteDeletion).toHaveBeenCalledWith(path.join(photosDataDir, ASSET_DIR, asset1.getAssetFilename()), [asset1, asset2, asset3]);
            expect(archiveEngine.prepareForRemoteDeletion).toHaveBeenCalledWith(path.join(photosDataDir, ASSET_DIR, asset2.getAssetFilename()), [asset1, asset2, asset3]);
            expect(archiveEngine.prepareForRemoteDeletion).toHaveBeenCalledWith(path.join(photosDataDir, ASSET_DIR, asset3.getAssetFilename()), [asset1, asset2, asset3]);

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

        const asset1 = new Asset(`Aa7/yox97ecSUNmVw0xP4YzIDDKf`, 4, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `stephen-leonardi-xx6ZyOeyJtI-unsplash`);
        asset1.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1843`;
        const asset2 = new Asset(`AaGv15G3Cp9LPMQQfFZiHRryHgjU`, 5, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `steve-johnson-gkfvdCEbUbQ-unsplash`);
        asset2.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1888`;
        const asset3 = new Asset(`Aah0dUnhGFNWjAeqKEkB/SNLNpFf`, 6, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `steve-johnson-T12spiHYons-unsplash`);
        asset3.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1999`;

        mockfs({
            [photosDataDir]: {
                [ASSET_DIR]: {
                    [asset1.getAssetFilename()]: Buffer.from([1, 1, 1, 1]),
                    [asset2.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1]),
                    [asset3.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1, 1]),
                },
                [ARCHIVE_DIR]: {},
                [albumUUIDPath]: {
                    [asset1.getPrettyFilename()]: mockfs.symlink({
                        "path": `../${ASSET_DIR}/${asset1.getAssetFilename()}`,
                    }),
                    [asset2.getPrettyFilename()]: mockfs.symlink({
                        "path": `../${ASSET_DIR}/${asset2.getAssetFilename()}`,
                    }),
                    [asset3.getPrettyFilename()]: mockfs.symlink({
                        "path": `../${ASSET_DIR}/${asset3.getAssetFilename()}`,
                    }),
                },
                [albumName]: mockfs.symlink({
                    "path": albumUUIDPath,
                }),
            },
        });

        const archiveEngine = archiveEngineFactory();

        await archiveEngine.persistAsset(path.join(photosDataDir, ASSET_DIR, asset1.getAssetFilename()), path.join(photosDataDir, albumUUIDPath, asset1.getPrettyFilename()));
        await archiveEngine.persistAsset(path.join(photosDataDir, ASSET_DIR, asset2.getAssetFilename()), path.join(photosDataDir, albumUUIDPath, asset2.getPrettyFilename()));
        await archiveEngine.persistAsset(path.join(photosDataDir, ASSET_DIR, asset3.getAssetFilename()), path.join(photosDataDir, albumUUIDPath, asset3.getPrettyFilename()));

        expect(fs.lstatSync(path.join(photosDataDir, ASSET_DIR, asset1.getAssetFilename())).isFile()).toBeTruthy();
        expect(fs.lstatSync(path.join(photosDataDir, albumUUIDPath, asset1.getPrettyFilename())).isFile()).toBeTruthy();
        expect(fs.lstatSync(path.join(photosDataDir, ASSET_DIR, asset2.getAssetFilename())).isFile()).toBeTruthy();
        expect(fs.lstatSync(path.join(photosDataDir, albumUUIDPath, asset2.getPrettyFilename())).isFile()).toBeTruthy();
        expect(fs.lstatSync(path.join(photosDataDir, ASSET_DIR, asset3.getAssetFilename())).isFile()).toBeTruthy();
        expect(fs.lstatSync(path.join(photosDataDir, albumUUIDPath, asset3.getPrettyFilename())).isFile()).toBeTruthy();
    });

    describe(`Delete remote asset`, () => {
        test(`Delete remote asset`, () => {
            const asset1 = new Asset(`Aa7/yox97ecSUNmVw0xP4YzIDDKf`, 4, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `stephen-leonardi-xx6ZyOeyJtI-unsplash`);
            asset1.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1843`;
            const asset2 = new Asset(`AaGv15G3Cp9LPMQQfFZiHRryHgjU`, 5, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `steve-johnson-gkfvdCEbUbQ-unsplash`);
            asset2.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1888`;
            const asset3 = new Asset(`Aah0dUnhGFNWjAeqKEkB/SNLNpFf`, 6, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `steve-johnson-T12spiHYons-unsplash`);
            asset3.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1999`;

            const archiveEngine = archiveEngineFactory();

            const result1 = archiveEngine.prepareForRemoteDeletion(path.join(photosDataDir, ASSET_DIR, asset1.getAssetFilename()), [asset1, asset2, asset3]);
            const result2 = archiveEngine.prepareForRemoteDeletion(path.join(photosDataDir, ASSET_DIR, asset2.getAssetFilename()), [asset1, asset2, asset3]);
            const result3 = archiveEngine.prepareForRemoteDeletion(path.join(photosDataDir, ASSET_DIR, asset3.getAssetFilename()), [asset1, asset2, asset3]);

            expect(result1).toEqual(asset1.recordName);
            expect(result2).toEqual(asset2.recordName);
            expect(result3).toEqual(asset3.recordName);
        });

        test(`Unable to find remote asset`, () => {
            const albumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
            const albumUUIDPath = `.${albumUUID}`;
            const albumName = `Random`;

            const asset1 = new Asset(`Aa7/yox97ecSUNmVw0xP4YzIDDKf`, 4, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `stephen-leonardi-xx6ZyOeyJtI-unsplash`);
            asset1.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1843`;
            const asset2 = new Asset(`AaGv15G3Cp9LPMQQfFZiHRryHgjU`, 5, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `steve-johnson-gkfvdCEbUbQ-unsplash`);
            asset2.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1888`;
            const asset3 = new Asset(`Aah0dUnhGFNWjAeqKEkB/SNLNpFf`, 6, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `steve-johnson-T12spiHYons-unsplash`);
            asset3.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1999`;

            mockfs({
                [photosDataDir]: {
                    [ASSET_DIR]: {
                        [asset1.getAssetFilename()]: Buffer.from([1, 1, 1, 1]),
                        [asset2.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1]),
                        [asset3.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1, 1]),
                    },
                    [ARCHIVE_DIR]: {},
                    [albumUUIDPath]: {
                        [asset1.getPrettyFilename()]: mockfs.symlink({
                            "path": `../${ASSET_DIR}/${asset1.getAssetFilename()}`,
                        }),
                        [asset2.getPrettyFilename()]: mockfs.symlink({
                            "path": `../${ASSET_DIR}/${asset2.getAssetFilename()}`,
                        }),
                        [asset3.getPrettyFilename()]: mockfs.symlink({
                            "path": `../${ASSET_DIR}/${asset3.getAssetFilename()}`,
                        }),
                    },
                    [albumName]: mockfs.symlink({
                        "path": albumUUIDPath,
                    }),
                },
            });

            const archiveEngine = archiveEngineFactory();

            expect(() => archiveEngine.prepareForRemoteDeletion(path.join(photosDataDir, ASSET_DIR, asset1.getAssetFilename()), [asset2, asset3])).toThrowError(`Unable to find asset with UUID`);
        });

        test(`Unable to find remote asset's record name`, () => {
            const albumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
            const albumUUIDPath = `.${albumUUID}`;
            const albumName = `Random`;

            const asset1 = new Asset(`Aa7/yox97ecSUNmVw0xP4YzIDDKf`, 4, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `stephen-leonardi-xx6ZyOeyJtI-unsplash`);
            const asset2 = new Asset(`AaGv15G3Cp9LPMQQfFZiHRryHgjU`, 5, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `steve-johnson-gkfvdCEbUbQ-unsplash`);
            asset2.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1888`;
            const asset3 = new Asset(`Aah0dUnhGFNWjAeqKEkB/SNLNpFf`, 6, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `steve-johnson-T12spiHYons-unsplash`);
            asset3.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1999`;

            mockfs({
                [photosDataDir]: {
                    [ASSET_DIR]: {
                        [asset1.getAssetFilename()]: Buffer.from([1, 1, 1, 1]),
                        [asset2.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1]),
                        [asset3.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1, 1]),
                    },
                    [ARCHIVE_DIR]: {},
                    [albumUUIDPath]: {
                        [asset1.getPrettyFilename()]: mockfs.symlink({
                            "path": `../${ASSET_DIR}/${asset1.getAssetFilename()}`,
                        }),
                        [asset2.getPrettyFilename()]: mockfs.symlink({
                            "path": `../${ASSET_DIR}/${asset2.getAssetFilename()}`,
                        }),
                        [asset3.getPrettyFilename()]: mockfs.symlink({
                            "path": `../${ASSET_DIR}/${asset3.getAssetFilename()}`,
                        }),
                    },
                    [albumName]: mockfs.symlink({
                        "path": albumUUIDPath,
                    }),
                },
            });

            const archiveEngine = archiveEngineFactory();

            expect(() => archiveEngine.prepareForRemoteDeletion(path.join(photosDataDir, ASSET_DIR, asset1.getAssetFilename()), [asset1, asset2, asset3])).toThrowError(`Unable to get record name for asset`);
        });

        test(`Don't delete asset if flag is set`, () => {
            const albumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
            const albumUUIDPath = `.${albumUUID}`;
            const albumName = `Random`;

            const asset1 = new Asset(`Aa7/yox97ecSUNmVw0xP4YzIDDKf`, 4, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `stephen-leonardi-xx6ZyOeyJtI-unsplash`);
            const asset2 = new Asset(`AaGv15G3Cp9LPMQQfFZiHRryHgjU`, 5, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `steve-johnson-gkfvdCEbUbQ-unsplash`);
            asset2.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1888`;
            const asset3 = new Asset(`Aah0dUnhGFNWjAeqKEkB/SNLNpFf`, 6, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `steve-johnson-T12spiHYons-unsplash`);
            asset3.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1999`;

            mockfs({
                [photosDataDir]: {
                    [ASSET_DIR]: {
                        [asset1.getAssetFilename()]: Buffer.from([1, 1, 1, 1]),
                        [asset2.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1]),
                        [asset3.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1, 1]),
                    },
                    [ARCHIVE_DIR]: {},
                    [albumUUIDPath]: {
                        [asset1.getPrettyFilename()]: mockfs.symlink({
                            "path": `../${ASSET_DIR}/${asset1.getAssetFilename()}`,
                        }),
                        [asset2.getPrettyFilename()]: mockfs.symlink({
                            "path": `../${ASSET_DIR}/${asset2.getAssetFilename()}`,
                        }),
                        [asset3.getPrettyFilename()]: mockfs.symlink({
                            "path": `../${ASSET_DIR}/${asset3.getAssetFilename()}`,
                        }),
                    },
                    [albumName]: mockfs.symlink({
                        "path": albumUUIDPath,
                    }),
                },
            });

            const archiveEngine = archiveEngineFactory();
            archiveEngine.remoteDelete = false;

            const result = archiveEngine.prepareForRemoteDeletion(path.join(photosDataDir, ASSET_DIR, asset1.getAssetFilename()), [asset1, asset2, asset3]);
            expect(result).toBeUndefined();
        });

        test(`Don't delete favorited asset`, () => {
            const albumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
            const albumUUIDPath = `.${albumUUID}`;
            const albumName = `Random`;

            const asset1 = new Asset(`Aa7/yox97ecSUNmVw0xP4YzIDDKf`, 4, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `stephen-leonardi-xx6ZyOeyJtI-unsplash`);
            asset1.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1843`;
            asset1.isFavorite = true;
            const asset2 = new Asset(`AaGv15G3Cp9LPMQQfFZiHRryHgjU`, 5, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `steve-johnson-gkfvdCEbUbQ-unsplash`);
            asset2.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1888`;
            const asset3 = new Asset(`Aah0dUnhGFNWjAeqKEkB/SNLNpFf`, 6, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `steve-johnson-T12spiHYons-unsplash`);
            asset3.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1999`;

            mockfs({
                [photosDataDir]: {
                    [ASSET_DIR]: {
                        [asset1.getAssetFilename()]: Buffer.from([1, 1, 1, 1]),
                        [asset2.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1]),
                        [asset3.getAssetFilename()]: Buffer.from([1, 1, 1, 1, 1, 1]),
                    },
                    [ARCHIVE_DIR]: {},
                    [albumUUIDPath]: {
                        [asset1.getPrettyFilename()]: mockfs.symlink({
                            "path": `../${ASSET_DIR}/${asset1.getAssetFilename()}`,
                        }),
                        [asset2.getPrettyFilename()]: mockfs.symlink({
                            "path": `../${ASSET_DIR}/${asset2.getAssetFilename()}`,
                        }),
                        [asset3.getPrettyFilename()]: mockfs.symlink({
                            "path": `../${ASSET_DIR}/${asset3.getAssetFilename()}`,
                        }),
                    },
                    [albumName]: mockfs.symlink({
                        "path": albumUUIDPath,
                    }),
                },
            });

            const archiveEngine = archiveEngineFactory();

            const result = archiveEngine.prepareForRemoteDeletion(path.join(photosDataDir, ASSET_DIR, asset1.getAssetFilename()), [asset1, asset2, asset3]);
            expect(result).toBeUndefined();
        });
    });
});