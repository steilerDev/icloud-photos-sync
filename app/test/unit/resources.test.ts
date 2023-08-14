
import {test, beforeEach, expect, jest, describe} from '@jest/globals';
import {EventManager} from "../../src/lib/resources/event-manager";
import {iCPSEventError, iCPSEventLog} from "../../src/lib/resources/events-types";
import {prepareResources} from '../_helpers/_general';
import {Resources} from '../../src/lib/resources/main';

let eventManager: EventManager;

beforeEach(() => {
    eventManager = prepareResources()!.event;
});

describe(`Creates static events element correctly`, () => {
    test(`on function`, () => {
        eventManager.on = jest.fn<typeof eventManager.on>()
            .mockReturnValue(eventManager);

        const listener = {};

        const staticEvents = Resources.events(listener);
        expect(staticEvents).toHaveProperty(`on`);

        staticEvents.on(iCPSEventError.HANDLER_EVENT, () => {});
        expect(eventManager.on).toHaveBeenCalledWith(listener, iCPSEventError.HANDLER_EVENT, expect.any(Function));
    });

    test(`once function`, () => {
        eventManager.once = jest.fn<typeof eventManager.once>()
            .mockReturnValue(eventManager);

        const listener = {};

        const staticEvents = Resources.events(listener);
        expect(staticEvents).toHaveProperty(`once`);

        staticEvents.once(iCPSEventError.HANDLER_EVENT, () => {});
        expect(eventManager.once).toHaveBeenCalledWith(listener, iCPSEventError.HANDLER_EVENT, expect.any(Function));
    });

    test(`removeListener function`, () => {
        eventManager.removeListenersFromRegistry = jest.fn<typeof eventManager.removeListenersFromRegistry>()
            .mockReturnValue(eventManager);

        const listener = {};

        const staticEvents = Resources.events(listener);
        expect(staticEvents).toHaveProperty(`removeListeners`);

        staticEvents.removeListeners(iCPSEventError.HANDLER_EVENT);
        expect(eventManager.removeListenersFromRegistry).toHaveBeenCalledWith(listener, iCPSEventError.HANDLER_EVENT);
    });

    test(`removeListener function without event`, () => {
        eventManager.removeListenersFromRegistry = jest.fn<typeof eventManager.removeListenersFromRegistry>()
            .mockReturnValue(eventManager);

        const listener = {};

        const staticEvents = Resources.events(listener);
        expect(staticEvents).toHaveProperty(`removeListeners`);

        staticEvents.removeListeners();
        expect(eventManager.removeListenersFromRegistry).toHaveBeenCalledWith(listener, undefined);
    });
});

describe(`Creates static logger element correctly`, () => {
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

        const staticLogger = Resources.logger(`test`);
        expect(staticLogger).toHaveProperty(functionName);

        staticLogger[functionName](`Hello, world!`);
        expect(eventManager.emit).toHaveBeenCalledWith(expectedLogLevel, `test`, `Hello, world!`);
    });
});