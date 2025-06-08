import {afterEach, beforeEach, describe, expect, jest, test} from "@jest/globals";
import MockAdapter from 'axios-mock-adapter';
import mockfs from 'mock-fs';
import {HealthCheckPingExecutor} from "../../src/app/event/health-check-ping-executor";
import {iCPSEventRuntimeError, iCPSEventSyncEngine} from "../../src/lib/resources/events-types";
import * as Config from '../_helpers/_config';
import {MockedEventManager, MockedResourceManager, prepareResources} from "../_helpers/_general";

const exampleHealthCheckUrl = `https://hc-ping.com/example-healthcheck-slug`;
let mockedResourceManager: MockedResourceManager;
let mockedEventManager: MockedEventManager;

beforeEach(() => {
    const instances = prepareResources()!;
    mockedResourceManager = instances.manager;
    mockedEventManager = instances.event;
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
        expect(mockedEventManager._eventRegistry.get(healthCheckPingExecutor)).toHaveLength(3)
    });
})

describe(`Health Check Pings`, () => {
    let healthCheckPingExecutor: HealthCheckPingExecutor;
    let mockAdapter: MockAdapter;

    beforeEach(() => {
        healthCheckPingExecutor = new HealthCheckPingExecutor();
        healthCheckPingExecutor.getLog = jest.fn<typeof healthCheckPingExecutor.getLog>().mockResolvedValue(`Example log message`);
        mockAdapter = new MockAdapter(healthCheckPingExecutor.networkInterface);
        mockAdapter.onPost().reply(200);
    });

    test(`Sends start if sync is started`, async () => {
        mockedEventManager.emit(iCPSEventSyncEngine.START);
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(mockAdapter.history.post[0].baseURL).toBe(exampleHealthCheckUrl);
        expect(mockAdapter.history.post[0].url).toBe(`/start`);
    });

    test(`Sends success if sync completed`, async () => {
        mockedEventManager.emit(iCPSEventSyncEngine.DONE);
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(mockAdapter.history.post[0].baseURL).toBe(exampleHealthCheckUrl);
        expect(mockAdapter.history.post[0].url).toBe(`/`);
        expect(mockAdapter.history.post[0].data).toBe(`Example log message`);
        expect(healthCheckPingExecutor.getLog).toHaveBeenCalledTimes(1)
    });

    test(`Sends error if sync failed`, async () => {
        mockedEventManager.emit(iCPSEventRuntimeError.HANDLED_ERROR, new Error(`Test error message`));
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(mockAdapter.history.post[0].baseURL).toBe(exampleHealthCheckUrl);
        expect(mockAdapter.history.post[0].url).toBe(`/fail`);
        expect(mockAdapter.history.post[0].data).toBe(`Example log message`);
        expect(healthCheckPingExecutor.getLog).toHaveBeenCalledTimes(1)
    });
});

describe(`Reads log file`, () => {
    let healthCheckPingExecutor: HealthCheckPingExecutor;

    beforeEach(() => {
        healthCheckPingExecutor = new HealthCheckPingExecutor();
    });

    afterEach(() => {
        mockfs.restore();
    });

    test(`Returns 'failed to read log file' if log file path is not readable`, async () => {
        mockfs({
            [Config.defaultConfig.dataDir]: {
                '.icloud-photos-sync.log': mockfs.file({
                    content: `Restricted`,
                    mode: 0o000
                })
            }
        });
        const log = await healthCheckPingExecutor.getLog();

        expect(log).toBe(`failed to read log file`);
    });

    test(`Returns log file content`, async () => {
        mockfs({
            [Config.defaultConfig.dataDir]: {
                '.icloud-photos-sync.log': `log file content`
            }
        });
        const log = await healthCheckPingExecutor.getLog();

        expect(log).toBe(`log file content`);
    });

    test(`Returns only 100k of log file`, async () => {
        mockfs({
            [Config.defaultConfig.dataDir]: {
                '.icloud-photos-sync.log': Buffer.alloc(200000, `a`)
            }
        });
        const log = Buffer.from(await healthCheckPingExecutor.getLog(), `utf-8`);

        expect(log).toHaveLength(102400);
    });

});