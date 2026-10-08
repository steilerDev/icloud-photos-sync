import {iCPSError} from "../../app/error/error.js";
import {MFA_ERR, AUTH_ERR, WEB_SERVER_ERR, LIBRARY_ERR} from "../../app/error/error-codes.js";
import {Resources} from "./main.js";
import {iCPSEventApp, iCPSEventCloud, iCPSEventLog, iCPSEventMFA, iCPSEventPhotos, iCPSEventRuntimeError, iCPSEventRuntimeWarning, iCPSEventSyncEngine, iCPSEventWebServer, iCPSState} from "./events-types.js";
import {CPLAsset} from "../icloud/icloud-photos/query-parser.js";
import {Asset} from "../photos-library/model/asset.js";
import {Album} from "../photos-library/model/album.js";
import {MFAMethod} from "../icloud/mfa/mfa-method.js";
import {TrustedPhoneNumber} from "./network-types.js";
import * as fs from 'fs';
import {hostname} from 'os';
import {randomUUID} from 'crypto';
import {setTimeout} from 'timers/promises';
import {jsonc} from "jsonc";
import {FILE_ENCODING, LibraryLockOwner} from "./resource-types.js";

export enum StateType {
    READY = `ready`,
    RUNNING = `running`,
    BLOCKED = `blocked`,
}

export enum StateTrigger {
    SYNC = `sync`,
    AUTH = `auth`,
}

type LogFilter = {
    level: LogLevel | `none`,
    source?: RegExp
}

export enum LogLevel {
    DEBUG = `debug`,
    INFO = `info`,
    WARN = `warn`,
    ERROR = `error`,
}

export type LogMessage = {
    level: LogLevel,
    time: number,
    source: string,
    message: string
}

export type SerializedState = {
    state: StateType,
    timestamp: number,
    nextSync?: number,
    prevError?: {
        message: string,
        code: string
    },
    prevTrigger?: StateTrigger,
    progress?: number,
    progressMsg?: string,
    trustedPhoneNumbers?: {
        id: number,
        maskedNumber: string
    }[]
}

export class StateManager {
    /**
     * Keeps track when the next scheduled sync should happen
     */
    nextSync?: number;
    /**
     * If error is present, previous state ended in error
     */
    prevError?: iCPSError
    /**
     * What triggered the current state initially (if applicable)
     */
    prevTrigger?: StateTrigger
    /**
     * The timestamp when the state was last changed
     */
    timestamp: number = Date.now();
    /**
     * THe full log since the last trigger
     */
    log?: LogMessage[]

    /**
     * Additional in progress context to provide more granular information on the current progress
     */
    inProgressContext: {
        message?: string,
        progress?: number
    } = {}

    /**
     * Tracking in progress assets (when relevant), in order to predict progress
     */
    inProgressAssets: {
        totalAssets: number,
        completedAssets: number
    } = {
        totalAssets: 0,
        completedAssets: 0
    }

    trustedPhoneNumbers?: TrustedPhoneNumber[] 

    /**
     * Current state of the application
     */
    state: StateType = StateType.READY;

