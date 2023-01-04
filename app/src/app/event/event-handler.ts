import {EventEmitter} from "events";

/**
 * A generic class that can be supplied at runtime to listen for events emmitted by a list of objects
 */
export interface EventHandler {
    /**
     * Registers listeners to act on the provided events
     * @param object - The object to listen on
     */
    registerObjects(...objects: EventEmitter[]): void
}

export function registerObjectsToEventHandlers(eventHandlers: EventHandler[], ...objects: EventEmitter[]) {
    eventHandlers.forEach(handler => {
        handler.registerObjects(...objects);
    });
}

/**
 * This function will remove all event listeners from all provided objects
 * @param objects - The objects whose listeners will be removed
 */
export function removeObjectsFromEventHandlers(...objects: EventEmitter[]) {
    objects.forEach(obj => {
        obj.removeAllListeners();
    });
}