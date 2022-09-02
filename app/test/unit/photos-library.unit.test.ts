import mockfs from 'mock-fs';
import fs from 'fs';
import {expect, describe, test, afterEach} from '@jest/globals';
import {PhotosLibrary} from '../../src/lib/photos-library/photos-library';
import {ASSET_DIR, ARCHIVE_DIR, SAFE_FILES} from '../../src/lib/photos-library/constants';
import path from 'path';
import {AlbumType} from '../../src/lib/photos-library/model/album';

const photosDataDir = `/media/files/photos-library`;
const assetDir = path.join(photosDataDir, ASSET_DIR);
// Const archiveDir = path.join(photosDataDir, ARCHIVE_DIR);

function photosLibraryFactory(): PhotosLibrary {
    const opts = {
        "dataDir": photosDataDir,
    };
    return new PhotosLibrary(opts);
}

describe(`Unit Tests - Photos Library`, () => {
    afterEach(() => {
        mockfs.restore();
    });

    test(`Should create missing directories`, () => {
        mockfs();
        const _library = photosLibraryFactory();
        expect(fs.existsSync(photosDataDir)).toBe(true);
        expect(fs.existsSync(assetDir)).toBe(true);
    });

    test(`Should use existing directories and not overwrite content`, () => {
        mockfs({
            [photosDataDir]: {
                "testFile": `test content`,
                [ASSET_DIR]: {
                    "testFile": `test content`,
                },
            },
        });
        const opts = {
            "dataDir": photosDataDir,
        };
        const _library = new PhotosLibrary(opts);
        expect(fs.existsSync(photosDataDir)).toBe(true);
        expect(fs.existsSync(assetDir)).toBe(true);
        expect(fs.existsSync(path.join(photosDataDir, `testFile`)));
        expect(fs.existsSync(path.join(assetDir, `testFile`)));
    });

    describe(`Load state`, () => {
        describe(`Load assets`, () => {
            test(`No assets`, async () => {
                mockfs();
                const library = photosLibraryFactory();
                const assets = await library.loadAssets();
                expect(Object.keys(assets).length).toEqual(0);
            });

            test(`Multiple assets`, async () => {
                mockfs({
                    [assetDir]: {
                        "Aa7_yox97ecSUNmVw0xP4YzIDDKf.jpeg": Buffer.from([1, 1, 1, 1]),
                        "AaGv15G3Cp9LPMQQfFZiHRryHgjU.jpeg": Buffer.from([1, 1, 1, 1, 1]),
                        "Aah0dUnhGFNWjAeqKEkB_SNLNpFf.jpeg": Buffer.from([1, 1, 1, 1, 1, 1]),
                    },
                });
                const library = photosLibraryFactory();
                const assets = await library.loadAssets();
                expect(Object.keys(assets).length).toEqual(3);
            });

            test(`Invalid assets`, async () => {
                mockfs({
                    [assetDir]: {
                        "Aa7_yox97ecSUNmVw0xP4YzIDDKf.jpeg": Buffer.from([1, 1, 1, 1]),
                        "AaGv15G3Cp9LPMQQfFZiHRryHgjU.jpeg": Buffer.from([1, 1, 1, 1, 1]),
                        "Aah0dUnhGFNWjAeqKEkB_SNLNpFf": Buffer.from([1, 1, 1, 1, 1, 1]), // No file extension
                        "Aah0dUnhGFNWjAeqKEkB_SNLNpFf.pdf": Buffer.from([1, 1, 1, 1, 1, 1]), // Invalid file extension
                        "Aah0dUnhGFNWjAeqKEkB_SNLNpF-f": Buffer.from([1, 1, 1, 1, 1, 1]), // Invalid file name
                    },
                });
                const library = photosLibraryFactory();
                const assets = await library.loadAssets();
                expect(Object.keys(assets).length).toEqual(2);
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

            test(`Ignore 'All Photos' Folder`, async () => {
                mockfs({
                    [photosDataDir]: {
                        [ASSET_DIR]: {
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

                const files: any = {}
                for (const safeFileName of SAFE_FILES) {
                    files[safeFileName] = Buffer.from([1])
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

            test.only(`Load nested state`, async () => {
                const emptyAlbumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;
                const emptyAlbumName = `Stuff`;
                const files: any = {}
                for (const safeFileName of SAFE_FILES) {
                    files[safeFileName] = Buffer.from([1])
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
                        [ASSET_DIR]: {
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

                const emptyAlbum = albums[emptyAlbumUUID]
                expect(emptyAlbum).toBeDefined()
                expect(emptyAlbum.albumType).toEqual(AlbumType.ALBUM)
                expect(Object.keys(emptyAlbum.assets).length).toEqual(0)

                const folder = albums[folderUUID]
                expect(folder).toBeDefined()
                expect(folder.albumType).toEqual(AlbumType.FOLDER)
                expect(Object.keys(folder.assets).length).toEqual(0)

                const folderedFolder = albums[folderedFolderUUID]
                expect(folderedFolder).toBeDefined()
                expect(folderedFolder.albumType).toEqual(AlbumType.FOLDER)
                expect(Object.keys(folderedFolder.assets).length).toEqual(0)

                const nonEmptyAlbum = albums[nonEmptyAlbumUUID]
                expect(nonEmptyAlbum).toBeDefined()
                expect(nonEmptyAlbum.albumType).toEqual(AlbumType.ALBUM)
                expect(Object.keys(nonEmptyAlbum.assets).length).toEqual(4)

                const archivedAlbum = albums[archivedUUID]
                expect(archivedAlbum).toBeDefined()
                expect(archivedAlbum.albumType).toEqual(AlbumType.ARCHIVED)
                expect(Object.keys(archivedAlbum.assets).length).toEqual(0)
            });

        });
    });
    describe(`Write state`, () => {
        test.todo(`Succesfully verify asset`);
        test.todo(`Reject unverifiable asset`);
        test.todo(`Write asset`);
        test.todo(`Delete asset`);
    });
    describe(`Handle processing queue`, () => {
        test.todo(`Empty processing queue`);
        test.todo(`Only deleting`);
        test.todo(`Only adding`);
        test.todo(`Adding & deleting`);
    });
});