    constructor() {
        // TRIGGERS
        Resources.events(this)
            .on(iCPSEventApp.SCHEDULED_START, () => {
                this.triggerSync(StateTrigger.SYNC);
            })
            .on(iCPSEventWebServer.REAUTH_REQUESTED, () => {
                this.triggerSync(StateTrigger.AUTH);
            });
        
        // Auth & setup process (0-20%)
        Resources.events(this)
            .on(iCPSEventCloud.AUTHENTICATION_STARTED, () => {
                this.updateState(StateType.RUNNING, {
                    progressMsg: `Authenticating user...`,
                    progress: 1 * (this.prevTrigger === StateTrigger.AUTH ? 12.5 : 1)
                });
            })
            .on(iCPSEventCloud.MFA_REQUIRED, (trustedPhoneNumbers: TrustedPhoneNumber[]) => {
                this.updateState(StateType.BLOCKED, {
                    progressMsg: `Waiting for MFA code...`,
                    progress: 2 * (this.prevTrigger === StateTrigger.AUTH ? 12.5 : 1),
                    trustedPhoneNumbers
                })
            })
            .on(iCPSEventMFA.MFA_RESEND, (method: MFAMethod) => {
                this.updateState(StateType.BLOCKED, {
                    progressMsg: `Resending MFA code via ${method.toString()}...`,
                    progress: 2 * (this.prevTrigger === StateTrigger.AUTH ? 12.5 : 1)
                });
            })
            .on(iCPSEventMFA.MFA_RECEIVED, (method: MFAMethod, code: string) => {
                this.updateState(StateType.BLOCKED, {
                    progressMsg: `MFA code received from ${method.toString()} (${code})`,
                    progress: 2 * (this.prevTrigger === StateTrigger.AUTH ? 12.5 : 1)
                });
            })
            .on(iCPSEventCloud.AUTHENTICATED, () => {
                this.updateState(StateType.RUNNING, {
                    progressMsg: `User authenticated`,
                    progress: 5 * (this.prevTrigger === StateTrigger.AUTH ? 12.5 : 1)
                });
            })
            .on(iCPSEventCloud.TRUSTED, () => {
                this.updateState(StateType.RUNNING, {
                    progressMsg: `Device trusted`,
                    progress: 8 * (this.prevTrigger === StateTrigger.AUTH ? 12.5 : 1)
                });
            })
            .on(iCPSEventCloud.PCS_REQUIRED, () => {
                this.updateState(StateType.RUNNING, {progressMsg: `Advanced Data Protection requires additional cookies, acquiring...`, progress: 9});
            })
            .on(iCPSEventCloud.PCS_NOT_READY, () => {
                this.updateState(StateType.RUNNING, {progressMsg: `Advanced Data Protection request not confirmed yet, retrying...`, progress: 9});
            })
            .on(iCPSEventCloud.ACCOUNT_READY, () => {
                this.updateState(StateType.RUNNING, {progressMsg: `Sign in successful!`, progress: 10});
            })
            .on(iCPSEventCloud.SESSION_EXPIRED, () => {
                this.updateState(StateType.RUNNING, {progressMsg: `Session expired, re-authenticating...`, progress: 0});
            })
            .on(iCPSEventPhotos.SETUP_COMPLETED, () => {
                this.updateState(StateType.RUNNING, {progressMsg: `iCloud Photos setup completed, checking indexing status...`, progress: 11});
            })
            .on(iCPSEventPhotos.READY, () => {
                this.updateState(StateType.RUNNING, {progressMsg: `iCloud Photos ready!`, progress: 15});
            });

        // Sync process
        Resources.events(this)
            .on(iCPSEventSyncEngine.START, () => {
                this.updateState(StateType.RUNNING, {progressMsg: `Starting sync...`, progress: 15});
            })
            .on(iCPSEventSyncEngine.FETCH_N_LOAD, () => {
                this.updateState(StateType.RUNNING, {progressMsg: `Loading local & fetching remote iCloud Library state...`, progress: 16});
            })
            .on(iCPSEventSyncEngine.FETCH_N_LOAD_COMPLETED, (remoteAssetCount: number, remoteAlbumCount: number, localAssetCount: number, localAlbumCount: number) => {
                this.updateState(StateType.RUNNING, {progressMsg: `Loaded local (${localAssetCount} assets in ${localAlbumCount} albums) & remote state (${remoteAssetCount} assets in ${remoteAlbumCount} albums)`, progress: 23});
            })
            .on(iCPSEventSyncEngine.DIFF, () => {
                this.updateState(StateType.RUNNING, {progressMsg: `Diffing remote with local state...`, progress: 24});
            })
            .on(iCPSEventSyncEngine.DIFF_COMPLETED, () => {
                this.updateState(StateType.RUNNING, {progressMsg: `Diffing completed!`, progress: 25});
            })
            .on(iCPSEventSyncEngine.WRITE, () => {
                this.updateState(StateType.RUNNING, {progressMsg: `Writing diff to disk...`, progress: 25});
            })
            .on(iCPSEventSyncEngine.WRITE_ASSETS, (_toBeDeletedCount: number, toBeAddedCount: number, _toBeKept: number) => {
                this.updateState(StateType.RUNNING, {progressMsg: `Syncing assets: 0/${toBeAddedCount}`, progress: 25});
                this.inProgressAssets = {
                    totalAssets: toBeAddedCount,
                    completedAssets: 0
                }
            })
            .on(iCPSEventSyncEngine.WRITE_ASSET_COMPLETED, () => {
                this.inProgressAssets.completedAssets++
                const inProgressPercentage = this.inProgressAssets.completedAssets/this.inProgressAssets.totalAssets
                this.updateState(StateType.RUNNING, {progressMsg: `Syncing assets: ${this.inProgressAssets.completedAssets}/${this.inProgressAssets.totalAssets}`, progress: 25 + (inProgressPercentage * 65)});
            })
            .on(iCPSEventRuntimeWarning.WRITE_ASSET_ERROR, () => {
                this.inProgressAssets.completedAssets++
                const inProgressPercentage = this.inProgressAssets.completedAssets/this.inProgressAssets.totalAssets
                this.updateState(StateType.RUNNING, {progressMsg: `Syncing assets: ${this.inProgressAssets.completedAssets}/${this.inProgressAssets.totalAssets}`, progress: 25 + (inProgressPercentage * 65)});
            })
            .on(iCPSEventSyncEngine.WRITE_ASSETS_COMPLETED, () => {
                this.updateState(StateType.RUNNING, {progressMsg: `Asset sync completed!`, progress: 90});
            })
            .on(iCPSEventSyncEngine.WRITE_ALBUMS, () => {
                this.updateState(StateType.RUNNING, {progressMsg: `Syncing albums...`, progress: 91});
            })
            .on(iCPSEventSyncEngine.WRITE_ALBUMS_COMPLETED, () => {
                this.updateState(StateType.RUNNING, {progressMsg: `Album sync completed!`, progress: 98});
            })
            .on(iCPSEventSyncEngine.WRITE_COMPLETED, () => {
                this.updateState(StateType.RUNNING, {progressMsg: `Successfully wrote diff to disk!`, progress: 99});
            })
            .on(iCPSEventSyncEngine.RETRY, (retryCount: number, err: iCPSError) => {
                this.updateState(StateType.RUNNING, {progressMsg: `Detected error during sync: ${iCPSError.toiCPSError(err).getDescription()}, Refreshing iCloud connection & retrying (attempt #${retryCount})...`, progress: 15});
            })
            .on(iCPSEventSyncEngine.REFRESH, (writtenAssets: number) => {
                this.updateState(StateType.RUNNING, {progressMsg: `Download URLs expired after writing ${writtenAssets} assets, refreshing remote state...`, progress: 15});
            });


        // SUCCESS
        Resources.events(this)
            .on(iCPSEventApp.SCHEDULED_DONE, (nextSync: Date) => {
                this.updateState(StateType.READY, {nextSync: nextSync.getTime()});
            })
            .on(iCPSEventApp.TOKEN, () => {
                this.updateState(StateType.READY);
            })
            .on(iCPSEventApp.SCHEDULED, (timestamp: Date) => {
                this.updateState(StateType.READY, {nextSync: timestamp.getTime()});
            });

        // ERROR
        Resources.events(this)
            .on(iCPSEventRuntimeError.SCHEDULED_ERROR, (err: iCPSError) => {
                this.updateState(StateType.READY, {error: err});
            })
            .on(iCPSEventMFA.MFA_NOT_PROVIDED, () => {
                this.updateState(StateType.READY, {error: new iCPSError(WEB_SERVER_ERR.MFA_CODE_NOT_PROVIDED)});
            })
            .on(iCPSEventWebServer.REAUTH_ERROR, (err: iCPSError) => {
                this.updateState(StateType.READY, {error: err});
            });

        // Logs
        Resources.events(this)
            .on(iCPSEventLog.DEBUG, (source: unknown, msg: string) => this.addLog(LogLevel.DEBUG, source, msg))
            .on(iCPSEventLog.INFO, (source: unknown, msg: string) => this.addLog(LogLevel.INFO, source, msg))
            .on(iCPSEventLog.WARN, (source: unknown, msg: string) => this.addLog(LogLevel.WARN, source, msg))
            .on(iCPSEventRuntimeWarning.COUNT_MISMATCH, (album: string, expectedCount: number, actualCPLAssets: number, actualCPLMasters: number) => {
                this.addLog(LogLevel.WARN, `RuntimeWarning`, `Expected ${expectedCount} CPLAssets & CPLMasters, but got ${actualCPLAssets} CPLAssets and ${actualCPLMasters} CPLMasters for album ${album}`);
            })
            .on(iCPSEventRuntimeWarning.FILETYPE_ERROR, (ext: string, descriptor: string) => {
                this.addLog(LogLevel.WARN, `RuntimeWarning`, `Unknown file extension ${ext} for descriptor ${descriptor}`);
            })
            .on(iCPSEventRuntimeWarning.LIBRARY_LOAD_ERROR, (err: Error, filePath: string) => {
                this.addLog(LogLevel.WARN, `RuntimeWarning`, `Error while loading file ${filePath}: ${iCPSError.toiCPSError(err).getDescription()}`);
            })
            .on(iCPSEventRuntimeWarning.EXTRANEOUS_FILE, (filePath: string) => {
                this.addLog(LogLevel.WARN, `RuntimeWarning`, `Extraneous file found in directory ${filePath}`);
            })
            .on(iCPSEventRuntimeWarning.ICLOUD_LOAD_ERROR, (err: Error, asset: CPLAsset) => {
                this.addLog(LogLevel.WARN, `RuntimeWarning`, `Error while loading iCloud asset ${asset.recordName}: ${iCPSError.toiCPSError(err).getDescription()}`);
            })
            .on(iCPSEventRuntimeWarning.WRITE_ASSET_ERROR, (err: Error, asset: Asset) => {
                this.addLog(LogLevel.WARN, `RuntimeWarning`, `Error while verifying asset ${asset?.getDisplayName()}: ${iCPSError.toiCPSError(err).getDescription()}`);
            })
            .on(iCPSEventRuntimeWarning.WRITE_ALBUM_ERROR, (err: Error, album: Album) => {
                this.addLog(LogLevel.WARN, `RuntimeWarning`, `Error while writing album ${album?.getDisplayName()}: ${iCPSError.toiCPSError(err).getDescription()}`);
            })
            .on(iCPSEventRuntimeWarning.LINK_ERROR, (err: Error, srcPath: string, dstPath: string) => {
                this.addLog(LogLevel.WARN, `RuntimeWarning`, `Error while linking ${srcPath} to ${dstPath}: ${iCPSError.toiCPSError(err).getDescription()}`);
            })
            .on(iCPSEventRuntimeWarning.MFA_ERROR, (err: iCPSError) => {
                this.addLog(LogLevel.WARN, `RuntimeWarning`, `Error within MFA flow: ${iCPSError.toiCPSError(err).getDescription()}`);
            })
            .on(iCPSEventRuntimeWarning.WEB_SERVER_ERROR, (err: iCPSError) => {
                this.addLog(LogLevel.WARN, `RuntimeWarning`, `Error within web server: ${iCPSError.toiCPSError(err).getDescription()}`);
            })
            .on(iCPSEventRuntimeWarning.TRUSTED_PHONE_NUMBERS_ERROR, (err: iCPSError) => {
                this.addLog(LogLevel.WARN, `RuntimeWarning`, `Error while loading trusted phone numbers: ${iCPSError.toiCPSError(err).getDescription()}`);
            })
            .on(iCPSEventRuntimeWarning.RESOURCE_FILE_ERROR, (err: Error) => {
                this.addLog(LogLevel.WARN, `RuntimeWarning`, `Error while accessing resource file: ${iCPSError.toiCPSError(err).getDescription()}`);
            })
            .on(iCPSEventRuntimeWarning.ARCHIVE_ASSET_ERROR, (err: Error, assetPath: string) => {
                this.addLog(LogLevel.WARN, `RuntimeWarning`, `Error while archiving asset ${assetPath}: ${iCPSError.toiCPSError(err).getDescription()}`);
            })
            .on(iCPSEventSyncEngine.RETRY, (_retryCount: number, err: Error) => {
                this.addLog(LogLevel.WARN, `RuntimeWarning`, `Detected error during sync: ${iCPSError.toiCPSError(err).getDescription()}`);
            })
            .on(iCPSEventLog.ERROR, (source: unknown, msg: string) => this.addLog(LogLevel.ERROR, source, msg))
            .on(iCPSEventRuntimeError.HANDLED_ERROR, (err: iCPSError) => this.addLog(LogLevel.ERROR, `RuntimeError`, iCPSError.toiCPSError(err).getDescription()));
    }

