/**
 * This class handles access to the .icloud-photos-sync resource file and handles currently applied configurations from the CLI and environment variables as well as other shared resources
 */

import {iCPSError} from "../../app/error/error.js";
import {RES_MANAGER_ERR} from "../../app/error/error-codes.js";
import {iCPSAppOptions} from "../../app/factory.js";
import * as PHOTOS_LIBRARY from '../photos-library/constants.js';
import * as path from 'path';
import {readFileSync, writeFileSync} from "fs";
import {FILE_ENCODING, HAR_FILE_NAME, LOG_FILE_NAME, METRICS_FILE_NAME, PhotosAccountZone, RESOURCE_FILE_NAME, ResourceFile, iCPSResources} from "./resources.js";
import {Validator} from "./validator.js";
import {NetworkManager} from "./network-manager.js";
import {iCPSEventError, iCPSEventResourceManager} from "./events.js";
import {LogLevel} from "../../app/event/log.js";
import {EventManager} from "./event-manager.js";
import {Resources} from "./main.js";

export class ResourceManager {
    /**
     * The shared resources held by this instances of the icps application
     */
    _resources: iCPSResources = {} as iCPSResources;

    /**
     * Local axios instance to handle network requests
     */
    _networkManager: NetworkManager;

    /**
     * Access to shared validator functionalities
     */
    _validator: Validator = new Validator();

    /**
     * Access to the central event bus
     */
    _eventManager: EventManager = new EventManager();

    /**
     * Creates the resource manager, based on the previously parsed iCPSAppOptions.
     * Should not be called directly, but through the static setup function.
     * @param appOptions - The parsed app options
     */
    constructor(appOptions: iCPSAppOptions) {
        // Cannot use logger here
        Object.assign(this._resources, appOptions);

        if (this._resources.refreshToken) {
            this._trustToken = undefined;
        }

        this._networkManager = new NetworkManager(this._resources);
    }

    /**
     * Reads the resource file from disk and parses it
     */
    readResourceFile(): ResourceFile {
        try {
            Resources.logger(this).debug(`Reading resource file from ${this._resourceFilePath}`);
            const resourceFileData = JSON.parse(readFileSync(this._resourceFilePath, {encoding: FILE_ENCODING}));
            return this._validator.validateResourceFile(resourceFileData);
        } catch (err) {
            Resources.emit(iCPSEventResourceManager.NO_RESOURCE_FILE_FOUND);
            Resources.logger(this).debug(`No resource file found returning default values`);
            return {
                libraryVersion: PHOTOS_LIBRARY.LIBRARY_VERSION,
                trustToken: undefined,
            };
        }
    }

    /**
     * Writes the resource file to disk
     */
    writeResourceFile() {
        try {
            const formattedResourceFile: ResourceFile = {
                libraryVersion: this._libraryVersion,
                trustToken: this._trustToken,
            };
            const resourceFileData = JSON.stringify(formattedResourceFile, null, 4);
            Resources.logger(this).debug(`Writing resource file to ${this._resourceFilePath}`);

            writeFileSync(this._resourceFilePath, resourceFileData, {encoding: FILE_ENCODING});
        } catch (err) {
            Resources.emit(iCPSEventError.HANDLER_EVENT, new iCPSError(RES_MANAGER_ERR.UNABLE_TO_WRITE_FILE)
                .setWarning()
                .addCause(err));
        }
    }

    /**
     * @returns The data dir read from the CLI Options
     */
    get _dataDir(): string {
        return this._resources.dataDir;
    }

    /**
     * @returns The path to the resource file
     */
    get _resourceFilePath(): string {
        return path.format({
            dir: this._dataDir,
            base: RESOURCE_FILE_NAME,
        });
    }

    /**
     * @returns The path to the log file, or undefined if logging to CLI is enabled
     */
    get _logFilePath(): string | undefined {
        if (!this._resources.logToCli) {
            return path.format({
                dir: this._dataDir,
                base: LOG_FILE_NAME,
            });
        }

        return undefined;
    }

    /**
     * @returns The path to the metrics file, or undefined if metrics are disabled
     */
    get _metricsFilePath(): string | undefined {
        if (this._resources.exportMetrics) {
            return path.format({
                dir: this._dataDir,
                base: METRICS_FILE_NAME,
            });
        }

        return undefined;
    }

    /**
     * @returns The path to the metrics file, or undefined if network capture is disabled
     */
    get _harFilePath(): string | undefined {
        if (this._resources.enableNetworkCapture) {
            return path.format({
                dir: this._dataDir,
                base: HAR_FILE_NAME,
            });
        }

        return undefined;
    }

