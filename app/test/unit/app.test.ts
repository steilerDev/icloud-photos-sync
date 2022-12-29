import mockfs from 'mock-fs';
import fs from 'fs';
import {describe, test, expect, jest, beforeEach, afterEach} from '@jest/globals';
import {rejectOptions, validOptions} from '../_helpers/app-factory.helper';
import {ArchiveApp, SyncApp, TokenApp} from '../../src/app/icloud-app';
import {appFactory} from '../../src/app/factory';
import {Asset} from '../../src/lib/photos-library/model/asset';
import {Album} from '../../src/lib/photos-library/model/album';
import {iCloudAuthError, SyncError, TokenError} from '../../src/app/error/types';

describe(`Unit Tests - iCloud App`, () => {
    beforeEach(() => {
        mockfs();
    });

    afterEach(() => {
        mockfs.restore();
    });

    describe(`App Factory`, () => {
        test.each(rejectOptions)(`Reject CLI: $_desc`, ({options, _desc}) => {
            const mockExit = jest.spyOn(process, `exit`).mockImplementation(() => {
                throw new Error(`Process Exit`);
            });
            const mockStderr = jest.spyOn(process.stderr, `write`).mockImplementation(() => true);

            expect(() => appFactory(options)).toThrowError(`Process Exit`);

            expect(mockExit).toHaveBeenCalledWith(1);
            expect(mockStderr).toBeCalled();
            mockExit.mockRestore();
            mockStderr.mockRestore();
        });

        test(`Create Token App`, () => {
            const tokenApp = appFactory(validOptions.token);
            expect(tokenApp).toBeInstanceOf(TokenApp);
            expect(tokenApp.icloud).toBeDefined();
            expect(tokenApp.icloud.mfaServer).toBeDefined();
            expect(tokenApp.icloud.auth).toBeDefined();
            expect(fs.existsSync(`/opt/icloud-photos-library`));
        });

        test(`Create Sync App`, () => {
            const syncApp = appFactory(validOptions.sync);
            expect(syncApp).toBeInstanceOf(SyncApp);
            expect(syncApp.icloud).toBeDefined();
            expect(syncApp.icloud.mfaServer).toBeDefined();
            expect(syncApp.icloud.auth).toBeDefined();
            expect((syncApp as SyncApp).photosLibrary).toBeDefined();
            expect((syncApp as SyncApp).syncEngine).toBeDefined();
        });

        test(`Create Archive App`, () => {
            const archiveApp = appFactory(validOptions.archive);
            expect(archiveApp).toBeInstanceOf(ArchiveApp);
            expect(archiveApp.icloud).toBeDefined();
            expect(archiveApp.icloud.mfaServer).toBeDefined();
            expect(archiveApp.icloud.auth).toBeDefined();
            expect((archiveApp as ArchiveApp).photosLibrary).toBeDefined();
            expect((archiveApp as ArchiveApp).syncEngine).toBeDefined();
            expect((archiveApp as ArchiveApp).archiveEngine).toBeDefined();
        });
    });

    describe(`App control flow`, () => {
        test(`Handle authentication error`, async () => {
            const tokenApp = appFactory(validOptions.token);
            tokenApp.errorHandler.handle = jest.fn(_err => Promise.resolve());
            tokenApp.icloud.authenticate = jest.fn(() => Promise.reject());
            await tokenApp.run();
            expect(tokenApp.errorHandler.handle).toHaveBeenCalledWith(new SyncError(`Init failed`, `FATAL`));
        });

        describe(`Token App`, () => {
            test(`Execute token actions`, async () => {
                const tokenApp = appFactory(validOptions.token);
                tokenApp.icloud.authenticate = jest.fn(() => Promise.resolve());
                tokenApp.icloud.auth.validateAccountTokens = jest.fn();

                await tokenApp.run();
                expect(tokenApp.icloud.authenticate).toHaveBeenCalledTimes(1);
                expect(tokenApp.icloud.auth.validateAccountTokens).toHaveBeenCalledTimes(1);
                expect(tokenApp.cliInterface.print).toBeCalledTimes(2);
            });

            test(`Handle trust token error`, async () => {
                const tokenApp = appFactory(validOptions.token);
                tokenApp.icloud.authenticate = jest.fn(() => Promise.resolve());
                tokenApp.errorHandler.handle = jest.fn(_err => Promise.resolve());
                tokenApp.icloud.auth.validateAccountTokens = jest.fn(() => {
                    throw new iCloudAuthError(``, `FATAL`);
                });

                await tokenApp.run();
                expect(tokenApp.errorHandler.handle).toHaveBeenCalledWith(new TokenError(`Unable to validate account token`, `FATAL`));

                expect(tokenApp.icloud.authenticate).toHaveBeenCalledTimes(1);
                expect(tokenApp.icloud.auth.validateAccountTokens).toHaveBeenCalledTimes(1);
            });
        });

        describe(`Sync App`, () => {
            test(`Execute sync actions`, async () => {
                const syncApp = appFactory(validOptions.sync) as SyncApp;
                syncApp.icloud.authenticate = jest.fn(() => Promise.resolve());
                syncApp.syncEngine.sync = jest.fn(() => Promise.resolve([[], []] as [Asset[], Album[]]));

                await syncApp.run();

                expect(syncApp.icloud.authenticate).toHaveBeenCalledTimes(1);
                expect(syncApp.syncEngine.sync).toHaveBeenCalledTimes(1);
            });

            test(`Handle sync error`, async () => {
                const syncApp = appFactory(validOptions.sync) as SyncApp;
                syncApp.icloud.authenticate = jest.fn(() => Promise.resolve());
                syncApp.syncEngine.sync = jest.fn(() => Promise.reject(new Error()));
                syncApp.errorHandler.handle = jest.fn(_err => Promise.resolve());

                await syncApp.run();

                expect(syncApp.icloud.authenticate).toHaveBeenCalledTimes(1);
                expect(syncApp.syncEngine.sync).toHaveBeenCalledTimes(1);
                expect(syncApp.errorHandler.handle).toHaveBeenCalledWith(new SyncError(`Sync failed`, `FATAL`));
            });
        });

        describe(`Archive App`, () => {
            test(`Execute archive actions`, async () => {
                const archiveApp = appFactory(validOptions.archive) as ArchiveApp;
                archiveApp.icloud.authenticate = jest.fn(() => Promise.resolve());
                const remoteState = [{"fileChecksum": `someChecksum`}] as Asset[];
                archiveApp.syncEngine.sync = jest.fn(() => Promise.resolve([remoteState, []] as [Asset[], Album[]]));
                archiveApp.archiveEngine.archivePath = jest.fn(() => Promise.resolve());

                await archiveApp.run();

                expect(archiveApp.icloud.authenticate).toHaveBeenCalledTimes(1);
                expect(archiveApp.syncEngine.sync).toHaveBeenCalledTimes(1);
                expect(archiveApp.archiveEngine.archivePath).toHaveBeenCalledWith(validOptions.archive[validOptions.archive.length - 1], remoteState);
            });

            test(`Handle archive error`, async () => {
                const archiveApp = appFactory(validOptions.archive) as ArchiveApp;
                archiveApp.icloud.authenticate = jest.fn(() => Promise.resolve());
                archiveApp.syncEngine.sync = jest.fn(() => Promise.resolve([[], []] as [Asset[], Album[]]));
                archiveApp.archiveEngine.archivePath = jest.fn(() => Promise.reject(new Error()));
                archiveApp.errorHandler.handle = jest.fn(_err => Promise.resolve());

                await archiveApp.run();

                expect(archiveApp.icloud.authenticate).toHaveBeenCalledTimes(1);
                expect(archiveApp.syncEngine.sync).toHaveBeenCalledTimes(1);
                expect(archiveApp.archiveEngine.archivePath).toHaveBeenCalledTimes(1);
                expect(archiveApp.errorHandler.handle).toHaveBeenCalledWith(new Error(`Archive failed`));
            });
        });
    });
});