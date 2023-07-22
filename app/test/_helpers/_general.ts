
import mockfs from 'mock-fs';
import {jest} from '@jest/globals';
import EventEmitter from 'events';
import * as Config from './_config';
import {iCPSAppOptions} from '../../src/app/factory';
import {ResourceManager} from '../../src/lib/resource-manager/resource-manager';

/**
 * This function resets the ResourceManager singleton and optionally creates a new instance using the supplied configuration.
 * @param initiate - Whether to create a new instance of the ResourceManager. If false, the ResourceManager singleton will be reset, but not re-initialized and a resource file will be created through mockfs.
 * @param appOptions - The configuration to use when creating a new instance of the ResourceManager
 */
export function prepareResourceManager(initiate: boolean = true, appOptions: iCPSAppOptions = Config.defaultConfig) {
    ResourceManager._instance = undefined;
    mockfs({
        '/opt/icloud-photos-library/.icloud-photos.sync': JSON.stringify({
            trustToken: Config.trustToken,
            libraryVersion: 1,
        }),
    });

    if (initiate) {
        ResourceManager.setup(appOptions);
        mockfs.restore();
    }
}

export function spyOnEvent(object: EventEmitter, eventName: string): any {
    const eventFunction = jest.fn();
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