import {jest} from '@jest/globals';
import EventEmitter from 'events';
import * as Config from './_config';
import {iCPSAppOptions} from '../../src/app/factory';
import {ResourceManager} from '../../src/lib/resource-manager/resource-manager';
import MockAdapter from 'axios-mock-adapter';
import {NetworkManager} from '../../src/lib/resource-manager/network-manager';
import {iCPSEvent, iCPSEventError} from '../../src/lib/resource-manager/events';
import {Resources} from '../../src/lib/resource-manager/main';

export type UnknownFunction = (...args: Array<unknown>) => unknown
export type UnknownAsyncFunction = (...args: Array<unknown>) => Promise<unknown>

export type MockedNetworkManager = NetworkManager & {
    mock: MockAdapter;
};

export type MockedResourceManager = ResourceManager & {
    spyOnEvent: (event: iCPSEvent, removeListeners?: boolean) => jest.Mock;
    spyOnHandlerEvent: (removeListeners?: boolean) => jest.Mock;
    _networkManager: MockedNetworkManager;
}

/**
 * This function resets the ResourceManager singleton and optionally creates a new instance using the supplied configuration.
 * @param initiate - Whether to create a new instance of the ResourceManager. If false, the ResourceManager singleton will be reset, but not re-initialized and a resource file will be created through mockfs.
 * @param appOptions - The configuration to use when creating a new instance of the ResourceManager
 */
export function prepareResourceManager(initiate: boolean = true, appOptions: iCPSAppOptions = Config.defaultConfig): MockedResourceManager | undefined {
    if (Resources._instance) {
        Resources._instance._eventManager._eventBus.removeAllListeners();
        Resources._instance = undefined as any;
    }

    ResourceManager.prototype.readResourceFile = jest.fn<typeof ResourceManager.prototype.readResourceFile>()
        .mockReturnValue({
            trustToken: Config.trustToken,
            libraryVersion: 1,
        });

    ResourceManager.prototype.writeResourceFile = jest.fn<typeof ResourceManager.prototype.writeResourceFile>()
        .mockReturnValue();

    if (initiate) {
        const instance = Resources.setup(appOptions) as MockedResourceManager;
        instance._networkManager.mock = new MockAdapter(instance._networkManager._axios, {onNoMatch: `throwException`});
        instance.spyOnEvent = (event: iCPSEvent, removeListeners: boolean = true) => spyOnEvent(instance._eventManager._eventBus, event, removeListeners);
        instance.spyOnHandlerEvent = (removeListeners: boolean = true) => spyOnEvent(instance._eventManager._eventBus, iCPSEventError.HANDLER_EVENT, removeListeners);
        return instance;
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

export function addHoursToCurrentDate(hours: number): string {
    return new Date(new Date().getTime() + (hours * 3600000)).toUTCString();
}

export function getDateInThePast(): string {
    // 36 hours in the past
    return new Date(new Date().getTime() - (36 * 3600000)).toUTCString();
}