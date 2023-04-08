import mockfs from 'mock-fs';
import fs from 'fs';
import {expect, describe, test, afterEach, jest} from '@jest/globals';
import {PhotosLibrary} from '../../src/lib/photos-library/photos-library';
import {PRIMARY_ASSET_DIR, SHARED_ASSET_DIR, ARCHIVE_DIR, STASH_DIR, SAFE_FILES} from '../../src/lib/photos-library/constants';
import path from 'path';
import {Album, AlbumType} from '../../src/lib/photos-library/model/album';
import {Asset} from '../../src/lib/photos-library/model/asset';
import {FileType} from '../../src/lib/photos-library/model/file-type';
import axios, {AxiosRequestConfig} from 'axios';
import {appDataDir as photosDataDir} from '../_helpers/_config';
import {photosLibraryFactory} from '../_helpers/photos-library.helper';
import {appWithOptions} from '../_helpers/app-factory.helper';
import {spyOnEvent} from '../_helpers/_general';
import {HANDLER_EVENT} from '../../src/app/event/error-handler';
import {Zones} from '../../src/lib/icloud/icloud-photos/query-builder';

const primaryAssetDir = path.join(photosDataDir, PRIMARY_ASSET_DIR);
const sharedAssetDir = path.join(photosDataDir, SHARED_ASSET_DIR);
const archiveDir = path.join(photosDataDir, ARCHIVE_DIR);
const stashDir = path.join(photosDataDir, ARCHIVE_DIR, STASH_DIR);

afterEach(() => {
    mockfs.restore();
});

test(`Should create missing directories`, () => {
    mockfs();
    const _library = photosLibraryFactory();
    expect(fs.existsSync(photosDataDir)).toBe(true);
    expect(fs.existsSync(primaryAssetDir)).toBe(true);
    expect(fs.existsSync(sharedAssetDir)).toBe(true);
    expect(fs.existsSync(archiveDir)).toBe(true);
    expect(fs.existsSync(stashDir)).toBe(true);
});

test(`Should use existing directories and not overwrite content`, () => {
    mockfs({
        [photosDataDir]: {
            "testFile": `test content`,
            [PRIMARY_ASSET_DIR]: {
                "testFile": `test content`,
            },
            [SHARED_ASSET_DIR]: {
                "testFile": `test content`,
            },
            [ARCHIVE_DIR]: {
                [STASH_DIR]: {
                    "testFile": `test content`,
                },
                "testFile": `test content`,
            },

        },
    });
    const opts = {
        "dataDir": photosDataDir,
    };
    const _library = new PhotosLibrary(appWithOptions(opts));
    expect(fs.existsSync(photosDataDir)).toBe(true);
    expect(fs.existsSync(path.join(photosDataDir, `testFile`)));
    expect(fs.existsSync(primaryAssetDir)).toBe(true);
    expect(fs.existsSync(path.join(primaryAssetDir, `testFile`)));
    expect(fs.existsSync(sharedAssetDir)).toBe(true);
    expect(fs.existsSync(path.join(sharedAssetDir, `testFile`)));
    expect(fs.existsSync(archiveDir)).toBe(true);
    expect(fs.existsSync(path.join(archiveDir, `testFile`)));
    expect(fs.existsSync(stashDir)).toBe(true);
    expect(fs.existsSync(path.join(stashDir, `testFile`)));
});

