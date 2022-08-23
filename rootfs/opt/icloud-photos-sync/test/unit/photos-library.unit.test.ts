import mockfs from 'mock-fs';
import fs from 'fs';
import {expect, describe, test, afterEach} from '@jest/globals';
import {PhotosLibrary} from '../../src/lib/photos-library/photos-library';
import {ASSET_DIR} from '../../src/lib/photos-library/constants';
import path from 'path';

const photosDataDir = `/media/files/photos-library`;
const assetDir = path.join(photosDataDir, ASSET_DIR);

describe(`Unit Tests - Photos Library`, () => {
    afterEach(() => {
        mockfs.restore();
    });

    test(`Should create missing directories`, () => {
        mockfs();
        const opts = {
            "dataDir": photosDataDir,
        };
        const _library = new PhotosLibrary(opts);
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
            test(`Load empty state`, async () => {
                mockfs();
                const opts = {
                    "dataDir": photosDataDir,
                };
                const library = new PhotosLibrary(opts);
                const assets = await library.loadAssets();
                expect(Object.keys(assets).length).toEqual(0);
            });

            test(`Load valid state`, async () => {
                mockfs({
                    [assetDir]: {
                        "Aa7_yox97ecSUNmVw0xP4YzIDDKf.jpeg": Buffer.from([1, 1, 1, 1]),
                        "AaGv15G3Cp9LPMQQfFZiHRryHgjU.jpeg": Buffer.from([1, 1, 1, 1, 1]),
                        "Aah0dUnhGFNWjAeqKEkB_SNLNpFf.jpeg": Buffer.from([1, 1, 1, 1, 1, 1]),
                    },
                });
                const opts = {
                    "dataDir": photosDataDir,
                };
                const library = new PhotosLibrary(opts);
                const assets = await library.loadAssets();
                expect(Object.keys(assets).length).toEqual(3);
            });

            test(`Load in-valid state`, async () => {
                mockfs({
                    [assetDir]: {
                        "Aa7_yox97ecSUNmVw0xP4YzIDDKf.jpeg": Buffer.from([1, 1, 1, 1]),
                        "AaGv15G3Cp9LPMQQfFZiHRryHgjU.jpeg": Buffer.from([1, 1, 1, 1, 1]),
                        "Aah0dUnhGFNWjAeqKEkB_SNLNpFf": Buffer.from([1, 1, 1, 1, 1, 1]), // No file extension
                        "Aah0dUnhGFNWjAeqKEkB_SNLNpFf.pdf": Buffer.from([1, 1, 1, 1, 1, 1]), // Invalid file extension
                        "Aah0dUnhGFNWjAeqKEkB_SNLNpF-f": Buffer.from([1, 1, 1, 1, 1, 1]), // Invalid file name
                    },
                });
                const opts = {
                    "dataDir": photosDataDir,
                };
                const library = new PhotosLibrary(opts);
                const assets = await library.loadAssets();
                expect(Object.keys(assets).length).toEqual(2);
            });
        });

        describe(`Load albums`, () => {
            test.todo(`Load valid state - no archives`);
            test.todo(`Load valid state - with archives`);

            test.todo(`Load in-valid state`);

            describe(`Album type detection`, () => {
                test.todo(`Identify album type`);
                test.todo(`Identify folder type`);
                test.todo(`Identify archived type`);
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