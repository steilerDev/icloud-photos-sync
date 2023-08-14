
import {test, beforeEach, expect, jest, describe} from '@jest/globals';
import {EventManager} from "../../src/lib/resources/event-manager";
import {iCPSEventError} from "../../src/lib/resources/events-types";
import {prepareResources} from '../_helpers/_general';

let eventManager: EventManager;

beforeEach(() => {
    eventManager = prepareResources()!.event;
});

test(`EventManager emits events correctly`, () => {
    const testEvent = iCPSEventError.HANDLER_EVENT;
    const testData = {message: `Hello, world!`};
    const eventListener = jest.fn();

    eventManager._eventBus.on(testEvent, eventListener);

    eventManager.emit(testEvent, testData);
    expect(eventListener).toHaveBeenCalledWith(testData);
});

describe(`EventManager manages registry correctly`, () => {
    describe(`EventManager subscribes to events correctly`, () => {
        test(`Permanent listener`, () => {
            const eventListener = jest.fn();
            const testEvent = iCPSEventError.HANDLER_EVENT;
            const listener = {};

            eventManager.addListenerToRegistry = jest.fn<typeof eventManager.addListenerToRegistry>();
            eventManager._eventBus.on = jest.fn<typeof eventManager._eventBus.on>();

            eventManager.on(listener, testEvent, eventListener);

            expect(eventManager.addListenerToRegistry).toHaveBeenCalledWith(listener, testEvent, eventListener);
            expect(eventManager._eventBus.on).toHaveBeenCalledWith(testEvent, eventListener);
        });

        test(`One-time listener`, () => {
            const eventListener = jest.fn();
            const testEvent = iCPSEventError.HANDLER_EVENT;
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
            const testEvent = iCPSEventError.HANDLER_EVENT;
            const listener = {};

            eventManager.on(listener, testEvent, eventListener);

            expect(eventManager._eventRegistry.get(listener)).toHaveLength(1);

            eventManager.emit(testEvent);
            expect(eventListener).toHaveBeenCalledTimes(1);
        });

        test(`EventManager adds multiple listener for class correctly`, () => {
            const eventListener = jest.fn();
            const testEventA = iCPSEventError.HANDLER_EVENT;
            const testEventB = iCPSEventError.HANDLER_ERROR;
            const listener = {};

            eventManager.on(listener, testEventA, eventListener);
            eventManager.on(listener, testEventA, eventListener);
            eventManager.on(listener, testEventB, eventListener);

            expect(eventManager._eventRegistry.get(listener)).toHaveLength(3);

            eventManager.emit(testEventA);
            eventManager.emit(testEventB);
            expect(eventListener).toHaveBeenCalledTimes(3);
        });

        test(`EventManager adds multiple listener for multiple classes correctly`, () => {
            const eventListener = jest.fn();
            const testEventA = iCPSEventError.HANDLER_EVENT;
            const testEventB = iCPSEventError.HANDLER_ERROR;
            const listenerA = {};
            const listenerB = {};

            eventManager.on(listenerA, testEventA, eventListener);
            eventManager.on(listenerA, testEventA, eventListener);
            eventManager.on(listenerA, testEventB, eventListener);
            eventManager.on(listenerB, testEventA, eventListener);
            eventManager.on(listenerB, testEventB, eventListener);

            expect(eventManager._eventRegistry.get(listenerA)).toHaveLength(3);
            expect(eventManager._eventRegistry.get(listenerB)).toHaveLength(2);

            eventManager.emit(testEventA);
            eventManager.emit(testEventB);
            expect(eventListener).toHaveBeenCalledTimes(5);
        });
    });

    describe(`EventManager removes listeners from registry correctly`, () => {
        test(`EventManager removes all listeners for class correctly`, () => {
            const eventListenerA = jest.fn();
            const eventListenerB = jest.fn();
            const testEventA = iCPSEventError.HANDLER_EVENT;
            const testEventB = iCPSEventError.HANDLER_ERROR;
            const listenerA = {};
            const listenerB = {};

            eventManager.on(listenerA, testEventA, eventListenerA);
            eventManager.on(listenerA, testEventB, eventListenerA);
            eventManager.on(listenerB, testEventA, eventListenerB);
            eventManager.on(listenerB, testEventB, eventListenerB);

            eventManager.removeListenersFromRegistry(listenerA);

            eventManager.emit(testEventA);
            eventManager.emit(testEventB);
            expect(eventListenerA).not.toHaveBeenCalled();
            expect(eventListenerB).toHaveBeenCalledTimes(2);
        });

        test(`EventManager removes specific listeners for class correctly`, () => {
            const eventListenerA = jest.fn();
            const eventListenerB = jest.fn();
            const testEventA = iCPSEventError.HANDLER_EVENT;
            const testEventB = iCPSEventError.HANDLER_ERROR;
            const listenerA = {};
            const listenerB = {};

            eventManager.on(listenerA, testEventA, eventListenerA);
            eventManager.on(listenerA, testEventB, eventListenerA);
            eventManager.on(listenerB, testEventA, eventListenerB);
            eventManager.on(listenerB, testEventB, eventListenerB);

            eventManager.removeListenersFromRegistry(listenerA, testEventA);

            eventManager.emit(testEventA);
            eventManager.emit(testEventB);
            expect(eventListenerA).toHaveBeenCalledTimes(1);
            expect(eventListenerB).toHaveBeenCalledTimes(2);
        });

        test(`EventManager does nothing if class never registered`, () => {
            const eventListenerA = jest.fn();
            const testEventA = iCPSEventError.HANDLER_EVENT;
            const testEventB = iCPSEventError.HANDLER_ERROR;
            const listenerA = {};
            const listenerB = {};

            eventManager.on(listenerA, testEventA, eventListenerA);
            eventManager.on(listenerA, testEventB, eventListenerA);

            eventManager.removeListenersFromRegistry(listenerB);

            eventManager.emit(testEventA);
            eventManager.emit(testEventB);
            expect(eventListenerA).toHaveBeenCalledTimes(2);
        });

        test(`EventManager does nothing if event never registered`, () => {
            const eventListenerA = jest.fn();
            const eventListenerB = jest.fn();
            const testEventA = iCPSEventError.HANDLER_EVENT;
            const testEventB = iCPSEventError.HANDLER_ERROR;
            const listenerA = {};
            const listenerB = {};

            eventManager.on(listenerA, testEventA, eventListenerA);
            eventManager.on(listenerA, testEventB, eventListenerA);
            eventManager.on(listenerB, testEventA, eventListenerB);

            eventManager.removeListenersFromRegistry(listenerB, testEventB);

            eventManager.emit(testEventA);
            eventManager.emit(testEventB);
            expect(eventListenerA).toHaveBeenCalledTimes(2);
            expect(eventListenerB).toHaveBeenCalledTimes(1);
        });
    });
});