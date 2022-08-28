import mockfs from 'mock-fs';
import fs from 'fs';
import {expect, describe, test, afterEach} from '@jest/globals';
import {PhotosLibrary} from '../../src/lib/photos-library/photos-library';
import {ASSET_DIR, ARCHIVE_DIR} from '../../src/lib/photos-library/constants';
import path from 'path';
import {AlbumType} from '../../src/lib/photos-library/model/album';

const photosDataDir = `/media/files/photos-library`;
const assetDir = path.join(photosDataDir, ASSET_DIR);
//const archiveDir = path.join(photosDataDir, ARCHIVE_DIR);

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

            test.skip(`Load nested state`, async () => {
                // This is the structure of the test environment on disk
                mockfs({
                    [photosDataDir]: {
                        [ASSET_DIR]: {

                        },
                        ".7198a6a0-27fe-4fb6-961b-74231e425858": {
                            ".6e7f4f44-445a-41ee-a87e-844a9109069d": {
                                "stephen-leonardi-xx6ZyOeyJtI-unsplash.jpeg": mockfs.symlink({
                                    "path": `../../_All-Photos/AdXHmFwV1bys5hRFYq2PMg3K4pAl.jpeg`,
                                }),
                            },
                            "2022": mockfs.symlink({
                                "path": `.6e7f4f44-445a-41ee-a87e-844a9109069d`,
                            }),
                        },
                        ".b971e88c-ca73-4712-9f70-202879ea8b26": {
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
                        ".cc40a239-2beb-483e-acee-e897db1b818a": {
                        },
                        "Memories": mockfs.symlink({
                            "path": `.cc40a239-2beb-483e-acee-e897db1b818a`,
                        }),
                        "Random": mockfs.symlink({
                            "path": `.b971e88c-ca73-4712-9f70-202879ea8b26`,
                        }),
                        "Stuff": mockfs.symlink({
                            "path": `.7198a6a0-27fe-4fb6-961b-74231e425858`,
                        }),
                    },
                });

                const library = photosLibraryFactory();
                const albums = await library.loadAlbums();
                expect(Object.keys(albums).length).toEqual(4);

                const emptyAlbumUUID = `7198a6a0-27fe-4fb6-961b-74231e425858`;
                const emptyAlbum = albums[emptyAlbumUUID];
                expect(emptyAlbum).toBeDefined();
                expect(emptyAlbum.albumName).toEqual(`Stuff`);
                expect(emptyAlbum.uuid).toEqual(`7198a6a0-27fe-4fb6-961b-74231e425858`);
                expect(Object.keys(emptyAlbum.assets).length).toEqual(0);
                expect(emptyAlbum.albumType).toEqual(AlbumType.ALBUM);

                const multiItemAlbumUUID = `b971e88c-ca73-4712-9f70-202879ea8b26`;
                const multiItemAlbum = albums[multiItemAlbumUUID];
                expect(multiItemAlbum).toBeDefined();
                expect(multiItemAlbum.albumName).toEqual(`Random`);
                expect(multiItemAlbum.uuid).toEqual(multiItemAlbumUUID);
                expect(Object.keys(multiItemAlbum.assets).length).toEqual(4);
                expect(multiItemAlbum.albumType).toEqual(AlbumType.ALBUM);

                const folderUUID = `.7198a6a0-27fe-4fb6-961b-74231e425858`;
                const folder = albums[folderUUID];
                expect(folder).toBeDefined();
                expect(folder.albumName).toEqual(`Memories`);
                expect(folder.uuid).toEqual(folderUUID);
                expect(Object.keys(folder.assets).length).toEqual(0);
                expect(folder.albumType).toEqual(AlbumType.FOLDER);
            });

            test.todo(`Ignore safe files in folder`);
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