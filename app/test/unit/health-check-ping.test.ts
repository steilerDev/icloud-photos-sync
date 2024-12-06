import { beforeEach, describe, expect, test } from "@jest/globals";
import { HealthCheckPingExecutor } from "../../src/app/event/health-check-ping-executor";
import { LogInterface } from "../../src/app/event/log";
import { iCPSEventRuntimeError, iCPSEventSyncEngine } from "../../src/lib/resources/events-types";
import * as Config from '../_helpers/_config';
import { MockedEventManager, MockedNetworkManager, MockedResourceManager, prepareResources } from "../_helpers/_general";

const exampleHealthCheckUrl = `https://hc-ping.com/example-healthcheck-slug`;
let mockedResourceManager: MockedResourceManager;
let mockedNetworkManager: MockedNetworkManager;
let mockedEventManager: MockedEventManager;
let healthCheckPingExecutor: HealthCheckPingExecutor;

beforeEach(() => {
    const instances = prepareResources()!;
    mockedResourceManager = instances.manager;
    mockedNetworkManager = instances.network;
    mockedEventManager = instances.event;

    mockedResourceManager._resources.primaryZone = Config.primaryZone;
    mockedResourceManager._resources.sharedZone = Config.sharedZone;
    mockedResourceManager._resources.healthCheckPingUrl = exampleHealthCheckUrl;

    healthCheckPingExecutor = new HealthCheckPingExecutor({
        getLog: () => `Example log message`,
    } as LogInterface);

    mockedNetworkManager
            .mock
            .onPost(new RegExp(`${exampleHealthCheckUrl}/.*`))
            .reply(200);
});

describe(`Health Check Pings`, () => {
    test(`Sends start if sync is started`, async () => {
        mockedEventManager.emit(iCPSEventSyncEngine.START);
        await requestsBeingExecuted();

        expect(mockedNetworkManager.mock.history.post[0].url).toBe(exampleHealthCheckUrl + `/start`);
    });

    test(`Sends success if sync completed`, async () => {
        mockedEventManager.emit(iCPSEventSyncEngine.DONE);
        await requestsBeingExecuted();

        expect(mockedNetworkManager.mock.history.post[0].url).toBe(exampleHealthCheckUrl);
        expect(mockedNetworkManager.mock.history.post[0].data).toBe(`"Example log message"`);
    });

    test(`Sends error if sync failed`, async () => {
        mockedEventManager.emit(iCPSEventRuntimeError.HANDLED_ERROR, new Error(`Test error message`));
        await requestsBeingExecuted();

        expect(mockedNetworkManager.mock.history.post[0].url).toBe(exampleHealthCheckUrl + `/fail`);
        expect(mockedNetworkManager.mock.history.post[0].data).toBe(`"Example log message"`);
    });
});

function requestsBeingExecuted(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}
