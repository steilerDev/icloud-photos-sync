
import {test, beforeEach, expect, jest, describe} from '@jest/globals';
import {EventManager} from "../../src/lib/resource-manager/event-manager";
import {iCPSEventError, iCPSEventLog} from "../../src/lib/resource-manager/events";
import {prepareResourceManager} from '../_helpers/_general';

let eventManager: EventManager;

beforeEach(() => {
    prepareResourceManager()!;
    eventManager = new EventManager();
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
    describe(`EventManager creates static events element correctly`, () => {
        test(`on function`, () => {
            eventManager.on = jest.fn<typeof eventManager.on>()
                .mockReturnValue(eventManager);

            const listener = {};

            const staticEvents = eventManager.events(listener);
            expect(staticEvents).toHaveProperty(`on`);

            staticEvents.on(iCPSEventError.HANDLER_EVENT, () => {});
            expect(eventManager.on).toHaveBeenCalledWith(listener, iCPSEventError.HANDLER_EVENT, expect.any(Function));
        });

        test(`once function`, () => {
            eventManager.once = jest.fn<typeof eventManager.once>()
                .mockReturnValue(eventManager);

            const listener = {};

            const staticEvents = eventManager.events(listener);
            expect(staticEvents).toHaveProperty(`once`);

            staticEvents.once(iCPSEventError.HANDLER_EVENT, () => {});
            expect(eventManager.once).toHaveBeenCalledWith(listener, iCPSEventError.HANDLER_EVENT, expect.any(Function));
        });

        test(`removeListener function`, () => {
            eventManager.removeListenersFromRegistry = jest.fn<typeof eventManager.removeListenersFromRegistry>()
                .mockReturnValue(eventManager);

            const listener = {};

            const staticEvents = eventManager.events(listener);
            expect(staticEvents).toHaveProperty(`removeListeners`);

            staticEvents.removeListeners(iCPSEventError.HANDLER_EVENT);
            expect(eventManager.removeListenersFromRegistry).toHaveBeenCalledWith(listener, iCPSEventError.HANDLER_EVENT);
        });

        test(`removeListener function without event`, () => {
            eventManager.removeListenersFromRegistry = jest.fn<typeof eventManager.removeListenersFromRegistry>()
                .mockReturnValue(eventManager);

            const listener = {};

            const staticEvents = eventManager.events(listener);
            expect(staticEvents).toHaveProperty(`removeListeners`);

            staticEvents.removeListeners();
            expect(eventManager.removeListenersFromRegistry).toHaveBeenCalledWith(listener, undefined);
        });
    });

    describe(`EventManager creates static logger element correctly`, () => {
        test.each([
            {
                functionName: `log`,
                expectedLogLevel: iCPSEventLog.INFO,
            }, {
                functionName: `debug`,
                expectedLogLevel: iCPSEventLog.DEBUG,
            }, {
                functionName: `info`,
                expectedLogLevel: iCPSEventLog.INFO,
            }, {
                functionName: `warn`,
                expectedLogLevel: iCPSEventLog.WARN,
            }, {
                functionName: `error`,
                expectedLogLevel: iCPSEventLog.ERROR,
            },
        ])(`$functionName function`, ({functionName, expectedLogLevel}) => {
            eventManager.emit = jest.fn<typeof eventManager.emit>()
                .mockReturnValue(true);

            const staticLogger = eventManager.logger(`test`);
            expect(staticLogger).toHaveProperty(functionName);

            staticLogger[functionName](`Hello, world!`);
            expect(eventManager.emit).toHaveBeenCalledWith(expectedLogLevel, `test`, `Hello, world!`);
        });
    });

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

            eventManager.events(listener).on(testEvent, eventListener);

            expect(eventManager._eventRegistry.get(listener)).toHaveLength(1);

            eventManager.emit(testEvent);
            expect(eventListener).toHaveBeenCalledTimes(1);
        });

        test(`EventManager adds multiple listener for class correctly`, () => {
            const eventListener = jest.fn();
            const testEventA = iCPSEventError.HANDLER_EVENT;
            const testEventB = iCPSEventError.HANDLER_ERROR;
            const listener = {};

            eventManager.events(listener).on(testEventA, eventListener);
            eventManager.events(listener).on(testEventA, eventListener);
            eventManager.events(listener).on(testEventB, eventListener);

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

            eventManager.events(listenerA).on(testEventA, eventListener);
            eventManager.events(listenerA).on(testEventA, eventListener);
            eventManager.events(listenerA).on(testEventB, eventListener);
            eventManager.events(listenerB).on(testEventA, eventListener);
            eventManager.events(listenerB).on(testEventB, eventListener);

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

            eventManager.events(listenerA)
                .on(testEventA, eventListenerA)
                .on(testEventB, eventListenerA);
            eventManager.events(listenerB)
                .on(testEventA, eventListenerB)
                .on(testEventB, eventListenerB);

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

            eventManager.events(listenerA)
                .on(testEventA, eventListenerA)
                .on(testEventB, eventListenerA);
            eventManager.events(listenerB)
                .on(testEventA, eventListenerB)
                .on(testEventB, eventListenerB);

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

            eventManager.events(listenerA)
                .on(testEventA, eventListenerA)
                .on(testEventB, eventListenerA);

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

            eventManager.events(listenerA)
                .on(testEventA, eventListenerA)
                .on(testEventB, eventListenerA);
            eventManager.events(listenerB)
                .on(testEventA, eventListenerB);

            eventManager.removeListenersFromRegistry(listenerB, testEventB);

            eventManager.emit(testEventA);
            eventManager.emit(testEventB);
            expect(eventListenerA).toHaveBeenCalledTimes(2);
            expect(eventListenerB).toHaveBeenCalledTimes(1);
        });
    });
});