describe(`Load state`, () => {
    describe(`Load assets`, () => {
        test.each([
            {
                "desc": `No asset`,
                "fsTree": {},
                "expectedCount": 0,
                "expectedZones": [],
            }, {
                "desc": `Multiple assets - PrimaryZone`,
                "fsTree": {
                    [primaryAssetDir]: {
                        "Aa7_yox97ecSUNmVw0xP4YzIDDKf.jpeg": Buffer.from([1, 1, 1, 1]),
                        "AaGv15G3Cp9LPMQQfFZiHRryHgjU.jpeg": Buffer.from([1, 1, 1, 1, 1]),
                        "Aah0dUnhGFNWjAeqKEkB_SNLNpFf.jpeg": Buffer.from([1, 1, 1, 1, 1, 1]),
                    },
                },
                "expectedCount": 3,
                "expectedZones": [Zones.Primary, Zones.Primary, Zones.Primary],
            }, {
                "desc": `Multiple assets - SharedZone`,
                "fsTree": {
                    [sharedAssetDir]: {
                        "Aa7_yox97ecSUNmVw0xP4YzIDDKf.jpeg": Buffer.from([1, 1, 1, 1]),
                        "AaGv15G3Cp9LPMQQfFZiHRryHgjU.jpeg": Buffer.from([1, 1, 1, 1, 1]),
                        "Aah0dUnhGFNWjAeqKEkB_SNLNpFf.jpeg": Buffer.from([1, 1, 1, 1, 1, 1]),
                    },
                },
                "expectedCount": 3,
                "expectedZones": [Zones.Shared, Zones.Shared, Zones.Shared],
            }, {
                "desc": `Multiple assets - Mixed Zones`,
                "fsTree": {
                    [primaryAssetDir]: {
                        "deFEyox97ecdknADe0xP4YzIDDKf.jpeg": Buffer.from([1, 1, 1, 1]),
                        "deFEeee3Cp9LPMQQfFZiHRryHgjU.jpeg": Buffer.from([1, 1, 1, 1, 1]),
                        "kkiceenhGFNWjAeqKEkB_SNLNpFf.jpeg": Buffer.from([1, 1, 1, 1, 1, 1]),
                    },
                    [sharedAssetDir]: {
                        "Aa7_yox97ecSUNmVw0xP4YzIDDKf.jpeg": Buffer.from([1, 1, 1, 1]),
                        "AaGv15G3Cp9LPMQQfFZiHRryHgjU.jpeg": Buffer.from([1, 1, 1, 1, 1]),
                        "Aah0dUnhGFNWjAeqKEkB_SNLNpFf.jpeg": Buffer.from([1, 1, 1, 1, 1, 1]),
                    },
                },
                "expectedCount": 6,
                "expectedZones": [Zones.Primary, Zones.Primary, Zones.Primary, Zones.Shared, Zones.Shared, Zones.Shared],
            }, {
                "desc": `Invalid assets - PrimaryZone`,
                "fsTree": {
                    [primaryAssetDir]: {
                        "Aa7_yox97ecSUNmVw0xP4YzIDDKf.jpeg": Buffer.from([1, 1, 1, 1]),
                        "AaGv15G3Cp9LPMQQfFZiHRryHgjU.jpeg": Buffer.from([1, 1, 1, 1, 1]),
                        "Aah0dUnhGFNWjAeqKEkB_SNLNpFf": Buffer.from([1, 1, 1, 1, 1, 1]), // No file extension
                        "Aah0dUnhGFNWjAeqKEkB_SNLNpFf.xyz": Buffer.from([1, 1, 1, 1, 1, 1]), // Invalid file extension
                        "Aah0dUnhGFNWjAeqKEkB_SNLNpF-f": Buffer.from([1, 1, 1, 1, 1, 1]), // Invalid file name
                    },
                },
                "expectedCount": 2,
                "expectedZones": [Zones.Primary, Zones.Primary],
            }, {
                "desc": `Invalid assets - SharedZone`,
                "fsTree": {
                    [sharedAssetDir]: {
                        "Aa7_yox97ecSUNmVw0xP4YzIDDKf.jpeg": Buffer.from([1, 1, 1, 1]),
                        "AaGv15G3Cp9LPMQQfFZiHRryHgjU.jpeg": Buffer.from([1, 1, 1, 1, 1]),
                        "Aah0dUnhGFNWjAeqKEkB_SNLNpFf": Buffer.from([1, 1, 1, 1, 1, 1]), // No file extension
                        "Aah0dUnhGFNWjAeqKEkB_SNLNpFf.xyz": Buffer.from([1, 1, 1, 1, 1, 1]), // Invalid file extension
                        "Aah0dUnhGFNWjAeqKEkB_SNLNpF-f": Buffer.from([1, 1, 1, 1, 1, 1]), // Invalid file name
                    },
                },
                "expectedCount": 2,
                "expectedZones": [Zones.Shared, Zones.Shared],
            }, {
                "desc": `Invalid assets - Mixed Zones`,
                "fsTree": {
                    [primaryAssetDir]: {
                        "deFEyox97ecdknADe0xP4YzIDDKf.jpeg": Buffer.from([1, 1, 1, 1]),
                        "deFEeee3Cp9LPMQQfFZiHRryHgjU.jpeg": Buffer.from([1, 1, 1, 1, 1]),
                        "kkiceenhGFNWjAeqKEkB_SNLNpFf.jpeg": Buffer.from([1, 1, 1, 1, 1, 1]),
                        "Aah0dUnasdfejAeqKEkB_SNLNpFf.xyz": Buffer.from([1, 1, 1, 1, 1, 1]), // Invalid file extension
                    },
                    [sharedAssetDir]: {
                        "Aa7_yox97ecSUNmVw0xP4YzIDDKf.jpeg": Buffer.from([1, 1, 1, 1]),
                        "AaGv15G3Cp9LPMQQfFZiHRryHgjU.jpeg": Buffer.from([1, 1, 1, 1, 1]),
                        "Aah0dUnhGFNWjAeqKEkB_SNLNpFf": Buffer.from([1, 1, 1, 1, 1, 1]), // No file extension
                        "Aah0dUnhGFNWjAeqKEkB_SNLNpFf.xyz": Buffer.from([1, 1, 1, 1, 1, 1]), // Invalid file extension
                        "Aah0dUnhGFNWjAeqKEkB_SNLNpF-f": Buffer.from([1, 1, 1, 1, 1, 1]), // Invalid file name
                    },
                },
                "expectedCount": 5,
                "expectedZones": [Zones.Primary, Zones.Primary, Zones.Primary, Zones.Shared, Zones.Shared],
            },
        ])(`$desc`, async ({fsTree, expectedCount, expectedZones}) => {
            mockfs(fsTree as any);
            const library = photosLibraryFactory();

            const assets = await library.loadAssets();

            expect(Object.keys(assets).length).toEqual(expectedCount);
            expect(Object.values(assets).map(asset => asset.zone)).toEqual(expectedZones);
        });
    });

    describe(`Load albums`, () => {
        test(`No albums`, async () => {
            mockfs();
            const library = photosLibraryFactory();
            const albums = await library.loadAlbums();
            expect(Object.keys(albums).length).toEqual(0);
        });

        test(`Empty album`, async () => {
            const emptyAlbumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
            const emptyAlbumName = `Stuff`;

            mockfs({
                [photosDataDir]: {
                    [`.${emptyAlbumUUID}`]: {},
                    [emptyAlbumName]: mockfs.symlink({
                        "path": `.${emptyAlbumUUID}`,
                    }),
                },
            });

            const library = photosLibraryFactory();
            const albums = await library.loadAlbums();

            expect(Object.keys(albums).length).toEqual(1);

            const emptyAlbum = albums[emptyAlbumUUID];
            expect(emptyAlbum).toBeDefined();
            expect(emptyAlbum.albumName).toEqual(emptyAlbumName);
            expect(emptyAlbum.uuid).toEqual(emptyAlbumUUID);
            expect(Object.keys(emptyAlbum.assets).length).toEqual(0);
            expect(emptyAlbum.albumType).toEqual(AlbumType.ALBUM);
        });

        test(`Extraneous file in folder`, async () => {
            const someFolderName = `folder`;
            const someFolderUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
            const someAlbumName = `album`;
            const someAlbumUUID = `cc40a239-2beb-483e-acee-e897db1b818b`;
            const someFileName = `file`;

            mockfs({
                [photosDataDir]: {
                    [`.${someFolderUUID}`]: {
                        [`.${someAlbumUUID}`]: {},
                        [someAlbumName]: mockfs.symlink({
                            "path": `.${someAlbumUUID}`,
                        }),
                        [someFileName]: Buffer.from([1, 1, 1]),
                    },
                    [someFolderName]: mockfs.symlink({
                        "path": `.${someFolderUUID}`,
                    }),
                },
            });

            const library = photosLibraryFactory();
            const handlerEvent = spyOnEvent(library, HANDLER_EVENT);

            const albums = await library.loadAlbums();

            expect(Object.keys(albums).length).toEqual(2);
            expect(handlerEvent).toHaveBeenCalledWith(new Error(`Extraneous file found while processing a folder`));
        });

        test(`Orphaned album`, async () => {
            const orphanedAlbumName = `Orphan`;
            const orphanedAlbumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;

            mockfs({
                [photosDataDir]: {
                    [orphanedAlbumName]: mockfs.symlink({
                        "path": `.${orphanedAlbumUUID}`,
                    }),
                },
            });

            const library = photosLibraryFactory();
            const orphanEvent = spyOnEvent(library, HANDLER_EVENT);
            const albums = await library.loadAlbums();

            expect(Object.keys(albums).length).toEqual(0);

            expect(orphanEvent).toHaveBeenCalledWith(new Error(`Found dead symlink (removing it)`));
            expect(() => fs.lstatSync(path.join(photosDataDir, orphanedAlbumName))).toThrowError(`ENOENT: no such file or directory, lstat '/opt/icloud-photos-library/Orphan'`);
        });

        test(`Unexpected loading error`, async () => {
            const orphanedAlbumName = `Orphan`;
            const orphanedAlbumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;

            mockfs({
                [photosDataDir]: {
                    [`.${orphanedAlbumUUID}`]: {},
                    [orphanedAlbumName]: mockfs.symlink({
                        "path": `.${orphanedAlbumUUID}`,
                    }),
                },
            });

            const library = photosLibraryFactory();
            library.readFolderFromDisk = jest.fn(() => Promise.resolve([{}, ``] as [Album, string]))
                .mockRejectedValue(new Error(`Nondescriptive Error`));
            await expect(library.loadAlbums()).rejects.toThrowError(`Unknown error while processing symlink`);
        });

        test(`Non-empty album`, async () => {
            const nonEmptyAlbumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
            const nonEmptyAlbumName = `Random`;

            mockfs({
                [photosDataDir]: {
                    [`.${nonEmptyAlbumUUID}`]: {
                        "stephen-leonardi-xx6ZyOeyJtI-unsplash.jpeg": mockfs.symlink({
                            "path": `../_All-Photos/AdXHmFwV1bys5hRFYq2PMg3K4pAl.jpeg`,
                        }),
                        "steve-johnson-gkfvdCEbUbQ-unsplash.jpeg": mockfs.symlink({
                            "path": `../_All-Photos/AQ-qACkUB_yOBUVvye9kJSVdxZEc.jpeg`,
                        }),
                        "steve-johnson-T12spiHYons-unsplash.jpeg": mockfs.symlink({
                            "path": `../_All-Photos/Acgr2fdPRy7x4l16nE6wwBNKrOzf.jpeg`,
                        }),
                        "steve-johnson-YLfycNerbPo-unsplash.jpeg": mockfs.symlink({
                            "path": `./_All-Photos/AfFUy6toSMWpB1FVJQThs4Y-rVHJ.jpeg`,
                        }),
                    },
                    [nonEmptyAlbumName]: mockfs.symlink({
                        "path": `.${nonEmptyAlbumUUID}`,
                    }),
                },
            });

            const library = photosLibraryFactory();
            const albums = await library.loadAlbums();

            expect(Object.keys(albums).length).toEqual(1);

            const nonEmptyAlbum = albums[nonEmptyAlbumUUID];
            expect(nonEmptyAlbum).toBeDefined();
            expect(nonEmptyAlbum.albumName).toEqual(nonEmptyAlbumName);
            expect(nonEmptyAlbum.uuid).toEqual(nonEmptyAlbumUUID);
            expect(Object.keys(nonEmptyAlbum.assets).length).toEqual(4);
            expect(nonEmptyAlbum.albumType).toEqual(AlbumType.ALBUM);
        });

        test(`Folder`, async () => {
            const folderUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
            const folderName = `Memories`;
            const folderedAlbumUUID = `6e7f4f44-445a-41ee-a87e-844a9109069d`;
            const folderedAlbumName = `2022`;
            mockfs({
                [photosDataDir]: {
                    [`.${folderUUID}`]: {
                        [`.${folderedAlbumUUID}`]: {},
                        [folderedAlbumName]: mockfs.symlink({
                            "path": `.${folderedAlbumUUID}`,
                        }),
                    },
                    [folderName]: mockfs.symlink({
                        "path": `.${folderUUID}`,
                    }),
                },
            });

            const library = photosLibraryFactory();
            const albums = await library.loadAlbums();

            expect(Object.keys(albums).length).toEqual(2);

            const folder = albums[folderUUID];
            expect(folder).toBeDefined();
            expect(folder.albumName).toEqual(folderName);
            expect(folder.uuid).toEqual(folderUUID);
            expect(Object.keys(folder.assets).length).toEqual(0);
            expect(folder.albumType).toEqual(AlbumType.FOLDER);

            const folderedAlbum = albums[folderedAlbumUUID];
            expect(folderedAlbum).toBeDefined();
            expect(folderedAlbum.parentAlbumUUID).toEqual(folderUUID);
        });

        test(`Archived`, async () => {
            const archivedUUID = `fc649b1a-d22e-4b49-a5ee-066eb577d023`;
            const archivedName = `2015 - 2016`;
            mockfs({
                [photosDataDir]: {
                    [`.${archivedUUID}`]: {
                        "stephen-leonardi-xx6ZyOeyJtI-unsplash.jpeg": Buffer.from([1, 1, 1, 1]),
                        "steve-johnson-gkfvdCEbUbQ-unsplash.jpeg": Buffer.from([1, 1, 1, 1]),
                        "steve-johnson-T12spiHYons-unsplash.jpeg": Buffer.from([1, 1, 1, 1]),
                        "steve-johnson-YLfycNerbPo-unsplash.jpeg": Buffer.from([1, 1, 1, 1]),
                    },
                    [archivedName]: mockfs.symlink({
                        "path": `.${archivedUUID}`,
                    }),
                },
            });

            const library = photosLibraryFactory();
            const albums = await library.loadAlbums();
            expect(Object.keys(albums).length).toEqual(1);

            const archivedAlbum = albums[archivedUUID];
            expect(archivedAlbum).toBeDefined();
            expect(archivedAlbum.albumName).toEqual(archivedName);
            expect(archivedAlbum.uuid).toEqual(archivedUUID);
            expect(Object.keys(archivedAlbum.assets).length).toEqual(0);
            expect(archivedAlbum.albumType).toEqual(AlbumType.ARCHIVED);
        });

        test(`Ignore 'Archived Assets' Folder`, async () => {
            mockfs({
                [photosDataDir]: {
                    [ARCHIVE_DIR]: {
                        "test-file": Buffer.from([1, 1, 1]),
                    },
                },
            });

            const library = photosLibraryFactory();
            const albums = await library.loadAlbums();

            expect(Object.keys(albums).length).toEqual(0);
        });

        test(`Ignore 'All Photos' & 'Shared Photos' Folder`, async () => {
            mockfs({
                [photosDataDir]: {
                    [PRIMARY_ASSET_DIR]: {
                        "test-file": Buffer.from([1, 1, 1]),
                    },
                    [SHARED_ASSET_DIR]: {
                        "test-file": Buffer.from([1, 1, 1]),
                    },
                },
            });

            const library = photosLibraryFactory();
            const albums = await library.loadAlbums();

            expect(Object.keys(albums).length).toEqual(0);
        });

        test(`Ignore safe files in empty album`, async () => {
            const emptyAlbumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
            const emptyAlbumName = `Stuff`;

            const files: any = {};
            for (const safeFileName of SAFE_FILES) {
                files[safeFileName] = Buffer.from([1]);
            }

            mockfs({
                [photosDataDir]: {
                    [`.${emptyAlbumUUID}`]: files,
                    [emptyAlbumName]: mockfs.symlink({
                        "path": `.${emptyAlbumUUID}`,
                    }),
                },
            });

            const library = photosLibraryFactory();
            const albums = await library.loadAlbums();

            expect(Object.keys(albums).length).toEqual(1);

            const emptyFolder = albums[emptyAlbumUUID];
            expect(emptyFolder).toBeDefined();
            expect(emptyFolder.albumName).toEqual(emptyAlbumName);
            expect(emptyFolder.uuid).toEqual(emptyAlbumUUID);
            expect(Object.keys(emptyFolder.assets).length).toEqual(0);
            expect(emptyFolder.albumType).toEqual(AlbumType.ALBUM);
        });

        test(`Load nested state`, async () => {
            const emptyAlbumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
            const emptyAlbumName = `Stuff`;
            const files: any = {};
            for (const safeFileName of SAFE_FILES) {
                files[safeFileName] = Buffer.from([1]);
            }

            const folderUUID = `cc40a239-2beb-483e-acee-e897db1b818b`;
            const folderName = `Memories`;
            const folderedFolderUUID = `6e7f4f44-445a-41ee-a87e-844a9109069d`;
            const folderedFolderName = `2022`;
            const nonEmptyAlbumUUID = `cc40a239-2beb-483e-acee-e897db1b818c`;
            const nonEmptyAlbumName = `Random`;
            const archivedUUID = `fc649b1a-d22e-4b49-a5ee-066eb577d023`;
            const archivedName = `2015 - 2016`;

            mockfs({
                [photosDataDir]: {
                    [PRIMARY_ASSET_DIR]: {
                        "test-file": Buffer.from([1, 1, 1]),
                    },
                    [ARCHIVE_DIR]: {
                        "test-file": Buffer.from([1, 1, 1]),
                    },
                    [`.${emptyAlbumUUID}`]: files,
                    [emptyAlbumName]: mockfs.symlink({
                        "path": `.${emptyAlbumUUID}`,
                    }),
                    [`.${folderUUID}`]: {
                        [`.${folderedFolderUUID}`]: {
                            [`.${nonEmptyAlbumUUID}`]: {
                                "stephen-leonardi-xx6ZyOeyJtI-unsplash.jpeg": mockfs.symlink({
                                    "path": `../_All-Photos/AdXHmFwV1bys5hRFYq2PMg3K4pAl.jpeg`,
                                }),
                                "steve-johnson-gkfvdCEbUbQ-unsplash.jpeg": mockfs.symlink({
                                    "path": `../_All-Photos/AQ-qACkUB_yOBUVvye9kJSVdxZEc.jpeg`,
                                }),
                                "steve-johnson-T12spiHYons-unsplash.jpeg": mockfs.symlink({
                                    "path": `../_All-Photos/Acgr2fdPRy7x4l16nE6wwBNKrOzf.jpeg`,
                                }),
                                "steve-johnson-YLfycNerbPo-unsplash.jpeg": mockfs.symlink({
                                    "path": `./_All-Photos/AfFUy6toSMWpB1FVJQThs4Y-rVHJ.jpeg`,
                                }),
                            },
                            [nonEmptyAlbumName]: mockfs.symlink({
                                "path": `.${nonEmptyAlbumUUID}`,
                            }),
                            [`.${archivedUUID}`]: {
                                "stephen-leonardi-xx6ZyOeyJtI-unsplash.jpeg": Buffer.from([1, 1, 1, 1]),
                                "steve-johnson-gkfvdCEbUbQ-unsplash.jpeg": Buffer.from([1, 1, 1, 1]),
                                "steve-johnson-T12spiHYons-unsplash.jpeg": Buffer.from([1, 1, 1, 1]),
                                "steve-johnson-YLfycNerbPo-unsplash.jpeg": Buffer.from([1, 1, 1, 1]),
                            },
                            [archivedName]: mockfs.symlink({
                                "path": `.${archivedUUID}`,
                            }),
                        },
                        [folderedFolderName]: mockfs.symlink({
                            "path": `.${folderedFolderUUID}`,
                        }),
                    },
                    [folderName]: mockfs.symlink({
                        "path": `.${folderUUID}`,
                    }),
                },
            });

            const library = photosLibraryFactory();
            const albums = await library.loadAlbums();

            expect(Object.keys(albums).length).toEqual(5);

            const emptyAlbum = albums[emptyAlbumUUID];
            expect(emptyAlbum).toBeDefined();
            expect(emptyAlbum.albumType).toEqual(AlbumType.ALBUM);
            expect(Object.keys(emptyAlbum.assets).length).toEqual(0);

            const folder = albums[folderUUID];
            expect(folder).toBeDefined();
            expect(folder.albumType).toEqual(AlbumType.FOLDER);
            expect(Object.keys(folder.assets).length).toEqual(0);

            const folderedFolder = albums[folderedFolderUUID];
            expect(folderedFolder).toBeDefined();
            expect(folderedFolder.albumType).toEqual(AlbumType.FOLDER);
            expect(Object.keys(folderedFolder.assets).length).toEqual(0);

            const nonEmptyAlbum = albums[nonEmptyAlbumUUID];
            expect(nonEmptyAlbum).toBeDefined();
            expect(nonEmptyAlbum.albumType).toEqual(AlbumType.ALBUM);
            expect(Object.keys(nonEmptyAlbum.assets).length).toEqual(4);

            const archivedAlbum = albums[archivedUUID];
            expect(archivedAlbum).toBeDefined();
            expect(archivedAlbum.albumType).toEqual(AlbumType.ARCHIVED);
            expect(Object.keys(archivedAlbum.assets).length).toEqual(0);
        });
    });
});