    /**
     * This function updates the state using the provided context
     * @param newState - the new state
     * @param ctx - context for the new state, note: only relevant properties will be overwritten
     * @emits iCPSState.STATE_CHANGED with a serialized copy of the new state
     */
    updateState(newState: StateType, ctx? : {error?: iCPSError, nextSync?: number, progress?: number, progressMsg?: string, trustedPhoneNumbers?: TrustedPhoneNumber[]}) {
        this.timestamp = Date.now();
        this.state = newState;
        if(ctx) {
            if(ctx.nextSync) {
                this.nextSync = ctx.nextSync;
            }
            if(ctx.error) {
                this.prevError = iCPSError.toiCPSError(ctx.error);
            }
            if(ctx.progress || ctx.progressMsg) {
                this.inProgressContext = {
                    progress: ctx.progress,
                    message: ctx.progressMsg
                }
            }
            if(ctx.trustedPhoneNumbers) {
                this.trustedPhoneNumbers = ctx.trustedPhoneNumbers
            }
        }
        Resources.event().emit(iCPSState.STATE_CHANGED, this.serialize())
    }

    /**
     * Indicates that the current state was changed due to a trigger (such as sync or auth).
     * This will clear any previous error and logs.
     * @param trigger - The trigger that caused the state change
     */
    triggerSync(trigger: StateTrigger) {
        this.prevTrigger = trigger;
        this.prevError = undefined;
        this.log = []
        this.inProgressAssets = {
            totalAssets: 0,
            completedAssets: 0
        }
        this.updateState(StateType.RUNNING, {progress: 0, progressMsg: `Starting ${trigger}...`})
    }

