import {iCloud} from "../lib/icloud/icloud.js";
import {PhotosLibrary} from "../lib/photos-library/photos-library.js";
import * as fs from 'fs';
import {ArchiveEngine} from "../lib/archive-engine/archive-engine.js";
import {SyncEngine} from "../lib/sync-engine/sync-engine.js";
import {iCPSError} from "./error/error.js";
import {Asset} from "../lib/photos-library/model/asset.js";
import {Album} from "../lib/photos-library/model/album.js";
import path from "path";
import {EventEmitter} from "events";
import * as ICLOUD from "../lib/icloud/constants.js";
import * as Logger from '../lib/logger.js';
import {Cron} from "croner";
import {HANDLER_EVENT} from "./event/error-handler.js";
import {EventHandler, registerObjectsToEventHandlers, removeObjectsFromEventHandlers} from "./event/event-handler.js";
import {APP_ERR, AUTH_ERR, LIBRARY_ERR} from "./error/error-codes.js";
import {iCPSAppOptions} from "./factory.js";

/**
 * Filename for library lock file located in DATA_DIR
 */
export const LIBRARY_LOCK_FILE = `.library.lock`;

export abstract class iCPSApp {
    options: iCPSAppOptions;

    constructor(options: iCPSAppOptions) {
        this.options = options;
        // Needs to be done here so all future objects use it / including handlers and everything created down the chain
        Logger.setupLogger(this.options);
    }

    /**
     * Executes this app
     * @param eventHandlers - A list of EventHandlers that will be registering relevant objects
     */
    abstract run(...eventHandlers: EventHandler[]): Promise<unknown>
}

export class DaemonAppEvents extends EventEmitter {
    static EVENTS = {
        'SCHEDULED': `scheduled`, // Next execution
        'START': `start`,
        'DONE': `done`, // Next execution
        'RETRY': `retry`, // Next execution
    };
}

/**
 * This app will allow running in scheduled daemon mode - where a sync is executed based on a cron schedule
 */
export class DaemonApp extends iCPSApp {
    /**
     * Holds the cron job
     */
    job?: Cron;

    /**
     * EventEmitter to notify EventHandlers
     */
    event: DaemonAppEvents;

    /**
     * Builds the app
     * @param options - CLI Options for the app
     */
    constructor(options: iCPSAppOptions) {
        super(options);
        this.event = new DaemonAppEvents();
    }

    /**
     * Schedule the synchronization based on the provided cron string
     * @returns Once the job has been scheduled
     */
    async run(...eventHandlers: EventHandler[]) {
        registerObjectsToEventHandlers(eventHandlers, this.event);
        this.job = new Cron(this.options.schedule, async () => {
            await this.performScheduledSync(eventHandlers);
        });
        this.event.emit(DaemonAppEvents.EVENTS.SCHEDULED, this.job?.nextRun());
    }

    /**
     * Perform a scheduled sync using the provided event handlers
     * @param eventHandlers - Event handlers of daemon app
     * @param syncApp - Parametrized for testability - will be freshly initiated if omitted
     */
    async performScheduledSync(eventHandlers: EventHandler[], syncApp: SyncApp = new SyncApp(this.options)) {
        try {
            this.event.emit(DaemonAppEvents.EVENTS.START);
            await syncApp.run(...eventHandlers);
            this.event.emit(DaemonAppEvents.EVENTS.DONE, this.job?.nextRun());
        } catch (err) {
            this.event.emit(HANDLER_EVENT, new iCPSError(APP_ERR.DAEMON).addCause(err));
            this.event.emit(DaemonAppEvents.EVENTS.RETRY, this.job?.nextRun());
        } finally { // Cleaning up
            syncApp = undefined;
        }
    }
}

/**
 * This is the base application class which will setup and manage the iCloud connection and local Photos Library
 */
export abstract class iCloudApp extends iCPSApp {
    /**
     * This sessions' iCloud object
     */
    icloud: iCloud;

    /**
     * Creates and sets up the necessary infrastructure
     * @param options - The parsed CLI options
     */
    constructor(options: iCPSAppOptions) {
        super(options);

        // It's crucial for the data dir to exist, create if it doesn't
        if (!fs.existsSync(this.options.dataDir)) {
            fs.mkdirSync(this.options.dataDir, {"recursive": true});
        }

        // Creating necessary objects for this scope
        this.icloud = new iCloud(this);
    }

