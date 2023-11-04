import mockfs from 'mock-fs';
import fs from 'fs';
import {describe, test, expect, jest, beforeEach, afterEach} from '@jest/globals';
import * as Config from '../_helpers/_config';
import {nonRejectOptions, rejectOptions, validOptions} from '../_helpers/app-factory.helper';
import {ArchiveApp, DaemonApp, SyncApp, TokenApp} from '../../src/app/icloud-app';
import {appFactory} from '../../src/app/factory';
import {Asset} from '../../src/lib/photos-library/model/asset';
import {prepareResources, spyOnEvent} from '../_helpers/_general';
import path from 'path';
import {iCPSEventApp, iCPSEventCloud, iCPSEventRuntimeError} from '../../src/lib/resources/events-types';
import {Resources} from '../../src/lib/resources/main';
import {stdin} from 'mock-stdin';
import {LIBRARY_LOCK_FILE_NAME} from '../../src/lib/resources/resource-types';

beforeEach(() => {
    mockfs();
    prepareResources(false);
});

afterEach(() => {
    mockfs.restore();
    jest.clearAllMocks();
});

describe(`App Factory`, () => {
    test.each(rejectOptions)(`Reject CLI: $_desc`, async ({options, expected}) => {
        const setupSpy = jest.spyOn(Resources, `setup`);
        const mockStderr = jest.spyOn(process.stderr, `write`).mockImplementation(() => true);

        await expect(() => appFactory(options)).rejects.toThrowError(expected);

        expect(mockStderr).toBeCalledWith(expected + `\n`);
        expect(setupSpy).not.toHaveBeenCalled();
    });

    describe.each([{
        desc: `Token App`,
        command: [`token`],
        appType: TokenApp,
    }, {
        desc: `Sync App`,
        command: [`sync`],
        appType: SyncApp,
    }, {
        desc: `Daemon App`,
        command: [`daemon`],
        appType: DaemonApp,
    }, {
        desc: `Archive App`,
        command: [`archive`, `/some/valid/path`],
        appType: ArchiveApp,
    }])(`Valid CLI for $desc app`, ({command, appType}) => {
        test.each(nonRejectOptions)(`$_desc`, async ({options, expectedOptions}) => {
            const setupSpy = jest.spyOn(Resources, `setup`);
            const app = await appFactory([...options, ...command]);
            expect(setupSpy).toHaveBeenCalledWith({...Config.defaultConfig, ...expectedOptions});
            expect(app).toBeInstanceOf(appType);
        });
    });

    test.each([{
        desc: `username`,
        options: [`-p`, `testPass`],
        stdinValue: `test@icloud.com`,
        stdOutValue: `Please enter your AppleID username`,
    }, {
        desc: `password`,
        options: [`-u`, `test@icloud.com`],
        stdinValue: `testPass`,
        stdOutValue: `Please enter your AppleID password`,
    }])(`Asking user to provide $desc`, async ({options, stdinValue, stdOutValue}) => {
        const setupSpy = jest.spyOn(Resources, `setup`);
        const mockStdout = jest.spyOn(process.stdout, `write`).mockImplementation(() => true);
        const mockStdin = stdin();

        const app = appFactory(
            [
                `/usr/bin/node`,
                `/home/icloud-photos-sync/main.js`,
                ...options,
                `token`,
            ],
        );

        mockStdin.send(`${stdinValue}\n`);

        expect(await app).toBeInstanceOf(TokenApp);
        expect(mockStdout).toHaveBeenNthCalledWith(2, expect.stringMatching(new RegExp(`${stdOutValue}`)));
        expect(setupSpy).toHaveBeenCalledWith(Config.defaultConfig);
    });

    test(`Create Token App`, async () => {
        const tokenApp = await appFactory(validOptions.token) as TokenApp;

        expect(tokenApp).toBeInstanceOf(TokenApp);
        expect(tokenApp.icloud).toBeDefined();
        expect(tokenApp.icloud.mfaServer).toBeDefined();
        expect(Resources.manager()).toBeDefined();
        expect(Resources.event()).toBeDefined();
        expect(Resources.validator()).toBeDefined();
        expect(Resources.network()).toBeDefined();
        expect(fs.existsSync(`/opt/icloud-photos-library`));
    });

    test(`Create Sync App`, async () => {
        const syncApp = await appFactory(validOptions.sync) as SyncApp;

        expect(syncApp).toBeInstanceOf(SyncApp);
        expect(syncApp.icloud).toBeDefined();
        expect(syncApp.icloud.mfaServer).toBeDefined();
        expect(Resources.manager()).toBeDefined();
        expect(Resources.event()).toBeDefined();
        expect(Resources.validator()).toBeDefined();
        expect(Resources.network()).toBeDefined();
        expect(syncApp.photosLibrary).toBeDefined();
        expect(syncApp.syncEngine).toBeDefined();
        expect(fs.existsSync(`/opt/icloud-photos-library`));
    });

    test(`Create Archive App`, async () => {
        const archiveApp = await appFactory(validOptions.archive) as ArchiveApp;

        expect(archiveApp).toBeInstanceOf(ArchiveApp);
        expect(archiveApp.icloud).toBeDefined();
        expect(archiveApp.icloud.mfaServer).toBeDefined();
        expect(Resources.manager()).toBeDefined();
        expect(Resources.event()).toBeDefined();
        expect(Resources.validator()).toBeDefined();
        expect(Resources.network()).toBeDefined();
        expect(archiveApp.photosLibrary).toBeDefined();
        expect(archiveApp.syncEngine).toBeDefined();
        expect(archiveApp.archiveEngine).toBeDefined();
        expect(fs.existsSync(`/opt/icloud-photos-library`));
    });

    test(`Create Daemon App`, async () => {
        const daemonApp = await appFactory(validOptions.daemon) as DaemonApp;

        expect(daemonApp).toBeInstanceOf(DaemonApp);
        expect(Resources._instances).toBeDefined();
    });
});

