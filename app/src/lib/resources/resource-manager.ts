import {readFileSync, writeFileSync} from "fs";
import {jsonc} from "jsonc";
import * as path from 'path';
import {RESOURCES_ERR} from "../../app/error/error-codes.js";
import {iCPSError} from "../../app/error/error.js";
import {iCPSAppOptions} from "../../app/factory.js";
import * as PHOTOS_LIBRARY from '../photos-library/constants.js';
import {iCPSEventRuntimeWarning} from "./events-types.js";
import {Resources} from "./main.js";
import {FILE_ENCODING, HAR_FILE_NAME, LIBRARY_LOCK_FILE_NAME, LOG_FILE_NAME, METRICS_FILE_NAME, PhotosAccountZone, RESOURCE_FILE_NAME, ResourceFile, iCPSResources} from "./resource-types.js";
import { PushSubscription } from "./web-server-types.js";
import webpush from 'web-push'
import {LogLevel} from "./state-manager.js";

/**
 * This class handles access to the .icloud-photos-sync resource file and handles currently applied configurations from the CLI and environment variables
 */
export class ResourceManager {
    /**
     * The shared resources held by this instances of the icps application
     */
    _resources: iCPSResources = {} as iCPSResources;

    /**
     * Creates the resource manager, based on the previously parsed iCPSAppOptions.
     * Should not be called directly, but through the static setup function.
     * @param appOptions - The parsed app options
     */
    constructor(appOptions: iCPSAppOptions) {
        // Assign app options & resource files to this data structure
        Object.assign(this._resources, this._readResourceFile(), appOptions);

        // If trustToken should be refreshed, we clear it now
        if(this._resources.refreshToken) {
            this._resources.trustToken = undefined
        }
        // Making sure new merged configuration is persisted to file
        this._writeResourceFile()
    }

    /**
     * Reads the resource file from disk and parses it
     */
    _readResourceFile(): ResourceFile {
        try {
            Resources.logger(this).debug(`Reading resource file from ${this.resourceFilePath}`);
            const resourceFileData = jsonc.parse(readFileSync(this.resourceFilePath, {encoding: FILE_ENCODING}));
            return Resources.validator().validateResourceFile(resourceFileData);
        } catch (err) {
            Resources.emit(iCPSEventRuntimeWarning.RESOURCE_FILE_ERROR,
                new iCPSError(RESOURCES_ERR.UNABLE_TO_READ_FILE).addCause(err));
            return {
                libraryVersion: PHOTOS_LIBRARY.LIBRARY_VERSION,
                trustToken: undefined,
            };
        }
    }

    /**
     * Writes the resources to the resource file
     */
    _writeResourceFile() {
        try {
            const formattedResourceFile: ResourceFile = {
                libraryVersion: this._resources.libraryVersion,
                trustToken: this._resources.trustToken,
                notificationVapidCredentials: this._resources.notificationVapidCredentials,
                notificationSubscriptions: this._resources.notificationSubscriptions
            };
            const resourceFileData = jsonc.stringify(formattedResourceFile, null, 4);
            Resources.logger(this).debug(`Writing resource file to ${this.resourceFilePath}`);

            writeFileSync(this.resourceFilePath, resourceFileData, {encoding: FILE_ENCODING, flush: true});
        } catch (err) {
            Resources.emit(iCPSEventRuntimeWarning.RESOURCE_FILE_ERROR,
                new iCPSError(RESOURCES_ERR.UNABLE_TO_WRITE_FILE).addCause(err));
        }
    }

    /**
     * @returns The data dir read from the CLI Options
     */
    get dataDir(): string {
        return this._resources.dataDir;
    }

    /**
     * @returns The path to the resource file
     */
    get resourceFilePath(): string {
        return path.format({
            dir: this.dataDir,
            base: RESOURCE_FILE_NAME,
        });
    }