    addLog(level: LogLevel, source: string | any, message: string) {
        if(!this.log) {
            this.log = []
        }

        const msg = {
            level,
            message,
            source: typeof source === `string` ? source : String(source.constructor.name),
            time: Date.now()
        }

        this.log.push(msg)
        Resources.event().emit(iCPSState.LOG_ADDED, msg)
    }

    /**
     * Serializes the state object for transfer
     * @returns The serialized object
     */
    serialize(): SerializedState {
        let error = undefined
        if(this.prevError) {
            error = {
                message: this.prevError.getDescription(),
                code: this.prevError.getRootErrorCode(),
            }

            /**
             * If possible, this will try to convert known error codes into user-friendly messages
             */
            switch (error.code) {
            case MFA_ERR.FAIL_ON_MFA.code:
                error.message = `MFA code required. Use the 'Renew Authentication' button to request and enter a new code.`;
                break;
            case AUTH_ERR.UNAUTHORIZED.code:
                error.message = `Your credentials seem to be invalid. Please check your iCloud credentials and try again.`;
                break;
            case WEB_SERVER_ERR.MFA_CODE_NOT_PROVIDED.code:
                error.message = `MFA code not provided within timeout period. Use the 'Renew Authentication' button to request and enter a new code.`;
                break;
            }
        }

        let trustedPhoneNumbers = undefined
        if(this.trustedPhoneNumbers) {
            trustedPhoneNumbers = this.trustedPhoneNumbers.map((value) => {
                return {
                    id: value.id,
                    maskedNumber: value.numberWithDialCode
                }
            })
        }

        return {
            state: this.state,
            nextSync: this.nextSync,
            prevError: error,
            prevTrigger: this.prevTrigger,
            timestamp: this.timestamp,
            progress: this.inProgressContext?.progress,
            progressMsg: this.inProgressContext?.message,
            trustedPhoneNumbers
        };
    }

