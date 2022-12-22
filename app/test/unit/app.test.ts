import mockfs from 'mock-fs';
import fs from 'fs';
import {describe, test, expect, jest, beforeEach, afterEach} from '@jest/globals';
import {rejectOptions, validOptions} from '../_helpers/app-factory.helper';
import {ArchiveApp, SyncApp, TokenApp} from '../../src/app/icloud-app';
import {appFactory} from '../../src/app/factory';

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
        test.todo(`Handle authentication error`);
        describe(`Token App`, () => {
            test.todo(`Execute token actions`);
            test.todo(`Handle trust token error`);
        });
        describe(`Sync App`, () => {
            test.todo(`Execute sync actions`);
            test.todo(`Handle sync error`);
        });
        describe(`Archive App`, () => {
            test.todo(`Execute archive actions`);
            test.todo(`Handle archive error`);
        });
    });
});