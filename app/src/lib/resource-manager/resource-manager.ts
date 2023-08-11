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
import {iCPSEvent, iCPSEventError, iCPSEventResourceManager} from "./events.js";
import {LogLevel} from "../../app/event/log.js";
import {EventManager, StaticEvents, StaticLogger} from "./event-manager.js";

export class ResourceManager {
    /**
     * The singleton instance of the ResourceManager
     */
    static _instance?: ResourceManager;

    /**
     * Prepares the ResourceManager singleton.
     * This function should only be called once.
     * @param appOptions - The parsed app options
     * @returns The singleton instance of the ResourceManager
     * @throws If the function is called with an already initiated singleton
     */
    static setup(appOptions: iCPSAppOptions): ResourceManager {
        if (this._instance) {
            throw new iCPSError(RES_MANAGER_ERR.ALREADY_INITIATED);
        }

        this._instance = new ResourceManager(appOptions);
        return this._instance;
    }

    /**
     * @returns The singleton instance of the ResourceManager
     * @throws If the function is called before the singleton is initiated
     */
    static get instance() {
        if (!this._instance) {
            throw new iCPSError(RES_MANAGER_ERR.NOT_INITIATED);
        }

        return this._instance;
    }

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

        if (!this._resources.logToCli) {
            this._resources.logFilePath = path.format({
                dir: this._dataDir,
                base: LOG_FILE_NAME,
            });
        }

        if (this._resources.exportMetrics) {
            this._resources.metricsFilePath = path.format({
                dir: this._dataDir,
                base: METRICS_FILE_NAME,
            });
        }

        if (this._resources.networkCapture) {
            this._resources.harFilePath = path.format({
                dir: this._dataDir,
                base: HAR_FILE_NAME,
            });
        }

