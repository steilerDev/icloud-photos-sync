
import {expect, describe, test} from '@jest/globals';
describe(`Unit Tests - MFA Server`, () => {
    test(`Should fail`, () => {
        expect(true).toEqual(false)
    })
    test.todo(`Should start & stop`);
    test.todo(`Should be able to parse valid token`);
    test.todo(`Should reject invalid token`);
    test.todo(`Should reject undefined route`);
    test.todo(`Should be able to parse valid re-send request`);
    test.todo(`Should reject invalid re-send request`);
});