import {EventEmitter} from "events";
import {iCPSEvent} from "./events-types.js";
import {Resources} from "./main.js";

/**
 * Callbacks for event listeners
 */
export type ListenerFunction = (...args: any[]) => void;

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
     * Keeps track of the number of times an event was emitted
     */
    _eventCounter: Map<iCPSEvent, number> = new Map();

    /**
     * Emits an event on the event bus
     * @param event - The event to emit
     * @param args - The arguments to pass to the event
     * @returns True if the event had listeners
     */
    emit(event: iCPSEvent, ...args: any[]): boolean {
        this.increaseEventCounter(event);
        return this._eventBus.emit(event, ...args);
    }

    /**
     * @param event - The event to check
     * @returns The number of times an event was emitted since the last reset
     */
    getEventCount(event: iCPSEvent): number {
        return this._eventCounter.get(event) ?? 0;
    }

    /**
     * Increases the event counter of the associated event by one
     * @param event - The event to increase the counter of
     */
    increaseEventCounter(event: iCPSEvent) {
        this._eventCounter.set(event, this.getEventCount(event) + 1);
    }

    /**
     * Resets the event counter of the associated event
     * @param event - The event to reset the counter of
     */
    resetEventCounter(event: iCPSEvent) {
        this._eventCounter.set(event, 0);
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
        Resources.logger(this).debug(`Registering listener for event ${event} from source ${source.constructor.name}`);
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
            Resources.logger(this).debug(`No listeners registered for source ${source.constructor.name}`);
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

        Resources.logger(this).debug(`Removed ${removedListenerCount} listeners for source ${source.constructor.name}`);

        if (updatedSourceRegistry.length === 0) {
            Resources.logger(this).debug(`No more listeners for source ${source.constructor.name} registered`);
            this._eventRegistry.delete(source);
            return this;
        }

        this._eventRegistry.set(source, updatedSourceRegistry);
        return this;
    }
}