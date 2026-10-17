import {Cron} from "croner";
import {ArchiveEngine} from "../lib/archive-engine/archive-engine.js";
import {iCloud} from "../lib/icloud/icloud.js";
import type {Album} from "../lib/photos-library/model/album.js";
import type {Asset} from "../lib/photos-library/model/asset.js";
import {PhotosLibrary} from "../lib/photos-library/photos-library.js";
import {iCPSEventApp, iCPSEventCloud, iCPSEventPhotos, iCPSEventRuntimeError, iCPSEventRuntimeWarning, iCPSEventWebServer} from "../lib/resources/events-types.js";
import {Resources} from "../lib/resources/main.js";
import {SyncEngine} from "../lib/sync-engine/sync-engine.js";
import {APP_ERR, AUTH_ERR } from "./error/error-codes.js";
import {errorMessage, iCPSError} from "./error/error.js";
import {StateType} from "../lib/resources/state-manager.js";

/**
 * Abstract class returned by the factory function
 */
export abstract class iCPSApp {
    /**
     * Executes this app
     */
    abstract run(): Promise<unknown>;
}

/**
 * This app will allow running in scheduled daemon mode - where a sync is executed based on a cron schedule
 */
export class DaemonApp extends iCPSApp {
    /**
     * Holds the cron job - available once the app is running
     */
    job?: Cron;

    /**
     * Schedules triggering syncs closer than this interval (in ms) are most likely misconfigured
     */
    static readonly MIN_SCHEDULE_INTERVAL = 60 * 60 * 1000;

    /**
     * Number of upcoming runs that are inspected to determine the schedule's frequency
     */
    static readonly INSPECTED_RUNS = 10;

    /**
     * Schedule the synchronization based on the provided cron string
     * @returns Once the job has been scheduled
     * @emits iCPSEventRuntimeWarning.SCHEDULE_FREQUENCY - If the schedule triggers syncs more often than once per hour - provides the iCPSError as argument
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
        // performScheduledSync() never rejects, errors are emitted as iCPSEventRuntimeError.SCHEDULED_ERROR
        Resources.events(this).on(iCPSEventWebServer.SYNC_REQUESTED, () => void this.job?.trigger());
        this.checkScheduleFrequency(this.job);
        Resources.emit(iCPSEventApp.SCHEDULED, this.job?.nextRun());
    }

    /**
     * Warns, if the schedule triggers syncs more often than once per hour. This is most likely a misconfiguration, e.g. `* 2 * * *` (every minute between 02:00 and 02:59) instead of `0 2 * * *` (daily at 02:00).
     * @param job - The scheduled job
     * @emits iCPSEventRuntimeWarning.SCHEDULE_FREQUENCY - If the schedule triggers syncs more often than once per hour - provides the iCPSError as argument
     */
    checkScheduleFrequency(job: Cron) {
        const nextRuns = job.nextRuns(DaemonApp.INSPECTED_RUNS);
        let shortestInterval = Infinity;
        for (let i = 1; i < nextRuns.length; i++) {
            shortestInterval = Math.min(shortestInterval, nextRuns[i].getTime() - nextRuns[i - 1].getTime());
        }

        if (shortestInterval >= DaemonApp.MIN_SCHEDULE_INTERVAL) {
            return;
        }

        const schedule = Resources.manager().schedule;
        const warning = new iCPSError(APP_ERR.SCHEDULE_FREQUENCY);

        // The common mistake of a wildcard minute with a fixed hour - e.g. `* 2 * * *` instead of `0 2 * * *`
        const [minute, hour, ...rest] = schedule.trim().split(/\s+/);
        if (rest.length === 3 && minute === `*` && /^\d{1,2}$/.test(hour)) {
            const paddedHour = hour.padStart(2, `0`);
            warning.addMessage(`'${schedule}' runs every minute between ${paddedHour}:00 and ${paddedHour}:59 - did you mean '0 ${hour} ${rest.join(` `)}'?`);
        } else {
            warning.addMessage(`'${schedule}' runs as often as every ${DaemonApp.formatInterval(shortestInterval)}`);
        }

        Resources.emit(iCPSEventRuntimeWarning.SCHEDULE_FREQUENCY, warning);
    }