    /**
     * @param logFilter - A filter that will provide log messages for the current run
     * @returns An array of log messages filtered by log level
     */
    serializeLog(logFilter: LogFilter): LogMessage[] {
        if(logFilter.level === `none`) {
            return []
        }

        const logLevels: LogLevel[] = []
        /* eslint-disable no-fallthrough */
        switch(logFilter.level) {
        case LogLevel.DEBUG:
            logLevels.push(LogLevel.DEBUG)
        case LogLevel.INFO:
            logLevels.push(LogLevel.INFO)
        case LogLevel.WARN:
            logLevels.push(LogLevel.WARN)
        case LogLevel.ERROR:
            logLevels.push(LogLevel.ERROR)
        }

        return (this.log ?? []).filter(_value => {
            return logLevels.includes(_value.level) && (logFilter?.source === undefined || _value.source.match(logFilter.source) !== null)
        })
    }

    /**
     * Timings (in ms) of the library lock
     */
    _lockTimings = {
        /**
         * Interval in which the lock holder refreshes the modification time of the lock file
         */
        heartbeat: 15 * 1000,
        /**
         * Age of the last heartbeat, after which a lock is considered stale
         */
        stale: 60 * 1000,
        /**
         * Interval in which a lock is checked, while waiting for its heartbeat
         */
        poll: 1000,
    };

