import {iCloudAuth} from "../../src/lib/icloud/auth";
import {jest} from '@jest/globals';

export function mockValidation(auth: iCloudAuth) {
    auth.validateAccountSecrets = jest.fn(() => true);
    auth.validateAccountTokens = jest.fn(() => true);
    auth.validateAuthSecrets = jest.fn(() => true);
    auth.validateCloudCookies = jest.fn(() => true);
    auth.validatePhotosAccount = jest.fn(() => true);
}