describe(`App control flow`, () => {
    test(`Handle authentication error`, async () => {
        const tokenApp = await appFactory(validOptions.token) as TokenApp;
        tokenApp.acquireLibraryLock = jest.fn<typeof tokenApp.acquireLibraryLock>()
            .mockResolvedValue();
        tokenApp.icloud.authenticate = jest.fn<typeof tokenApp.icloud.authenticate>()
            .mockRejectedValue(new Error(`Authentication failed`));
        tokenApp.releaseLibraryLock = jest.fn<typeof tokenApp.releaseLibraryLock>()
            .mockResolvedValue();
        Resources._instances.network.resetSession = jest.fn<typeof Resources._instances.network.resetSession>()
            .mockResolvedValue();
        Resources._instances.event.removeListenersFromRegistry = jest.fn<typeof Resources._instances.event.removeListenersFromRegistry>()
            .mockReturnValue(Resources._instances.event);

        await expect(tokenApp.run()).rejects.toThrow(/^Unable to acquire trust token$/);

        expect(Resources._instances.network.resetSession).toHaveBeenCalledTimes(1);
        expect(Resources._instances.event.removeListenersFromRegistry).toHaveBeenCalledTimes(4);

        expect(tokenApp.acquireLibraryLock).toHaveBeenCalledTimes(1);
        expect(tokenApp.releaseLibraryLock).toHaveBeenCalledTimes(1);
    });

    test(`Handle MFA not provided`, async () => {
        const tokenApp = await appFactory(validOptions.token) as TokenApp;
        tokenApp.acquireLibraryLock = jest.fn<typeof tokenApp.acquireLibraryLock>()
            .mockResolvedValue();
        tokenApp.icloud.authenticate = jest.fn<typeof tokenApp.icloud.authenticate>()
            .mockResolvedValue(false);
        tokenApp.releaseLibraryLock = jest.fn<typeof tokenApp.releaseLibraryLock>()
            .mockResolvedValue();
        Resources._instances.network.resetSession = jest.fn<typeof Resources._instances.network.resetSession>()
            .mockResolvedValue();
        Resources._instances.event.removeListenersFromRegistry = jest.fn<typeof Resources._instances.event.removeListenersFromRegistry>()
            .mockReturnValue(Resources._instances.event);

        await expect(tokenApp.run()).resolves.toBeFalsy();

        expect(Resources._instances.network.resetSession).toHaveBeenCalledTimes(1);
        expect(Resources._instances.event.removeListenersFromRegistry).toHaveBeenCalledTimes(4);

        expect(tokenApp.acquireLibraryLock).toHaveBeenCalledTimes(1);
        expect(tokenApp.releaseLibraryLock).toHaveBeenCalledTimes(1);
    });

    test(`Handle lock acquisition error`, async () => {
        const tokenApp = await appFactory(validOptions.token) as TokenApp;
        tokenApp.acquireLibraryLock = jest.fn<typeof tokenApp.acquireLibraryLock>()
            .mockRejectedValue(new Error());
        tokenApp.icloud.authenticate = jest.fn<typeof tokenApp.icloud.authenticate>()
            .mockResolvedValue(true);
        tokenApp.releaseLibraryLock = jest.fn<typeof tokenApp.releaseLibraryLock>()
            .mockResolvedValue();
        Resources._instances.network.resetSession = jest.fn<typeof Resources._instances.network.resetSession>()
            .mockResolvedValue();
        Resources._instances.event.removeListenersFromRegistry = jest.fn<typeof Resources._instances.event.removeListenersFromRegistry>()
            .mockReturnValue(Resources._instances.event);

        await expect(tokenApp.run()).rejects.toThrow(/^Unable to acquire trust token$/);

        expect(Resources._instances.network.resetSession).toHaveBeenCalledTimes(1);
        expect(Resources._instances.event.removeListenersFromRegistry).toHaveBeenCalledTimes(4);

        expect(tokenApp.acquireLibraryLock).toHaveBeenCalledTimes(1);
        expect(tokenApp.releaseLibraryLock).toHaveBeenCalledTimes(1);
        expect(tokenApp.icloud.authenticate).not.toHaveBeenCalled();
    });

    describe(`Token App`, () => {
        test(`Execute token actions`, async () => {
            const tokenApp = await appFactory(validOptions.token) as TokenApp;

            const tokenEvent = spyOnEvent(Resources._instances.event._eventBus, iCPSEventApp.TOKEN);

            tokenApp.acquireLibraryLock = jest.fn<typeof tokenApp.acquireLibraryLock>()
                .mockResolvedValue();
            tokenApp.icloud.authenticate = jest.fn<typeof tokenApp.icloud.authenticate>(() => {
                const ready = tokenApp.icloud.getReady();
                Resources.emit(iCPSEventCloud.TRUSTED);
                return ready;
            });
            tokenApp.releaseLibraryLock = jest.fn<typeof tokenApp.releaseLibraryLock>()
                .mockResolvedValue();
            Resources._instances.network.resetSession = jest.fn<typeof Resources._instances.network.resetSession>()
                .mockResolvedValue();

            const originalRemoveListenersFromRegistry = Resources._instances.event.removeListenersFromRegistry;

            Resources._instances.event.removeListenersFromRegistry = jest.fn<typeof Resources._instances.event.removeListenersFromRegistry>()
                .mockImplementationOnce(originalRemoveListenersFromRegistry) // Original implementation need to run once, so it can divert the execution flow
                .mockReturnValue(Resources._instances.event);

            await expect(tokenApp.run()).resolves.toBeTruthy();

            expect(tokenApp.acquireLibraryLock).toHaveBeenCalledTimes(1);
            expect(tokenApp.icloud.authenticate).toHaveBeenCalledTimes(1);
            expect(tokenApp.releaseLibraryLock).toHaveBeenCalledTimes(1);

            expect(Resources._instances.network.resetSession).toHaveBeenCalledTimes(1);
            expect(Resources._instances.event.removeListenersFromRegistry).toHaveBeenCalledTimes(4);

            expect(tokenEvent).toHaveBeenCalledTimes(1);
        });
    });

    describe(`Sync App`, () => {
        test(`Execute sync actions`, async () => {
            const syncApp = await appFactory(validOptions.sync) as SyncApp;

            syncApp.acquireLibraryLock = jest.fn<typeof syncApp.acquireLibraryLock>()
                .mockResolvedValue();
            syncApp.icloud.authenticate = jest.fn<typeof syncApp.icloud.authenticate>()
                .mockResolvedValue(true);
            syncApp.syncEngine.sync = jest.fn<typeof syncApp.syncEngine.sync>()
                .mockResolvedValue([[], []]);
            syncApp.releaseLibraryLock = jest.fn<typeof syncApp.releaseLibraryLock>()
                .mockResolvedValue();
            Resources._instances.network.resetSession = jest.fn<typeof Resources._instances.network.resetSession>()
                .mockResolvedValue();
            Resources._instances.event.removeListenersFromRegistry = jest.fn<typeof Resources._instances.event.removeListenersFromRegistry>()
                .mockReturnValue(Resources._instances.event);

            await syncApp.run();

            expect(syncApp.acquireLibraryLock).toHaveBeenCalledTimes(1);
            expect(syncApp.icloud.authenticate).toHaveBeenCalledTimes(1);
            expect(syncApp.syncEngine.sync).toHaveBeenCalledTimes(1);
            expect(syncApp.releaseLibraryLock).toHaveBeenCalledTimes(1);
            expect(Resources._instances.network.resetSession).toHaveBeenCalledTimes(1);
            expect(Resources._instances.event.removeListenersFromRegistry).toHaveBeenCalledTimes(2);
        });

        test(`Handle MFA not provided`, async () => {
            const syncApp = await appFactory(validOptions.sync) as SyncApp;

            syncApp.acquireLibraryLock = jest.fn<typeof syncApp.acquireLibraryLock>()
                .mockResolvedValue();
            syncApp.icloud.authenticate = jest.fn<typeof syncApp.icloud.authenticate>()
                .mockResolvedValue(false);
            syncApp.syncEngine.sync = jest.fn<typeof syncApp.syncEngine.sync>()
                .mockRejectedValue(new Error(`MFA required`));
            syncApp.releaseLibraryLock = jest.fn<typeof syncApp.releaseLibraryLock>()
                .mockResolvedValue();
            Resources._instances.network.resetSession = jest.fn<typeof Resources._instances.network.resetSession>()
                .mockResolvedValue();
            Resources._instances.event.removeListenersFromRegistry = jest.fn<typeof Resources._instances.event.removeListenersFromRegistry>()
                .mockReturnValue(Resources._instances.event);

            await expect(syncApp.run()).resolves.toEqual([[], []]);

            expect(syncApp.acquireLibraryLock).toHaveBeenCalledTimes(1);
            expect(syncApp.icloud.authenticate).toHaveBeenCalledTimes(1);
            expect(syncApp.syncEngine.sync).not.toHaveBeenCalled();
            expect(syncApp.releaseLibraryLock).toHaveBeenCalledTimes(1);
            expect(Resources._instances.network.resetSession).toHaveBeenCalledTimes(1);
            expect(Resources._instances.event.removeListenersFromRegistry).toHaveBeenCalledTimes(2);
        });

        test(`Handle sync error`, async () => {
            const syncApp = await appFactory(validOptions.sync) as SyncApp;

            syncApp.acquireLibraryLock = jest.fn<typeof syncApp.acquireLibraryLock>()
                .mockResolvedValue();
            syncApp.icloud.authenticate = jest.fn<typeof syncApp.icloud.authenticate>()
                .mockResolvedValue(true);
            syncApp.syncEngine.sync = jest.fn<typeof syncApp.syncEngine.sync>()
                .mockRejectedValue(new Error());
            syncApp.releaseLibraryLock = jest.fn<typeof syncApp.releaseLibraryLock>()
                .mockResolvedValue();
            Resources._instances.network.resetSession = jest.fn<typeof Resources._instances.network.resetSession>()
                .mockResolvedValue();
            Resources._instances.event.removeListenersFromRegistry = jest.fn<typeof Resources._instances.event.removeListenersFromRegistry>()
                .mockReturnValue(Resources._instances.event);

            await expect(syncApp.run()).rejects.toThrow(/^Sync failed$/);

            expect(syncApp.acquireLibraryLock).toHaveBeenCalledTimes(1);
            expect(syncApp.icloud.authenticate).toHaveBeenCalledTimes(1);
            expect(syncApp.syncEngine.sync).toHaveBeenCalledTimes(1);
            expect(syncApp.releaseLibraryLock).toHaveBeenCalledTimes(1);
            expect(Resources._instances.network.resetSession).toHaveBeenCalledTimes(1);
            expect(Resources._instances.event.removeListenersFromRegistry).toHaveBeenCalledTimes(2);
        });
    });

    describe(`Archive App`, () => {
        test(`Execute archive actions`, async () => {
            const archiveApp = await appFactory(validOptions.archive) as ArchiveApp;
            archiveApp.acquireLibraryLock = jest.fn<typeof archiveApp.acquireLibraryLock>()
                .mockResolvedValue();
            archiveApp.icloud.authenticate = jest.fn<typeof archiveApp.icloud.authenticate>()
                .mockResolvedValue(true);

            const remoteState = [{fileChecksum: `someChecksum`}] as Asset[];
            archiveApp.syncEngine.sync = jest.fn<typeof archiveApp.syncEngine.sync>()
                .mockResolvedValue([remoteState, []]);

            archiveApp.archiveEngine.archivePath = jest.fn<typeof archiveApp.archiveEngine.archivePath>()
                .mockResolvedValue();
            archiveApp.releaseLibraryLock = jest.fn<typeof archiveApp.releaseLibraryLock>()
                .mockResolvedValue();
            Resources._instances.network.resetSession = jest.fn<typeof Resources._instances.network.resetSession>()
                .mockResolvedValue();
            Resources._instances.event.removeListenersFromRegistry = jest.fn<typeof Resources._instances.event.removeListenersFromRegistry>()
                .mockReturnValue(Resources._instances.event);

            await archiveApp.run();

            expect(archiveApp.acquireLibraryLock).toHaveBeenCalledTimes(1);
            expect(archiveApp.icloud.authenticate).toHaveBeenCalledTimes(1);
            expect(archiveApp.syncEngine.sync).toHaveBeenCalledTimes(1);
            expect(archiveApp.archiveEngine.archivePath).toHaveBeenCalledWith(validOptions.archive[validOptions.archive.length - 1], remoteState);
            expect(archiveApp.releaseLibraryLock).toHaveBeenCalledTimes(1);
            expect(Resources._instances.network.resetSession).toHaveBeenCalledTimes(1);
            expect(Resources._instances.event.removeListenersFromRegistry).toHaveBeenCalledTimes(2);
        });

        test(`Handle MFA not provided`, async () => {
            const archiveApp = await appFactory(validOptions.archive) as ArchiveApp;
            archiveApp.acquireLibraryLock = jest.fn<typeof archiveApp.acquireLibraryLock>()
                .mockResolvedValue();
            archiveApp.icloud.authenticate = jest.fn<typeof archiveApp.icloud.authenticate>()
                .mockResolvedValue(false);

            const remoteState = [{fileChecksum: `someChecksum`}] as Asset[];
            archiveApp.syncEngine.sync = jest.fn<typeof archiveApp.syncEngine.sync>()
                .mockResolvedValue([remoteState, []]);

            archiveApp.archiveEngine.archivePath = jest.fn<typeof archiveApp.archiveEngine.archivePath>()
                .mockResolvedValue();
            archiveApp.releaseLibraryLock = jest.fn<typeof archiveApp.releaseLibraryLock>()
                .mockResolvedValue();
            Resources._instances.network.resetSession = jest.fn<typeof Resources._instances.network.resetSession>()
                .mockResolvedValue();
            Resources._instances.event.removeListenersFromRegistry = jest.fn<typeof Resources._instances.event.removeListenersFromRegistry>()
                .mockReturnValue(Resources._instances.event);

            await archiveApp.run();

            expect(archiveApp.acquireLibraryLock).toHaveBeenCalledTimes(1);
            expect(archiveApp.icloud.authenticate).toHaveBeenCalledTimes(1);
            expect(archiveApp.syncEngine.sync).not.toHaveBeenCalled();
            expect(archiveApp.archiveEngine.archivePath).toHaveBeenCalledWith(validOptions.archive[validOptions.archive.length - 1], []);
            expect(archiveApp.releaseLibraryLock).toHaveBeenCalledTimes(1);
            expect(Resources._instances.network.resetSession).toHaveBeenCalledTimes(1);
            expect(Resources._instances.event.removeListenersFromRegistry).toHaveBeenCalledTimes(2);
        });

        test(`Handle archive error`, async () => {
            const archiveApp = await appFactory(validOptions.archive) as ArchiveApp;
            archiveApp.acquireLibraryLock = jest.fn<typeof archiveApp.acquireLibraryLock>()
                .mockResolvedValue();
            archiveApp.icloud.authenticate = jest.fn<typeof archiveApp.icloud.authenticate>()
                .mockResolvedValue(true);

            archiveApp.syncEngine.sync = jest.fn<typeof archiveApp.syncEngine.sync>()
                .mockResolvedValue([[], []]);

            archiveApp.archiveEngine.archivePath = jest.fn<typeof archiveApp.archiveEngine.archivePath>()
                .mockRejectedValue(new Error());
            archiveApp.releaseLibraryLock = jest.fn<typeof archiveApp.releaseLibraryLock>()
                .mockResolvedValue();
            Resources._instances.network.resetSession = jest.fn<typeof Resources._instances.network.resetSession>()
                .mockResolvedValue();
            Resources._instances.event.removeListenersFromRegistry = jest.fn<typeof Resources._instances.event.removeListenersFromRegistry>()
                .mockReturnValue(Resources._instances.event);

            await expect(archiveApp.run()).rejects.toThrow(/^Archive failed$/);

            expect(archiveApp.acquireLibraryLock).toHaveBeenCalledTimes(1);
            expect(archiveApp.icloud.authenticate).toHaveBeenCalledTimes(1);
            expect(archiveApp.syncEngine.sync).toHaveBeenCalledTimes(1);
            expect(archiveApp.archiveEngine.archivePath).toHaveBeenCalledTimes(1);
            expect(archiveApp.releaseLibraryLock).toHaveBeenCalledTimes(1);
            expect(Resources._instances.network.resetSession).toHaveBeenCalledTimes(1);
            expect(Resources._instances.event.removeListenersFromRegistry).toHaveBeenCalledTimes(2);
        });
    });

    describe(`Daemon App`, () => {
        describe(`Scheduling`, () => {
            // Fake timers don't work with croner, so we need to wait actual time
            const executionPadding = 100; // Waiting for the croner execution to finish, in ms

            test(`Run single scheduled job`, async () => {
                const daemonApp = await appFactory(validOptions.daemon) as DaemonApp;
                daemonApp.performScheduledSync = jest.fn<typeof daemonApp.performScheduledSync>()
                    .mockResolvedValue();
                Resources._instances.manager._resources.schedule = `*/1 * * * * *`; // Every second
                const eventScheduledEvent = spyOnEvent(Resources._instances.event._eventBus, iCPSEventApp.SCHEDULED);

                await daemonApp.run();

                // Calculating time till next full second (when schedule will trigger)
                const timePadding = 1000 - (Date.now() % 1000);
                // Waiting for the first run to trigger and the second run to try and overrun
                await new Promise(r => setTimeout(r, timePadding + executionPadding));

                // Cleaning up
                daemonApp.job?.stop();

                expect(eventScheduledEvent).toHaveBeenCalledTimes(1);
                expect(daemonApp.performScheduledSync).toHaveBeenCalledTimes(1);
            });

            test(`Run multiple scheduled job`, async () => {
                const daemonApp = await appFactory(validOptions.daemon) as DaemonApp;
                daemonApp.performScheduledSync = jest.fn<typeof daemonApp.performScheduledSync>()
                    .mockResolvedValue();
                Resources._instances.manager._resources.schedule = `*/1 * * * * *`; // Every second
                const eventScheduledEvent = spyOnEvent(Resources._instances.event._eventBus, iCPSEventApp.SCHEDULED);
                const eventScheduledOverrun = spyOnEvent(Resources._instances.event._eventBus, iCPSEventApp.SCHEDULED_OVERRUN);

                await daemonApp.run();

                // Calculating time till next full second (when schedule will trigger)
                const timePadding = 1000 - (Date.now() % 1000);
                // Waiting for the first run to trigger and the second run to try and overrun
                await new Promise(r => setTimeout(r, timePadding + 1000 + executionPadding));

                // Cleaning up
                daemonApp.job?.stop();

                expect(eventScheduledEvent).toHaveBeenCalledTimes(1);
                expect(daemonApp.performScheduledSync).toHaveBeenCalledTimes(2);
                expect(eventScheduledOverrun).not.toHaveBeenCalled();
            });

            test(`Schedule job overrun`, async () => {
                const daemonApp = await appFactory(validOptions.daemon) as DaemonApp;
                daemonApp.performScheduledSync = jest.fn<typeof daemonApp.performScheduledSync>(async () => {
                    await new Promise(r => setTimeout(r, 2000));
                });
                Resources._instances.manager._resources.schedule = `*/1 * * * * *`; // Every second
                const eventScheduledEvent = spyOnEvent(Resources._instances.event._eventBus, iCPSEventApp.SCHEDULED);
                const eventScheduledOverrun = spyOnEvent(Resources._instances.event._eventBus, iCPSEventApp.SCHEDULED_OVERRUN);

                await daemonApp.run();

                // Calculating time till next full second (when schedule will trigger)
                const timePadding = 1000 - (Date.now() % 1000);
                // Waiting for the first run to trigger and the second run to try and overrun
                await new Promise(r => setTimeout(r, timePadding + 1000 + executionPadding));

                // Cleaning up
                daemonApp.job?.stop();

                expect(eventScheduledEvent).toHaveBeenCalledTimes(1);
                expect(eventScheduledOverrun).toHaveBeenCalledTimes(1);
                expect(daemonApp.performScheduledSync).toHaveBeenCalledTimes(1);
            });
        });

        test(`Scheduled sync succeeds`, async () => {
            const daemonApp = await appFactory(validOptions.daemon) as DaemonApp;
            const successEvent = spyOnEvent(Resources._instances.event._eventBus, iCPSEventApp.SCHEDULED_DONE);

            const remoteState = [{fileChecksum: `someChecksum`}] as Asset[];
            const syncApp = new SyncApp();
            syncApp.run = jest.fn<typeof syncApp.run>()
                .mockResolvedValue([remoteState, []]);

            await daemonApp.performScheduledSync(syncApp);

            expect(syncApp.run).toHaveBeenCalled();
            expect(successEvent).toHaveBeenCalled();
        });

        test(`Scheduled sync requires MFA`, async () => {
            const daemonApp = await appFactory(validOptions.daemon) as DaemonApp;
            const successEvent = spyOnEvent(Resources._instances.event._eventBus, iCPSEventApp.SCHEDULED_DONE);

            const syncApp = new SyncApp();
            syncApp.run = jest.fn<typeof syncApp.run>()
                .mockResolvedValue([[], []]);

            await daemonApp.performScheduledSync(syncApp);

            expect(syncApp.run).toHaveBeenCalled();
            expect(successEvent).not.toHaveBeenCalled();
        });

        test(`Scheduled sync fails`, async () => {
            const daemonApp = await appFactory(validOptions.daemon) as DaemonApp;
            const retryEvent = spyOnEvent(Resources._instances.event._eventBus, iCPSEventApp.SCHEDULED_RETRY);
            const errorEvent = spyOnEvent(Resources._instances.event._eventBus, iCPSEventRuntimeError.SCHEDULED_ERROR);

            const syncApp = new SyncApp();
            syncApp.run = jest.fn<typeof syncApp.run>()
                .mockRejectedValue(new Error());

            await daemonApp.performScheduledSync(syncApp);

            expect(syncApp.run).toHaveBeenCalled();
            expect(retryEvent).toHaveBeenCalled();
            expect(errorEvent).toHaveBeenCalled();
        });
    });
});

