import {iCloudAuth} from "../../src/lib/icloud/auth";
import {jest} from '@jest/globals';
import {Cookie} from "tough-cookie";
import {getICloudCookieHeader} from "./icloud.helper";
import * as Config from "./_config";

export function mockValidation(auth: iCloudAuth) {
    auth.validateAccountSecrets = jest.fn(() => true);
    auth.validateAccountTokens = jest.fn(() => true);
    auth.validateAuthSecrets = jest.fn(() => true);
    auth.validateCloudCookies = jest.fn(() => true);
    auth.validatePhotosAccount = jest.fn(() => true);
}

export function getICloudCookies(expired: boolean = false): Cookie[] {
    const cookies: Cookie[] = [];
    const cookieHeader = getICloudCookieHeader(expired);
    cookieHeader[`set-cookie`].forEach(cookieHeaderString => cookies.push(Cookie.parse(cookieHeaderString)!));
    return cookies;
}

export function iCloudAuthFactory(): iCloudAuth {
    return new iCloudAuth(Config.username, Config.password, Config.trustToken, Config.appDataDir);
}