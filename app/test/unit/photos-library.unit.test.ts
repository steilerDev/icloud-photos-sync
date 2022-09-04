import mockfs from 'mock-fs';
import fs from 'fs';
import {expect, describe, test, afterEach} from '@jest/globals';
import {PhotosLibrary} from '../../src/lib/photos-library/photos-library';
import {ASSET_DIR, ARCHIVE_DIR, SAFE_FILES} from '../../src/lib/photos-library/constants';
import path from 'path';
import {AlbumType} from '../../src/lib/photos-library/model/album';
import { Asset } from '../../src/lib/photos-library/model/asset';
import { FileType } from '../../src/lib/photos-library/model/file-type';
import { file } from 'mock-fs/lib/filesystem';
import mock from 'mock-fs';
import axios, { AxiosRequestConfig } from 'axios';

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

            test(`Load nested state`, async () => {
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
        describe(`Write assets`, () => {
            test(`Succesfully verify asset`, () => {
                const assetFileName = "Aa7_yox97ecSUNmVw0xP4YzIDDKf"
                const assetChecksum = Buffer.from(assetFileName, `base64url`).toString(`base64`)
                const assetExt = "jpeg"
                const assetData = Buffer.from([1, 1, 1, 1])
                const assetMTime = 1640995200000 // 01.01.2022
                const fileType = FileType.fromExtension(assetExt)
                mockfs({
                    [assetDir] : {
                        [`${assetFileName}.${assetExt}`]: mock.file({
                            content: assetData,
                            mtime: new Date(assetMTime)
                        }),
                    }
                })
                
                const library = photosLibraryFactory();
                const asset = new Asset(assetChecksum, assetData.length, fileType, assetMTime)
                expect(library.verifyAsset(asset)).toBeTruthy()
            });

            test(`Reject unverifiable asset - Wrong Size`, () => {
                const assetFileName = "Aa7_yox97ecSUNmVw0xP4YzIDDKf"
                const assetChecksum = Buffer.from(assetFileName, `base64url`).toString(`base64`)
                const assetExt = "jpeg"
                const assetData = Buffer.from([1, 1, 1, 1])
                const assetMTime = 1640995200000 // 01.01.2022
                const fileType = FileType.fromExtension(assetExt)
                mockfs({
                    [assetDir] : {
                        [`${assetFileName}.${assetExt}`]: mock.file({
                            content: assetData,
                            mtime: new Date(assetMTime)
                        }),
                    }
                })
                
                const library = photosLibraryFactory();
                const asset = new Asset(assetChecksum, 1, fileType, assetMTime)
                expect(library.verifyAsset(asset)).toBeFalsy()
            })

            test(`Reject unverifiable asset - Wrong MTime`, () => {
                const assetFileName = "Aa7_yox97ecSUNmVw0xP4YzIDDKf"
                const assetChecksum = Buffer.from(assetFileName, `base64url`).toString(`base64`)
                const assetExt = "jpeg"
                const assetData = Buffer.from([1, 1, 1, 1])
                const assetMTime = 1640995200000 // 01.01.2022
                const fileType = FileType.fromExtension(assetExt)
                mockfs({
                    [assetDir] : {
                        [`${assetFileName}.${assetExt}`]: mock.file({
                            content: assetData,
                            mtime: new Date(assetMTime)
                        }),
                    }
                })
                
                const library = photosLibraryFactory();
                const asset = new Asset(assetChecksum, assetData.length, fileType, 0)
                expect(library.verifyAsset(asset)).toBeFalsy()
            })

            // Checksum verification is currently not understood/implemented. Therefore skipping
            test.skip(`Reject unverifiable asset - Wrong Checksum`, () => {
                const assetFileName = "Aa7_yox97ecSUNmVw0xP4YzIDDKf"
                const assetChecksum = Buffer.from(assetFileName, `base64url`).toString(`base64`)
                const assetExt = "jpeg"
                const assetData = Buffer.from([1, 1, 1, 1])
                const assetMTime = 1640995200000 // 01.01.2022
                const fileType = FileType.fromExtension(assetExt)
                mockfs({
                    [assetDir] : {
                        [`${assetFileName}.${assetExt}`]: mock.file({
                            content: assetData,
                            mtime: new Date(assetMTime)
                        }),
                    }
                })
                
                const library = photosLibraryFactory();
                const asset = new Asset("asdf", assetData.length, fileType, assetMTime)
                expect(library.verifyAsset(asset)).toBeFalsy()
            })

            test(`Write asset`, async () => {
                // downloading banner of this repo
                const url = "https://steilerdev.github.io/icloud-photos-sync/assets/icloud-photos-sync-open-graph.png"
                const config: AxiosRequestConfig = {
                    "responseType": `stream`,
                };
                const fileName = "asdf"
                const ext = "png"
                const asset = new Asset(
                    fileName,
                    82215,
                    FileType.fromExtension(ext),
                    42
                )
                mockfs({
                    [assetDir] : {}
                })

                const library = photosLibraryFactory()
                const response = await axios.get(url, config);
                await library.writeAsset(asset, response)
                const assetPath = path.join(assetDir, `${fileName}.${ext}`)
                expect(fs.existsSync(assetPath)).toBeTruthy()
                expect(fs.readFileSync(assetPath).length).toBeGreaterThan(0)
            });

            test(`Delete asset`, async () => {
                const assetFileName = "Aa7_yox97ecSUNmVw0xP4YzIDDKf"
                const assetChecksum = Buffer.from(assetFileName, `base64url`).toString(`base64`)
                const assetExt = "jpeg"
                const assetData = Buffer.from([1, 1, 1, 1])
                const assetMTime = 1640995200000 // 01.01.2022
                const fileType = FileType.fromExtension(assetExt)
                const assetFullFilename = `${assetFileName}.${assetExt}`
                mockfs({
                    [assetDir] : {
                        [assetFullFilename]: mock.file({
                            content: assetData,
                            mtime: new Date(assetMTime)
                        }),
                    }
                })
                
                const library = photosLibraryFactory();
                const asset = new Asset(assetChecksum, assetData.length, fileType, assetMTime)
                await library.deleteAsset(asset)
                expect(fs.existsSync(path.join(assetDir, assetFullFilename))).toBeFalsy()
            });
        });

        describe(`Write albums`, () => {
            describe(`Find albums`, () => {
                test(`Find album in root`, () => {
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
                    const library = photosLibraryFactory()
                    const relativePath = library.findAlbumByUUIDInPath(albumUUID, photosDataDir)
                    expect(relativePath).toEqual(`.${albumUUID}`)
                })

                test(`Find album in sub-directory`, () => {
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
                    const relativePath = library.findAlbumByUUIDInPath(folderedAlbumUUID, photosDataDir)
                    expect(relativePath).toEqual(`.${folderUUID}/.${folderedAlbumUUID}`)
                })

                test(`Find album in multibranch sub-directory`, () => {
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

                    const searchAlbumUUID = `6e7f4f44-445a-41ee-a87e-844a91090694`
                    const searchAlbumName = `2042`

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
                    const relativePath = library.findAlbumByUUIDInPath(searchAlbumUUID, photosDataDir)
                    expect(relativePath).toEqual(`.${folder3UUID}/.${folderedAlbum6UUID}/.${searchAlbumUUID}`)
                })

                test(`Find album in multibranch sub-directory: Duplicate UUIDs`, () => {
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
                    expect(() => library.findAlbumByUUIDInPath(searchAlbumUUID, photosDataDir)).toThrowError('Multiple matches')
                })

                test(`Find album in multibranch sub-directory: Album does not exist`, () => {
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

                    const searchAlbumUUID = `6e7f4f44-445a-41ee-a87e-844a91090694`

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
                    const relativePath = library.findAlbumByUUIDInPath(searchAlbumUUID, photosDataDir)
                    expect(relativePath.length).toEqual(0)
                })

                test(`Get full path for existing album`, () => {
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
                    const library = photosLibraryFactory()
                    const relativePath = library.findAlbumByUUID(albumUUID)
                    expect(relativePath).toEqual(`${photosDataDir}/.${albumUUID}`)
                })

                test(`Get full path for non-existing album`, () => {
                    const albumUUID = `cc40a239-2beb-483e-acee-e897db1b818a`;

                    mockfs({
                        [photosDataDir]: {},
                    });
                    const library = photosLibraryFactory()
                    expect(() => library.findAlbumByUUID(albumUUID)).toThrowError('Unable to find album')
                })
            })

            describe(`Create albums`, () => {
                test.todo(`Create & link album`)
                test.todo(`Create & link album - already exists`)
                test.todo(`Link album assets - No assets`)
                test.todo(`Link album assets - Multiple assets`)

                test.todo(`Write album - Invalid parent`)
                test.todo(`Write album - Root`)
                test.todo(`Write album - Subdir`)
            })

            describe(`Archived albums`, () => {
                test.todo(`Stash album - Empty album`)
                test.todo(`Stash album - Non-empty album`)
                test.todo(`Stash album - Album already in stash`)
                test.todo(`Retrieve stashed album - Empty album`)
                test.todo(`Retrieve stashed album - Non-empty album`)
                test.todo(`Retrieve stashed album - Album not in stash`)
            })
        })
    });

});