describe(`Write state`, () => {
    describe.each([{
        "zone": Zones.Primary,
        "zoneDir": primaryAssetDir,
    }, {
        "zone": Zones.Shared,
        "zoneDir": sharedAssetDir,
    }])(`Write assets - $zone`, ({zone, zoneDir}) => {
        test(`Successfully verify asset`, async () => {
            const assetFileName = `Aa7_yox97ecSUNmVw0xP4YzIDDKf`;
            const assetChecksum = Buffer.from(assetFileName, `base64url`).toString(`base64`);
            const assetExt = `jpeg`;
            const assetData = Buffer.from([1, 1, 1, 1]);
            const assetMTime = 1640995200000; // 01.01.2022
            const fileType = FileType.fromExtension(assetExt);
            mockfs({
                [zoneDir]: {
                    [`${assetFileName}.${assetExt}`]: mockfs.file({
                        "content": assetData,
                        "mtime": new Date(assetMTime),
                    }),
                },
            });

            const library = photosLibraryFactory();
            const asset = new Asset(assetChecksum, assetData.length, fileType, assetMTime, zone);
            await expect(library.verifyAsset(asset)).resolves.toEqual(true);
        });

        test.each([
            [10],
            [-10],
            [100],
            [-100],
            [1000],
            [-1000],
        ])(`Successfully verify asset within range of %i ms`, async range => {
            const assetFileName = `Aa7_yox97ecSUNmVw0xP4YzIDDKf`;
            const assetChecksum = Buffer.from(assetFileName, `base64url`).toString(`base64`);
            const assetExt = `jpeg`;
            const assetData = Buffer.from([1, 1, 1, 1]);
            const assetMTime = 1640995200000; // 01.01.2022
            const fileType = FileType.fromExtension(assetExt);
            mockfs({
                [zoneDir]: {
                    [`${assetFileName}.${assetExt}`]: mockfs.file({
                        "content": assetData,
                        "mtime": new Date(assetMTime + range),
                    }),
                },
            });

            const library = photosLibraryFactory();
            const asset = new Asset(assetChecksum, assetData.length, fileType, assetMTime, zone);
            await expect(library.verifyAsset(asset)).resolves.toEqual(true);
        });

        test(`Reject unverifiable asset - Wrong Size`, async () => {
            const assetFileName = `Aa7_yox97ecSUNmVw0xP4YzIDDKf`;
            const assetChecksum = Buffer.from(assetFileName, `base64url`).toString(`base64`);
            const assetExt = `jpeg`;
            const assetData = Buffer.from([1, 1, 1, 1]);
            const assetMTime = 1640995200000; // 01.01.2022
            const fileType = FileType.fromExtension(assetExt);
            mockfs({
                [zoneDir]: {
                    [`${assetFileName}.${assetExt}`]: mockfs.file({
                        "content": assetData,
                        "mtime": new Date(assetMTime),
                    }),
                },
            });

            const library = photosLibraryFactory();
            const asset = new Asset(assetChecksum, 1, fileType, assetMTime, zone);
            await expect(library.verifyAsset(asset)).rejects.toThrowError(new Error(`File's size does not match iCloud record`));
        });

        test(`Reject unverifiable asset - Not exist`, async () => {
            const assetFileName = `Aa7_yox97ecSUNmVw0xP4YzIDDKf`;
            const assetChecksum = Buffer.from(assetFileName, `base64url`).toString(`base64`);
            const assetMTime = 1640995200000; // 01.01.2022
            const fileType = FileType.fromExtension(`jpeg`);
            mockfs({
                [zoneDir]: {},
            });

            const library = photosLibraryFactory();
            const asset = new Asset(assetChecksum, 1, fileType, assetMTime, zone);
            await expect(library.verifyAsset(asset)).rejects.toThrowError(new Error(`File not found`));
        });

        test.each([
            [1001],
            [-1001],
            [10000],
            [-10000],
            [1000000000],
            [-1000000000],
        ])(`Reject unverifiable asset - Wrong MTime due to range of %i ms`, async range => {
            const assetFileName = `Aa7_yox97ecSUNmVw0xP4YzIDDKf`;
            const assetChecksum = Buffer.from(assetFileName, `base64url`).toString(`base64`);
            const assetExt = `jpeg`;
            const assetData = Buffer.from([1, 1, 1, 1]);
            const assetMTime = 1640995200000; // 01.01.2022
            const fileType = FileType.fromExtension(assetExt);
            mockfs({
                [zoneDir]: {
                    [`${assetFileName}.${assetExt}`]: mockfs.file({
                        "content": assetData,
                        "mtime": new Date(assetMTime + range),
                    }),
                },
            });

            const library = photosLibraryFactory();
            const asset = new Asset(assetChecksum, assetData.length, fileType, assetMTime, zone);
            await expect(library.verifyAsset(asset)).rejects.toThrowError(new Error(`File's modification time does not match iCloud record`));
        });

        // Checksum verification is currently not understood/implemented. Therefore skipping
        // test.skip(`Reject unverifiable asset - Wrong Checksum`, async () => {
        //     const assetFileName = `Aa7_yox97ecSUNmVw0xP4YzIDDKf`;
        //     const _assetChecksum = Buffer.from(assetFileName, `base64url`).toString(`base64`);
        //     const assetExt = `jpeg`;
        //     const assetData = Buffer.from([1, 1, 1, 1]);
        //     const assetMTime = 1640995200000; // 01.01.2022
        //     const fileType = FileType.fromExtension(assetExt);
        //     mockfs({
        //         [assetDir]: {
        //             [`${assetFileName}.${assetExt}`]: mockfs.file({
        //                 "content": assetData,
        //                 "mtime": new Date(assetMTime),
        //             }),
        //         },
        //     });

        //     const library = photosLibraryFactory();
        //     const asset = new Asset(`asdf`, assetData.length, fileType, assetMTime);
        //     await expect(library.verifyAsset(asset)).rejects.toThrowError(new Error('bla'))
        // });

        test(`Write asset`, async () => {
            // Downloading banner of this repo
            const url = `https://steilerdev.github.io/icloud-photos-sync/assets/icloud-photos-sync-open-graph.png`;
            const config: AxiosRequestConfig = {
                "responseType": `stream`,
            };
            const fileName = `asdf`;
            const ext = `png`;
            const asset = new Asset(
                fileName,
                82215,
                FileType.fromExtension(ext),
                42,
                zone,
            );
            mockfs({
                [zoneDir]: {},
            });

            const library = photosLibraryFactory();

            try {
                const response = await axios.get(url, config);
                await library.writeAsset(asset, response);
            } catch (err) {
                // If there is no network connectivity, pass the test and print warning
                expect(err).toEqual(new Error(`getaddrinfo ENOTFOUND steilerdev.github.io`));
                console.warn(`Unable to run test - potentially due to lacking network connectivity`);
            }

            const assetPath = path.join(zoneDir, `${fileName}.${ext}`);
            expect(fs.statSync(assetPath).size).toEqual(82215);
        });

        test(`Write asset with failing verification`, async () => {
            // Downloading banner of this repo
            const url = `https://steilerdev.github.io/icloud-photos-sync/assets/icloud-photos-sync-open-graph.png`;
            const config: AxiosRequestConfig = {
                "responseType": `stream`,
            };
            const fileName = `asdf`;
            const ext = `png`;
            const asset = new Asset(
                fileName,
                82215,
                FileType.fromExtension(ext),
                42,
                zone,
            );
            mockfs({
                [zoneDir]: {},
            });

            const library = photosLibraryFactory();
            const handlerEvent = spyOnEvent(library, HANDLER_EVENT);
            library.verifyAsset = jest.fn(() => Promise.reject(new Error(`Invalid file`)));

            try {
                const response = await axios.get(url, config);
                await library.writeAsset(asset, response);
                expect(handlerEvent).toHaveBeenCalledWith(new Error(`Unable to verify asset`));
            } catch (err) {
                // If there is no network connectivity, pass the test and print warning
                expect(err).toEqual(new Error(`getaddrinfo ENOTFOUND steilerdev.github.io`));
                console.warn(`Unable to run test - potentially due to lacking network connectivity`);
            }

            const assetPath = path.join(zoneDir, `${fileName}.${ext}`);
            expect(fs.statSync(assetPath).size).toEqual(82215);
        });

        test(`Delete asset`, async () => {
            const assetFileName = `Aa7_yox97ecSUNmVw0xP4YzIDDKf`;
            const assetChecksum = Buffer.from(assetFileName, `base64url`).toString(`base64`);
            const assetExt = `jpeg`;
            const assetData = Buffer.from([1, 1, 1, 1]);
            const assetMTime = 1640995200000; // 01.01.2022
            const fileType = FileType.fromExtension(assetExt);
            const assetFullFilename = `${assetFileName}.${assetExt}`;
            mockfs({
                [zoneDir]: {
                    [assetFullFilename]: mockfs.file({
                        "content": assetData,
                        "mtime": new Date(assetMTime),
                    }),
                },
            });

            const library = photosLibraryFactory();
            const asset = new Asset(assetChecksum, assetData.length, fileType, assetMTime, zone);
            await library.deleteAsset(asset);
            expect(fs.existsSync(path.join(zoneDir, assetFullFilename))).toBeFalsy();
        });
    });

    describe(`Write albums`, () => {
        describe(`Find albums`, () => {
            test(`In root`, () => {
                const albumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
                const albumName = `Stuff`;

                mockfs({
                    [photosDataDir]: {
                        [`.${albumUUID}`]: {},
                        [albumName]: mockfs.symlink({
                            "path": `.${albumName}`,
                        }),
                    },
                });
                const library = photosLibraryFactory();
                const relativePath = library.findAlbumByUUIDInPath(albumUUID, photosDataDir);
                expect(relativePath).toEqual(`.${albumUUID}`);
            });

            test(`In sub-directory`, () => {
                const folderUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
                const folderName = `Memories`;
                const folderedAlbumUUID = `6e7f4f44-445a-41ee-a87e-844a9109069d`;
                const folderedAlbumName = `2022`;
                mockfs({
                    [photosDataDir]: {
                        [`.${folderUUID}`]: {
                            [`.${folderedAlbumUUID}`]: {},
                            [folderedAlbumName]: mockfs.symlink({
                                "path": `.${folderedAlbumUUID}`,
                            }),
                        },
                        [folderName]: mockfs.symlink({
                            "path": `.${folderUUID}`,
                        }),
                    },
                });

                const library = photosLibraryFactory();
                const relativePath = library.findAlbumByUUIDInPath(folderedAlbumUUID, photosDataDir);
                expect(relativePath).toEqual(`.${folderUUID}/.${folderedAlbumUUID}`);
            });

            test(`In multi branch sub-directory`, () => {
                const folder1UUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
                const folder1Name = `Memories`;
                const folder2UUID = `cc40a239-2beb-483e-acee-e897db1b818b`;
                const folder2Name = `Memories2`;
                const folder3UUID = `cc40a239-2beb-483e-acee-e897db1b818c`;
                const folder3Name = `Memories3`;

                const folderedAlbum1UUID = `6e7f4f44-445a-41ee-a87e-844a9109069d`;
                const folderedAlbum1Name = `2022`;
                const folderedAlbum2UUID = `6e7f4f44-445a-41ee-a87e-844a9109069e`;
                const folderedAlbum2Name = `2023`;
                const folderedAlbum3UUID = `6e7f4f44-445a-41ee-a87e-844a9109069f`;
                const folderedAlbum3Name = `2024`;
                const folderedAlbum4UUID = `6e7f4f44-445a-41ee-a87e-844a91090691`;
                const folderedAlbum4Name = `2025`;
                const folderedAlbum5UUID = `6e7f4f44-445a-41ee-a87e-844a91090692`;
                const folderedAlbum5Name = `2026`;
                const folderedAlbum6UUID = `6e7f4f44-445a-41ee-a87e-844a91090693`;
                const folderedAlbum6Name = `2027`;

                const searchAlbumUUID = `6e7f4f44-445a-41ee-a87e-844a91090694`;
                const searchAlbumName = `2042`;

                mockfs({
                    [photosDataDir]: {
                        [`.${folder1UUID}`]: {
                            [`.${folderedAlbum1UUID}`]: {
                                [`.${folderedAlbum2UUID}`]: {
                                },
                                [folderedAlbum2Name]: mockfs.symlink({
                                    "path": `.${folderedAlbum2UUID}`,
                                }),
                            },
                            [folderedAlbum1Name]: mockfs.symlink({
                                "path": `.${folderedAlbum1UUID}`,
                            }),
                        },
                        [folder1Name]: mockfs.symlink({
                            "path": `.${folder1UUID}`,
                        }),
                        [`.${folder2UUID}`]: {
                            [`.${folderedAlbum3UUID}`]: {
                            },
                            [folderedAlbum3Name]: mockfs.symlink({
                                "path": `.${folderedAlbum3UUID}`,
                            }),
                            [`.${folderedAlbum4UUID}`]: {
                            },
                            [folderedAlbum4Name]: mockfs.symlink({
                                "path": `.${folderedAlbum4UUID}`,
                            }),
                        },
                        [folder2Name]: mockfs.symlink({
                            "path": `.${folder2UUID}`,
                        }),
                        [`.${folder3UUID}`]: {
                            [`.${folderedAlbum5UUID}`]: {
                            },
                            [folderedAlbum5Name]: mockfs.symlink({
                                "path": `.${folderedAlbum5UUID}`,
                            }),
                            [`.${folderedAlbum6UUID}`]: {
                                [`.${searchAlbumUUID}`]: {
                                },
                                [searchAlbumName]: mockfs.symlink({
                                    "path": `.${searchAlbumUUID}`,
                                }),
                            },
                            [folderedAlbum6Name]: mockfs.symlink({
                                "path": `.${folderedAlbum6UUID}`,
                            }),
                        },
                        [folder3Name]: mockfs.symlink({
                            "path": `.${folder3UUID}`,
                        }),
                    },
                });

                const library = photosLibraryFactory();
                const relativePath = library.findAlbumByUUIDInPath(searchAlbumUUID, photosDataDir);
                expect(relativePath).toEqual(`.${folder3UUID}/.${folderedAlbum6UUID}/.${searchAlbumUUID}`);
            });

            describe(`In multi branch sub-directory`, () => {
                test(`Duplicate UUIDs`, () => {
                    const folder1UUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
                    const folder1Name = `Memories`;
                    const folder2UUID = `cc40a239-2beb-483e-acee-e897db1b818b`;
                    const folder2Name = `Memories2`;

                    const searchAlbumUUID = `6e7f4f44-445a-41ee-a87e-844a9109069d`;
                    const searchAlbumName = `2022`;

                    mockfs({
                        [photosDataDir]: {
                            [`.${folder1UUID}`]: {
                                [`.${searchAlbumUUID}`]: {
                                },
                                [searchAlbumName]: mockfs.symlink({
                                    "path": `.${searchAlbumUUID}`,
                                }),
                            },
                            [folder1Name]: mockfs.symlink({
                                "path": `.${folder1UUID}`,
                            }),
                            [`.${folder2UUID}`]: {
                                [`.${searchAlbumUUID}`]: {
                                },
                                [searchAlbumName]: mockfs.symlink({
                                    "path": `.${searchAlbumUUID}`,
                                }),
                            },
                            [folder2Name]: mockfs.symlink({
                                "path": `.${folder2UUID}`,
                            }),
                        },
                    });

                    const library = photosLibraryFactory();
                    expect(() => library.findAlbumByUUIDInPath(searchAlbumUUID, photosDataDir)).toThrowError(`Multiple matches`);
                });

                test(`Album does not exist`, () => {
                    const folder1UUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
                    const folder1Name = `Memories`;
                    const folder2UUID = `cc40a239-2beb-483e-acee-e897db1b818b`;
                    const folder2Name = `Memories2`;
                    const folder3UUID = `cc40a239-2beb-483e-acee-e897db1b818c`;
                    const folder3Name = `Memories3`;

                    const folderedAlbum1UUID = `6e7f4f44-445a-41ee-a87e-844a9109069d`;
                    const folderedAlbum1Name = `2022`;
                    const folderedAlbum2UUID = `6e7f4f44-445a-41ee-a87e-844a9109069e`;
                    const folderedAlbum2Name = `2023`;
                    const folderedAlbum3UUID = `6e7f4f44-445a-41ee-a87e-844a9109069f`;
                    const folderedAlbum3Name = `2024`;
                    const folderedAlbum4UUID = `6e7f4f44-445a-41ee-a87e-844a91090691`;
                    const folderedAlbum4Name = `2025`;
                    const folderedAlbum5UUID = `6e7f4f44-445a-41ee-a87e-844a91090692`;
                    const folderedAlbum5Name = `2026`;
                    const folderedAlbum6UUID = `6e7f4f44-445a-41ee-a87e-844a91090693`;
                    const folderedAlbum6Name = `2027`;

                    const searchAlbumUUID = `6e7f4f44-445a-41ee-a87e-844a91090694`;

                    mockfs({
                        [photosDataDir]: {
                            [`.${folder1UUID}`]: {
                                [`.${folderedAlbum1UUID}`]: {
                                    [`.${folderedAlbum2UUID}`]: {
                                    },
                                    [folderedAlbum2Name]: mockfs.symlink({
                                        "path": `.${folderedAlbum2UUID}`,
                                    }),
                                },
                                [folderedAlbum1Name]: mockfs.symlink({
                                    "path": `.${folderedAlbum1UUID}`,
                                }),
                            },
                            [folder1Name]: mockfs.symlink({
                                "path": `.${folder1UUID}`,
                            }),
                            [`.${folder2UUID}`]: {
                                [`.${folderedAlbum3UUID}`]: {
                                },
                                [folderedAlbum3Name]: mockfs.symlink({
                                    "path": `.${folderedAlbum3UUID}`,
                                }),
                                [`.${folderedAlbum4UUID}`]: {
                                },
                                [folderedAlbum4Name]: mockfs.symlink({
                                    "path": `.${folderedAlbum4UUID}`,
                                }),
                            },
                            [folder2Name]: mockfs.symlink({
                                "path": `.${folder2UUID}`,
                            }),
                            [`.${folder3UUID}`]: {
                                [`.${folderedAlbum5UUID}`]: {
                                },
                                [folderedAlbum5Name]: mockfs.symlink({
                                    "path": `.${folderedAlbum5UUID}`,
                                }),
                                [`.${folderedAlbum6UUID}`]: {
                                },
                                [folderedAlbum6Name]: mockfs.symlink({
                                    "path": `.${folderedAlbum6UUID}`,
                                }),
                            },
                            [folder3Name]: mockfs.symlink({
                                "path": `.${folder3UUID}`,
                            }),
                        },
                    });

                    const library = photosLibraryFactory();
                    const relativePath = library.findAlbumByUUIDInPath(searchAlbumUUID, photosDataDir);
                    expect(relativePath.length).toEqual(0);
                });
            });

            describe(`Get full path`, () => {
                test(`For existing album - Root`, () => {
                    const albumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
                    const albumName = `Stuff`;
                    const album = new Album(albumUUID, AlbumType.FOLDER, albumName, ``);

                    mockfs({
                        [photosDataDir]: {
                            [`.${albumUUID}`]: {},
                            [albumName]: mockfs.symlink({
                                "path": `.${albumName}`,
                            }),
                        },
                    });
                    const library = photosLibraryFactory();
                    const [albumNamePath, uuidPath] = library.findAlbumPaths(album);
                    expect(uuidPath).toEqual(path.join(photosDataDir, `.${albumUUID}`));
                    expect(albumNamePath).toEqual(path.join(photosDataDir, albumName));
                });

                test(`For existing album - Non-Root`, () => {
                    const folderUUID = `cc40a239-2beb-483e-acee-e897db1b818b`;
                    const folderName = `Stuff`;
                    const albumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
                    const albumName = `Stuff`;
                    const album = new Album(albumUUID, AlbumType.FOLDER, albumName, folderUUID);

                    mockfs({
                        [photosDataDir]: {
                            [`.${folderUUID}`]: {
                                [`.${albumUUID}`]: {},
                                [albumName]: mockfs.symlink({
                                    "path": `.${albumName}`,
                                }),
                            },
                            [folderName]: mockfs.symlink({
                                "path": `.${folderUUID}`,
                            }),
                        },
                    });
                    const library = photosLibraryFactory();
                    const [albumNamePath, uuidPath] = library.findAlbumPaths(album);
                    expect(uuidPath).toEqual(path.join(photosDataDir, `.${folderUUID}`, `.${albumUUID}`));
                    expect(albumNamePath).toEqual(path.join(photosDataDir, `.${folderUUID}`, albumName));
                });

                test(`For album with non-existing parent`, () => {
                    const parentUUID = `cc40a239-2beb-483e-acee-e897db1b818b`;
                    const albumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
                    const albumName = `Stuff`;
                    const album = new Album(albumUUID, AlbumType.FOLDER, albumName, parentUUID);

                    mockfs({
                        [photosDataDir]: {},
                    });
                    const library = photosLibraryFactory();
                    expect(() => library.findAlbumPaths(album)).toThrowError(`Unable to find parent of album`);
                });
            });
        });

        describe(`Create & Link`, () => {
            test(`Folder - Root`, () => {
                mockfs({
                    [photosDataDir]: {},
                });
                const albumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
                const albumName = `Memories`;
                const folder = new Album(albumUUID, AlbumType.FOLDER, albumName, ``);
                const library = photosLibraryFactory();
                library.writeAlbum(folder);
                const uuidFolder = fs.statSync(path.join(photosDataDir, `.${albumUUID}`));
                const namedFolder = fs.lstatSync(path.join(photosDataDir, albumName));
                const namedFolderTarget = fs.readlinkSync(path.join(photosDataDir, albumName));
                expect(uuidFolder.isDirectory()).toBeTruthy();
                expect(namedFolder.isSymbolicLink()).toBeTruthy();
                expect(namedFolderTarget).toEqual(`.${albumUUID}`);
            });

            test(`Folder - Subdirectory`, () => {
                const parentUUID = `cc40a239-2beb-483e-acee-e897db1b818b`;
                const parentName = `Memories`;
                const albumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
                const albumName = `2021`;
                mockfs({
                    [photosDataDir]: {
                        [`.${parentUUID}`]: {},
                        [parentName]: mockfs.symlink({
                            "path": `.${parentUUID}`,
                        }),
                    },
                });
                const folder = new Album(albumUUID, AlbumType.FOLDER, albumName, parentUUID);
                const library = photosLibraryFactory();

                library.writeAlbum(folder);

                const uuidFolder = fs.statSync(path.join(photosDataDir, `.${parentUUID}`, `.${albumUUID}`));
                const namedFolder = fs.lstatSync(path.join(photosDataDir, `.${parentUUID}`, albumName));
                const namedFolderTarget = fs.readlinkSync(path.join(photosDataDir, parentName, albumName));
                expect(uuidFolder.isDirectory()).toBeTruthy();
                expect(namedFolder.isSymbolicLink()).toBeTruthy();
                expect(namedFolderTarget).toEqual(`.${albumUUID}`);
            });

            test(`Folder - UUID path already exists`, () => {
                const albumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
                const albumName = `Memories`;
                mockfs({
                    [photosDataDir]: {
                        [`.${albumUUID}`]: {},
                    },
                });
                const folder = new Album(albumUUID, AlbumType.FOLDER, albumName, ``);
                const library = photosLibraryFactory();
                expect(() => library.writeAlbum(folder)).toThrowError(`Unable to create album: Already exists`);
            });

            test(`Folder - named path already exists`, () => {
                const albumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
                const albumName = `Memories`;
                mockfs({
                    [photosDataDir]: {
                        [albumName]: {},
                    },
                });
                const folder = new Album(albumUUID, AlbumType.FOLDER, albumName, ``);
                const library = photosLibraryFactory();
                expect(() => library.writeAlbum(folder)).toThrowError(`Unable to create album: Already exists`);
            });

            test(`Folder - Invalid parent`, () => {
                const parentUUID = `cc40a239-2beb-483e-acee-e897db1b818b`;
                const albumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
                const albumName = `Memories`;
                mockfs({
                    [photosDataDir]: {},
                });
                const folder = new Album(albumUUID, AlbumType.FOLDER, albumName, parentUUID);
                const library = photosLibraryFactory();
                expect(() => library.writeAlbum(folder)).toThrowError(`Unable to find parent of album`);
            });

            test(`Album - no assets`, () => {
                mockfs({
                    [photosDataDir]: {},
                });
                const albumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
                const albumName = `Memories`;
                const folder = new Album(albumUUID, AlbumType.ALBUM, albumName, ``);
                const library = photosLibraryFactory();

                library.writeAlbum(folder);

                const uuidFolder = fs.statSync(path.join(photosDataDir, `.${albumUUID}`));
                const namedFolder = fs.lstatSync(path.join(photosDataDir, albumName));
                const namedFolderTarget = fs.readlinkSync(path.join(photosDataDir, albumName));
                expect(uuidFolder.isDirectory()).toBeTruthy();
                expect(namedFolder.isSymbolicLink()).toBeTruthy();
                expect(namedFolderTarget).toEqual(`.${albumUUID}`);
            });

            test(`Album - missing asset in All Photos`, () => {
                const albumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
                const albumName = `Memories`;

                const albumAsset1PrettyFilename = `2h-media-MOCpD78SHW0-unsplash.jpeg`;
                const albumAsset1Filename = `AexevMtFb8wMSLb78udseVvLv-m2.jpeg`;

                const albumAsset2PrettyFilename = `2h-media-Q_x3Equ11Jk-unsplash.jpeg`;
                const albumAsset2Filename = `AZmQ91f-NKAp5b67HE23Fqhjt5NO.jpeg`;
                const albumAsset2mTime = 1609459200000; // 01.01.2021
                const albumAsset3PrettyFilename = `aditya-vyas-pbY2DCN1Atk-unsplash-edited.jpeg`;
                const albumAsset3Filename = `AXDMJGQac7vQa1exGBIEFkvZoIWL.jpeg`;
                const albumAsset3mTime = 1577836800000; // 01.01.2020
                const albumAsset4PrettyFilename = `aditya-vyas-pbY2DCN1Atk-unsplash.jpeg`;
                const albumAsset4Filename = `AQcZhJl1ZIGYuUtKNYDBI_b7MYpN.jpeg`;
                const albumAsset4mTime = 1546300800000; // 01.01.2019

                mockfs({
                    [photosDataDir]: {
                        [PRIMARY_ASSET_DIR]: {
                            [albumAsset2Filename]: mockfs.file({
                                "mtime": new Date(albumAsset2mTime),
                                "content": Buffer.from([1, 1, 1, 1]),
                            }),
                            [albumAsset3Filename]: mockfs.file({
                                "mtime": new Date(albumAsset3mTime),
                                "content": Buffer.from([1, 1, 1, 1]),
                            }),
                            [albumAsset4Filename]: mockfs.file({
                                "mtime": new Date(albumAsset4mTime),
                                "content": Buffer.from([1, 1, 1, 1]),
                            }),
                        },
                    },
                });

                const albumAssets = {
                    [albumAsset1Filename]: albumAsset1PrettyFilename,
                    [albumAsset2Filename]: albumAsset2PrettyFilename,
                    [albumAsset3Filename]: albumAsset3PrettyFilename,
                    [albumAsset4Filename]: albumAsset4PrettyFilename,
                };

                const folder = new Album(albumUUID, AlbumType.ALBUM, albumName, ``);
                folder.assets = albumAssets;
                const library = photosLibraryFactory();

                const handlerEvent = spyOnEvent(library, HANDLER_EVENT);

                library.writeAlbum(folder);

                const uuidFolder = fs.statSync(path.join(photosDataDir, `.${albumUUID}`));
                const namedFolder = fs.lstatSync(path.join(photosDataDir, albumName));
                const namedFolderTarget = fs.readlinkSync(path.join(photosDataDir, albumName));
                expect(uuidFolder.isDirectory()).toBeTruthy();
                expect(namedFolder.isSymbolicLink()).toBeTruthy();
                expect(namedFolderTarget).toEqual(`.${albumUUID}`);

                const albumAsset1Path = path.join(photosDataDir, `.${albumUUID}`, albumAsset1PrettyFilename);
                expect(fs.existsSync(albumAsset1Path)).toBeFalsy();

                expect(handlerEvent).toHaveBeenCalledWith(new Error(`Unable to link assets`));
                expect(handlerEvent).toHaveBeenCalledTimes(1);

                const albumAsset2Path = path.join(photosDataDir, `.${albumUUID}`, albumAsset2PrettyFilename);
                const albumAsset2Stat = fs.lstatSync(albumAsset2Path);
                expect(albumAsset2Stat.isSymbolicLink()).toBeTruthy();
                expect(albumAsset2Stat.mtime).toEqual(new Date(albumAsset2mTime));
                const albumAsset2Target = fs.readlinkSync(albumAsset2Path);
                expect(albumAsset2Target).toEqual(path.join(`..`, PRIMARY_ASSET_DIR, albumAsset2Filename));

                const albumAsset3Path = path.join(photosDataDir, `.${albumUUID}`, albumAsset3PrettyFilename);
                const albumAsset3Stat = fs.lstatSync(albumAsset3Path);
                expect(albumAsset3Stat.isSymbolicLink()).toBeTruthy();
                expect(albumAsset3Stat.mtime).toEqual(new Date(albumAsset3mTime));
                const albumAsset3Target = fs.readlinkSync(albumAsset3Path);
                expect(albumAsset3Target).toEqual(path.join(`..`, PRIMARY_ASSET_DIR, albumAsset3Filename));

                const albumAsset4Path = path.join(photosDataDir, `.${albumUUID}`, albumAsset4PrettyFilename);
                const albumAsset4Stat = fs.lstatSync(albumAsset4Path);
                expect(albumAsset4Stat.isSymbolicLink()).toBeTruthy();
                expect(albumAsset4Stat.mtime).toEqual(new Date(albumAsset4mTime));
                const albumAsset4Target = fs.readlinkSync(albumAsset4Path);
                expect(albumAsset4Target).toEqual(path.join(`..`, PRIMARY_ASSET_DIR, albumAsset4Filename));
            });

            test(`Album - multiple assets`, () => {
                const albumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
                const albumName = `Memories`;

                const albumAsset1PrettyFilename = `2h-media-MOCpD78SHW0-unsplash.jpeg`;
                const albumAsset1Filename = `AexevMtFb8wMSLb78udseVvLv-m2.jpeg`;
                const albumAsset1mTime = 1640995200000; // 01.01.2022
                const albumAsset2PrettyFilename = `2h-media-Q_x3Equ11Jk-unsplash.jpeg`;
                const albumAsset2Filename = `AZmQ91f-NKAp5b67HE23Fqhjt5NO.jpeg`;
                const albumAsset2mTime = 1609459200000; // 01.01.2021
                const albumAsset3PrettyFilename = `aditya-vyas-pbY2DCN1Atk-unsplash-edited.jpeg`;
                const albumAsset3Filename = `AXDMJGQac7vQa1exGBIEFkvZoIWL.jpeg`;
                const albumAsset3mTime = 1577836800000; // 01.01.2020
                const albumAsset4PrettyFilename = `aditya-vyas-pbY2DCN1Atk-unsplash.jpeg`;
                const albumAsset4Filename = `AQcZhJl1ZIGYuUtKNYDBI_b7MYpN.jpeg`;
                const albumAsset4mTime = 1546300800000; // 01.01.2019

                mockfs({
                    [photosDataDir]: {
                        [PRIMARY_ASSET_DIR]: {
                            [albumAsset1Filename]: mockfs.file({
                                "mtime": new Date(albumAsset1mTime),
                                "content": Buffer.from([1, 1, 1, 1]),
                            }),
                            [albumAsset2Filename]: mockfs.file({
                                "mtime": new Date(albumAsset2mTime),
                                "content": Buffer.from([1, 1, 1, 1]),
                            }),
                            [albumAsset3Filename]: mockfs.file({
                                "mtime": new Date(albumAsset3mTime),
                                "content": Buffer.from([1, 1, 1, 1]),
                            }),
                            [albumAsset4Filename]: mockfs.file({
                                "mtime": new Date(albumAsset4mTime),
                                "content": Buffer.from([1, 1, 1, 1]),
                            }),
                        },
                    },
                });

                const albumAssets = {
                    [albumAsset1Filename]: albumAsset1PrettyFilename,
                    [albumAsset2Filename]: albumAsset2PrettyFilename,
                    [albumAsset3Filename]: albumAsset3PrettyFilename,
                    [albumAsset4Filename]: albumAsset4PrettyFilename,
                };

                const folder = new Album(albumUUID, AlbumType.ALBUM, albumName, ``);
                folder.assets = albumAssets;
                const library = photosLibraryFactory();

                library.writeAlbum(folder);

                const uuidFolder = fs.statSync(path.join(photosDataDir, `.${albumUUID}`));
                const namedFolder = fs.lstatSync(path.join(photosDataDir, albumName));
                const namedFolderTarget = fs.readlinkSync(path.join(photosDataDir, albumName));
                expect(uuidFolder.isDirectory()).toBeTruthy();
                expect(namedFolder.isSymbolicLink()).toBeTruthy();
                expect(namedFolderTarget).toEqual(`.${albumUUID}`);

                const albumAsset1Path = path.join(photosDataDir, `.${albumUUID}`, albumAsset1PrettyFilename);
                const albumAsset1Stat = fs.lstatSync(albumAsset1Path);
                expect(albumAsset1Stat.isSymbolicLink()).toBeTruthy();
                expect(albumAsset1Stat.mtime).toEqual(new Date(albumAsset1mTime));
                const albumAsset1Target = fs.readlinkSync(albumAsset1Path);
                expect(albumAsset1Target).toEqual(path.join(`..`, PRIMARY_ASSET_DIR, albumAsset1Filename));

                const albumAsset2Path = path.join(photosDataDir, `.${albumUUID}`, albumAsset2PrettyFilename);
                const albumAsset2Stat = fs.lstatSync(albumAsset2Path);
                expect(albumAsset2Stat.isSymbolicLink()).toBeTruthy();
                expect(albumAsset2Stat.mtime).toEqual(new Date(albumAsset2mTime));
                const albumAsset2Target = fs.readlinkSync(albumAsset2Path);
                expect(albumAsset2Target).toEqual(path.join(`..`, PRIMARY_ASSET_DIR, albumAsset2Filename));

                const albumAsset3Path = path.join(photosDataDir, `.${albumUUID}`, albumAsset3PrettyFilename);
                const albumAsset3Stat = fs.lstatSync(albumAsset3Path);
                expect(albumAsset3Stat.isSymbolicLink()).toBeTruthy();
                expect(albumAsset3Stat.mtime).toEqual(new Date(albumAsset3mTime));
                const albumAsset3Target = fs.readlinkSync(albumAsset3Path);
                expect(albumAsset3Target).toEqual(path.join(`..`, PRIMARY_ASSET_DIR, albumAsset3Filename));

                const albumAsset4Path = path.join(photosDataDir, `.${albumUUID}`, albumAsset4PrettyFilename);
                const albumAsset4Stat = fs.lstatSync(albumAsset4Path);
                expect(albumAsset4Stat.isSymbolicLink()).toBeTruthy();
                expect(albumAsset4Stat.mtime).toEqual(new Date(albumAsset4mTime));
                const albumAsset4Target = fs.readlinkSync(albumAsset4Path);
                expect(albumAsset4Target).toEqual(path.join(`..`, PRIMARY_ASSET_DIR, albumAsset4Filename));
            });

            test(`Album - linking conflict (same pretty filename)`, () => {
                const albumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
                const albumName = `Memories`;

                const albumAsset1PrettyFilename = `2h-media-MOCpD78SHW0-unsplash.jpeg`;
                const albumAsset1Filename = `AexevMtFb8wMSLb78udseVvLv-m2.jpeg`;
                const albumAsset1mTime = 1640995200000; // 01.01.2022
                const albumAsset2Filename = `AZmQ91f-NKAp5b67HE23Fqhjt5NO.jpeg`;
                const albumAsset2mTime = 1609459200000; // 01.01.2021

                mockfs({
                    [photosDataDir]: {
                        [PRIMARY_ASSET_DIR]: {
                            [albumAsset1Filename]: mockfs.file({
                                "mtime": new Date(albumAsset1mTime),
                                "content": Buffer.from([1, 1, 1, 1]),
                            }),
                            [albumAsset2Filename]: mockfs.file({
                                "mtime": new Date(albumAsset2mTime),
                                "content": Buffer.from([1, 1, 1, 1]),
                            }),
                        },
                    },
                });

                const albumAssets = {
                    [albumAsset1Filename]: albumAsset1PrettyFilename,
                    [albumAsset2Filename]: albumAsset1PrettyFilename,
                };

                const folder = new Album(albumUUID, AlbumType.ALBUM, albumName, ``);
                folder.assets = albumAssets;
                const library = photosLibraryFactory();

                const handlerEvent = spyOnEvent(library, HANDLER_EVENT);

                library.writeAlbum(folder);

                const uuidFolder = fs.statSync(path.join(photosDataDir, `.${albumUUID}`));
                const namedFolder = fs.lstatSync(path.join(photosDataDir, albumName));
                const namedFolderTarget = fs.readlinkSync(path.join(photosDataDir, albumName));
                expect(uuidFolder.isDirectory()).toBeTruthy();
                expect(namedFolder.isSymbolicLink()).toBeTruthy();
                expect(namedFolderTarget).toEqual(`.${albumUUID}`);

                const albumAsset1Path = path.join(photosDataDir, `.${albumUUID}`, albumAsset1PrettyFilename);
                const albumAsset1Stat = fs.lstatSync(albumAsset1Path);
                expect(albumAsset1Stat.isSymbolicLink()).toBeTruthy();
                expect(albumAsset1Stat.mtime).toEqual(new Date(albumAsset1mTime));
                const albumAsset1Target = fs.readlinkSync(albumAsset1Path);
                expect(albumAsset1Target).toEqual(path.join(`..`, PRIMARY_ASSET_DIR, albumAsset1Filename));

                expect(handlerEvent).toHaveBeenCalledWith(new Error(`Unable to link assets`));
                expect(handlerEvent).toHaveBeenCalledTimes(1);
            });
        });

        describe(`Delete`, () => {
            test(`Folder`, () => {
                const albumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
                const albumName = `Memories`;
                mockfs({
                    [photosDataDir]: {
                        [`.${albumUUID}`]: {},
                        [albumName]: mockfs.symlink({
                            "path": `.${albumUUID}`,
                        }),
                    },
                });
                const folder = new Album(albumUUID, AlbumType.FOLDER, albumName, ``);
                const library = photosLibraryFactory();

                library.deleteAlbum(folder);

                expect(fs.existsSync(path.join(photosDataDir, `.${albumUUID}`))).toBeFalsy();
                expect(fs.existsSync(path.join(photosDataDir, albumName))).toBeFalsy();
            });

            test(`Non-empty folder (only links)`, () => {
                const albumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
                const albumName = `Memories`;
                mockfs({
                    [photosDataDir]: {
                        [`.${albumUUID}`]: {
                            "stephen-leonardi-xx6ZyOeyJtI-unsplash.jpeg": mockfs.symlink({
                                "path": `../_All-Photos/AdXHmFwV1bys5hRFYq2PMg3K4pAl.jpeg`,
                            }),
                            "steve-johnson-gkfvdCEbUbQ-unsplash.jpeg": mockfs.symlink({
                                "path": `../_All-Photos/AQ-qACkUB_yOBUVvye9kJSVdxZEc.jpeg`,
                            }),
                            "steve-johnson-T12spiHYons-unsplash.jpeg": mockfs.symlink({
                                "path": `../_All-Photos/Acgr2fdPRy7x4l16nE6wwBNKrOzf.jpeg`,
                            }),
                            "steve-johnson-YLfycNerbPo-unsplash.jpeg": mockfs.symlink({
                                "path": `./_All-Photos/AfFUy6toSMWpB1FVJQThs4Y-rVHJ.jpeg`,
                            }),
                        },
                        [albumName]: mockfs.symlink({
                            "path": `.${albumUUID}`,
                        }),
                    },
                });
                const folder = new Album(albumUUID, AlbumType.ALBUM, albumName, ``);
                const library = photosLibraryFactory();

                library.deleteAlbum(folder);

                expect(fs.existsSync(path.join(photosDataDir, `.${albumUUID}`))).toBeFalsy();
                expect(fs.existsSync(path.join(photosDataDir, albumName))).toBeFalsy();
            });

            test(`Non-empty folder (non-safe files)`, () => {
                const albumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
                const albumName = `Memories`;
                mockfs({
                    [photosDataDir]: {
                        [`.${albumUUID}`]: {
                            "test-picture": Buffer.from([1, 1, 1, 1]),
                        },
                        [albumName]: mockfs.symlink({
                            "path": `.${albumUUID}`,
                        }),
                    },
                });
                const folder = new Album(albumUUID, AlbumType.FOLDER, albumName, ``);
                const library = photosLibraryFactory();

                expect(() => library.deleteAlbum(folder)).toThrowError(`not empty`);

                expect(fs.existsSync(path.join(photosDataDir, `.${albumUUID}`))).toBeTruthy();
                expect(fs.existsSync(path.join(photosDataDir, albumName))).toBeTruthy();
            });

            test(`Non-empty folder (safe files)`, () => {
                const albumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
                const albumName = `Memories`;

                const files: any = {};
                for (const safeFileName of SAFE_FILES) {
                    files[safeFileName] = Buffer.from([1]);
                }

                mockfs({
                    [photosDataDir]: {
                        [`.${albumUUID}`]: files,
                        [albumName]: mockfs.symlink({
                            "path": `.${albumUUID}`,
                        }),
                    },
                });
                const folder = new Album(albumUUID, AlbumType.FOLDER, albumName, ``);
                const library = photosLibraryFactory();

                library.deleteAlbum(folder);

                expect(fs.existsSync(path.join(photosDataDir, `.${albumUUID}`))).toBeFalsy();
                expect(fs.existsSync(path.join(photosDataDir, albumName))).toBeFalsy();
            });

            test(`Only pretty folder exists`, () => {
                const albumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
                const albumName = `Memories`;

                mockfs({
                    [photosDataDir]: {
                        [albumName]: mockfs.symlink({
                            "path": `.${albumUUID}`,
                        }),
                    },
                });
                const folder = new Album(albumUUID, AlbumType.FOLDER, albumName, ``);
                const library = photosLibraryFactory();

                expect(() => library.deleteAlbum(folder)).toThrowError(`Unable to find path`);

                expect(fs.readlinkSync(path.join(photosDataDir, albumName)).length).toBeGreaterThan(0);
            });

            test(`Only UUID folder exists`, () => {
                const albumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
                const albumName = `Memories`;

                mockfs({
                    [photosDataDir]: {
                        [`.${albumUUID}`]: {},
                    },
                });
                const folder = new Album(albumUUID, AlbumType.FOLDER, albumName, ``);
                const library = photosLibraryFactory();

                expect(() => library.deleteAlbum(folder)).toThrowError(`Unable to find path`);

                expect(fs.existsSync(path.join(photosDataDir, `.${albumUUID}`))).toBeTruthy();
            });
        });

        describe(`Archived albums`, () => {
            describe(`Move paths`, () => {
                test(`Move paths`, () => {
                    const archivedUUID = `fc649b1a-d22e-4b49-a5ee-066eb577d023`;
                    const archivedName = `2015 - 2016`;
                    const asset1Name = `stephen-leonardi-xx6ZyOeyJtI-unsplash.jpeg`;
                    const asset1Modified = Date.now() - 10000;
                    const asset2Name = `steve-johnson-gkfvdCEbUbQ-unsplash.jpeg`;
                    const asset2Modified = Date.now() - 15000;
                    const asset3Name = `steve-johnson-T12spiHYons-unsplash.jpeg`;
                    const asset3Modified = Date.now() - 13000;
                    const asset4Name = `steve-johnson-YLfycNerbPo-unsplash.jpeg`;
                    const asset4Modified = Date.now() - 16000;

                    mockfs({
                        [photosDataDir]: {
                            [`.${archivedUUID}`]: {
                                [asset1Name]: mockfs.file({
                                    "content": Buffer.from([1, 1, 1, 1]),
                                    "ctime": new Date(asset1Modified),
                                    "mtime": new Date(asset1Modified),
                                }),
                                [asset2Name]: mockfs.file({
                                    "content": Buffer.from([1, 1, 1, 1]),
                                    "atime": new Date(asset2Modified),
                                    "mtime": new Date(asset2Modified),
                                }),
                                [asset3Name]: mockfs.file({
                                    "content": Buffer.from([1, 1, 1, 1]),
                                    "atime": new Date(asset3Modified),
                                    "mtime": new Date(asset3Modified),
                                }),
                                [asset4Name]: mockfs.file({
                                    "content": Buffer.from([1, 1, 1, 1]),
                                    "atime": new Date(asset4Modified),
                                    "mtime": new Date(asset4Modified),
                                }),
                            },
                            [archivedName]: mockfs.symlink({
                                "path": `.${archivedUUID}`,
                            }),
                        },
                    });

                    const library = photosLibraryFactory();
                    library.movePathTuple(
                        [path.join(photosDataDir, archivedName), path.join(photosDataDir, `.${archivedUUID}`)],
                        [path.join(stashDir, archivedName), path.join(stashDir, `.${archivedUUID}`)],
                    );

                    expect(fs.existsSync(path.join(stashDir, `.${archivedUUID}`))).toBeTruthy();
                    expect(fs.existsSync(path.join(stashDir, `.${archivedUUID}`, asset1Name))).toBeTruthy();
                    expect(fs.statSync(path.join(stashDir, `.${archivedUUID}`, asset1Name)).mtimeMs).toEqual(asset1Modified);
                    expect(fs.existsSync(path.join(stashDir, `.${archivedUUID}`, asset2Name))).toBeTruthy();
                    expect(fs.statSync(path.join(stashDir, `.${archivedUUID}`, asset2Name)).mtimeMs).toEqual(asset2Modified);
                    expect(fs.existsSync(path.join(stashDir, `.${archivedUUID}`, asset3Name))).toBeTruthy();
                    expect(fs.statSync(path.join(stashDir, `.${archivedUUID}`, asset3Name)).mtimeMs).toEqual(asset3Modified);
                    expect(fs.existsSync(path.join(stashDir, `.${archivedUUID}`, asset4Name))).toBeTruthy();
                    expect(fs.statSync(path.join(stashDir, `.${archivedUUID}`, asset4Name)).mtimeMs).toEqual(asset4Modified);
                    expect(fs.existsSync(path.join(stashDir, archivedName))).toBeTruthy();

                    expect(fs.existsSync(path.join(photosDataDir, `.${archivedUUID}`))).toBeFalsy();
                    expect(fs.existsSync(path.join(photosDataDir, `.${archivedUUID}`, asset1Name))).toBeFalsy();
                    expect(fs.existsSync(path.join(photosDataDir, `.${archivedUUID}`, asset2Name))).toBeFalsy();
                    expect(fs.existsSync(path.join(photosDataDir, `.${archivedUUID}`, asset3Name))).toBeFalsy();
                    expect(fs.existsSync(path.join(photosDataDir, `.${archivedUUID}`, asset4Name))).toBeFalsy();
                    expect(fs.existsSync(path.join(photosDataDir, archivedName))).toBeFalsy();
                });

                test(`Destination with same UUID exists`, () => {
                    const archivedUUID = `fc649b1a-d22e-4b49-a5ee-066eb577d023`;
                    const archivedName = `2015 - 2016`;
                    const asset1Name = `stephen-leonardi-xx6ZyOeyJtI-unsplash.jpeg`;
                    const asset2Name = `steve-johnson-gkfvdCEbUbQ-unsplash.jpeg`;
                    const asset3Name = `steve-johnson-T12spiHYons-unsplash.jpeg`;
                    const asset4Name = `steve-johnson-YLfycNerbPo-unsplash.jpeg`;
                    mockfs({
                        [photosDataDir]: {
                            [ARCHIVE_DIR]: {
                                [STASH_DIR]: {
                                    [`.${archivedUUID}`]: {},
                                },
                            },
                            [`.${archivedUUID}`]: {
                                [asset1Name]: Buffer.from([1, 1, 1, 1]),
                                [asset2Name]: Buffer.from([1, 1, 1, 1]),
                                [asset3Name]: Buffer.from([1, 1, 1, 1]),
                                [asset4Name]: Buffer.from([1, 1, 1, 1]),
                            },
                            [archivedName]: mockfs.symlink({
                                "path": `.${archivedUUID}`,
                            }),
                        },
                    });

                    const library = photosLibraryFactory();
                    expect(() => library.movePathTuple(
                        [path.join(photosDataDir, archivedName), path.join(photosDataDir, `.${archivedUUID}`)],
                        [path.join(stashDir, archivedName), path.join(stashDir, `.${archivedUUID}`)],
                    )).toThrowError(`Unable to create album: Already exists`);

                    expect(fs.existsSync(path.join(stashDir, `.${archivedUUID}`))).toBeTruthy();

                    expect(fs.existsSync(path.join(photosDataDir, `.${archivedUUID}`))).toBeTruthy();
                    expect(fs.existsSync(path.join(photosDataDir, `.${archivedUUID}`, asset1Name))).toBeTruthy();
                    expect(fs.existsSync(path.join(photosDataDir, `.${archivedUUID}`, asset2Name))).toBeTruthy();
                    expect(fs.existsSync(path.join(photosDataDir, `.${archivedUUID}`, asset3Name))).toBeTruthy();
                    expect(fs.existsSync(path.join(photosDataDir, `.${archivedUUID}`, asset4Name))).toBeTruthy();
                    expect(fs.existsSync(path.join(photosDataDir, archivedName))).toBeTruthy();
                });

                test(`Destination with same name already exist`, () => {
                    const archivedUUID = `fc649b1a-d22e-4b49-a5ee-066eb577d023`;
                    const archivedName = `2015 - 2016`;
                    const asset1Name = `stephen-leonardi-xx6ZyOeyJtI-unsplash.jpeg`;
                    const asset2Name = `steve-johnson-gkfvdCEbUbQ-unsplash.jpeg`;
                    const asset3Name = `steve-johnson-T12spiHYons-unsplash.jpeg`;
                    const asset4Name = `steve-johnson-YLfycNerbPo-unsplash.jpeg`;
                    mockfs({
                        [photosDataDir]: {
                            [ARCHIVE_DIR]: {
                                [STASH_DIR]: {
                                    [archivedName]: {},
                                },
                            },
                            [`.${archivedUUID}`]: {
                                [asset1Name]: Buffer.from([1, 1, 1, 1]),
                                [asset2Name]: Buffer.from([1, 1, 1, 1]),
                                [asset3Name]: Buffer.from([1, 1, 1, 1]),
                                [asset4Name]: Buffer.from([1, 1, 1, 1]),
                            },
                            [archivedName]: mockfs.symlink({
                                "path": `.${archivedUUID}`,
                            }),
                        },
                    });

                    const library = photosLibraryFactory();
                    expect(() => library.movePathTuple(
                        [path.join(photosDataDir, archivedName), path.join(photosDataDir, `.${archivedUUID}`)],
                        [path.join(stashDir, archivedName), path.join(stashDir, `.${archivedUUID}`)],
                    )).toThrowError(`Unable to create album: Already exists`);

                    expect(fs.existsSync(path.join(stashDir, archivedName))).toBeTruthy();
                    expect(fs.existsSync(path.join(photosDataDir, `.${archivedUUID}`))).toBeTruthy();
                    expect(fs.existsSync(path.join(photosDataDir, `.${archivedUUID}`, asset1Name))).toBeTruthy();
                    expect(fs.existsSync(path.join(photosDataDir, `.${archivedUUID}`, asset2Name))).toBeTruthy();
                    expect(fs.existsSync(path.join(photosDataDir, `.${archivedUUID}`, asset3Name))).toBeTruthy();
                    expect(fs.existsSync(path.join(photosDataDir, `.${archivedUUID}`, asset4Name))).toBeTruthy();
                    expect(fs.existsSync(path.join(photosDataDir, archivedName))).toBeTruthy();
                });

                test(`Source AlbumName does not exist - will be ignored`, () => {
                    const archivedUUID = `fc649b1a-d22e-4b49-a5ee-066eb577d023`;
                    const archivedName = `2015 - 2016`;
                    const asset1Name = `stephen-leonardi-xx6ZyOeyJtI-unsplash.jpeg`;
                    const asset2Name = `steve-johnson-gkfvdCEbUbQ-unsplash.jpeg`;
                    const asset3Name = `steve-johnson-T12spiHYons-unsplash.jpeg`;
                    const asset4Name = `steve-johnson-YLfycNerbPo-unsplash.jpeg`;
                    mockfs({
                        [photosDataDir]: {
                            [ARCHIVE_DIR]: {
                            },
                            [`.${archivedUUID}`]: {
                                [asset1Name]: Buffer.from([1, 1, 1, 1]),
                                [asset2Name]: Buffer.from([1, 1, 1, 1]),
                                [asset3Name]: Buffer.from([1, 1, 1, 1]),
                                [asset4Name]: Buffer.from([1, 1, 1, 1]),
                            },
                        },
                    });

                    const library = photosLibraryFactory();

                    library.movePathTuple(
                        [path.join(photosDataDir, archivedName), path.join(photosDataDir, `.${archivedUUID}`)],
                        [path.join(stashDir, archivedName), path.join(stashDir, `.${archivedUUID}`)],
                    );

                    expect(fs.existsSync(path.join(stashDir, `.${archivedUUID}`))).toBeTruthy();
                    expect(fs.existsSync(path.join(stashDir, `.${archivedUUID}`, asset1Name))).toBeTruthy();
                    expect(fs.existsSync(path.join(stashDir, `.${archivedUUID}`, asset2Name))).toBeTruthy();
                    expect(fs.existsSync(path.join(stashDir, `.${archivedUUID}`, asset3Name))).toBeTruthy();
                    expect(fs.existsSync(path.join(stashDir, `.${archivedUUID}`, asset4Name))).toBeTruthy();
                    expect(fs.existsSync(path.join(stashDir, archivedName))).toBeTruthy();

                    expect(fs.existsSync(path.join(photosDataDir, `.${archivedUUID}`))).toBeFalsy();
                    expect(fs.existsSync(path.join(photosDataDir, `.${archivedUUID}`, asset1Name))).toBeFalsy();
                    expect(fs.existsSync(path.join(photosDataDir, `.${archivedUUID}`, asset2Name))).toBeFalsy();
                    expect(fs.existsSync(path.join(photosDataDir, `.${archivedUUID}`, asset3Name))).toBeFalsy();
                    expect(fs.existsSync(path.join(photosDataDir, `.${archivedUUID}`, asset4Name))).toBeFalsy();
                    expect(fs.existsSync(path.join(photosDataDir, archivedName))).toBeFalsy();
                });

                test(`AlbumUUID does not exist`, () => {
                    const archivedUUID = `fc649b1a-d22e-4b49-a5ee-066eb577d023`;
                    const archivedName = `2015 - 2016`;
                    mockfs({
                        [photosDataDir]: {
                            [ARCHIVE_DIR]: {},
                            [archivedName]: {},
                        },
                    });

                    const library = photosLibraryFactory();
                    expect(() => library.movePathTuple(
                        [path.join(photosDataDir, archivedName), path.join(photosDataDir, `.${archivedUUID}`)],
                        [path.join(stashDir, archivedName), path.join(stashDir, `.${archivedUUID}`)],
                    )).toThrowError(`Unable to find path`);
                    expect(fs.existsSync(path.join(photosDataDir, archivedName))).toBeTruthy();
                });
            });

            test(`Retrieve stashed album`, () => {
                mockfs();
                const archivedUUID = `fc649b1a-d22e-4b49-a5ee-066eb577d023`;
                const archivedName = `2015 - 2016`;

                const library = photosLibraryFactory();
                library.movePathTuple = jest.fn();

                const album = new Album(archivedUUID, AlbumType.ARCHIVED, archivedName, ``);
                library.retrieveStashedAlbum(album);
                expect(library.movePathTuple).toHaveBeenCalledWith(
                    [path.join(stashDir, archivedName), path.join(stashDir, `.${archivedUUID}`)],
                    [path.join(photosDataDir, archivedName), path.join(photosDataDir, `.${archivedUUID}`)],
                );
            });

            test(`Stash album`, () => {
                mockfs();
                const archivedUUID = `fc649b1a-d22e-4b49-a5ee-066eb577d023`;
                const archivedName = `2015 - 2016`;

                const library = photosLibraryFactory();
                library.movePathTuple = jest.fn();

                const album = new Album(archivedUUID, AlbumType.ARCHIVED, archivedName, ``);
                library.stashArchivedAlbum(album);
                expect(library.movePathTuple).toHaveBeenCalledWith(
                    [path.join(photosDataDir, archivedName), path.join(photosDataDir, `.${archivedUUID}`)],
                    [path.join(stashDir, archivedName), path.join(stashDir, `.${archivedUUID}`)],
                );
            });

            describe(`Clean archived orphans`, () => {
                test(`Single Orphan`, async () => {
                    const archivedUUID = `fc649b1a-d22e-4b49-a5ee-066eb577d023`;
                    const archivedName = `2015 - 2016`;
                    const asset1Name = `stephen-leonardi-xx6ZyOeyJtI-unsplash.jpeg`;
                    const asset2Name = `steve-johnson-gkfvdCEbUbQ-unsplash.jpeg`;
                    const asset3Name = `steve-johnson-T12spiHYons-unsplash.jpeg`;
                    const asset4Name = `steve-johnson-YLfycNerbPo-unsplash.jpeg`;

                    mockfs({
                        [photosDataDir]: {
                            [ARCHIVE_DIR]: {
                                [STASH_DIR]: {
                                    [`.${archivedUUID}`]: {
                                        [asset1Name]: Buffer.from([1, 1, 1, 1]),
                                        [asset2Name]: Buffer.from([1, 1, 1, 1]),
                                        [asset3Name]: Buffer.from([1, 1, 1, 1]),
                                        [asset4Name]: Buffer.from([1, 1, 1, 1]),
                                    },
                                    [archivedName]: mockfs.symlink({
                                        "path": `.${archivedUUID}`,
                                    }),
                                },
                            },
                        },
                    });

                    const library = photosLibraryFactory();
                    await library.cleanArchivedOrphans();
                    expect(fs.existsSync(path.join(archiveDir, archivedName))).toBeTruthy();
                    expect(fs.existsSync(path.join(archiveDir, archivedName, asset1Name))).toBeTruthy();
                    expect(fs.existsSync(path.join(archiveDir, archivedName, asset2Name))).toBeTruthy();
                    expect(fs.existsSync(path.join(archiveDir, archivedName, asset3Name))).toBeTruthy();
                    expect(fs.existsSync(path.join(archiveDir, archivedName, asset4Name))).toBeTruthy();
                });

                test(`Multiple orphans`, async () => {
                    const archived1UUID = `fc649b1a-d22e-4b49-a5ee-066eb577d023`;
                    const archived1Name = `2015 - 2016`;
                    const archived2UUID = `fc649b1a-d22e-4b49-a5ee-066eb577d024`;
                    const archived2Name = `2016 - 2017`;
                    const asset1Name = `stephen-leonardi-xx6ZyOeyJtI-unsplash.jpeg`;
                    const asset2Name = `steve-johnson-gkfvdCEbUbQ-unsplash.jpeg`;
                    const asset3Name = `steve-johnson-T12spiHYons-unsplash.jpeg`;
                    const asset4Name = `steve-johnson-YLfycNerbPo-unsplash.jpeg`;

                    mockfs({
                        [photosDataDir]: {
                            [ARCHIVE_DIR]: {
                                [STASH_DIR]: {
                                    [`.${archived1UUID}`]: {
                                        [asset1Name]: Buffer.from([1, 1, 1, 1]),
                                        [asset2Name]: Buffer.from([1, 1, 1, 1]),
                                        [asset3Name]: Buffer.from([1, 1, 1, 1]),
                                        [asset4Name]: Buffer.from([1, 1, 1, 1]),
                                    },
                                    [archived1Name]: mockfs.symlink({
                                        "path": `.${archived1UUID}`,
                                    }),
                                    [`.${archived2UUID}`]: {
                                        [asset1Name]: Buffer.from([1, 1, 1, 1]),
                                        [asset2Name]: Buffer.from([1, 1, 1, 1]),
                                        [asset3Name]: Buffer.from([1, 1, 1, 1]),
                                        [asset4Name]: Buffer.from([1, 1, 1, 1]),
                                    },
                                    [archived2Name]: mockfs.symlink({
                                        "path": `.${archived2UUID}`,
                                    }),
                                },
                            },
                        },
                    });

                    const library = photosLibraryFactory();
                    await library.cleanArchivedOrphans();

                    expect(fs.existsSync(path.join(archiveDir, archived1Name))).toBeTruthy();
                    expect(fs.existsSync(path.join(archiveDir, archived1Name, asset1Name))).toBeTruthy();
                    expect(fs.existsSync(path.join(archiveDir, archived1Name, asset2Name))).toBeTruthy();
                    expect(fs.existsSync(path.join(archiveDir, archived1Name, asset3Name))).toBeTruthy();
                    expect(fs.existsSync(path.join(archiveDir, archived1Name, asset4Name))).toBeTruthy();

                    expect(fs.existsSync(path.join(archiveDir, archived2Name))).toBeTruthy();
                    expect(fs.existsSync(path.join(archiveDir, archived2Name, asset1Name))).toBeTruthy();
                    expect(fs.existsSync(path.join(archiveDir, archived2Name, asset2Name))).toBeTruthy();
                    expect(fs.existsSync(path.join(archiveDir, archived2Name, asset3Name))).toBeTruthy();
                    expect(fs.existsSync(path.join(archiveDir, archived2Name, asset4Name))).toBeTruthy();
                });

                test(`Naming conflict`, async () => {
                    const archivedUUID = `fc649b1a-d22e-4b49-a5ee-066eb577d023`;
                    const archivedName = `2015 - 2016`;
                    const archivedName1 = `${archivedName}-1`;
                    const archivedName2 = `${archivedName}-2`;
                    const asset1Name = `stephen-leonardi-xx6ZyOeyJtI-unsplash.jpeg`;
                    const asset2Name = `steve-johnson-gkfvdCEbUbQ-unsplash.jpeg`;
                    const asset3Name = `steve-johnson-T12spiHYons-unsplash.jpeg`;
                    const asset4Name = `steve-johnson-YLfycNerbPo-unsplash.jpeg`;

                    mockfs({
                        [photosDataDir]: {
                            [ARCHIVE_DIR]: {
                                [STASH_DIR]: {
                                    [`.${archivedUUID}`]: {
                                        [asset1Name]: Buffer.from([1, 1, 1, 1]),
                                        [asset2Name]: Buffer.from([1, 1, 1, 1]),
                                        [asset3Name]: Buffer.from([1, 1, 1, 1]),
                                        [asset4Name]: Buffer.from([1, 1, 1, 1]),
                                    },
                                    [archivedName]: mockfs.symlink({
                                        "path": `.${archivedUUID}`,
                                    }),
                                },
                                [archivedName]: {},
                                [archivedName1]: {},
                            },
                        },
                    });

                    const library = photosLibraryFactory();
                    await library.cleanArchivedOrphans();

                    expect(fs.existsSync(path.join(archiveDir, archivedName))).toBeTruthy();
                    expect(fs.existsSync(path.join(archiveDir, archivedName1))).toBeTruthy();
                    expect(fs.existsSync(path.join(archiveDir, archivedName2))).toBeTruthy();
                    expect(fs.existsSync(path.join(archiveDir, archivedName2, asset1Name))).toBeTruthy();
                    expect(fs.existsSync(path.join(archiveDir, archivedName2, asset2Name))).toBeTruthy();
                    expect(fs.existsSync(path.join(archiveDir, archivedName2, asset3Name))).toBeTruthy();
                    expect(fs.existsSync(path.join(archiveDir, archivedName2, asset4Name))).toBeTruthy();
                });
            });
        });
    });
});