    /**
     * Uniquely identifies this process as holder of the library lock - process ids are not unique across containers (e.g. PID 1)
     */
    _lockInstance: string = randomUUID();

    /**
     * Timer refreshing the heartbeat of the library lock - only set while the lock is held
     */
    _lockHeartbeat?: NodeJS.Timeout;

    /**
     * Tries to acquire the lock for the local library to execute a sync.
     * A lock held by another process is only removed, if it is stale: Its heartbeat expired or its process is no longer running on this host.
     * If the liveness of the process cannot be verified (because it is running on a different host or container), this function waits for the next heartbeat of the lock.
     * While the lock is held, its heartbeat is refreshed periodically.
     * @returns A promise that resolves once the lock was acquired
     * @throws An iCPSError, if the lock could not be acquired
     */
    async acquireLibraryLock() {
        const lockStat = Resources.getLockStat();

        if (lockStat.lockFileExists) {
            if (lockStat.owner?.instance !== this._lockInstance) {
                if (Resources.manager().force) {
                    Resources.logger(this).warn(`Forcefully removing lock held by ${this.describeLockOwner(lockStat)}`);
                } else {
                    await this.verifyLockIsStale(lockStat);
                    Resources.logger(this).info(`Clearing stale lock held by ${this.describeLockOwner(lockStat)}`);
                }
            }

            fs.rmSync(lockStat.lockFilePath, {force: true});
        }

        const owner: LibraryLockOwner = {
            instance: this._lockInstance,
            pid: process.pid,
            hostname: hostname(),
        };

        try {
            // Exclusively creating the file, in case another process acquired the lock in the meantime
            fs.writeFileSync(lockStat.lockFilePath, jsonc.stringify(owner), {encoding: FILE_ENCODING, flush: true, flag: `wx`});
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code === `EEXIST`) {
                throw new iCPSError(LIBRARY_ERR.LOCKED)
                    .addMessage(`Lock was acquired by another process`);
            }

            throw err;
        }

