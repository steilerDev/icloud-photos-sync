import {RES_MANAGER_ERR} from "../../app/error/error-codes.js";
import {iCPSError} from "../../app/error/error.js";
import {LogLevel} from "../../app/event/log.js";
import {iCPSAppOptions} from "../../app/factory.js";
import {ListenerFunction} from "./event-manager.js";
import {iCPSEvent, iCPSEventLog} from "./events.js";
import {NetworkManager} from "./network-manager.js";
import {ResourceManager} from "./resource-manager.js";
import {PhotosAccountZone} from "./resources.js";
import {Validator} from "./validator.js";

/**
 * This namespace handles the static access to the singleton functions of the ResourceManager, NetworkManager and EventManager
 */
export namespace Resources {
    /**
     * The singleton instance of the ResourceManager
     */
    export let _instance: ResourceManager;

    /**
     * Prepares the ResourceManager singleton.
     * This function should only be called once.
     * @param appOptions - The parsed app options
     * @returns The singleton instance of the ResourceManager
     * @throws If the function is called with an already initiated singleton
     */
    export function setup(appOptions: iCPSAppOptions): ResourceManager {
        if (_instance) {
            throw new iCPSError(RES_MANAGER_ERR.ALREADY_INITIATED);
        }

        _instance = new ResourceManager(appOptions);
        return _instance;
    }

    /**
     * @returns The singleton instance of the ResourceManager
     * @throws If the function is called before the singleton is initiated
     */
    export function instance() {
        if (!_instance) {
            throw new iCPSError(RES_MANAGER_ERR.NOT_INITIATED);
        }

        return _instance;
    }

    /**
     * @see {@link ResourceManager#_dataDir}
     * @returns The data dir read from the CLI Options
     */
    export function dataDir(): string {
        return instance()._dataDir;
    }

    /**
     * @see {@link ResourceManager#_libraryVersion}
     * @returns The currently loaded libraries version
     */
    export function libraryVersion(): number {
        return instance()._libraryVersion;
    }

    /**
     * @see {@link ResourceManager#_trustToken}
     * @returns The currently used trust token, or undefined if none is set.
     */
    export function trustToken(): string {
        return instance()._trustToken;
    }

    /**
     * Persists the trust token to the resource file
     * @see {@link ResourceManager#_trustToken}
     * @param trustToken - The trust token to use
     */
    export function setTrustToken(trustToken: string | undefined) {
        instance()._trustToken = trustToken;
    }

    /**
     * @see {@link ResourceManager#_username}
     * @returns The iCloud username
     */
    export function username(): string {
        return instance()._username;
    }

    /**
     * @see {@link ResourceManager#password}
     * @returns The iCloud user password
     */
    export function password(): string {
        return instance()._password;
    }

    /**
     * @see {@link ResourceManager#_mfaServerPort}
     * @returns The port to use for the MFA server
     */
    export function mfaServerPort(): number {
        return instance()._mfaServerPort;
    }

    /**
     * @see {@link ResourceManager#_maxRetries}
     * @returns The number of retries to use for downloading
     */
    export function maxRetries() : number {
        return instance()._maxRetries;
    }

    /**
     * @see {@link ResourceManager#_schedule}
     * @returns The schedule of the application
     */
    export function schedule(): string {
        return instance()._schedule;
    }

    /**
     * @see {@link ResourceManager#_enableCrashReporting}
     * @returns If the application should enable crash reporting
     */
    export function enableCrashReporting(): boolean {
        return instance()._enableCrashReporting;
    }

    /**
     * @see {@link ResourceManager#_force}
     * @returns If an existing library lock should be forcefully removed
     */
    export function force(): boolean {
        return instance()._force;
    }

      /**
     * @see {@link ResourceManager#_failOnMfa}
     * @returns If the application should fail on MFA requirement
     */
    export function failOnMfa(): boolean {
        return instance()._failOnMfa;
    }

    /**
     * @see {@link ResourceManager#_remoteDelete}
     * @returns If the application should delete remote files
     */
    export function remoteDelete(): boolean {
        return instance()._remoteDelete;
    }

    /**
     * @see {@link ResourceManager#_logLevel}
     * @returns The log level of the application
     */
    export function logLevel(): LogLevel {
        return instance()._logLevel;
    }

    /**
     * @see {@link ResourceManager#_silent}
     * @returns If the application should run in silent mode
     */
    export function silent(): boolean {
        return instance()._silent;
    }

    /**
     * @see {@link ResourceManager#_logToCli}
     * @returns If the application should log to the CLI
     */
    export function logToCli(): boolean {
        return instance()._logToCli;
    }

    /**
     * @see {@link ResourceManager#_suppressWarnings}
     * @returns If the application should suppress warnings
     */
    export function suppressWarnings(): boolean {
        return instance()._suppressWarnings;
    }

    /**
     * @see {@link ResourceManager#_exportMetrics}
     * @returns If the application should export metrics
     */
    export function exportMetrics(): boolean {
        return instance()._exportMetrics;
    }

    /**
     * @see {@link ResourceManager#_networkCapture}
     * @returns If the application should capture network traffic
     */
    export function enableNetworkCapture(): boolean {
        return instance()._enableNetworkCapture;
    }

    /**
     * @see {@link ResourceManager#_primaryZone}
     * @returns The primary zone of the account, if available
     * @throws If the primary zone is not set
     */
    export function primaryZone(): PhotosAccountZone {
        return instance()._primaryZone;
    }

    /**
     * @see {@link ResourceManager#_primaryZone}
     * @param primaryZone - The primary zone of the account
     */
    export function setPrimaryZone(primaryZone: PhotosAccountZone) {
        instance()._primaryZone = primaryZone;
    }