    /**
     * @returns The path to the log file
     */
    get logFilePath(): string {
        return path.format({
            dir: this.dataDir,
            base: LOG_FILE_NAME,
        });
    }

    /**
     * @returns The path to the library lock file
     */
    get lockFilePath(): string {
        return path.format({
            dir: this.dataDir,
            base: LIBRARY_LOCK_FILE_NAME,
        });
    }

    /**
     * @returns The path to the metrics file
     */
    get metricsFilePath(): string {
        return path.format({
            dir: this.dataDir,
            base: METRICS_FILE_NAME,
        });
    }

    /**
     * @returns The path to the har file
     */
    get harFilePath(): string {
        return path.format({
            dir: this.dataDir,
            base: HAR_FILE_NAME,
        });
    }

    /**
     * Even though present in the resource file, this will only be loaded once and not re-read
     * @returns The currently loaded libraries version
     */
    get libraryVersion(): number {
        return this._resources.libraryVersion;
    }

    /**
     * This will always read the resource file for the most recently trust token and update the internal data structure
     * @returns The currently used trust token, or undefined if none is set.
     */
    get trustToken(): string | undefined {
        const resourceFile = this._readResourceFile();
        this._resources.trustToken = resourceFile.trustToken;

        return this._resources.trustToken;
    }

    /**
     * Sets the trust token and syncs the resource file.
     * @param trustToken - The trust token to use
     */
    set trustToken(trustToken: string | undefined) {
        this._resources.trustToken = trustToken;
        this._writeResourceFile();
    }

    /**
     * Retrieves the notification vapid credentials, generating them if they do not exist.
     * @returns The notification vapid credentials, containing the public and private key
     */
    get notificationVapidCredentials(): { publicKey: string, privateKey: string } {
        let credentials = this._resources.notificationVapidCredentials;
        if (!credentials) {
            credentials = webpush.generateVAPIDKeys();
            this._resources.notificationVapidCredentials = credentials;
            this._writeResourceFile();
        }
        return credentials;
    }

    /**
     * Gets the notification subscriptions from the resource file.
     * @returns The notification subscriptions, or an empty map if none are set
     */
    get notificationSubscriptions(): webpush.PushSubscription[] {
        return this._resources.notificationSubscriptions 
            ? Object.values(this._resources.notificationSubscriptions) 
            : [];
    }

    /**
     * Adds a subscription to the notification subscriptions in the resource file.
     * @param subscription - The notification subscription to add
     */
    addNotificationSubscription(subscription: PushSubscription) {
        this._resources.notificationSubscriptions = this._resources.notificationSubscriptions || {};
        this._resources.notificationSubscriptions[subscription.endpoint] = subscription;
        this._writeResourceFile();
    }

    /**
     * Removes a subscription from the notification subscriptions in the resource file.
     * @param subscription - The notification subscription to remove
     */
    removeNotificationSubscription(subscription: webpush.PushSubscription) {
        if (this._resources.notificationSubscriptions && subscription.endpoint in this._resources.notificationSubscriptions) {
            delete this._resources.notificationSubscriptions[subscription.endpoint]
            this._writeResourceFile();
        } else {
            Resources.logger(this).warn(`No notification subscriptions found to remove endpoint: ${subscription.endpoint}`);
        }
    }

    /**
     * @returns The iCloud username
     */
    get username(): string {
        return this._resources.username;
    }

    /**
     * @returns The iCloud user password
     */
    get password(): string {
        return this._resources.password;
    }

    /**
     * @returns The port to use for the MFA server
     */
    get webServerPort(): number {
        return this._resources.port;
    }

    /**
     * @returns The web base path for subpath deployment
     */
    get webBasePath(): string {
        return this._resources.webBasePath;
    }

    /**
     * @returns The number of retries to use for downloading
     */
    get maxRetries(): number {
        return this._resources.maxRetries;
    }

