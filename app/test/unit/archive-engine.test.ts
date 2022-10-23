import mockfs from 'mock-fs';
import {describe, test, afterEach, expect, jest} from '@jest/globals';
import {archiveEngineFactory} from '../_helpers/archive-engine.helper';
import {appDataDir as photosDataDir} from '../_helpers/_config';
import {ASSET_DIR, ARCHIVE_DIR, STASH_DIR, SAFE_FILES} from '../../src/lib/photos-library/constants';
import path from 'path';
import {Asset, AssetType} from '../../src/lib/photos-library/model/asset';
import {FileType} from '../../src/lib/photos-library/model/file-type';
import fs from 'fs';

const assetDir = path.join(photosDataDir, ASSET_DIR);
const archiveDir = path.join(photosDataDir, ARCHIVE_DIR);

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

            archiveEngine.persistAsset = jest.fn(assetPath => Promise.resolve(assetPath));
            archiveEngine.deleteRemoteAsset = jest.fn(() => Promise.resolve());

            await archiveEngine.archivePath(`/opt/icloud-photos-library/Random`, [asset1, asset2, asset3]);

            expect(archiveEngine.persistAsset).toHaveBeenCalledTimes(3);
            expect(archiveEngine.persistAsset).toHaveBeenCalledWith(path.join(photosDataDir, ASSET_DIR, asset1.getAssetFilename()), path.join(photosDataDir, albumUUIDPath, asset1.getPrettyFilename()));
            expect(archiveEngine.persistAsset).toHaveBeenCalledWith(path.join(photosDataDir, ASSET_DIR, asset2.getAssetFilename()), path.join(photosDataDir, albumUUIDPath, asset2.getPrettyFilename()));
            expect(archiveEngine.persistAsset).toHaveBeenCalledWith(path.join(photosDataDir, ASSET_DIR, asset3.getAssetFilename()), path.join(photosDataDir, albumUUIDPath, asset3.getPrettyFilename()));

            expect(archiveEngine.deleteRemoteAsset).toHaveBeenCalledTimes(3);
            expect(archiveEngine.deleteRemoteAsset).toHaveBeenCalledWith(path.join(photosDataDir, ASSET_DIR, asset1.getAssetFilename()), [asset1, asset2, asset3]);
            expect(archiveEngine.deleteRemoteAsset).toHaveBeenCalledWith(path.join(photosDataDir, ASSET_DIR, asset2.getAssetFilename()), [asset1, asset2, asset3]);
            expect(archiveEngine.deleteRemoteAsset).toHaveBeenCalledWith(path.join(photosDataDir, ASSET_DIR, asset3.getAssetFilename()), [asset1, asset2, asset3]);
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

                archiveEngine.persistAsset = jest.fn(assetPath => Promise.resolve(assetPath));
                archiveEngine.deleteRemoteAsset = jest.fn(() => Promise.resolve());

                expect.assertions(3);
                await archiveEngine.archivePath(`/opt/icloud-photos-library/.cc40a239-2beb-483e-acee-e897db1b818a`, [asset1, asset2, asset3])
                    .catch(err => expect(err.message).toMatch(`UUID path selected, use named path only`));

                expect(archiveEngine.persistAsset).not.toHaveBeenCalled();
                expect(archiveEngine.deleteRemoteAsset).not.toHaveBeenCalled();
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

                archiveEngine.persistAsset = jest.fn(assetPath => Promise.resolve(assetPath));
                archiveEngine.deleteRemoteAsset = jest.fn(() => Promise.resolve());

                expect.assertions(3);
                await archiveEngine.archivePath(`/opt/icloud-photos-library/Random1`, [asset1, asset2, asset3])
                    .catch(err => expect(err.message).toMatch(`Only able to archive non-archived albums`));

                expect(archiveEngine.persistAsset).not.toHaveBeenCalled();
                expect(archiveEngine.deleteRemoteAsset).not.toHaveBeenCalled();
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

                archiveEngine.persistAsset = jest.fn(assetPath => Promise.resolve(assetPath));
                archiveEngine.deleteRemoteAsset = jest.fn(() => Promise.resolve());

                expect.assertions(3);
                await archiveEngine.archivePath(`/opt/icloud-photos-library/.cc40a239-2beb-483e-acee-e897db1b818a`, [asset1, asset2, asset3])
                    .catch(err => expect(err.message).toMatch(`UUID path selected, use named path only`));

                expect(archiveEngine.persistAsset).not.toHaveBeenCalled();
                expect(archiveEngine.deleteRemoteAsset).not.toHaveBeenCalled();
            });
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
        test(`Delete remote asset`, async () => {
            const albumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
            const albumUUIDPath = `.${albumUUID}`;
            const albumName = `Random`;

            const asset1 = new Asset(`Aa7/yox97ecSUNmVw0xP4YzIDDKf`, 4, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `stephen-leonardi-xx6ZyOeyJtI-unsplash`);
            asset1.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1843`;
            const asset2 = new Asset(`AaGv15G3Cp9LPMQQfFZiHRryHgjU`, 5, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `steve-johnson-gkfvdCEbUbQ-unsplash`);
            asset2.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1888`;
            const asset3 = new Asset(`Aah0dUnhGFNWjAeqKEkB/SNLNpFf`, 6, FileType.fromExtension(`jpeg`), 10, AssetType.ORIG, `steve-johnson-T12spiHYons-unsplash`);
            asset3.recordName = `9D672118-CCDB-4336-8D0D-CA4CD6BD1999`;

            const archiveEngine = archiveEngineFactory();

            archiveEngine.icloud.photos.deleteAsset = jest.fn(() => Promise.resolve([]));

            await archiveEngine.deleteRemoteAsset(path.join(photosDataDir, ASSET_DIR, asset1.getAssetFilename()), [asset1, asset2, asset3]);
            await archiveEngine.deleteRemoteAsset(path.join(photosDataDir, ASSET_DIR, asset2.getAssetFilename()), [asset1, asset2, asset3]);
            await archiveEngine.deleteRemoteAsset(path.join(photosDataDir, ASSET_DIR, asset3.getAssetFilename()), [asset1, asset2, asset3]);

            expect(archiveEngine.icloud.photos.deleteAsset).toHaveBeenCalledTimes(3);
            expect(archiveEngine.icloud.photos.deleteAsset).toHaveBeenCalledWith(asset1.recordName);
            expect(archiveEngine.icloud.photos.deleteAsset).toHaveBeenCalledWith(asset2.recordName);
            expect(archiveEngine.icloud.photos.deleteAsset).toHaveBeenCalledWith(asset3.recordName);
        });

        test(`Unable to find remote asset`, async () => {
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

            archiveEngine.icloud.photos.deleteAsset = jest.fn(() => Promise.resolve([]));

            await expect(archiveEngine.deleteRemoteAsset(path.join(photosDataDir, ASSET_DIR, asset1.getAssetFilename()), [asset2, asset3])).rejects.toThrowError(`Unable to find asset with UUID`);

            expect(archiveEngine.icloud.photos.deleteAsset).not.toHaveBeenCalled();
        });

        test(`Unable to find remote asset's record name`, async () => {
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

            archiveEngine.icloud.photos.deleteAsset = jest.fn(() => Promise.resolve([]));

            await expect(archiveEngine.deleteRemoteAsset(path.join(photosDataDir, ASSET_DIR, asset1.getAssetFilename()), [asset1, asset2, asset3])).rejects.toThrowError(`Unable to get record name for asset`);

            expect(archiveEngine.icloud.photos.deleteAsset).not.toHaveBeenCalled();
        });

        test(`Don't delete asset if flag is set`, async () => {
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
            archiveEngine.noRemoteDelete = true;

            archiveEngine.icloud.photos.deleteAsset = jest.fn(() => Promise.resolve([]));

            await archiveEngine.deleteRemoteAsset(path.join(photosDataDir, ASSET_DIR, asset1.getAssetFilename()), [asset1, asset2, asset3]);

            expect(archiveEngine.icloud.photos.deleteAsset).not.toHaveBeenCalled();
        });

        test(`Don't delete favorited asset`, async () => {
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

            archiveEngine.icloud.photos.deleteAsset = jest.fn(() => Promise.resolve([]));

            await archiveEngine.deleteRemoteAsset(path.join(photosDataDir, ASSET_DIR, asset1.getAssetFilename()), [asset1, asset2, asset3]);

            expect(archiveEngine.icloud.photos.deleteAsset).not.toHaveBeenCalled();
        });
    });
});