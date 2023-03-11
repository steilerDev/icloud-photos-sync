
import {jest} from '@jest/globals';
import EventEmitter from 'events';

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