    /**
     * @returns The currently loaded libraries version
     */
    get _libraryVersion(): number {
        const {libraryVersion} = this.readResourceFile();
        if (libraryVersion !== undefined) {
            this._resources.libraryVersion = libraryVersion;
        }

        return this._resources.libraryVersion;
    }

    /**
     * @returns The currently used trust token, or undefined if none is set. The supplied trust token from the CLI options takes precedence over the one from the resource file.
     */
    get _trustToken(): string | undefined {
        const {trustToken} = this.readResourceFile();
        if (trustToken !== undefined) {
            this._resources.trustToken = trustToken;
        }

        return this._resources.trustToken;
    }

    /**
     * Sets the trust token and syncs the resource file.
     * @param trustToken - The trust token to use
     */
    set _trustToken(trustToken: string | undefined) {
        this._resources.trustToken = trustToken;
        this.writeResourceFile();
    }

    /**
     * @returns The iCloud username
     */
    get _username(): string {
        return this._resources.username;
    }

    /**
     * @returns The iCloud user password
     */
    get _password(): string {
        return this._resources.password;
    }

    /**
     * @returns The port to use for the MFA server
     */
    get _mfaServerPort(): number {
        return this._resources.port;
    }

    /**
     * @returns The number of retries to use for downloading
     */
    get _maxRetries(): number {
        return this._resources.maxRetries;
    }

    /**
     * @returns The number of threads to use for downloading
     */
    get _downloadThreads(): number {
        return this._resources.downloadThreads;
    }

    /**
     * @returns The schedule of the application
     */
    get _schedule(): string {
        return this._resources.schedule;
    }

    /**
     * @returns If the application should enable crash reporting
     */
    get _enableCrashReporting(): boolean {
        return this._resources.enableCrashReporting;
    }

    /**
     * @returns If the application should fail on MFA requirement
     */
    get _failOnMfa(): boolean {
        return this._resources.failOnMfa;
    }

    /**
     * @returns If an existing library lock should be forcefully removed
     */
    get _force(): boolean {
        return this._resources.force;
    }

    /**
     * @returns If the application should delete remote files
     */
    get _remoteDelete(): boolean {
        return this._resources.remoteDelete;
    }

    /**
     * @returns The log level of the application
     */
    get _logLevel(): LogLevel {
        return this._resources.logLevel;
    }

    /**
     * @returns If the application should run in silent mode
     */
    get _silent(): boolean {
        return this._resources.silent;
    }

    /**
     * @returns If the application should log to the CLI
     */
    get _logToCli(): boolean {
        return this._resources.logToCli;
    }

    /**
     * @returns If the application should suppress warnings
     */
    get _suppressWarnings(): boolean {
        return this._resources.suppressWarnings;
    }

    /**
     * @returns If the application should export metrics
     */
    get _exportMetrics(): boolean {
        return this._resources.exportMetrics;
    }

    /**
     * @returns The rate at which the metadata should be downloaded
     */
    get _metadataRate(): [number, number] {
        return this._resources.metadataRate;
    }

    /**
     * @returns If the application should capture network traffic
     */
    get _enableNetworkCapture(): boolean {
        return this._resources.enableNetworkCapture;
    }

    /**
     * @returns The primary zone of the account
     * @throws If no primary zone is set
     */
    get _primaryZone(): PhotosAccountZone {
        if (!this._resources.primaryZone) {
            throw new iCPSError(RES_MANAGER_ERR.NO_PRIMARY_ZONE);
        }

        return this._resources.primaryZone;
    }

    /**
     * Sets the primary zone of the account
     * @param primaryZone - The primary zone to set
     */
    set _primaryZone(primaryZone: PhotosAccountZone) {
        this._resources.primaryZone = primaryZone;
    }

    /**
     * @returns The shared zone of the account
     * @throws If no shared zone is set
     */
    get _sharedZone(): PhotosAccountZone {
        if (!this._resources.sharedZone) {
            throw new iCPSError(RES_MANAGER_ERR.NO_SHARED_ZONE);
        }

        return this._resources.sharedZone;
    }

    /**
     * Sets the shared zone of the account
     * @param primaryZone - The shared zone to set
     */
    set _sharedZone(sharedZone: PhotosAccountZone) {
        this._resources.sharedZone = sharedZone;
    }

    /**
     * @returns If the shared zone is available
     */
    get sharedZoneAvailable(): boolean {
        return Boolean(this._resources.sharedZone);
    }
}