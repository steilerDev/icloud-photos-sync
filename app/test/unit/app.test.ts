import mockfs from 'mock-fs';
import fs from 'fs';
import {describe, test, expect, jest, beforeEach, afterEach} from '@jest/globals';
import {nonRejectOptions, rejectOptions, validOptions} from '../_helpers/app-factory.helper';
import {ArchiveApp, DaemonApp, DaemonAppEvents, LIBRARY_LOCK_FILE, SyncApp, TokenApp} from '../../src/app/icloud-app';
import {appFactory} from '../../src/app/factory';
import {Asset} from '../../src/lib/photos-library/model/asset';
import {Album} from '../../src/lib/photos-library/model/album';
import {prepareResourceManager, spyOnEvent} from '../_helpers/_general';
import {EVENTS} from '../../src/lib/icloud/constants';
import path from 'path';
import {setupLogger} from '../_mocks/logger';
import {ResourceManager} from '../../src/lib/resource-manager/resource-manager';

beforeEach(() => {
    prepareResourceManager(false);
    jest.clearAllMocks();
});

afterEach(() => {
    mockfs.restore();
});

describe(`App Factory`, () => {
    test.each(rejectOptions)(`Reject CLI: $_desc`, ({options, expected}) => {
        const originalFunction = ResourceManager.setup;
        ResourceManager.setup = jest.fn<typeof ResourceManager.setup>();
        const mockExit = jest.spyOn(process, `exit`).mockImplementation(() => {
            throw new Error(`Process Exit`);
        });
        const mockStderr = jest.spyOn(process.stderr, `write`).mockImplementation(() => true);

        expect(() => appFactory(options)).toThrow(/^Process Exit$/);

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(mockStderr).toBeCalledWith(expected);
        expect(ResourceManager.setup).not.toHaveBeenCalled();

        ResourceManager.setup = originalFunction;
    });

    describe.each([{
        command: [`token`],
        _appType: `token`,
    }, {
        command: [`sync`],
        _appType: `sync`,
    }, {
        command: [`daemon`],
        _appType: `daemon`,
    }, {
        command: [`archive`, `/some/valid/path`],
        _appType: `archive`,
    }])(`Valid CLI for $_appType app`, ({command}) => {
        test.each(nonRejectOptions)(`$_desc`, ({options, expectedOptions}) => {
            const setupSpy = jest.spyOn(ResourceManager, `setup`);
            appFactory([...options, ...command]);
            expect(setupSpy).toHaveBeenCalledWith(expectedOptions);
        });
    });

    test(`Create Token App`, () => {
        const tokenApp = appFactory(validOptions.token) as TokenApp;

        expect(tokenApp).toBeInstanceOf(TokenApp);
        expect(setupLogger).toHaveBeenCalledTimes(1);
        expect(tokenApp.icloud).toBeDefined();
        expect(tokenApp.icloud.mfaServer).toBeDefined();
        expect(tokenApp.icloud.auth).toBeDefined();
        expect(ResourceManager._instance).toBeDefined();
        expect(fs.existsSync(`/opt/icloud-photos-library`));
    });

    test(`Create Sync App`, () => {
        const syncApp = appFactory(validOptions.sync) as SyncApp;

        expect(syncApp).toBeInstanceOf(SyncApp);
        expect(setupLogger).toHaveBeenCalledTimes(1);
        expect(syncApp.icloud).toBeDefined();
        expect(syncApp.icloud.mfaServer).toBeDefined();
        expect(syncApp.icloud.auth).toBeDefined();
        expect(ResourceManager._instance).toBeDefined();
        expect(syncApp.photosLibrary).toBeDefined();
        expect(syncApp.syncEngine).toBeDefined();
        expect(fs.existsSync(`/opt/icloud-photos-library`));
    });

    test(`Create Archive App`, () => {
        const archiveApp = appFactory(validOptions.archive) as ArchiveApp;

        expect(archiveApp).toBeInstanceOf(ArchiveApp);
        expect(setupLogger).toHaveBeenCalledTimes(1);
        expect(archiveApp.icloud).toBeDefined();
        expect(archiveApp.icloud.mfaServer).toBeDefined();
        expect(archiveApp.icloud.auth).toBeDefined();
        expect(ResourceManager._instance).toBeDefined();
        expect(archiveApp.photosLibrary).toBeDefined();
        expect(archiveApp.syncEngine).toBeDefined();
        expect(archiveApp.archiveEngine).toBeDefined();
        expect(fs.existsSync(`/opt/icloud-photos-library`));
    });

    test(`Create Daemon App`, () => {
        const daemonApp = appFactory(validOptions.daemon) as DaemonApp;

        expect(daemonApp).toBeInstanceOf(DaemonApp);
        expect(ResourceManager._instance).toBeDefined();
        expect(setupLogger).toHaveBeenCalledTimes(1);
        expect(daemonApp.event).toBeDefined();
    });
});

