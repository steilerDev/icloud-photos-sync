import {iCloudAuth} from "../../src/lib/icloud/auth";
import {jest} from '@jest/globals';
import {Cookie} from "tough-cookie";
import {getICloudCookieHeader} from "./icloud.helper";

export function getICloudCookies(expired: boolean = false): Cookie[] {
    const cookies: Cookie[] = [];
    const cookieHeader = getICloudCookieHeader(expired);
    cookieHeader[`set-cookie`].forEach(cookieHeaderString => cookies.push(Cookie.parse(cookieHeaderString)!));
    return cookies;
}

/**
 * This function creates a new instance of the iCloudAuth class and mocks unnecessary functions.
 * @param mockValidation - Whether to mock the validation functions. Defaults to false.
 * @returns An iCloudAuth instance, ready to be used in tests.
 */
export function iCloudAuthFactory(mockValidation: boolean = false): iCloudAuth {
    const auth = new iCloudAuth();
    if (mockValidation) {
        auth.validateAccountSecrets = jest.fn(() => true);
        auth.validateAccountTokens = jest.fn(() => true);
        auth.validateAuthSecrets = jest.fn(() => true);
        auth.validateCloudCookies = jest.fn(() => true);
        auth.validatePhotosAccount = jest.fn(() => true);
    }

    return auth;
}