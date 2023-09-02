
import {test, beforeEach, expect, jest, describe} from '@jest/globals';
import {EventManager} from "../../src/lib/resources/event-manager";
import {prepareResources} from '../_helpers/_general';
import {iCPSEvent} from '../../src/lib/resources/events-types';

let eventManager: EventManager;

beforeEach(() => {
    eventManager = prepareResources()!.event;
});

const testEvent = `testEvent` as iCPSEvent;
const testEvent2 = `testEvent2` as iCPSEvent;

test(`EventManager emits events correctly`, () => {
    const testData = {message: `Hello, world!`};
    const eventListener = jest.fn();

    eventManager._eventBus.on(testEvent, eventListener);

    eventManager.emit(testEvent, testData);
    expect(eventListener).toHaveBeenCalledWith(testData);
});

describe(`EventManager keeps track of listeners correctly`, () => {
    test(`EventManager counts single event correctly`, () => {
        eventManager.emit(testEvent);
        expect(eventManager.getEventCount(testEvent)).toBe(1);
        expect(eventManager.getEventCount(testEvent2)).toBe(0);
    });

    test(`EventManager counts multiple events correctly`, () => {
        eventManager.emit(testEvent);
        eventManager.emit(testEvent);
        eventManager.emit(testEvent2);
        expect(eventManager.getEventCount(testEvent)).toBe(2);
        expect(eventManager.getEventCount(testEvent2)).toBe(1);
    });

    test(`EventManager resets event count correctly`, () => {
        eventManager.emit(testEvent);
        eventManager.emit(testEvent2);
        eventManager.resetEventCounter(testEvent);
        expect(eventManager.getEventCount(testEvent)).toBe(0);
        expect(eventManager.getEventCount(testEvent2)).toBe(1);
    });
});

describe(`EventManager manages registry correctly`, () => {
    describe(`EventManager subscribes to events correctly`, () => {
        test(`Permanent listener`, () => {
            const eventListener = jest.fn();
            const listener = {};

            eventManager.addListenerToRegistry = jest.fn<typeof eventManager.addListenerToRegistry>();
            eventManager._eventBus.on = jest.fn<typeof eventManager._eventBus.on>();

            eventManager.on(listener, testEvent, eventListener);

            expect(eventManager.addListenerToRegistry).toHaveBeenCalledWith(listener, testEvent, eventListener);
            expect(eventManager._eventBus.on).toHaveBeenCalledWith(testEvent, eventListener);
        });

        test(`One-time listener`, () => {
            const eventListener = jest.fn();
            const listener = {};

            eventManager.addListenerToRegistry = jest.fn<typeof eventManager.addListenerToRegistry>();
            eventManager._eventBus.once = jest.fn<typeof eventManager._eventBus.on>();

            eventManager.once(listener, testEvent, eventListener);

            expect(eventManager.addListenerToRegistry).toHaveBeenCalledWith(listener, testEvent, eventListener);
            expect(eventManager._eventBus.once).toHaveBeenCalledWith(testEvent, eventListener);
        });
    });

    describe(`EventManager adds listeners to registry correctly`, () => {
        test(`EventManager adds listener for class correctly`, () => {
            const eventListener = jest.fn();
            const listener = {};

            eventManager.on(listener, testEvent, eventListener);

            expect(eventManager._eventRegistry.get(listener)).toHaveLength(1);

            eventManager.emit(testEvent);
            expect(eventListener).toHaveBeenCalledTimes(1);
        });

        test(`EventManager adds multiple listener for class correctly`, () => {
            const eventListener = jest.fn();
            const listener = {};

            eventManager.on(listener, testEvent, eventListener);
            eventManager.on(listener, testEvent, eventListener);
            eventManager.on(listener, testEvent2, eventListener);

            expect(eventManager._eventRegistry.get(listener)).toHaveLength(3);

            eventManager.emit(testEvent);
            eventManager.emit(testEvent2);
            expect(eventListener).toHaveBeenCalledTimes(3);
        });

        test(`EventManager adds multiple listener for multiple classes correctly`, () => {
            const eventListener = jest.fn();
            const listenerA = {};
            const listenerB = {};

            eventManager.on(listenerA, testEvent, eventListener);
            eventManager.on(listenerA, testEvent, eventListener);
            eventManager.on(listenerA, testEvent2, eventListener);
            eventManager.on(listenerB, testEvent, eventListener);
            eventManager.on(listenerB, testEvent2, eventListener);

            expect(eventManager._eventRegistry.get(listenerA)).toHaveLength(3);
            expect(eventManager._eventRegistry.get(listenerB)).toHaveLength(2);

            eventManager.emit(testEvent);
            eventManager.emit(testEvent2);
            expect(eventListener).toHaveBeenCalledTimes(5);
        });
    });

    describe(`EventManager removes listeners from registry correctly`, () => {
        test(`EventManager removes all listeners for class correctly`, () => {
            const eventListenerA = jest.fn();
            const eventListenerB = jest.fn();
            const listenerA = {};
            const listenerB = {};

            eventManager.on(listenerA, testEvent, eventListenerA);
            eventManager.on(listenerA, testEvent2, eventListenerA);
            eventManager.on(listenerB, testEvent, eventListenerB);
            eventManager.on(listenerB, testEvent2, eventListenerB);

            eventManager.removeListenersFromRegistry(listenerA);

            eventManager.emit(testEvent);
            eventManager.emit(testEvent2);
            expect(eventListenerA).not.toHaveBeenCalled();
            expect(eventListenerB).toHaveBeenCalledTimes(2);
        });

        test(`EventManager removes specific listeners for class correctly`, () => {
            const eventListenerA = jest.fn();
            const eventListenerB = jest.fn();
            const listenerA = {};
            const listenerB = {};

            eventManager.on(listenerA, testEvent, eventListenerA);
            eventManager.on(listenerA, testEvent2, eventListenerA);
            eventManager.on(listenerB, testEvent, eventListenerB);
            eventManager.on(listenerB, testEvent2, eventListenerB);

            eventManager.removeListenersFromRegistry(listenerA, testEvent);

            eventManager.emit(testEvent);
            eventManager.emit(testEvent2);
            expect(eventListenerA).toHaveBeenCalledTimes(1);
            expect(eventListenerB).toHaveBeenCalledTimes(2);
        });

        test(`EventManager does nothing if class never registered`, () => {
            const eventListenerA = jest.fn();
            const listenerA = {};
            const listenerB = {};

            eventManager.on(listenerA, testEvent, eventListenerA);
            eventManager.on(listenerA, testEvent2, eventListenerA);

            eventManager.removeListenersFromRegistry(listenerB);

            eventManager.emit(testEvent);
            eventManager.emit(testEvent2);
            expect(eventListenerA).toHaveBeenCalledTimes(2);
        });

        test(`EventManager does nothing if event never registered`, () => {
            const eventListenerA = jest.fn();
            const eventListenerB = jest.fn();
            const listenerA = {};
            const listenerB = {};

            eventManager.on(listenerA, testEvent, eventListenerA);
            eventManager.on(listenerA, testEvent2, eventListenerA);
            eventManager.on(listenerB, testEvent, eventListenerB);

            eventManager.removeListenersFromRegistry(listenerB, testEvent2);

            eventManager.emit(testEvent);
            eventManager.emit(testEvent2);
            expect(eventListenerA).toHaveBeenCalledTimes(2);
            expect(eventListenerB).toHaveBeenCalledTimes(1);
        });
    });
});