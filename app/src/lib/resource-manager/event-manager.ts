import {EventEmitter} from "events";
import {iCPSEvent, iCPSEventLog} from "./events.js";
import {ResourceManager} from "./resource-manager.js";

/**
 * Callbacks for event listeners
 */
type ListenerFunction = (...args: any[]) => void;

/**
 * Internal storage type for event registry
 */
type EventRegistryObject = {
    event: iCPSEvent,
    listener: ListenerFunction
}

/**
 * This class handles access to the central event bus, provides static helper functions and keeps track of classes listening to events
 */
export class EventManager {
    /**
     * The central event bus
     */
    _eventBus: EventEmitter = new EventEmitter();

    /**
     * Keeps track of classes listening to events
     * This is a map of objects to a map of events to a list of listeners
     */
    _eventRegistry: Map<any, EventRegistryObject[]> = new Map();

    /**
     * Returns a logger interface, that binds to log events from the event bus to a source
     * @param source - The source of the log message - either an object or a string
     * @returns The logger interface
     */
    logger(source: any | string): StaticLogger {
        return {
            log: (...args: any[]) => this.emit(iCPSEventLog.INFO, source, format(args)),
            debug: (...args: any[]) => this.emit(iCPSEventLog.DEBUG, source, format(args)),
            info: (...args: any[]) => this.emit(iCPSEventLog.INFO, source, format(args)),
            warn: (...args: any[]) => this.emit(iCPSEventLog.WARN, source, format(args)),
            error: (...args: any[]) => this.emit(iCPSEventLog.ERROR, source, format(args)),
        };
    }

    /**
     * Emits an event on the event bus
     * @param event - The event to emit
     * @param args - The arguments to pass to the event
     * @returns True if the event had listeners
     */
    emit(event: iCPSEvent, ...args: any[]): boolean {
        return this._eventBus.emit(event, ...args);
    }

    /**
     * Returns an event interface, that binds to event bus listener functions to a source
     * @param source - The source of the registration request, used to track the listeners and enable cleanup
     * @returns The events interface
     */
    events(source: any): StaticEvents {
        return {
            on: (event: iCPSEvent, listener: ListenerFunction) => this.on(source, event, listener).events(source),
            once: (event: iCPSEvent, listener: ListenerFunction) => this.once(source, event, listener).events(source),
            removeListeners: (event?: iCPSEvent) => this.removeListenersFromRegistry(source, event).events(source),
        };
    }

    /**
     * This function adds an event listener to the event bus and registers it in the event registry
     * @param source - The source of the registration request, used to track the listeners and enable cleanup
     * @param event - The event to listen to
     * @param listener - The listener function to call upon the event
     * @returns This instance for chaining
     */
    on(source: any, event: iCPSEvent, listener: ListenerFunction): EventManager {
        this.addListenerToRegistry(source, event, listener);
        this._eventBus.on(event, listener);
        return this;
    }

    /**
     * This function adds an one-time event listener to the event bus and registers it in the event registry
     * @param source - The source of the registration request, used to track the listeners and enable cleanup
     * @param event - The event to listen to
     * @param listener - The listener function to call upon the event
     * @returns This instance for chaining
     */
    once(source: any, event: iCPSEvent, listener: ListenerFunction): EventManager {
        this.addListenerToRegistry(source, event, listener);
        this._eventBus.once(event, listener);
        return this;
    }

    /**
     * This functions registers the listener with the event registry
     * @param source - The source of the registration request
     * @param event - The event to listen to
     * @param listener - The registered listener function
     */
    addListenerToRegistry(source: any, event: iCPSEvent, listener: ListenerFunction) {
        ResourceManager.logger(this).debug(`Registering listener for event ${event} from source ${source.constructor.name}`);
        if (!this._eventRegistry.has(source)) {
            this._eventRegistry.set(source, []);
        }

        const sourceRegistry = this._eventRegistry.get(source);
        sourceRegistry.push({event, listener});
    }

    /**
     * This function removes all listeners from the event bus and the event registry for the provided source
     * @param source - The source to remove listeners for
     * @param event - Optional event to remove listeners for - otherwise all will be removed
     * @returns This instance for chaining
     */
    removeListenersFromRegistry(source: any, event?: iCPSEvent): EventManager {
        if (!this._eventRegistry.has(source)) {
            ResourceManager.logger(this).debug(`No listeners registered for source ${source.constructor.name}`);
            return this;
        }

        // We need to remove reference to the listener from the registry to avoid memory leaks
        // Storing non-removed listeners in a new array and replacing the old one with it
        const updatedSourceRegistry: EventRegistryObject[] = [];

        let removedListenerCount = 0;
        for (const registryObject of this._eventRegistry.get(source)) {
            if (event === undefined || registryObject.event === event) { // Removing listener and not pushing to new array
                this._eventBus.removeListener(registryObject.event, registryObject.listener);
                removedListenerCount++;
            } else { // Keeping listener and pushing to new array
                updatedSourceRegistry.push(registryObject);
            }
        }

        ResourceManager.logger(this).debug(`Removed ${removedListenerCount} listeners for source ${source.constructor.name}`);

        if (updatedSourceRegistry.length === 0) {
            ResourceManager.logger(this).debug(`No more listeners for source ${source.constructor.name} registered`);
            this._eventRegistry.delete(source);
            return this;
        }

        this._eventRegistry.set(source, updatedSourceRegistry);
        return this;
    }
}

/**
 * Interface to logger event bus, with a source bound to it
 */
export type StaticLogger = {
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
export type StaticEvents = {
    /**
     * Registers an event listener to the event bus
     * @param event - The event to listen to
     * @param listener - The listener function to call upon the event
     * @returns This instance for chaining
     */
    on: (event: iCPSEvent, listener: ListenerFunction) => StaticEvents,
    /**
     * Registers an one-time event listener to the event bus
     * @param event - The event to listen to
     * @param listener - The listener function to call upon the event
     * @returns This instance for chaining
     */
    once: (event: iCPSEvent, listener: ListenerFunction) => StaticEvents,
    /**
     * Removes all listeners from the source from the event bus
     * @param event - Optional event to remove listeners for - otherwise all will be removed
     */
    removeListeners: (event?: iCPSEvent) => StaticEvents,
}

/**
 * Formats the provided arguments as a string
 * @param args - The arguments to format
 * @returns The formatted string
 */
function format(...args: unknown[]): string {
    return args.map(arg => String(arg)).join(` `);
}