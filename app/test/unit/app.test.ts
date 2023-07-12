import mockfs from 'mock-fs';
import fs from 'fs';
import {describe, test, expect, jest, beforeEach, afterEach} from '@jest/globals';
import {nonRejectOptions, rejectOptions, validOptions} from '../_helpers/app-factory.helper';
import {ArchiveApp, DaemonApp, DaemonAppEvents, LIBRARY_LOCK_FILE, SyncApp, TokenApp} from '../../src/app/icloud-app';
import {appFactory} from '../../src/app/factory';
import {Asset} from '../../src/lib/photos-library/model/asset';
import {Album} from '../../src/lib/photos-library/model/album';
import {spyOnEvent} from '../_helpers/_general';
import {EVENTS,DEFAULT_HEADER} from '../../src/lib/icloud/constants';
import path from 'path';
import {setupLogger} from '../_mocks/logger';

beforeEach(() => {
    mockfs();
    jest.clearAllMocks();
});

afterEach(() => {
    mockfs.restore();
});

describe(`App Factory`, () => {
    test.each(rejectOptions)(`Reject CLI: $_desc`, ({options, expected}) => {
        const mockExit = jest.spyOn(process, `exit`).mockImplementation(() => {
            throw new Error(`Process Exit`);
        });
        const mockStderr = jest.spyOn(process.stderr, `write`).mockImplementation(() => true);

        expect(() => appFactory(options)).toThrow(/^Process Exit$/);

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(mockStderr).toBeCalledWith(expected);
    });

    test.each(nonRejectOptions)(`Valid CLI: $_desc`, ({options, expectedKey, expectedValue}) => {
        const app = appFactory(options);
        expect(app.options[expectedKey]).toEqual(expectedValue);
    });

    test(`Create Token App`, () => {
        const tokenApp = appFactory(validOptions.token) as TokenApp;
        expect(tokenApp).toBeInstanceOf(TokenApp);
        expect(setupLogger).toHaveBeenCalledTimes(1);
        expect(tokenApp.icloud).toBeDefined();
        expect(tokenApp.icloud.mfaServer).toBeDefined();
        expect(tokenApp.icloud.auth).toBeDefined();
        expect(DEFAULT_HEADER.Origin).toEqual('https://www.icloud.com');
        expect(fs.existsSync(`/opt/icloud-photos-library`));
    });

    test(`Create Token App China`, () => {
        const tokenApp = appFactory(validOptions.token_china) as TokenApp;
        expect(tokenApp).toBeInstanceOf(TokenApp);
        expect(setupLogger).toHaveBeenCalledTimes(1);
        expect(tokenApp.icloud).toBeDefined();
        expect(tokenApp.icloud.mfaServer).toBeDefined();
        expect(tokenApp.icloud.auth).toBeDefined();
        expect(DEFAULT_HEADER.Origin).toEqual('https://www.icloud.com.cn');
        expect(fs.existsSync(`/opt/icloud-photos-library`));
    });

    test(`Create Sync App`, () => {
        const syncApp = appFactory(validOptions.sync) as SyncApp;
        expect(syncApp).toBeInstanceOf(SyncApp);
        expect(setupLogger).toHaveBeenCalledTimes(1);
        expect(syncApp.icloud).toBeDefined();
        expect(syncApp.icloud.mfaServer).toBeDefined();
        expect(syncApp.icloud.auth).toBeDefined();
        expect(syncApp.photosLibrary).toBeDefined();
        expect(syncApp.syncEngine).toBeDefined();
        expect(DEFAULT_HEADER.Origin).toEqual('https://www.icloud.com');
        expect(fs.existsSync(`/opt/icloud-photos-library`));
    });

    test(`Create Sync App China`, () => {
        const syncApp = appFactory(validOptions.sync_china) as SyncApp;
        expect(syncApp).toBeInstanceOf(SyncApp);
        expect(setupLogger).toHaveBeenCalledTimes(1);
        expect(syncApp.icloud).toBeDefined();
        expect(syncApp.icloud.mfaServer).toBeDefined();
        expect(syncApp.icloud.auth).toBeDefined();
        expect(syncApp.photosLibrary).toBeDefined();
        expect(syncApp.syncEngine).toBeDefined();
        expect(DEFAULT_HEADER.Origin).toEqual('https://www.icloud.com.cn');
        expect(fs.existsSync(`/opt/icloud-photos-library`));
    });

    test(`Create Archive App`, () => {
        const archiveApp = appFactory(validOptions.archive) as ArchiveApp;
        expect(archiveApp).toBeInstanceOf(ArchiveApp);
        expect(setupLogger).toHaveBeenCalledTimes(1);
        expect(archiveApp.icloud).toBeDefined();
        expect(archiveApp.icloud.mfaServer).toBeDefined();
        expect(archiveApp.icloud.auth).toBeDefined();
        expect(archiveApp.photosLibrary).toBeDefined();
        expect(archiveApp.syncEngine).toBeDefined();
        expect(archiveApp.archiveEngine).toBeDefined();
        expect(DEFAULT_HEADER.Origin).toEqual(`https://www.icloud.com`);
        expect(fs.existsSync(`/opt/icloud-photos-library`));
    });

    test(`Create Archive App China`, () => {
        const archiveApp = appFactory(validOptions.archive_china) as ArchiveApp;
        expect(archiveApp).toBeInstanceOf(ArchiveApp);
        expect(setupLogger).toHaveBeenCalledTimes(1);
        expect(archiveApp.icloud).toBeDefined();
        expect(archiveApp.icloud.mfaServer).toBeDefined();
        expect(archiveApp.icloud.auth).toBeDefined();
        expect(archiveApp.photosLibrary).toBeDefined();
        expect(archiveApp.syncEngine).toBeDefined();
        expect(archiveApp.archiveEngine).toBeDefined();
        expect(DEFAULT_HEADER.Origin).toEqual(`https://www.icloud.com.cn`);
        expect(fs.existsSync(`/opt/icloud-photos-library`));
    });

    test(`Create Daemon App`, () => {
        const daemonApp = appFactory(validOptions.daemon) as DaemonApp;
        expect(daemonApp).toBeInstanceOf(DaemonApp);
        expect(setupLogger).toHaveBeenCalledTimes(1);
        expect(daemonApp.event).toBeDefined();
        expect(DEFAULT_HEADER.Origin).toEqual('https://www.icloud.com');
    });

    test(`Create Daemon App China`, () => {
        const daemonApp = appFactory(validOptions.daemon_china) as DaemonApp;
        expect(daemonApp).toBeInstanceOf(DaemonApp);
        expect(setupLogger).toHaveBeenCalledTimes(1);
        expect(daemonApp.event).toBeDefined();
        expect(DEFAULT_HEADER.Origin).toEqual('https://www.icloud.com.cn');
    });
});