        this._networkManager = new NetworkManager(this._resources);
    }

    /**
     * Reads the resource file from disk and parses it
     */
    readResourceFile(): ResourceFile {
        try {
            ResourceManager.logger(this).debug(`Reading resource file from ${this._resourceFilePath}`);
            const resourceFileData = JSON.parse(readFileSync(this._resourceFilePath, {encoding: FILE_ENCODING}));
            return this._validator.validateResourceFile(resourceFileData);
        } catch (err) {
            ResourceManager.emit(iCPSEventResourceManager.NO_RESOURCE_FILE_FOUND);
            ResourceManager.logger(this).debug(`No resource file found returning default values`);
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
            ResourceManager.logger(this).debug(`Writing resource file to ${this._resourceFilePath}`);

            writeFileSync(this._resourceFilePath, resourceFileData, {encoding: FILE_ENCODING});
        } catch (err) {
            ResourceManager.emit(iCPSEventError.HANDLER_EVENT, new iCPSError(RES_MANAGER_ERR.UNABLE_TO_WRITE_FILE)
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
     * Calls the data dir getter from the singleton instance
     * @see {@link _dataDir}
     * @returns The data dir read from the CLI Options
     */
    static get dataDir(): string {
        return ResourceManager.instance._dataDir;
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
     * Calls the resource file path getter from the singleton instance
     * @see {@link _resourceFilePath}
     * @returns The path to the resource file
     */
    static get resourceFilePath(): string {
        return ResourceManager.instance._resourceFilePath;
    }

    /**
     * @returns The currently loaded libraries version
     */
    get _libraryVersion(): number {
        this._resources.libraryVersion = this.readResourceFile().libraryVersion;
        return this._resources.libraryVersion;
    }

    /**
     * Calls the library version getter from the singleton instance
     * @see {@link _libraryVersion}
     * @returns The currently loaded libraries version
     */
    static get libraryVersion(): number {
        return ResourceManager.instance._libraryVersion;
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
     * Calls the trust token getter from the singleton instance
     * @see {@link _trustToken}
     * @returns The currently used trust token, or undefined if none is set.
     */
    static get trustToken(): string {
        return ResourceManager.instance._trustToken;
    }

    /**
     * Calls the trust token setter from the singleton instance
     * @see {@link _trustToken}
     * @param trustToken - The trust token to use
     */
    static set trustToken(trustToken: string | undefined) {
        ResourceManager.instance._trustToken = trustToken;
    }

    /**
     * @returns The iCloud username
     */
    get _username(): string {
        return this._resources.username;
    }

    /**
     * Calls the username getter from the singleton instance
     * @see {@link _username}
     * @returns The iCloud username
     */
    static get username(): string {
        return ResourceManager.instance._username;
    }

    /**
     * @returns The iCloud user password
     */
    get _password(): string {
        return this._resources.password;
    }

    /**
     * Calls the password getter from the singleton instance
     * @see {@link password}
     * @returns The iCloud user password
     */
    static get password(): string {
        return ResourceManager.instance._password;
    }

    /**
     * @returns The port to use for the MFA server
     */
    get _mfaServerPort(): number {
        return this._resources.port;
    }

    /**
     * Calls the MFA server port getter from the singleton instance
     * @see {@link _mfaServerPort}
     * @returns The port to use for the MFA server
     */
    static get mfaServerPort(): number {
        return ResourceManager.instance._mfaServerPort;
    }

    /**
     * @returns The number of retries to use for downloading
     */
    get _maxRetries(): number {
        return this._resources.maxRetries;
    }

    /**
     * Calls the max retries getter from the singleton instance
     * @see {@link _maxRetries}
     * @returns The number of retries to use for downloading
     */
    static get maxRetries() : number {
        return ResourceManager.instance._maxRetries;
    }

    /**
     * @returns The number of threads to use for downloading
     */
    get _downloadThreads(): number {
        return this._resources.downloadThreads;
    }

    /**
     * Calls the download threads getter from the singleton instance
     * @see {@link _downloadThreads}
     * @returns The number of threads to use for downloading
     */
    static get downloadThreads(): number {
        return ResourceManager.instance._downloadThreads;
    }

    /**
     * @returns The schedule of the application
     */
    get _schedule(): string {
        return this._resources.schedule;
    }

    /**
     * Calls the schedule getter from the singleton instance
     * @see {@link _schedule}
     * @returns The schedule of the application
     */
    static get schedule(): string {
        return ResourceManager.instance._schedule;
    }

    /**
     * @returns If the application should enable crash reporting
     */
    get _enableCrashReporting(): boolean {
        return this._resources.enableCrashReporting;
    }

    /**
     * Calls the crash reporting getter from the singleton instance
     * @see {@link _enableCrashReporting}
     * @returns If the application should enable crash reporting
     */
    static get enableCrashReporting(): boolean {
        return ResourceManager.instance._enableCrashReporting;
    }

    /**
     * @returns If the application should fail on MFA requirement
     */
    get _failOnMfa(): boolean {
        return this._resources.failOnMfa;
    }

    /**
     * Calls the fail on MFA getter from the singleton instance
     * @see {@link _failOnMfa}
     * @returns If the application should fail on MFA requirement
     */
    static get failOnMfa(): boolean {
        return ResourceManager.instance._failOnMfa;
    }

    /**
     * @returns If an existing library lock should be forcefully removed
     */
    get _force(): boolean {
        return this._resources.force;
    }

    /**
     * Calls the force getter from the singleton instance
     * @see {@link _force}
     * @returns If an existing library lock should be forcefully removed
     */
    static get force(): boolean {
        return ResourceManager.instance._force;
    }

    /**
     * @returns If the application should delete remote files
     */
    get _remoteDelete(): boolean {
        return this._resources.remoteDelete;
    }

    /**
     * Calls the remote delete getter from the singleton instance
     * @see {@link _remoteDelete}
     * @returns If the application should delete remote files
     */
    static get remoteDelete(): boolean {
        return ResourceManager.instance._remoteDelete;
    }

    /**
     * @returns The log level of the application
     */
    get _logLevel(): LogLevel {
        return this._resources.logLevel;
    }

    /**
     * Calls the log level getter from the singleton instance
     * @see {@link _logLevel}
     * @returns The log level of the application
     */
    static get logLevel(): LogLevel {
        return ResourceManager.instance._logLevel;
    }

    /**
     * @returns If the application should run in silent mode
     */
    get _silent(): boolean {
        return this._resources.silent;
    }

    /**
     * Calls the silent getter from the singleton instance
     * @see {@link _silent}
     * @returns If the application should run in silent mode
     */
    static get silent(): boolean {
        return ResourceManager.instance._silent;
    }

    /**
     * @returns If the application should log to the CLI
     */
    get _logToCli(): boolean {
        return this._resources.logToCli;
    }

    /**
     * Calls the log to CLI getter from the singleton instance
     * @see {@link _logToCli}
     * @returns If the application should log to the CLI
     */
    static get logToCli(): boolean {
        return ResourceManager.instance._logToCli;
    }

    /**
     * @returns If the application should suppress warnings
     */
    get _suppressWarnings(): boolean {
        return this._resources.suppressWarnings;
    }

    /**
     * Calls the suppress warnings getter from the singleton instance
     * @see {@link _suppressWarnings}
     * @returns If the application should suppress warnings
     */
    static get suppressWarnings(): boolean {
        return ResourceManager.instance._suppressWarnings;
    }

    /**
     * @returns If the application should export metrics
     */
    get _exportMetrics(): boolean {
        return this._resources.exportMetrics;
    }

    /**
     * Calls the export metrics getter from the singleton instance
     * @see {@link _exportMetrics}
     * @returns If the application should export metrics
     */
    static get exportMetrics(): boolean {
        return ResourceManager.instance._exportMetrics;
    }

    /**
     * @returns The rate at which the metadata should be downloaded
     */
    get _metadataRate(): [number, number] {
        return this._resources.metadataRate;
    }

    /**
     * Calls the metadata rate getter from the singleton instance
     * @see {@link _metadataRate}
     * @returns The rate at which the metadata should be downloaded
     */
    static get metadataRate(): [number, number] {
        return ResourceManager.instance._metadataRate;
    }

    /**
     * @returns If the application should capture network traffic
     */
    get _networkCapture(): boolean {
        return this._resources.networkCapture;
    }

    /**
     * Calls the network capture getter from the singleton instance
     * @see {@link _networkCapture}
     */
    static get networkCapture(): boolean {
        return ResourceManager.instance._networkCapture;
    }

    /**
     * Calls the network getter from the singleton instance
     * @returns Access to the shared networking resource. Should be configured to hold all available authentication properties.
     */
    static get network(): NetworkManager {
        return ResourceManager.instance._networkManager;
    }

    /**
     * Retrieves the validator from the singleton instance
     * @returns The shared validator resource
     */
    static get validator(): Validator {
        return ResourceManager.instance._validator;
    }

    /**
     * Retrieves the event manager from the singleton instance
     * @returns The shared event manager resource
     */
    static get event(): EventManager {
        return ResourceManager.instance._eventManager;
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
     * Calls the primary zone getter from the singleton instance
     * @see {@link _primaryZone}
     */
    static get primaryZone(): PhotosAccountZone {
        return ResourceManager.instance._primaryZone;
    }

    /**
     * Calls the primary zone setter from the singleton instance
     * @see {@link _primaryZone}
     */
    static set primaryZone(primaryZone: PhotosAccountZone) {
        ResourceManager.instance._primaryZone = primaryZone;
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
     * Calls the shared zone getter from the singleton instance
     * @see {@link _sharedZone}
     */
    static get sharedZone(): PhotosAccountZone {
        return ResourceManager.instance._sharedZone;
    }

    /**
     * Calls the shared zone setter from the singleton instance
     * @see {@link _sharedZone}
     */
    static set sharedZone(sharedZone: PhotosAccountZone) {
        ResourceManager.instance._sharedZone = sharedZone;
    }

    /**
     * @returns If the shared zone is available
     */
    get sharedZoneAvailable(): boolean {
        return Boolean(this._resources.sharedZone);
    }

    /**
     * Calls the shared zone available getter from the singleton instance
     * @see {@link sharedZoneAvailable}
     */
    static get sharedZoneAvailable(): boolean {
        return ResourceManager.instance.sharedZoneAvailable;
    }

    /**
     * @returns The path to the log file
     */
    get _logFilePath(): string | undefined {
        return this._resources.logFilePath;
    }

    /**
     * Calls the log file path getter from the singleton instance
     * @see {@link _logFilePath}
     */
    static get logFilePath(): string | undefined {
        return ResourceManager.instance._logFilePath;
    }

    /**
     * @returns The path to the metrics file
     */
    get _metricsFilePath(): string | undefined {
        return this._resources.metricsFilePath;
    }

    /**
     * Calls the metrics file path getter from the singleton instance
     * @see {@link _metricsFilePath}
     */
    static get metricsFilePath(): string | undefined {
        return ResourceManager.instance._metricsFilePath;
    }

    /**
     * @returns The path to the metrics file
     */
    get _harFilePath(): string | undefined {
        return this._resources.harFilePath;
    }

    /**
     * Calls the har file path getter from the singleton instance
     * @see {@link _harFilePath}
     */
    static get harFilePath(): string | undefined {
        return ResourceManager.instance._harFilePath;
    }

    /**
     * Creates a logger interface for a given instance
     * @param instance - The instance from where messages originate
     * @returns A set of logging functions
     */
    static logger(instance: any | string): StaticLogger {
        return ResourceManager.instance._eventManager.logger(instance);
    }

    /**
     * Creates an event interface for a given instance
     * @param instance - The instance that wants to listen to events
     * @returns A set of event functions
     */
    static events(instance: any): StaticEvents {
        return ResourceManager.instance._eventManager.events(instance);
    }

    /**
     * Emits an event on the central event bus
     * @param event - The event to emit
     * @param args - Optional arguments to pass to the event
     * @returns True if the event had listeners
     */
    static emit(event: iCPSEvent, ...args: any[]): boolean {
        return ResourceManager.instance._eventManager.emit(event, ...args);
    }
}