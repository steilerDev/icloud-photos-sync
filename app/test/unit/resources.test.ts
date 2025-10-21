
import {test, beforeEach, expect, jest, describe} from '@jest/globals';
import * as Config from '../_helpers/_config';
import {EventManager} from "../../src/lib/resources/event-manager";
import {iCPSEvent, iCPSEventLog} from "../../src/lib/resources/events-types";
import {prepareResources} from '../_helpers/_general';
import {Resources} from '../../src/lib/resources/main';

describe(`Initializes correctly`, () => {
    beforeEach(() => {
        prepareResources(false);
    });

    test(`setup should initialize the singleton instances`, () => {
        const instances = Resources.setup(Config.defaultConfig);
        expect(instances.event).toBeDefined();
        expect(instances.validator).toBeDefined();
        expect(instances.manager).toBeDefined();
        expect(instances.network).toBeDefined();
        expect(instances.state).toBeDefined();
    });

    test(`setup should throw if called twice`, () => {
        Resources.setup(Config.defaultConfig);
        expect(() => Resources.setup(Config.defaultConfig)).toThrow();
    });

    test(`instances should return the singleton instances`, () => {
        Resources.setup(Config.defaultConfig);
        const instances = Resources.instances();
        expect(instances.event).toBeDefined();
        expect(instances.validator).toBeDefined();
        expect(instances.manager).toBeDefined();
        expect(instances.network).toBeDefined();
        expect(instances.state).toBeDefined();
    });

    test(`instances should throw if called before setup`, () => {
        expect(() => Resources.instances()).toThrow(/^Resources have not been initiated$/);
    });

    describe.each([
        {
            functionName: `event`,
            typeName: `EventManager`,
            error: /^EventManager has not been initiated$/,
        }, {
            functionName: `manager`,
            typeName: `ResourceManager`,
            error: /^ResourceManager has not been initiated$/,
        }, {
            functionName: `network`,
            typeName: `NetworkManager`,
            error: /^NetworkManager has not been initiated$/,
        }, {
            functionName: `state`,
            typeName: `StateManager`,
            error: /^State has not been initiated$/,
        }, {
            functionName: `validator`,
            typeName: `Validator`,
            error: /^Validator has not been initiated$/,
        },
    ])(`$functionName access function`, ({functionName, typeName, error}) => {
        test(`${functionName}() should return the ${typeName}`, () => {
            Resources.setup(Config.defaultConfig);

            const obj = (Resources as {[key: string]: any})[functionName](); // Using this type to suppress typescript error

            expect(obj).toBeDefined();
            expect(obj.constructor.name).toEqual(typeName);
        });

        test(`${functionName}() should throw if ${typeName} is uninitialized`, () => {
            Resources._instances = {} as any;

            expect(() => (Resources as {[key: string]: any})[functionName]()).toThrow(error); // Using this type to suppress typescript error
        });
    });
});

describe(`Creates static helper functions correctly`, () => {
    let eventManager: EventManager;
    const testEvent = `test-event` as iCPSEvent;

    beforeEach(() => {
        eventManager = prepareResources()!.event;
    });

    test(`Emits event correctly`, () => {
        eventManager.emit = jest.fn<typeof eventManager.emit>()
            .mockReturnValue(true);

        Resources.emit(testEvent, `Hello, world!`);

        expect(eventManager.emit).toHaveBeenCalledWith(testEvent, `Hello, world!`);
    });

    describe(`Creates static events element correctly`, () => {
        test(`on function`, () => {
            eventManager.on = jest.fn<typeof eventManager.on>()
                .mockReturnValue(eventManager);

            const listener = {};

            const staticEvents = Resources.events(listener);
            expect(staticEvents).toHaveProperty(`on`);

            staticEvents.on(testEvent, () => {});
            expect(eventManager.on).toHaveBeenCalledWith(listener, testEvent, expect.any(Function));
        });

        test(`once function`, () => {
            eventManager.once = jest.fn<typeof eventManager.once>()
                .mockReturnValue(eventManager);

            const listener = {};

            const staticEvents = Resources.events(listener);
            expect(staticEvents).toHaveProperty(`once`);

            staticEvents.once(testEvent, () => {});
            expect(eventManager.once).toHaveBeenCalledWith(listener, testEvent, expect.any(Function));
        });

        test(`removeListener function`, () => {
            eventManager.removeListenersFromRegistry = jest.fn<typeof eventManager.removeListenersFromRegistry>()
                .mockReturnValue(eventManager);

            const listener = {};

            const staticEvents = Resources.events(listener);
            expect(staticEvents).toHaveProperty(`removeListeners`);

            staticEvents.removeListeners(testEvent);
            expect(eventManager.removeListenersFromRegistry).toHaveBeenCalledWith(listener, testEvent);
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

            const staticLogger = Resources.logger(`test`) as {[key: string]: any}; // Using this type to suppress typescript error
            expect(staticLogger).toHaveProperty(functionName);

            staticLogger[functionName](`Hello, world!`);
            expect(eventManager.emit).toHaveBeenCalledWith(expectedLogLevel, `test`, `Hello, world!`);
        });
    });
});

describe(`package.json metadata`, () => {
    test(`should return the application version`, () => {
        expect(Resources.PackageInfo.version).toEqual(`0.0.0-development`);
    });

    test(`should return the application name`, () => {
        expect(Resources.PackageInfo.name).toEqual(`icloud-photos-sync`);
    });

    test(`should return the application description`, () => {
        expect(Resources.PackageInfo.description).toEqual(`One-way sync engine for the iCloud Photos Library into the native file system with archiving capabilities`);
    });
});

describe(`PID helper`, () => {
    test(`should return true if PID is running`, () => {
        // This process' pid is running
        expect(Resources.pidIsRunning(process.pid)).toBeTruthy();
    });
    test(`should return true if PID is not running`, () => {
        // Default Linux max PID is 32768 (adjustable), Mac max PID is 99998 (non-adjustable)
        expect(Resources.pidIsRunning(100000)).toBeFalsy();
    });
});