describe(`App control flow`, () => {


    test(`Handle lock acquisition error`, async () => {
        const tokenApp = appFactory(validOptions.token) as TokenApp;
        tokenApp.acquireLibraryLock = jest.fn(() => Promise.reject(new Error()));
        tokenApp.icloud.authenticate = jest.fn(() => Promise.resolve());
        tokenApp.releaseLibraryLock = jest.fn(() => Promise.resolve());

        await expect(tokenApp.run()).rejects.toThrow(/^Unable to acquire trust token$/);

        expect(tokenApp.acquireLibraryLock).toHaveBeenCalledTimes(1);
        expect(tokenApp.releaseLibraryLock).toHaveBeenCalledTimes(1);
        expect(tokenApp.icloud.authenticate).not.toHaveBeenCalled();
    });

    describe(`Token App`, () => {
        test(`Execute token actions`, async () => {
            const tokenApp = appFactory(validOptions.token) as TokenApp;
            tokenApp.acquireLibraryLock = jest.fn(() => Promise.resolve());
            tokenApp.icloud.authenticate = jest.fn(() => Promise.resolve());
            tokenApp.icloud.auth.validateAccountTokens = jest.fn();
            tokenApp.releaseLibraryLock = jest.fn(() => Promise.resolve());

            const tokenEvent = spyOnEvent(tokenApp.icloud, EVENTS.TOKEN);

            await tokenApp.run();

            expect(tokenApp.acquireLibraryLock).toHaveBeenCalledTimes(1);
            expect(tokenApp.icloud.authenticate).toHaveBeenCalledTimes(1);
            expect(tokenApp.icloud.auth.validateAccountTokens).toHaveBeenCalledTimes(1);
            expect(tokenApp.releaseLibraryLock).toHaveBeenCalledTimes(1);

            expect(tokenEvent).toHaveBeenCalledTimes(1);
        });
    });

    describe(`Sync App`, () => {
        test(`Execute sync actions`, async () => {
            const syncApp = appFactory(validOptions.sync) as SyncApp;
            syncApp.acquireLibraryLock = jest.fn(() => Promise.resolve());
            syncApp.icloud.authenticate = jest.fn(() => Promise.resolve());
            syncApp.syncEngine.sync = jest.fn(() => Promise.resolve([[], []] as [Asset[], Album[]]));
            syncApp.releaseLibraryLock = jest.fn(() => Promise.resolve());

            await syncApp.run();

            expect(syncApp.acquireLibraryLock).toHaveBeenCalledTimes(1);
            expect(syncApp.icloud.authenticate).toHaveBeenCalledTimes(1);
            expect(syncApp.syncEngine.sync).toHaveBeenCalledTimes(1);
            expect(syncApp.releaseLibraryLock).toHaveBeenCalledTimes(1);
        });

        test(`Handle sync error`, async () => {
            const syncApp = appFactory(validOptions.sync) as SyncApp;
            syncApp.acquireLibraryLock = jest.fn(() => Promise.resolve());
            syncApp.icloud.authenticate = jest.fn(() => Promise.resolve());
            syncApp.syncEngine.sync = jest.fn(() => Promise.reject(new Error()));
            syncApp.releaseLibraryLock = jest.fn(() => Promise.resolve());

            await expect(syncApp.run()).rejects.toThrow(/^Sync failed$/);

            expect(syncApp.acquireLibraryLock).toHaveBeenCalledTimes(1);
            expect(syncApp.icloud.authenticate).toHaveBeenCalledTimes(1);
            expect(syncApp.syncEngine.sync).toHaveBeenCalledTimes(1);
            expect(syncApp.releaseLibraryLock).toHaveBeenCalledTimes(1);
        });
    });

    describe(`Archive App`, () => {
        test(`Execute archive actions`, async () => {
            const archiveApp = appFactory(validOptions.archive) as ArchiveApp;
            archiveApp.acquireLibraryLock = jest.fn(() => Promise.resolve());
            archiveApp.icloud.authenticate = jest.fn(() => Promise.resolve());
            const remoteState = [{"fileChecksum": `someChecksum`}] as Asset[];
            archiveApp.syncEngine.sync = jest.fn(() => Promise.resolve([remoteState, []] as [Asset[], Album[]]));
            archiveApp.archiveEngine.archivePath = jest.fn(() => Promise.resolve());
            archiveApp.releaseLibraryLock = jest.fn(() => Promise.resolve());

            await archiveApp.run();

            expect(archiveApp.acquireLibraryLock).toHaveBeenCalledTimes(1);
            expect(archiveApp.icloud.authenticate).toHaveBeenCalledTimes(1);
            expect(archiveApp.syncEngine.sync).toHaveBeenCalledTimes(1);
            expect(archiveApp.archiveEngine.archivePath).toHaveBeenCalledWith(validOptions.archive[validOptions.archive.length - 1], remoteState);
            expect(archiveApp.releaseLibraryLock).toHaveBeenCalledTimes(1);
        });

        test(`Handle archive error`, async () => {
            const archiveApp = appFactory(validOptions.archive) as ArchiveApp;
            archiveApp.acquireLibraryLock = jest.fn(() => Promise.resolve());
            archiveApp.icloud.authenticate = jest.fn(() => Promise.resolve());
            archiveApp.syncEngine.sync = jest.fn(() => Promise.resolve([[], []] as [Asset[], Album[]]));
            archiveApp.archiveEngine.archivePath = jest.fn(() => Promise.reject(new Error()));
            archiveApp.releaseLibraryLock = jest.fn(() => Promise.resolve());

            await expect(archiveApp.run()).rejects.toThrow(/^Archive failed$/);

            expect(archiveApp.acquireLibraryLock).toHaveBeenCalledTimes(1);
            expect(archiveApp.icloud.authenticate).toHaveBeenCalledTimes(1);
            expect(archiveApp.syncEngine.sync).toHaveBeenCalledTimes(1);
            expect(archiveApp.archiveEngine.archivePath).toHaveBeenCalledTimes(1);
            expect(archiveApp.releaseLibraryLock).toHaveBeenCalledTimes(1);
        });
    });

    describe(`Daemon App`, () => {
        test(`Schedule job`, async () => {
            const daemonApp = appFactory(validOptions.daemon) as DaemonApp;
            daemonApp.performScheduledSync = jest.fn(() => Promise.resolve());
            daemonApp.options.schedule = `*/1 * * * * *`; // Every second
            const eventsScheduledEvent = spyOnEvent(daemonApp.event, DaemonAppEvents.EVENTS.SCHEDULED);

            await daemonApp.run();

            expect(eventsScheduledEvent).toHaveBeenCalledTimes(1);
            // Waiting 2 seconds to make sure schedule ran at least once
            await new Promise(r => setTimeout(r, 2000));
            expect(daemonApp.performScheduledSync).toHaveBeenCalled();

            daemonApp.job?.stop();
        });

        test(`Scheduled sync succeeds`, async () => {
            const syncApp = appFactory(validOptions.sync) as SyncApp;
            syncApp.run = jest.fn(() => Promise.resolve());

            const daemonApp = appFactory(validOptions.daemon) as DaemonApp;
            const successEvent = spyOnEvent(daemonApp.event, DaemonAppEvents.EVENTS.DONE);

            await daemonApp.performScheduledSync([], syncApp);

            expect(syncApp.run).toHaveBeenCalled();
            expect(successEvent).toHaveBeenCalled();
        });

        test(`Scheduled sync fails`, async () => {
            const syncApp = appFactory(validOptions.sync) as SyncApp;
            syncApp.run = jest.fn(() => Promise.reject());

            const daemonApp = appFactory(validOptions.daemon) as DaemonApp;
            const retryEvent = spyOnEvent(daemonApp.event, DaemonAppEvents.EVENTS.RETRY);

            await daemonApp.performScheduledSync([], syncApp);

            expect(syncApp.run).toHaveBeenCalled();
            expect(retryEvent).toHaveBeenCalled();
        });
    });
});

