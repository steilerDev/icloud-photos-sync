import {jest} from '@jest/globals';
import EventEmitter from 'events';
import * as Config from './_config';
import {iCPSAppOptions} from '../../src/app/factory';
import {ResourceManager} from '../../src/lib/resources/resource-manager';
import MockAdapter from 'axios-mock-adapter';
import {NetworkManager} from '../../src/lib/resources/network-manager';
import {iCPSEvent, iCPSEventError} from '../../src/lib/resources/events-types';
import {Resources} from '../../src/lib/resources/main';
import {Validator} from '../../src/lib/resources/validator';
import {EventManager} from '../../src/lib/resources/event-manager';

export type UnknownFunction = (...args: Array<unknown>) => unknown
export type UnknownAsyncFunction = (...args: Array<unknown>) => Promise<unknown>

export type MockedResourceInstances = {
    manager: MockedResourceManager,
    network: MockedNetworkManager,
    validator: MockedValidator,
    event: MockedEventManager,
}

export type MockedNetworkManager = NetworkManager & {
    mock: MockAdapter;
};

export type MockedResourceManager = ResourceManager & {
    _readResourceFile: jest.Mock<typeof ResourceManager.prototype._readResourceFile>
    _writeResourceFile: jest.Mock<typeof ResourceManager.prototype._writeResourceFile>
}

export type MockedValidator = Validator

export type MockedEventManager = EventManager & {
    spyOnEvent: (event: iCPSEvent, removeListeners?: boolean) => jest.Mock;
    spyOnHandlerEvent: (removeListeners?: boolean) => jest.Mock;
}

/**
 * This function resets the Resource singletons and creates new instances suitable for API tests, reading secrets from the environment variables.
 * @returns
 */
export function prepareResourceForApiTests(): Resources.Types.Instances {
    prepareResources(false);

    const instances = Resources.setup({
        ...Config.defaultConfig,
        username: process.env.TEST_APPLE_ID_USER!,
        password: process.env.TEST_APPLE_ID_PWD!,
        trustToken: process.env.TEST_TRUST_TOKEN!,
        failOnMfa: true,
    })!;

    instances.manager._writeResourceFile = jest.fn<typeof instances.manager._writeResourceFile>()
        .mockReturnValue();

    instances.manager._readResourceFile = jest.fn<typeof instances.manager._readResourceFile>()
        .mockReturnValue({
            libraryVersion: 1,
            trustToken: process.env.TEST_TRUST_TOKEN!,
        });

    return instances;
}

/**
 * This function resets the Resource singletons and optionally creates new instances using the supplied configuration.
 * @param initiate - Whether to create new instances. If false, the instance singletons will be reset, but not re-initialized.
 * @param appOptions - The configuration to use when creating a new instance of the ResourceManager
 */
export function prepareResources(initiate: boolean = true, appOptions: iCPSAppOptions = Config.defaultConfig): MockedResourceInstances | undefined {
    if (Resources._instances) {
        if (Resources._instances.event) {
            Resources._instances.event._eventBus.removeAllListeners();
        }

        Resources._instances = undefined as any;
    }

    if (initiate) {
        const originalWriteResourceFile = ResourceManager.prototype._writeResourceFile;
        const originalReadResourceFile = ResourceManager.prototype._readResourceFile;

        ResourceManager.prototype._writeResourceFile = jest.fn<typeof ResourceManager.prototype._writeResourceFile>()
            .mockReturnValue();

        ResourceManager.prototype._readResourceFile = jest.fn<typeof ResourceManager.prototype._readResourceFile>()
            .mockReturnValue({
                libraryVersion: 1,
                trustToken: undefined,
            });

        const instances = Resources.setup(appOptions) as MockedResourceInstances;

        instances.manager._writeResourceFile = ResourceManager.prototype._writeResourceFile as jest.Mock<typeof ResourceManager.prototype._writeResourceFile>;

        instances.manager._readResourceFile = ResourceManager.prototype._readResourceFile as jest.Mock<typeof ResourceManager.prototype._readResourceFile>;

        ResourceManager.prototype._writeResourceFile = originalWriteResourceFile;
        ResourceManager.prototype._readResourceFile = originalReadResourceFile;

        instances.network.mock = new MockAdapter(instances.network._axios, {onNoMatch: `throwException`});
        instances.event.spyOnEvent = (event: iCPSEvent, removeListeners: boolean = true) => spyOnEvent(instances.event._eventBus, event, removeListeners);
        instances.event.spyOnHandlerEvent = (removeListeners: boolean = true) => spyOnEvent(instances.event._eventBus, iCPSEventError.HANDLER_EVENT, removeListeners);
        return instances;
    }

    return undefined;
}

export function spyOnEvent(object: EventEmitter, eventName: string, removeListeners: boolean = true): any {
    const eventFunction = jest.fn<(...args: any[]) => void>();
    if (removeListeners) {
        object.removeAllListeners(eventName);
    }

    object.on(eventName, eventFunction);
    return eventFunction;
}

export function addHoursToCurrentDate(hours: number): Date {
    return new Date(new Date().getTime() + (hours * 3600000));
}

export function getDateInThePast(): Date {
    // 36 hours in the past
    return new Date(new Date().getTime() - (36 * 3600000));
}