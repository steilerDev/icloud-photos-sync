import {describe, test, expect, jest} from "@jest/globals";
import {getICloudCookies, iCloudAuthFactory} from "../_helpers/icloud-auth.helper";
import * as Config from '../_helpers/_config';

describe(`Unit Tests - iCloud Auth`, () => {
    describe(`Validate Cloud Cookies`, () => {
        test(`No cookies loaded`, () => {
            const auth = iCloudAuthFactory();
            auth.iCloudCookies = [];
            expect(() => auth.validateCloudCookies()).toThrowError(`Unable to validate cloud cookies: No cookies loaded`);
        });

        test(`Expired cookies loaded`, () => {
            const auth = iCloudAuthFactory();
            auth.iCloudCookies = getICloudCookies(true);
            expect(() => auth.validateCloudCookies()).toThrowError(`Unable to validate cloud cookies: Some cookies are expired`);
        });

        test(`Object valid`, () => {
            const auth = iCloudAuthFactory();
            auth.iCloudCookies = getICloudCookies();
            expect(() => auth.validateCloudCookies()).not.toThrowError();
        });
    });

    describe(`Validate Photos Account`, () => {
        test(`zoneName missing`, () => {
            const auth = iCloudAuthFactory();
            auth.validateCloudCookies = jest.fn();
            Object.assign(auth.iCloudPhotosAccount, Config.iCloudPhotosAccount);
            auth.iCloudPhotosAccount.zoneName = undefined;
            expect(() => auth.validatePhotosAccount()).toThrowError(`Unable to validate Photos account: ZoneName invalid`);
            expect(auth.validateCloudCookies).toHaveBeenCalled();
        });

        test(`photosDomain missing`, () => {
            const auth = iCloudAuthFactory();
            auth.validateCloudCookies = jest.fn();
            Object.assign(auth.iCloudPhotosAccount, Config.iCloudPhotosAccount);
            auth.iCloudPhotosAccount.photosDomain = ``;
            expect(() => auth.validatePhotosAccount()).toThrowError(`Unable to validate Photos account: PhotosDomain invalid`);
            expect(auth.validateCloudCookies).toHaveBeenCalled();
        });

        test(`zoneType missing`, () => {
            const auth = iCloudAuthFactory();
            auth.validateCloudCookies = jest.fn();
            Object.assign(auth.iCloudPhotosAccount, Config.iCloudPhotosAccount);
            auth.iCloudPhotosAccount.zoneType = ``;
            expect(() => auth.validatePhotosAccount()).toThrowError(`Unable to validate Photos account: ZoneType invalid`);
            expect(auth.validateCloudCookies).toHaveBeenCalled();
        });
        test(`ownerName missing`, () => {
            const auth = iCloudAuthFactory();
            auth.validateCloudCookies = jest.fn();
            Object.assign(auth.iCloudPhotosAccount, Config.iCloudPhotosAccount);
            auth.iCloudPhotosAccount.ownerName = ``;
            expect(() => auth.validatePhotosAccount()).toThrowError(`Unable to validate Photos account: OwnerName invalid`);
            expect(auth.validateCloudCookies).toHaveBeenCalled();
        });
        test(`syncToken missing`, () => {
            const auth = iCloudAuthFactory();
            auth.validateCloudCookies = jest.fn();
            Object.assign(auth.iCloudPhotosAccount, Config.iCloudPhotosAccount);
            auth.iCloudPhotosAccount.syncToken = ``;
            expect(() => auth.validatePhotosAccount()).toThrowError(`Unable to validate Photos account: SyncToken invalid`);
            expect(auth.validateCloudCookies).toHaveBeenCalled();
        });

        test(`Object valid`, () => {
            const auth = iCloudAuthFactory();
            auth.validateCloudCookies = jest.fn();
            Object.assign(auth.iCloudPhotosAccount, Config.iCloudPhotosAccount);
            expect(() => auth.validatePhotosAccount()).not.toThrowError();
            expect(auth.validateCloudCookies).toHaveBeenCalled();
        });
    });

    describe(`Validate Account Secrets`, () => {
        test(`username missing`, () => {
            const auth = iCloudAuthFactory();
            auth.iCloudAccountSecrets.username = ``;
            auth.iCloudAccountSecrets.password = Config.password;
            expect(() => auth.validateAccountSecrets()).toThrowError(`Unable to validate account secrets: Username invalid`);
        });

        test(`password missing`, () => {
            const auth = iCloudAuthFactory();
            auth.iCloudAccountSecrets.username = Config.username;
            auth.iCloudAccountSecrets.password = ``;
            expect(() => auth.validateAccountSecrets()).toThrowError(`Unable to validate account secrets: Password invalid`);
        });

        test(`Object valid`, () => {
            const auth = iCloudAuthFactory();
            auth.iCloudAccountSecrets.username = Config.username;
            auth.iCloudAccountSecrets.password = Config.password;
            expect(() => auth.validateAccountSecrets()).not.toThrowError();
        });
    });

    describe(`Validate Auth Secrets`, () => {
        test(`aasp missing`, () => {
            const auth = iCloudAuthFactory();
            Object.assign(auth.iCloudAuthSecrets, Config.iCloudAuthSecrets);
            auth.iCloudAuthSecrets.aasp = ``;
            expect(() => auth.validateAuthSecrets()).toThrowError(`Unable to validate auth secrets: aasp invalid`);
        });
        test(`scnt missing`, () => {
            const auth = iCloudAuthFactory();
            Object.assign(auth.iCloudAuthSecrets, Config.iCloudAuthSecrets);
            auth.iCloudAuthSecrets.scnt = ``;
            expect(() => auth.validateAuthSecrets()).toThrowError(`Unable to validate auth secrets: scnt invalid`);
        });

        test(`sessionId missing`, () => {
            const auth = iCloudAuthFactory();
            Object.assign(auth.iCloudAuthSecrets, Config.iCloudAuthSecrets);
            auth.iCloudAuthSecrets.sessionId = ``;
            expect(() => auth.validateAuthSecrets()).toThrowError(`Unable to validate auth secrets: sessionId invalid`);
        });

        test(`Object valid`, () => {
            const auth = iCloudAuthFactory();
            Object.assign(auth.iCloudAuthSecrets, Config.iCloudAuthSecrets);
            expect(() => auth.validateAuthSecrets()).not.toThrowError();
        });
    });

    describe(`Validate Account Tokens`, () => {
        test(`Session Token missing`, () => {
            const auth = iCloudAuthFactory();
            auth.iCloudAccountTokens.sessionToken = ``;
            auth.iCloudAccountTokens.trustToken = Config.trustToken;
            expect(() => auth.validateAccountTokens()).toThrowError(`Unable to validate account tokens: sessionToken invalid`);
        });

        test(`Trust Token missing`, () => {
            const auth = iCloudAuthFactory();
            auth.iCloudAccountTokens.sessionToken = Config.iCloudAuthSecrets.sessionId;
            auth.iCloudAccountTokens.trustToken = ``;
            expect(() => auth.validateAccountTokens()).toThrowError(`Unable to validate account tokens: trustToken invalid`);
        });

        test(`Object valid`, () => {
            const auth = iCloudAuthFactory();
            auth.iCloudAccountTokens.sessionToken = Config.iCloudAuthSecrets.sessionId;
            auth.iCloudAccountTokens.trustToken = Config.trustToken;
            expect(() => auth.validateAccountTokens()).not.toThrowError();
        });
    });
});