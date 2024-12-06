import {Cron} from "croner";
import * as fs from 'fs';
import {ArchiveEngine} from "../lib/archive-engine/archive-engine.js";
import {iCloud} from "../lib/icloud/icloud.js";
import {Album} from "../lib/photos-library/model/album.js";
import {Asset} from "../lib/photos-library/model/asset.js";
import {PhotosLibrary} from "../lib/photos-library/photos-library.js";
import {iCPSEventApp, iCPSEventCloud, iCPSEventPhotos, iCPSEventRuntimeError} from "../lib/resources/events-types.js";
import {Resources} from "../lib/resources/main.js";
import {SyncEngine} from "../lib/sync-engine/sync-engine.js";
import {APP_ERR, AUTH_ERR, LIBRARY_ERR} from "./error/error-codes.js";
import {iCPSError} from "./error/error.js";

/**
 * Abstract class returned by the factory function
 */
export abstract class iCPSApp {
    /**
     * Executes this app
     */
    abstract run(): Promise<unknown>
}

/**
 * This app will allow running in scheduled daemon mode - where a sync is executed based on a cron schedule
 */
export class DaemonApp extends iCPSApp {
    /**
     * Holds the cron job
     */
    job: Cron;

    /**
     * Schedule the synchronization based on the provided cron string
     * @returns Once the job has been scheduled
     */
    async run() {
        this.job = new Cron(
            Resources.manager().schedule,
            async () => {
                await this.performScheduledSync();
            },
            {
                protect: () => {
                    Resources.emit(iCPSEventApp.SCHEDULED_OVERRUN, this.job?.nextRun());
                },
            },
        );
        Resources.emit(iCPSEventApp.SCHEDULED, this.job?.nextRun());
    }

    /**
     * Perform a scheduled sync
     * @param syncApp - Parametrized for testability - will be freshly initiated if omitted
     */
    async performScheduledSync(syncApp: SyncApp = new SyncApp()) {
        try {
            Resources.emit(iCPSEventApp.SCHEDULED_START);
            const [remoteAssets, albums] = await syncApp.run() as [Asset[], Album[]];

            if (remoteAssets.length > 0) {
                Resources.emit(iCPSEventApp.SCHEDULED_DONE, this.job?.nextRun());
            }

            if (Resources.manager().healthCheckPingUrl) {
                Resources.network().post(Resources.manager().healthCheckPingUrl, `Successfully synced ${remoteAssets.length} assets and ${albums.length} albums`);
            }
        } catch (err) {
            Resources.emit(iCPSEventRuntimeError.SCHEDULED_ERROR, new iCPSError(APP_ERR.DAEMON).addCause(err));
            Resources.emit(iCPSEventApp.SCHEDULED_RETRY, this.job?.nextRun());
        }
    }
}

/**
 * This is the base application class which will setup and manage the iCloud connection and local Photos Library
 */
abstract class iCloudApp extends iCPSApp {
    /**
     * This sessions' iCloud object
     */
    icloud: iCloud;

    /**
     * Creates and sets up the necessary infrastructure
     */
    constructor() {
        super();

        // It's crucial for the data dir to exist, create if it doesn't
        if (!fs.existsSync(Resources.manager().dataDir)) {
            fs.mkdirSync(Resources.manager().dataDir, {recursive: true});
        }

        // Creating necessary object for this scope
        this.icloud = new iCloud();
    }

    /**
     * This function acquires the library lock and establishes the iCloud connection.
     * @returns A promise that resolves to true once the iCloud service is fully available. If it resolves to false, the MFA code was not provided in time and the object is not ready.
     * @throws An iCPSError in case an error occurs
     */
    async run(): Promise<unknown> {
        try {
            await this.acquireLibraryLock();
        } catch (err) {
            throw new iCPSError(LIBRARY_ERR.LOCK_ACQUISITION)
                .addCause(err);
        }

        try {
            return await this.icloud.authenticate();
        } catch (err) {
            throw new iCPSError(AUTH_ERR.FAILED)
                .addCause(err);
        }
    }

    /**
     * Removes all established event listeners, resets the network connection and releases the library lock
     */
    async clean() {
        await Resources.network().resetSession();
        Resources.events(this.icloud.photos).removeListeners();
        Resources.events(this.icloud).removeListeners();
        try {
            await this.releaseLibraryLock();
        } catch (err) {
            Resources.logger(this).warn(`Failed to release library lock: ${err}`);
        }
        try {
            await this.icloud.logout();
        } catch (err) {
            Resources.logger(this).warn(`Failed to logout from iCloud: ${err}`);
        }
    }

    /**
     * Tries to acquire the lock for the local library to execute a sync
     * @throws An iCPSError, if the lock could not be acquired
     */
    async acquireLibraryLock() {
        const {lockFilePath} = Resources.manager();
        const lockFileExists = await fs.promises.stat(lockFilePath)
            .then(stat => stat.isFile())
            .catch(() => false);

        if (lockFileExists) {
            const lockingProcess = parseInt(await fs.promises.readFile(lockFilePath, `utf-8`), 10);

            if (process.pid === lockingProcess) {
                Resources.logger(this).warn(`Lock file exists, but is owned by this process. Continuing.`);
                return;
            }

            if (Resources.pidIsRunning(lockingProcess) && !Resources.manager().force) {
                throw new iCPSError(LIBRARY_ERR.LOCKED)
                    .addMessage(`Locked by PID ${lockingProcess}`);
            }

            // Clear stale lock file
            await fs.promises.rm(lockFilePath, {force: true});
        }

        // Create lock file
        await fs.promises.writeFile(lockFilePath, process.pid.toString(), {encoding: `utf-8`, flush: true});
    }

