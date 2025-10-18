import PackageData from '../../../package.json' with { type: 'json' }; // eslint-disable-line
import {RESOURCES_ERR} from "../../app/error/error-codes.js";
import {iCPSError} from "../../app/error/error.js";
import {iCPSAppOptions} from "../../app/factory.js";
import {EventManager, ListenerFunction} from "./event-manager.js";
import {iCPSEvent, iCPSEventLog} from "./events-types.js";
import {NetworkManager} from "./network-manager.js";
import {ResourceManager} from "./resource-manager.js";
import {StateManager} from './state-manager.js';
import {Validator} from "./validator.js";

/* eslint-disable @typescript-eslint/no-namespace */

/**
 * This namespace handles the static access to the singleton functions of the ResourceManager, NetworkManager, Validator and EventManager
 */
export namespace Resources {
    /**
     * The singleton instances of the shared resources
     */
    export let _instances: Resources.Types.Instances;

    /**
     * Static package info
     */
    export const PackageInfo: Resources.Types.PackageInfo = {
        name: PackageData.name,
        version: PackageData.version,
        description: PackageData.description,
    };

    /**
     * Prepares the global singleton instances. This includes the ResourceManager, NetworkManager, Validator and EventManager.
     * This function should only be called once.
     * @param appOptions - The parsed app options
     * @returns The singleton instances
     * @throws If the function is called with an already initiated singleton
     */
    export function setup(appOptions: iCPSAppOptions): Resources.Types.Instances {
        if (_instances) {
            throw new iCPSError(RESOURCES_ERR.ALREADY_INITIATED);
        }

        _instances = {} as Resources.Types.Instances; // Creating one-by one, so they are available as soon as possible
        _instances.event = new EventManager();
        _instances.validator = new Validator();
        _instances.manager = new ResourceManager(appOptions);
        _instances.network = new NetworkManager(appOptions);
        _instances.state = new StateManager();

        return _instances;
    }

    /**
     * @returns The singleton instances of the shared resources
     * @throws If the function is called before the singleton is initiated
     */
    export function instances(): Resources.Types.Instances {
        if (!_instances) {
            throw new iCPSError(RESOURCES_ERR.NOT_INITIATED);
        }

        return _instances;
    }

    /**
     * @returns The singleton instances of the shared event manager
     * @throws If the function is called before the singleton is initiated
     */
    export function event(): EventManager {
        const {event} = instances();
        if (!event) {
            throw new iCPSError(RESOURCES_ERR.EVENT_NOT_INITIATED);
        }

        return event;
    }

    /**
     * @returns The singleton instances of the shared network manager
     * @throws If the function is called before the singleton is initiated
     */
    export function network(): NetworkManager {
        const {network} = instances();
        if (!network) {
            throw new iCPSError(RESOURCES_ERR.NETWORK_NOT_INITIATED);
        }

        return network;
    }

    /**
     * @returns The singleton instances of the shared resource manager
     * @throws If the function is called before the singleton is initiated
     */
    export function manager(): ResourceManager {
        const {manager} = instances();
        if (!manager) {
            throw new iCPSError(RESOURCES_ERR.RESOURCE_NOT_INITIATED);
        }

        return manager;
    }

    /**
     * @returns The singleton instances of the shared validator
     * @throws If the function is called before the singleton is initiated
     */
    export function validator(): Validator {
        const {validator} = instances();
        if (!validator) {
            throw new iCPSError(RESOURCES_ERR.VALIDATOR_NOT_INITIATED);
        }

        return validator;
    }

    /**
     * @returns THe Singleton instance of the shared state
     * @throws If the function is called before the singleton is initiated
     */
    export function state(): StateManager {
        const {state} = instances()
        if(!state) {
            throw new iCPSError(RESOURCES_ERR.STATE_NOT_INITIATED);
        }

        return state;
    }

    /**
     * Returns a logger interface, that allows emitting log events to the event bus by providing a source object
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
                Resources.event().emit(iCPSEventLog.INFO, source, format(args));
            },
            debug(...args: any[]) {
                Resources.event().emit(iCPSEventLog.DEBUG, source, format(args));
            },
            info(...args: any[]) {
                Resources.event().emit(iCPSEventLog.INFO, source, format(args));
            },
            warn(...args: any[]) {
                Resources.event().emit(iCPSEventLog.WARN, source, format(args));
            },
            error(...args: any[]) {
                Resources.event().emit(iCPSEventLog.ERROR, source, format(args));
            },
        };
    }

    /**
     * Returns an event interface, that allows listening to events emitted on the event bus, while binding the listener to the registry
     * Used to manage listeners for the listener object
     * @param listenerObject - The source of the registration request, used to track the listeners and enable cleanup
     * @returns The events interface
     */
    export function events(listenerObject: any): Resources.Types.Events {
        return {
            on(event: iCPSEvent, listener: ListenerFunction) {
                Resources.event().on(listenerObject, event, listener);
                return Resources.events(listenerObject); // Returning for chaining
            },
            once(event: iCPSEvent, listener: ListenerFunction) {
                Resources.event().once(listenerObject, event, listener);
                return Resources.events(listenerObject); // Returning for chaining
            },
            removeListeners(event?: iCPSEvent) {
                Resources.event().removeListenersFromRegistry(listenerObject, event);
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
        return Resources.event().emit(event, ...args);
    }

    /**
     * Can be used to check if a process is running
     * @param pid - The process id to check
     * @returns True if the process is running or the user does not have the necessary permissions to check this, false otherwise
     */
    export function pidIsRunning(pid: number): boolean {
        try {
            process.kill(pid, 0);
            return true;
        } catch (e) {
            return e.code === `EPERM`;
        }
    }

    /**
     * Typing namespace
     */
    export namespace Types {
        /**
         * Type holding all the singleton instances
         */
        export type Instances = {
            /**
             * The resource manager instance
             */
            manager: ResourceManager,
            /**
             * The network manager instance
             */
            network: NetworkManager,
            /**
             * The validator instance
             */
            validator: Validator,
            /**
             * The event manager instance
             */
            event: EventManager,
            /**
             * THe state manager instance
             */
            state: StateManager
        }

        /**
         * Package Metadata
         */
        export type PackageInfo = {
            /**
             * The name of this package
             */
            name: string,
            /**
             * The version of this package
             */
            version: string,
            /**
             * A short description of this package
             */
            description: string,
        }
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
        * Interface to listener functions of the event bus, with a listener bound to it
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

       /**
        * Possible regions for this tool to operate in
        */
       export enum Region {
        /**
         * Will use icloud.com
         */
        WORLD = `world`,
        /**
         * Will use icloud.com.cn
         */
        CHINA = `china`,
       }
   }
}