describe(`Library Lock`, () => {
    test(`Acquire lock`, async () => {
        const tokenApp = appFactory(validOptions.token) as TokenApp;
        const thisPID = process.pid.toString();

        await tokenApp.acquireLibraryLock();

        const lockFile = (await fs.promises.readFile(path.join(tokenApp.options.dataDir, LIBRARY_LOCK_FILE), {"encoding": `utf-8`})).toString();
        expect(lockFile).toEqual(thisPID);
    });

    test(`Acquire lock error - already locked`, async () => {
        const tokenApp = appFactory(validOptions.token) as TokenApp;
        const notThisPID = (process.pid + 1).toString();

        mockfs({
            [tokenApp.options.dataDir]: {
                [LIBRARY_LOCK_FILE]: notThisPID,
            },
        });

        await expect(tokenApp.acquireLibraryLock()).rejects.toThrow(/^Library locked. Use --force \(or FORCE env variable\) to forcefully remove the lock$/);
        expect(fs.existsSync(path.join(tokenApp.options.dataDir, LIBRARY_LOCK_FILE))).toBeTruthy();
    });

    test(`Acquire lock warning - already locked with --force`, async () => {
        const tokenApp = appFactory(validOptions.tokenWithForce) as TokenApp;
        const thisPID = process.pid.toString();
        const notThisPID = (process.pid + 1).toString();

        mockfs({
            [tokenApp.options.dataDir]: {
                [LIBRARY_LOCK_FILE]: notThisPID,
            },
        });

        await tokenApp.acquireLibraryLock();

        const lockFile = (await fs.promises.readFile(path.join(tokenApp.options.dataDir, LIBRARY_LOCK_FILE), {"encoding": `utf-8`})).toString();
        expect(lockFile).toEqual(thisPID);
    });

    test(`Release lock`, async () => {
        const tokenApp = appFactory(validOptions.token) as TokenApp;
        const thisPID = process.pid.toString();

        mockfs({
            [tokenApp.options.dataDir]: {
                [LIBRARY_LOCK_FILE]: thisPID,
            },
        });

        await tokenApp.releaseLibraryLock();

        expect(fs.existsSync(path.join(tokenApp.options.dataDir, LIBRARY_LOCK_FILE))).toBeFalsy();
    });

    test(`Release lock error - not this process' lock`, async () => {
        const tokenApp = appFactory(validOptions.token) as TokenApp;
        const notThisPID = (process.pid + 1).toString();

        mockfs({
            [tokenApp.options.dataDir]: {
                [LIBRARY_LOCK_FILE]: notThisPID,
            },
        });

        await expect(tokenApp.releaseLibraryLock()).rejects.toThrow(/^Library locked. Use --force \(or FORCE env variable\) to forcefully remove the lock$/);

        expect(fs.existsSync(path.join(tokenApp.options.dataDir, LIBRARY_LOCK_FILE))).toBeTruthy();
    });

    test(`Release lock error - not this process' lock --force`, async () => {
        const tokenApp = appFactory(validOptions.tokenWithForce) as TokenApp;
        const notThisPID = (process.pid + 1).toString();

        mockfs({
            [tokenApp.options.dataDir]: {
                [LIBRARY_LOCK_FILE]: notThisPID,
            },
        });

        await tokenApp.releaseLibraryLock();

        expect(fs.existsSync(path.join(tokenApp.options.dataDir, LIBRARY_LOCK_FILE))).toBeFalsy();
    });

    test(`Release lock error - no lock`, async () => {
        const tokenApp = appFactory(validOptions.token) as TokenApp;

        await expect(tokenApp.releaseLibraryLock()).resolves.toBeUndefined();

        expect(!fs.existsSync(path.join(tokenApp.options.dataDir, LIBRARY_LOCK_FILE))).toBeTruthy();
    });
});