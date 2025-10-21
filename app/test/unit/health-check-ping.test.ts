import {afterEach, beforeEach, describe, expect, jest, test} from "@jest/globals";
import MockAdapter from 'axios-mock-adapter';
import mockfs from 'mock-fs';
import {HealthCheckPingExecutor} from "../../src/app/event/health-check-ping-executor";
import {iCPSEventApp, iCPSEventCloud, iCPSEventRuntimeError, iCPSEventSyncEngine} from "../../src/lib/resources/events-types";
import * as Config from '../_helpers/_config';
import {MockedEventManager, MockedResourceManager, prepareResources} from "../_helpers/_general";
import {LogLevel, StateManager} from "../../src/lib/resources/state-manager";

const exampleHealthCheckUrl = `https://hc-ping.com/example-healthcheck-slug`;
let mockedResourceManager: MockedResourceManager;
let mockedEventManager: MockedEventManager;
let mockedState: StateManager;

beforeEach(() => {
    const instances = prepareResources()!;
    mockedResourceManager = instances.manager;
    mockedEventManager = instances.event;
    mockedState = instances.state;
    mockedResourceManager._resources.healthCheckUrl = exampleHealthCheckUrl;
});

describe(`Health check initiates`, () => {
    test(`Does not create network interface if health check url is not set`, () => {
        mockedResourceManager._resources.healthCheckUrl = undefined;
        const healthCheckPingExecutor = new HealthCheckPingExecutor();

        expect(healthCheckPingExecutor.networkInterface).toBeUndefined();
        expect(mockedEventManager._eventRegistry.has(healthCheckPingExecutor)).toBeFalsy()
    });

    test(`Creates network interface if health check url is set`, () => {
        const healthCheckPingExecutor = new HealthCheckPingExecutor();

        expect(healthCheckPingExecutor.networkInterface).toBeDefined();
        expect(mockedEventManager._eventRegistry.get(healthCheckPingExecutor)).toHaveLength(1)
    });
})

describe(`Health Check Pings`, () => {
    let healthCheckPingExecutor: HealthCheckPingExecutor;
    let mockAdapter: MockAdapter;

    beforeEach(() => {
        healthCheckPingExecutor = new HealthCheckPingExecutor();
        healthCheckPingExecutor.getLog = jest.fn<typeof healthCheckPingExecutor.getLog>().mockReturnValue(`Example log message`);
        mockAdapter = new MockAdapter(healthCheckPingExecutor.networkInterface);
        mockAdapter.onPost().reply(200);
    });

    test(`Sends start if sync is started`, async () => {
        mockedEventManager.emit(iCPSEventApp.SCHEDULED_START);

        expect(mockAdapter.history.post[0].baseURL).toBe(exampleHealthCheckUrl);
        expect(mockAdapter.history.post[0].url).toBe(`/start`);
    });

    test(`Sends success if sync completed`, async () => {
        mockedEventManager.emit(iCPSEventApp.SCHEDULED_START);
        mockedEventManager.emit(iCPSEventApp.SCHEDULED_DONE, new Date());

        expect(mockAdapter.history.post[1].baseURL).toBe(exampleHealthCheckUrl);
        expect(mockAdapter.history.post[1].url).toBe(``);
        expect(mockAdapter.history.post[1].data).toBe(`Example log message`);
        expect(healthCheckPingExecutor.getLog).toHaveBeenCalledTimes(1)
    });

    test(`Sends error if sync failed`, async () => {
        mockedEventManager.emit(iCPSEventApp.SCHEDULED_START);
        mockedEventManager.emit(iCPSEventRuntimeError.SCHEDULED_ERROR, new Error(`Test error message`));

        expect(mockAdapter.history.post[1].baseURL).toBe(exampleHealthCheckUrl);
        expect(mockAdapter.history.post[1].url).toBe(`/fail`);
        expect(mockAdapter.history.post[1].data).toBe(`Example log message`);
        expect(healthCheckPingExecutor.getLog).toHaveBeenCalledTimes(1)
    });

    test(`Does not send data if state changes`, async () => {
        mockedEventManager.emit(iCPSEventCloud.AUTHENTICATION_STARTED);

        expect(mockAdapter.history).toHaveLength(0);
    });
});

describe(`Reads log content`, () => {
    let healthCheckPingExecutor: HealthCheckPingExecutor;

    beforeEach(() => {
        healthCheckPingExecutor = new HealthCheckPingExecutor();
     
    });

    test(`Returns log content`, () => {
        mockedState.log = [
            {
                level: LogLevel.DEBUG,
                source: `SourceA`,
                message: `TestMsg`,
                time: 1
            },{
                level: LogLevel.INFO,
                source: `SourceA`,
                message: `TestMsg`,
                time: 1
            },{
                level: LogLevel.WARN,
                source: `SourceB`,
                message: `TestMsg`,
                time: 1
            },{
                level: LogLevel.ERROR,
                source: `SourceB`,
                message: `TestMsg`,
                time: 1
            }
        ]
        const log = healthCheckPingExecutor.getLog();

        expect(log).toBe(`[1970-01-01T00:00:00.001Z] DEBUG SourceA: TestMsg
[1970-01-01T00:00:00.001Z] INFO SourceA: TestMsg
[1970-01-01T00:00:00.001Z] WARN SourceB: TestMsg
[1970-01-01T00:00:00.001Z] ERROR SourceB: TestMsg
`);
    });

    test(`Returns only 100k of log file`, () => {
        const iterations = 1000000
        mockedState.log = []
        for(let a = 0; a < iterations; a++) {
            mockedState.log?.push({
                level: LogLevel.DEBUG,
                source: `someSource`,
                message: `someMsg`,
                time: a
            })
        }
        const logBuffer = Buffer.from(healthCheckPingExecutor.getLog(), `utf-8`);

        expect(mockedState.log).toHaveLength(iterations)
        expect(logBuffer).toHaveLength(102400);
    });

});