    /**
     * @see {@link ResourceManager#_sharedZone}
     * @returns The shared zone of the account, if available
     * @throws If the shared zone is not set
     */
    export function sharedZone(): PhotosAccountZone {
        return instance()._sharedZone;
    }

    /**
     * @see {@link ResourceManager#_sharedZone}
     * @param sharedZone - The shared zone of the account
     */
    export function setSharedZone(sharedZone: PhotosAccountZone) {
        instance()._sharedZone = sharedZone;
    }

    /**
     * Calls the shared zone available getter from the singleton instance
     * @see {@link ResourceManager#sharedZoneAvailable}
     */
    export function sharedZoneAvailable(): boolean {
        return instance().sharedZoneAvailable;
    }

    /**
     * @see {@link ResourceManager#_logFilePath}
     * @returns The path to the log file, or undefined if not enabled
     */
    export function logFilePath(): string | undefined {
        return instance()._logFilePath;
    }

    /**
     * @see {@link ResourceManager#_metricsFilePath}
     * @returns The path to the metrics file, or undefined if not enabled
     */
    export function metricsFilePath(): string | undefined {
        return instance()._metricsFilePath;
    }

    /**
     * @see {@link ResourceManager#_harFilePath}
     * @returns The path to the HAR file, or undefined if not enabled
     */
    export function harFilePath(): string | undefined {
        return instance()._harFilePath;
    }

    /**
     * @see {@link NetworkManager}
     * @returns Access to the shared networking resource.
     */
    export function network(): NetworkManager {
        return instance()._networkManager;
    }

    /**
     * @see {@link Validator}
     * @returns The shared validator resource
     */
    export function validator(): Validator {
        return instance()._validator;
    }

    /**
     * Returns a logger interface, that binds to log events from the event bus to a source
     * Used to log messages associated to the source object
     * @param source - The source of the log message - either an object or a string
     * @returns The logger interface
     */
    export function logger(source: any | string): Resources.Types.Logger {
        const format = function (...args: unknown[]): string {
            return args.map(arg => String(arg)).join(` `);
        };

        return {
            log(...args: any[]) {
                instance()._eventManager.emit(iCPSEventLog.INFO, source, format(args));
            },
            debug(...args: any[]) {
                instance()._eventManager.emit(iCPSEventLog.DEBUG, source, format(args));
            },
            info(...args: any[]) {
                instance()._eventManager.emit(iCPSEventLog.INFO, source, format(args));
            },
            warn(...args: any[]) {
                instance()._eventManager.emit(iCPSEventLog.WARN, source, format(args));
            },
            error(...args: any[]) {
                instance()._eventManager.emit(iCPSEventLog.ERROR, source, format(args));
            },
        };
    }

    /**
     * Returns an event interface, that binds to event bus listener functions to a source
     * Used to manage listeners for the listener object
     * @param listenerObject - The source of the registration request, used to track the listeners and enable cleanup
     * @returns The events interface
     */
    export function events(listenerObject: any): Resources.Types.Events {
        return {
            on(event: iCPSEvent, listener: ListenerFunction) {
                instance()._eventManager.on(listenerObject, event, listener);
                return Resources.events(listenerObject); // Returning for chaining
            },
            once(event: iCPSEvent, listener: ListenerFunction) {
                instance()._eventManager.once(listenerObject, event, listener);
                return Resources.events(listenerObject); // Returning for chaining
            },
            removeListeners(event?: iCPSEvent) {
                instance()._eventManager.removeListenersFromRegistry(listenerObject, event);
                return Resources.events(listenerObject); // Returning for chaining
            },
        };
    }

    /**
     * Emits an event on the central event bus
     * @param event - The event to emit
     * @param args - Optional arguments to pass to the event
     * @returns True if the event had listeners
     */
    export function emit(event: iCPSEvent, ...args: any[]): boolean {
        return instance()._eventManager.emit(event, ...args);
    }

    /**
     * Formats the provided arguments as a string
     * @param args - The arguments to format
     * @returns The formatted string
     */

    export namespace Types {
        /**
        * Interface to logger event bus, with a source bound to it
        */
        export type Logger = {
           /**
            * Logs a message to the event bus
            * @param args - The arguments to log
            */
           log: (...args: any[]) => void,
           /**
            * Logs a debug message to the event bus
            * @param args - The arguments to log
            */
           debug: (...args: any[]) => void,
           /**
            * Logs an info message to the event bus
            * @param args - The arguments to log
            */
           info: (...args: any[]) => void,
           /**
            * Logs a warn message to the event bus
            * @param args - The arguments to log
            */
           warn: (...args: any[]) => void,
           /**
            * Logs an error message to the event bus
            * @param args - The arguments to log
            */
           error: (...args: any[]) => void,
       }

       /**
        * Interface to listener functions of the event bus, with a source bound to it
        */
       export type Events = {
           /**
            * Registers an event listener to the event bus
            * @param event - The event to listen to
            * @param listener - The listener function to call upon the event
            * @returns This instance for chaining
            */
           on: (event: iCPSEvent, listener: ListenerFunction) => Resources.Types.Events,
           /**
            * Registers an one-time event listener to the event bus
            * @param event - The event to listen to
            * @param listener - The listener function to call upon the event
            * @returns This instance for chaining
            */
           once: (event: iCPSEvent, listener: ListenerFunction) => Resources.Types.Events,
           /**
            * Removes all listeners from the source from the event bus
            * @param event - Optional event to remove listeners for - otherwise all will be removed
            */
           removeListeners: (event?: iCPSEvent) => Resources.Types.Events,
       }
   }
}