describe(`App control flow`, () => {
    test(`Handle authentication error`, async () => {
        const tokenApp = appFactory(validOptions.token) as TokenApp;
        tokenApp.acquireLibraryLock = jest.fn(() => Promise.resolve());
        tokenApp.icloud.authenticate = jest.fn(() => Promise.reject(new Error()));
        tokenApp.releaseLibraryLock = jest.fn(() => Promise.resolve());

        await expect(tokenApp.run()).rejects.toThrow(/^Unable to acquire trust token$/);

        expect(tokenApp.acquireLibraryLock).toHaveBeenCalledTimes(1);
        expect(tokenApp.releaseLibraryLock).toHaveBeenCalledTimes(1);
    });

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
            const remoteState = [{fileChecksum: `someChecksum`}] as Asset[];
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
            ResourceManager.instance._appOptions.schedule = `*/1 * * * * *`; // Every second
            const eventsScheduledEvent = spyOnEvent(daemonApp.event, DaemonAppEvents.EVENTS.SCHEDULED);

            await daemonApp.run();

            expect(eventsScheduledEvent).toHaveBeenCalledTimes(1);
            // Waiting 2 seconds to make sure schedule ran at least once
            await new Promise(r => setTimeout(r, 2000));
            expect(daemonApp.performScheduledSync).toHaveBeenCalled();

            daemonApp.job?.stop();
        });

        test(`Scheduled sync succeeds`, async () => {
            const daemonApp = appFactory(validOptions.daemon) as DaemonApp;
            const successEvent = spyOnEvent(daemonApp.event, DaemonAppEvents.EVENTS.DONE);

            const syncApp = new SyncApp();
            syncApp.run = jest.fn(() => Promise.resolve());

            await daemonApp.performScheduledSync([], syncApp);

            expect(syncApp.run).toHaveBeenCalled();
            expect(successEvent).toHaveBeenCalled();
        });

        test(`Scheduled sync fails`, async () => {
            const daemonApp = appFactory(validOptions.daemon) as DaemonApp;
            const retryEvent = spyOnEvent(daemonApp.event, DaemonAppEvents.EVENTS.RETRY);

            const syncApp = new SyncApp();
            syncApp.run = jest.fn(() => Promise.reject());

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

        const lockFile = (await fs.promises.readFile(path.join(ResourceManager.instance.dataDir, LIBRARY_LOCK_FILE), {encoding: `utf-8`})).toString();
        expect(lockFile).toEqual(thisPID);
    });

    test(`Acquire lock error - already locked`, async () => {
        const tokenApp = appFactory(validOptions.token) as TokenApp;
        const notThisPID = (process.pid + 1).toString();

        mockfs({
            [ResourceManager.instance.dataDir]: {
                [LIBRARY_LOCK_FILE]: notThisPID,
            },
        });

        await expect(tokenApp.acquireLibraryLock()).rejects.toThrow(/^Library locked. Use --force \(or FORCE env variable\) to forcefully remove the lock$/);
        expect(fs.existsSync(path.join(ResourceManager.instance.dataDir, LIBRARY_LOCK_FILE))).toBeTruthy();
    });

    test(`Acquire lock warning - already locked with --force`, async () => {
        const tokenApp = appFactory(validOptions.tokenWithForce) as TokenApp;
        const thisPID = process.pid.toString();
        const notThisPID = (process.pid + 1).toString();

        mockfs({
            [ResourceManager.instance.dataDir]: {
                [LIBRARY_LOCK_FILE]: notThisPID,
            },
        });

        await tokenApp.acquireLibraryLock();

        const lockFile = (await fs.promises.readFile(path.join(ResourceManager.instance.dataDir, LIBRARY_LOCK_FILE), {encoding: `utf-8`})).toString();
        expect(lockFile).toEqual(thisPID);
    });

    test(`Release lock`, async () => {
        const tokenApp = appFactory(validOptions.token) as TokenApp;
        const thisPID = process.pid.toString();

        mockfs({
            [ResourceManager.instance.dataDir]: {
                [LIBRARY_LOCK_FILE]: thisPID,
            },
        });

        await tokenApp.releaseLibraryLock();

        expect(fs.existsSync(path.join(ResourceManager.instance.dataDir, LIBRARY_LOCK_FILE))).toBeFalsy();
    });

    test(`Release lock error - not this process' lock`, async () => {
        const tokenApp = appFactory(validOptions.token) as TokenApp;
        const notThisPID = (process.pid + 1).toString();

        mockfs({
            [ResourceManager.instance.dataDir]: {
                [LIBRARY_LOCK_FILE]: notThisPID,
            },
        });

        await expect(tokenApp.releaseLibraryLock()).rejects.toThrow(/^Library locked. Use --force \(or FORCE env variable\) to forcefully remove the lock$/);

        expect(fs.existsSync(path.join(ResourceManager.instance.dataDir, LIBRARY_LOCK_FILE))).toBeTruthy();
    });

    test(`Release lock error - not this process' lock --force`, async () => {
        const tokenApp = appFactory(validOptions.tokenWithForce) as TokenApp;
        const notThisPID = (process.pid + 1).toString();

        mockfs({
            [ResourceManager.instance.dataDir]: {
                [LIBRARY_LOCK_FILE]: notThisPID,
            },
        });

        await tokenApp.releaseLibraryLock();

        expect(fs.existsSync(path.join(ResourceManager.instance.dataDir, LIBRARY_LOCK_FILE))).toBeFalsy();
    });

    test(`Release lock error - no lock`, async () => {
        const tokenApp = appFactory(validOptions.token) as TokenApp;

        await expect(tokenApp.releaseLibraryLock()).resolves.toBeUndefined();

        expect(!fs.existsSync(path.join(ResourceManager.instance.dataDir, LIBRARY_LOCK_FILE))).toBeTruthy();
    });
});