    /**
     * Tries to release the lock for the local library after completing a sync
     * @throws An iCPSError, if the lock could not be released
     */
    async releaseLibraryLock() {
        const {lockFilePath} = Resources.manager();
        const lockFileExists = await fs.promises.stat(lockFilePath)
            .then(stat => stat.isFile())
            .catch(() => false);

        if (!lockFileExists) {
            Resources.logger(this).warn(`Cannot release lock: Lock file does not exist.`);
            return;
        }

        const lockingProcess = parseInt(await fs.promises.readFile(lockFilePath, `utf-8`), 10);

        if (process.pid !== lockingProcess && Resources.pidIsRunning(lockingProcess) && !Resources.manager().force) {
            throw new iCPSError(LIBRARY_ERR.LOCKED)
                .addMessage(`Locked by PID ${lockingProcess}`);
        }

        await fs.promises.rm(lockFilePath, {force: true});
    }
}

/**
 * This application will print the locally stored token, acquire a new one (if necessary) and print it to the CLI
 */
export class TokenApp extends iCloudApp {
    /**
     * This function will validate the currently stored account token and print it afterwards
     * @returns A promise that resolves once the operation has been completed
     * @throws An iCPSError in case an error occurs
     * @emits iCPSEventPhotos.READY - Once the token has been validated in order for the Promise to resolve
     * @emits iCPSEventApp.TOKEN - Once the token has been validated in order for the CLI to print it
     */
    async run(): Promise<unknown> {
        try {
            // Making sure execution stops after TRUSTED event, by removing existing listeners
            Resources.events(this.icloud).removeListeners(iCPSEventCloud.TRUSTED);

            Resources.events(this).once(iCPSEventCloud.TRUSTED, token => {
                Resources.emit(iCPSEventPhotos.READY);
                Resources.emit(iCPSEventApp.TOKEN, token);
            });
            return await super.run();
        } catch (err) {
            throw new iCPSError(APP_ERR.TOKEN)
                .addCause(err);
        } finally {
            // Only if this is the initiated class, release the lock
            if (this.constructor.name === TokenApp.name) {
                await this.clean();
            }
        }
    }

    /**
     * Removes all established event listeners and releases the library lock
     */
    async clean() {
        await super.clean();
        Resources.events(this).removeListeners();
    }
}

/**
 * This application will perform a synchronization of the provided Photos Library using the authenticated iCloud connection
 */
export class SyncApp extends iCloudApp {
    /**
     * This sessions' Photos Library object
     */
    photosLibrary: PhotosLibrary;

    /**
     * This sessions' Sync Engine object
     */
    syncEngine: SyncEngine;

    /**
     * Creates and sets up the necessary infrastructure for this app
     */
    constructor() {
        super();
        this.photosLibrary = new PhotosLibrary();
        this.syncEngine = new SyncEngine(this.icloud, this.photosLibrary);
    }

    /**
     * Runs the synchronization of the local Photo Library
     * @returns A Promise that resolves to a tuple containing containing the list of assets and albums as fetched from the remote state. The returned arrays might be empty, if the iCloud connection was not established successfully.
     * @throws An iCPSError in case an error occurs
     */
    async run(): Promise<unknown> {
        try {
            const ready = await super.run() as boolean;
            if (!ready) {
                return [[], []];
            }

            return await this.syncEngine.sync();
        } catch (err) {
            throw new iCPSError(APP_ERR.SYNC)
                .addCause(err);
        } finally {
            // If this is the initiated class, release the lock
            if (this.constructor.name === SyncApp.name) {
                await this.clean();
            }
        }
    }

    /**
     * Removes all established event listeners and releases the library lock
     */
    async clean() {
        await super.clean();
    }
}

/**
 * This application will first perform a synchronization and then archive a given local path
 */
export class ArchiveApp extends SyncApp {
    /**
     * This sessions' Archive Engine object
     */
    archiveEngine: ArchiveEngine;

    /**
     * The local path to be archived
     */
    archivePath: string;

    /**
     * Creates and sets up the necessary infrastructure for this app
     * @param archivePath - The path to the folder that should get archived
     */
    constructor(archivePath: string) {
        super();
        this.archivePath = archivePath;
        this.archiveEngine = new ArchiveEngine(this.icloud, this.photosLibrary);
    }

    /**
     * This function will first perform a synchronization run and then attempt to archive the provided path
     * @returns A promise that resolves once the operation has finished
     * @throws An ArchiveError in case an error occurs
     */
    async run(): Promise<unknown> {
        try {
            const [remoteAssets] = await super.run() as [Asset[], Album[]];
            return await this.archiveEngine.archivePath(this.archivePath, remoteAssets);
        } catch (err) {
            throw new iCPSError(APP_ERR.ARCHIVE)
                .addCause(err).addContext(`archivePath`, this.archivePath);
        } finally {
            // If this is the initiated class, release the lock
            if (this.constructor.name === ArchiveApp.name) {
                await this.clean();
            }
        }
    }

    /**
     * Removes all established event listeners and releases the library lock
     */
    async clean() {
        await super.clean();
    }
}