describe(`Library Lock`, () => {
    test(`Acquire lock`, async () => {
        const tokenApp = await appFactory(validOptions.token) as TokenApp;
        const thisPID = process.pid.toString();

        await expect(tokenApp.acquireLibraryLock()).resolves.toBeUndefined();

        const lockFile = (await fs.promises.readFile(path.join(Config.defaultConfig.dataDir, LIBRARY_LOCK_FILE_NAME), {encoding: `utf-8`})).toString();
        expect(lockFile).toEqual(thisPID);
    });

    test(`Acquire lock error - already locked by running process`, async () => {
        const tokenApp = await appFactory(validOptions.token) as TokenApp;
        const notThisPID = (process.pid + 1).toString();
        Resources.pidIsRunning = jest.fn<typeof Resources.pidIsRunning>()
            .mockReturnValue(true);

        mockfs({
            [Config.defaultConfig.dataDir]: {
                [LIBRARY_LOCK_FILE_NAME]: notThisPID,
            },
        });

        await expect(tokenApp.acquireLibraryLock()).rejects.toThrow(/^Library locked. Use --force \(or FORCE env variable\) to forcefully remove the lock$/);
        expect(Resources.pidIsRunning).toHaveBeenCalled();
        expect(fs.existsSync(path.join(Resources.manager().dataDir, LIBRARY_LOCK_FILE_NAME))).toBeTruthy();
    });

    test(`Acquire lock warning - already locked by this process`, async () => {
        const tokenApp = await appFactory(validOptions.token) as TokenApp;
        const thisPID = process.pid.toString();

        mockfs({
            [Config.defaultConfig.dataDir]: {
                [LIBRARY_LOCK_FILE_NAME]: thisPID,
            },
        });

        await expect(tokenApp.acquireLibraryLock()).resolves.toBeUndefined();

        const lockFile = (await fs.promises.readFile(path.join(Resources.manager().dataDir, LIBRARY_LOCK_FILE_NAME), {encoding: `utf-8`})).toString();
        expect(lockFile).toEqual(thisPID);
    });

    test(`Acquire lock warning - already locked by non-running process`, async () => {
        const tokenApp = await appFactory(validOptions.token) as TokenApp;
        const thisPID = process.pid.toString();
        const notThisPID = (process.pid + 1).toString();
        Resources.pidIsRunning = jest.fn<typeof Resources.pidIsRunning>()
            .mockReturnValue(false);

        mockfs({
            [Config.defaultConfig.dataDir]: {
                [LIBRARY_LOCK_FILE_NAME]: notThisPID,
            },
        });

        await expect(tokenApp.acquireLibraryLock()).resolves.toBeUndefined();

        const lockFile = (await fs.promises.readFile(path.join(Resources.manager().dataDir, LIBRARY_LOCK_FILE_NAME), {encoding: `utf-8`})).toString();
        expect(lockFile).toEqual(thisPID);
    });

    test(`Acquire lock warning - already locked by running process with --force`, async () => {
        const tokenApp = await appFactory(validOptions.tokenWithForce) as TokenApp;
        const thisPID = process.pid.toString();
        const notThisPID = (process.pid + 1).toString();
        Resources.pidIsRunning = jest.fn<typeof Resources.pidIsRunning>()
            .mockReturnValue(true);

        mockfs({
            [Resources.manager().dataDir]: {
                [LIBRARY_LOCK_FILE_NAME]: notThisPID,
            },
        });

        await expect(tokenApp.acquireLibraryLock()).resolves.toBeUndefined();

        expect(Resources.pidIsRunning).toHaveBeenCalled();
        const lockFile = (await fs.promises.readFile(path.join(Resources.manager().dataDir, LIBRARY_LOCK_FILE_NAME), {encoding: `utf-8`})).toString();
        expect(lockFile).toEqual(thisPID);
    });

    test(`Release lock`, async () => {
        const tokenApp = await appFactory(validOptions.token) as TokenApp;
        const thisPID = process.pid.toString();

        mockfs({
            [Config.defaultConfig.dataDir]: {
                [LIBRARY_LOCK_FILE_NAME]: thisPID,
            },
        });

        await expect(tokenApp.releaseLibraryLock()).resolves.toBeUndefined();

        expect(fs.existsSync(path.join(Resources.manager().dataDir, LIBRARY_LOCK_FILE_NAME))).toBeFalsy();
    });

    test(`Release lock error - other running process' lock`, async () => {
        const tokenApp = await appFactory(validOptions.token) as TokenApp;
        const notThisPID = (process.pid + 1).toString();

        Resources.pidIsRunning = jest.fn<typeof Resources.pidIsRunning>()
            .mockReturnValue(true);

        mockfs({
            [Resources.manager().dataDir]: {
                [LIBRARY_LOCK_FILE_NAME]: notThisPID,
            },
        });

        await expect(tokenApp.releaseLibraryLock()).rejects.toThrow(/^Library locked. Use --force \(or FORCE env variable\) to forcefully remove the lock$/);

        expect(Resources.pidIsRunning).toHaveBeenCalled();
        expect(fs.existsSync(path.join(Resources.manager().dataDir, LIBRARY_LOCK_FILE_NAME))).toBeTruthy();
    });

    test(`Release lock warning - other non-running process' lock`, async () => {
        const tokenApp = await appFactory(validOptions.token) as TokenApp;
        const notThisPID = (process.pid + 1).toString();

        Resources.pidIsRunning = jest.fn<typeof Resources.pidIsRunning>()
            .mockReturnValue(false);

        mockfs({
            [Resources.manager().dataDir]: {
                [LIBRARY_LOCK_FILE_NAME]: notThisPID,
            },
        });

        await expect(tokenApp.releaseLibraryLock()).resolves.toBeUndefined();

        expect(Resources.pidIsRunning).toHaveBeenCalled();
        expect(fs.existsSync(path.join(Resources.manager().dataDir, LIBRARY_LOCK_FILE_NAME))).toBeFalsy();
    });

    test(`Release lock warning - not this process' lock with --force`, async () => {
        const tokenApp = await appFactory(validOptions.tokenWithForce) as TokenApp;
        const notThisPID = (process.pid + 1).toString();
        Resources.pidIsRunning = jest.fn<typeof Resources.pidIsRunning>()
            .mockReturnValue(true);

        mockfs({
            [Resources.manager().dataDir]: {
                [LIBRARY_LOCK_FILE_NAME]: notThisPID,
            },
        });

        await expect(tokenApp.releaseLibraryLock()).resolves.toBeUndefined();

        expect(Resources.pidIsRunning).toHaveBeenCalled();
        expect(fs.existsSync(path.join(Resources.manager().dataDir, LIBRARY_LOCK_FILE_NAME))).toBeFalsy();
    });

    test(`Release lock warning - no lock`, async () => {
        const tokenApp = await appFactory(validOptions.token) as TokenApp;

        await expect(tokenApp.releaseLibraryLock()).resolves.toBeUndefined();

        expect(!fs.existsSync(path.join(Resources.manager().dataDir, LIBRARY_LOCK_FILE_NAME))).toBeTruthy();
    });
});