
import {jest} from '@jest/globals';
import EventEmitter from 'events';

export function spyOnEvent(object: EventEmitter, eventName: string): any {
    const eventFunction = jest.fn();
    object.on(eventName, eventFunction);
    return eventFunction;
}