    /**
     * @param interval - The interval in ms
     * @returns A human readable representation of the interval, in seconds or minutes
     */
    static formatInterval(interval: number): string {
        if (interval < 60 * 1000) {
            const seconds = Math.max(1, Math.round(interval / 1000));
            return seconds === 1 ? `second` : `${seconds} seconds`;
        }

        const minutes = Math.round(interval / (60 * 1000));
        return minutes === 1 ? `minute` : `${minutes} minutes`;
    }

    /**
     * Perform a scheduled sync
     * @param syncApp - Parametrized for testability - will be freshly initiated if omitted
     */
    async performScheduledSync(syncApp?: SyncApp) {
        // Another operation (e.g. a re-authentication triggered through the Web UI) is still in progress - skipping this run
        // This needs to be checked before emitting SCHEDULED_START, since that event moves the state to RUNNING
        if (Resources.state().state !== StateType.READY) {
            Resources.emit(iCPSEventApp.SCHEDULED_OVERRUN, this.job?.nextRun());
            return;
        }

        try {
            Resources.emit(iCPSEventApp.SCHEDULED_START);
            // Created within the try block, since setting up the library can fail (e.g. VERSION_MISMATCH)
            syncApp ??= new SyncApp();
            const remoteState = await syncApp.run() as [Asset[], Album[]] | undefined;

            // No remote state means that the MFA code was not provided - the state was already updated (an empty library is a successful sync)
            if (remoteState !== undefined) {
                Resources.emit(iCPSEventApp.SCHEDULED_DONE, this.job?.nextRun());
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
    icloud: iCloud = new iCloud()

    /**
     * This function establishes the iCloud connection.
     * @returns A promise that resolves to true once the iCloud service is fully available. If it resolves to false, the MFA code was not provided in time and the object is not ready.
     * @throws An iCPSError in case an error occurs
     */
    async run(): Promise<unknown> {
        try {
            return await this.icloud.authenticate();
        } catch (err) {
            throw new iCPSError(AUTH_ERR.FAILED)
                .addCause(err);
        }
    }

    /**
     * Removes all established event listeners, resets the network connection 
     */
    async clean() {
        await Resources.network().resetSession();
        Resources.events(this.icloud.photos).removeListeners();
        Resources.events(this.icloud).removeListeners();

        try {
            await this.icloud.logout();
        } catch (err) {
            Resources.logger(this).warn(`Failed to logout from iCloud: ${errorMessage(err)}`);
        }
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
    photosLibrary: PhotosLibrary = new PhotosLibrary();

    /**
     * This sessions' Sync Engine object
     */
    syncEngine: SyncEngine = new SyncEngine(this.icloud, this.photosLibrary);

    /**
     * Runs the synchronization of the local Photo Library
     * @returns A Promise that resolves to a tuple containing the list of assets and albums as fetched from the remote state, or undefined, if the iCloud connection was not established successfully (because the MFA code was not provided in time).
     * @throws An iCPSError in case an error occurs
     */
    async run(): Promise<unknown> {
        try {
            const ready = await super.run() as boolean;
            if (!ready) {
                return undefined;
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
    archiveEngine: ArchiveEngine = new ArchiveEngine(this.icloud, this.photosLibrary);

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
    }

    /**
     * This function will first perform a synchronization run and then attempt to archive the provided path
     * @returns A promise that resolves once the operation has finished
     * @throws An ArchiveError in case an error occurs
     */
    async run(): Promise<unknown> {
        try {
            const remoteState = await super.run() as [Asset[], Album[]] | undefined;
            // If the MFA code was not provided, no remote assets are available (and therefore none are deleted remotely)
            return await this.archiveEngine.archivePath(this.archivePath, remoteState?.[0] ?? []);
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