        this.startLockHeartbeat();
    }

    /**
     * Verifies that the provided lock (held by another process) is stale - waits for the next heartbeat, if this cannot be determined immediately
     * @param lockStat - The current lock information
     * @returns A promise that resolves, if the lock is stale
     * @throws An iCPSError, if the lock is held by a running process
     */
    async verifyLockIsStale(lockStat: Resources.LockStat) {
        const owner = lockStat.owner ?? {pid: NaN};

        if (Date.now() - lockStat.lastHeartbeat > this._lockTimings.stale) {
            return;
        }

        // Lock files of previous versions do not contain a hostname and were only checked on the same host
        const sameHost = owner.hostname === undefined || owner.hostname === hostname();
        if (sameHost && owner.pid !== process.pid) {
            // An unparsable lock file does not identify a running process
            if (Number.isInteger(owner.pid) && Resources.pidIsRunning(owner.pid)) {
                throw new iCPSError(LIBRARY_ERR.LOCKED)
                    .addMessage(`Locked by ${this.describeLockOwner(lockStat)}`);
            }

            return;
        }

        // The process cannot be checked from here (e.g. running in another container, potentially with the same PID) - waiting for the heartbeat to be refreshed or to expire
        const deadline = lockStat.lastHeartbeat + this._lockTimings.stale;
        Resources.logger(this).info(`Library is locked by ${this.describeLockOwner(lockStat)}, waiting up to ${Math.ceil(Math.max(deadline - Date.now(), 0) / 1000)}s for the lock to expire`);

        while (Date.now() <= deadline) {
            await setTimeout(this._lockTimings.poll);

            const currentLockStat = Resources.getLockStat();
            if (!currentLockStat.lockFileExists) {
                // Lock was released
                return;
            }

            if (currentLockStat.owner?.instance !== owner.instance || currentLockStat.lastHeartbeat !== lockStat.lastHeartbeat) {
                throw new iCPSError(LIBRARY_ERR.LOCKED)
                    .addMessage(`Locked by ${this.describeLockOwner(currentLockStat)}`);
            }
        }
    }

    /**
     * @param lockStat - The lock information
     * @returns A human readable description of the process holding the lock
     */
    describeLockOwner(lockStat: Resources.LockStat): string {
        const owner = lockStat.owner ?? {pid: NaN};
        const heartbeatAge = Math.round((Date.now() - lockStat.lastHeartbeat) / 1000);
        return `PID ${owner.pid}${owner.hostname ? ` on ${owner.hostname}` : ``} (last heartbeat ${heartbeatAge}s ago)`;
    }

    /**
     * Starts refreshing the heartbeat of the library lock periodically
     */
    startLockHeartbeat() {
        this.stopLockHeartbeat();
        this._lockHeartbeat = setInterval(() => this.refreshLibraryLock(), this._lockTimings.heartbeat);
        // The heartbeat should not keep the process alive
        this._lockHeartbeat.unref();
    }

    /**
     * Stops refreshing the heartbeat of the library lock
     */
    stopLockHeartbeat() {
        clearInterval(this._lockHeartbeat);
        this._lockHeartbeat = undefined;
    }

    /**
     * Refreshes the heartbeat of the library lock, by updating the modification time of the lock file.
     * Stops the heartbeat, if the lock is no longer held by this process.
     */
    refreshLibraryLock() {
        try {
            const {lockFileExists, lockFilePath, owner} = Resources.getLockStat();
            if (!lockFileExists || owner?.instance !== this._lockInstance) {
                Resources.logger(this).warn(`Library lock was removed or acquired by another process`);
                this.stopLockHeartbeat();
                return;
            }

            const now = new Date();
            fs.utimesSync(lockFilePath, now, now);
        } catch (err) {
            Resources.logger(this).warn(`Unable to refresh library lock: ${err}`);
        }
    }

    /**
     * Releases the lock for the local library, if it is held by this process
     */
    releaseLibraryLock() {
        this.stopLockHeartbeat();
        const lockStat = Resources.getLockStat();

        if (!lockStat.lockFileExists) {
            Resources.logger(this).warn(`Cannot release lock: Lock file does not exist.`);
            return;
        }

        if (lockStat.owner?.instance !== this._lockInstance) {
            Resources.logger(this).warn(`Not releasing lock held by ${this.describeLockOwner(lockStat)}`);
            return;
        }

        fs.rmSync(lockStat.lockFilePath, {force: true});
    }
}