    /**
     * @returns The number of threads to use for downloading
     */
    get downloadThreads(): number {
        return this._resources.downloadThreads;
    }

    /**
     * @returns The schedule of the application
     */
    get schedule(): string {
        return this._resources.schedule;
    }

    /**
     * @returns If the application should enable crash reporting
     */
    get enableCrashReporting(): boolean {
        return this._resources.enableCrashReporting;
    }

    /**
     * @returns If the application should fail on MFA requirement
     */
    get mfaTimeout(): number {
        return this._resources.mfaTimeout;
    }

    /**
     * @returns If an existing library lock should be forcefully removed
     */
    get force(): boolean {
        return this._resources.force;
    }

    /**
     * @returns If the application should delete remote files
     */
    get remoteDelete(): boolean {
        return this._resources.remoteDelete;
    }

    /**
     * @returns The log level of the application
     */
    get logLevel(): LogLevel {
        return this._resources.logLevel;
    }

    /**
     * @returns If the application should run in silent mode
     */
    get silent(): boolean {
        return this._resources.silent;
    }

    /**
     * @returns If the application should log to the CLI
     */
    get logToCli(): boolean {
        return this._resources.logToCli;
    }

    /**
     * @returns If the application should suppress warnings
     */
    get suppressWarnings(): boolean {
        return this._resources.suppressWarnings;
    }

    /**
     * @returns If the application should export metrics
     */
    get exportMetrics(): boolean {
        return this._resources.exportMetrics;
    }

    /**
     * @returns The rate at which the metadata should be downloaded
     */
    get metadataRate(): [number, number] {
        return this._resources.metadataRate;
    }

    /**
     * @returns If the application should capture network traffic
     */
    get enableNetworkCapture(): boolean {
        return this._resources.enableNetworkCapture;
    }

    /**
     * @returns The region to be used for this app
     */
    get region(): Resources.Types.Region {
        return this._resources.region;
    }

    /**
     * @returns The session secret of the account
     * @throws If no session secret is set
     */
    get sessionSecret(): string {
        if (this._resources.sessionSecret === undefined) {
            throw new iCPSError(RESOURCES_ERR.NO_SESSION_SECRET);
        }

        return this._resources.sessionSecret;
    }

    /**
     * Sets the session secret of the account
     * @param sessionSecret - The session secret to set
     */
    set sessionSecret(sessionSecret: string) {
        this._resources.sessionSecret = sessionSecret;
    }

    /**
     * @returns The primary zone of the account
     * @throws If no primary zone is set
     */
    get primaryZone(): PhotosAccountZone {
        if (!this._resources.primaryZone) {
            throw new iCPSError(RESOURCES_ERR.NO_PRIMARY_ZONE);
        }

        return this._resources.primaryZone;
    }

    /**
     * Sets the primary zone of the account
     * @param primaryZone - The primary zone to set
     */
    set primaryZone(primaryZone: PhotosAccountZone) {
        this._resources.primaryZone = primaryZone;
    }

    /**
     * @returns The shared zone of the account
     * @throws If no shared zone is set
     */
    get sharedZone(): PhotosAccountZone {
        if (!this._resources.sharedZone) {
            throw new iCPSError(RESOURCES_ERR.NO_SHARED_ZONE);
        }

        return this._resources.sharedZone;
    }

    /**
     * Sets the shared zone of the account
     * @param sharedZone - The shared zone to set
     */
    set sharedZone(sharedZone: PhotosAccountZone) {
        this._resources.sharedZone = sharedZone;
    }

    /**
     * @returns If the shared zone is available
     */
    get sharedZoneAvailable(): boolean {
        return Boolean(this._resources.sharedZone);
    }

    /**
     * @returns True if legacy login should be used, false otherwise
     */
    get legacyLogin(): boolean {
        return this._resources.legacyLogin;
    }

    get healthCheckUrl(): string {
        return this._resources.healthCheckUrl;
    }
}