    /**
     * This function acquires the library lock and establishes the iCloud connection.
     * @param eventHandlers - A list of EventHandlers that will be registering relevant objects
     * @returns A promise that resolves once the iCloud service is fully available
     * @throws A iCPSError in case an error occurs
     */
    async run(...eventHandlers: EventHandler[]): Promise<unknown> {
        registerObjectsToEventHandlers(eventHandlers, this.icloud, this.icloud.mfaServer);

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
     * Removes all established event listeners and releases the library lock
     */
    async clean() {
        removeObjectsFromEventHandlers(this.icloud, this.icloud.mfaServer);
        await this.releaseLibraryLock();
    }

    /**
     * Tries to acquire the lock for the local library to execute a sync
     * @throws A Library Error, if the lock could not be acquired
     */
    async acquireLibraryLock() {
        const lockFilePath = path.join(this.options.dataDir, LIBRARY_LOCK_FILE);
        if (fs.existsSync(lockFilePath)) {
            if (!this.options.force) {
                const lockingProcess = (await fs.promises.readFile(lockFilePath, `utf-8`)).toString();
                throw new iCPSError(LIBRARY_ERR.LOCKED)
                    .addMessage(`Locked by PID ${lockingProcess}`);
            }

            await fs.promises.rm(lockFilePath, {"force": true});
        }

        await fs.promises.writeFile(lockFilePath, process.pid.toString(), {"encoding": `utf-8`});
    }

    /**
     * Tries to release the lock for the local library after completing a sync
     * @throws A Library Error, if the lock could not be released
     */
    async releaseLibraryLock() {
        const lockFilePath = path.join(this.options.dataDir, LIBRARY_LOCK_FILE);
        if (!fs.existsSync(lockFilePath)) {
            return;
        }

        const lockingProcess = (await fs.promises.readFile(lockFilePath, `utf-8`)).toString();
        if (lockingProcess !== process.pid.toString() && !this.options.force) {
            throw new iCPSError(LIBRARY_ERR.LOCKED)
                .addMessage(`Locked by PID ${lockingProcess}`);
        }

        await fs.promises.rm(lockFilePath, {"force": true});
    }
}

/**
 * This application will print the locally stored token, acquire a new one (if necessary) and print it to the CLI
 */
export class TokenApp extends iCloudApp {
    /**
     * This function will validate the currently stored account token and print it afterwards
     * @param eventHandlers - A list of EventHandlers that will be registering relevant objects
     * @returns A promise that resolves once the operation has been completed
     * @throws A TokenError in case an error occurs
     */
    async run(...eventHandlers: EventHandler[]): Promise<unknown> {
        try {
            await super.run(...eventHandlers);
            this.icloud.auth.validateAccountTokens();
            this.icloud.emit(ICLOUD.EVENTS.TOKEN, this.icloud.auth.iCloudAccountTokens.trustToken);
        } catch (err) {
            throw new iCPSError(APP_ERR.TOKEN)
                .addCause(err);
        } finally {
            // Only if this is the initiated class, release the lock
            if (this.constructor.name === TokenApp.name) {
                await this.clean();
            }
        }

        // Has to return something (TS2355)
        return true;
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
     * @param options - The parsed CLI options
     */
    constructor(options: iCPSAppOptions) {
        super(options);
        this.photosLibrary = new PhotosLibrary(this);
        this.syncEngine = new SyncEngine(this);
    }

    /**
     * Runs the synchronization of the local Photo Library
     * @param eventHandlers - A list of EventHandlers that will be registering relevant objects
     * @returns A Promise that resolves to a tuple containing a list of assets as fetched from the remote state. It can be assumed that this reflects the local state (given a warning free execution of the sync).
     * @throws A SyncError in case an error occurs
     */
    async run(...eventHandlers: EventHandler[]): Promise<unknown> {
        registerObjectsToEventHandlers(eventHandlers, this.photosLibrary, this.syncEngine);
        try {
            await super.run(...eventHandlers);
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
        removeObjectsFromEventHandlers(this.photosLibrary, this.syncEngine);
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
     * @param options - The parsed CLI options
     * @param archivePath - The path to the folder that should get archived
     */
    constructor(options: iCPSAppOptions, archivePath: string) {
        super(options);
        this.archivePath = archivePath;
        this.archiveEngine = new ArchiveEngine(this);
    }

    /**
     * This function will first perform a synchronization run and then attempt to archive the provided path
     * @param eventHandlers - A list of EventHandlers that will be registering relevant objects
     * @returns A promise that resolves once the operation has finished
     * @throws An ArchiveError in case an error occurs
     */
    async run(...eventHandlers: EventHandler[]): Promise<unknown> {
        registerObjectsToEventHandlers(eventHandlers, this.archiveEngine);
        try {
            const [remoteAssets] = await super.run(...eventHandlers) as [Asset[], Album[]];
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
        removeObjectsFromEventHandlers(this.archiveEngine);
    }
}