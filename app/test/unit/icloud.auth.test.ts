import mockfs from 'mock-fs';
import * as fs from 'fs';
import {describe, test, expect, jest, afterEach} from "@jest/globals";
import {getICloudCookies, iCloudAuthFactory, mockValidation} from "../_helpers/icloud-auth.helper";
import * as Config from '../_helpers/_config';
import {AxiosResponse} from 'axios';

describe(`iCloud Auth`, () => {
    describe(`Storing trust token fails`, () => {
        afterEach(() => {
            mockfs.restore();
        });

        test(`Unable to create trust token directory`, async () => {
            mockfs({
                '/opt': mockfs.directory({
                    "mode": 0o000,
                    "uid": 0,
                    "gid": 0,
                }),
            });

            // For some reason required
            fs.chownSync(`/opt`, 0, 0);
            fs.chmodSync(`/opt`, 0o000);

            const auth = iCloudAuthFactory();
            await expect(auth.storeTrustToken()).rejects.toThrowError(`Unable to store trust token`);
        });

        test(`Unable to store trust token`, async () => {
            mockfs({
                '/opt/icloud-photos-library': mockfs.directory({
                    "mode": 0o000,
                }),
            });
            const auth = iCloudAuthFactory();
            await expect(auth.storeTrustToken()).rejects.toThrowError(`Unable to store trust token`);
        });
    });

    describe(`Validate Cloud Cookies`, () => {
        test(`No cookies loaded`, () => {
            const auth = iCloudAuthFactory();
            auth.iCloudCookies = [];
            expect(() => auth.validateCloudCookies()).toThrowError(`Unable to validate cookies`);
        });

        test(`Expired cookies loaded`, () => {
            const auth = iCloudAuthFactory();
            auth.iCloudCookies = getICloudCookies(true);
            expect(() => auth.validateCloudCookies()).toThrowError(`Unable to validate cookies`);
        });

        test(`Object valid`, () => {
            const auth = iCloudAuthFactory();
            auth.iCloudCookies = getICloudCookies();
            expect(() => auth.validateCloudCookies()).not.toThrowError();
        });
    });

    test(`Setup Photos Account`, () => {
        const auth = iCloudAuthFactory();
        mockValidation(auth);

        auth.processPhotosSetupResponse({
            "data": {
                "zones": [{
                    "zoneID": {
                        "ownerRecordName": `someOwner`,
                        "zoneName": `someZone`,
                        "zoneType": `someZoneType`,
                    },
                }],
            },
        } as AxiosResponse);

        expect(auth.validatePhotosAccount).toHaveBeenCalled();
        expect(auth.iCloudPhotosAccount.ownerName).toEqual(`someOwner`);
        expect(auth.iCloudPhotosAccount.zoneName).toEqual(`someZone`);
        expect(auth.iCloudPhotosAccount.zoneType).toEqual(`someZoneType`);
    });

    test(`Get Valid Photos Header`, () => {
        const auth = iCloudAuthFactory();

        auth.iCloudCookies = getICloudCookies();

        const photosHeader = auth.getPhotosHeader();

        expect(photosHeader).toEqual({
            "Accept": `application/json`,
            "Content-Type": `application/json`,
            "Cookie": `X-APPLE-WEBAUTH-HSA-TRUST="8a7c91e6fcxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxA0sVMViklkL/qm6SBVEKD2uttGESLUH2lWSvni/sQJecA+iJFa6DyvSRVX"; X-APPLE-WEBAUTH-PCS-Documents="TGlzdExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxV7v5//gztRqsIYpsU9TtMp2h1UA=="; X-APPLE-WEBAUTH-PCS-Photos="TGlzdExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxNTBISBjsuc745DjtDsiH/yHYfgA=="; X-APPLE-WEBAUTH-PCS-Cloudkit="TGlzdExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxVeHef/0ULtyvHtSgHUGlL7j5KFQ=="; X-APPLE-WEBAUTH-PCS-Safari="TGlzdExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxpqL5IcKJdwcXgGMcXjro+bgifiA=="; X-APPLE-WEBAUTH-PCS-Mail="TGlzdExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxABHBgot7Ib3orbZLQXGQzgPTZ9w=="; X-APPLE-WEBAUTH-PCS-Notes="TGlzdExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxLvjACvIoqe3JLeawWJUcGlVWfhg=="; X-APPLE-WEBAUTH-PCS-News="TGlzdExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx0DyPlzB1OWMIk5s6hWhwCUteozw=="; X-APPLE-WEBAUTH-PCS-Sharing="TGlzdExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxZD1Ll22Xk75XWbb+T8rnWZCviyw=="; X-APPLE-WEBAUTH-HSA-LOGIN=; X-APPLE-UNIQUE-CLIENT-ID="Ab=="; X-APPLE-WEBAUTH-LOGIN="v=1:t=Gw==BST_IAAAAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxEy3np0Qr1Lpv5hsKnIv5yNw~~"; X-APPLE-WEBAUTH-VALIDATE="v=1:t=Gw==BST_IAAAAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx09sUI4aWpMbX4Ta-EsVkJiQ~~"; X-APPLE-WEBAUTH-TOKEN="v=2:t=Gw==BST_IAAAAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxs7RYxfK23oSY3m2BBap2IMw~~"; X-APPLE-WEBAUTH-USER="v=1:s=0:d=12345678901"; X_APPLE_WEB_KB-ZUCWSXYHSDNT7JZRYLZEQMQNCTW="v=1:t=Gw==BST_IAAAAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxdzGQIa0ev-ST4n1ejsIPvFw~~"; X-APPLE-DS-WEB-SESSION-TOKEN="AQEiPexxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxsgH1lyGumhyY85tJUsIe5lYvBM5Xt66gkXKi9vwJnNVBrzhdXTolAJpj2f2MIipgTd6KEwN7Q="`,
            "Origin": `https://www.icloud.com`,
            "User-Agent": `Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:97.0) Gecko/20100101 Firefox/97.0`,
        });
    });

    describe(`Validate Photos Account`, () => {
        test(`zoneName missing`, () => {
            const auth = iCloudAuthFactory();
            auth.validateCloudCookies = jest.fn();
            Object.assign(auth.iCloudPhotosAccount, Config.iCloudPhotosAccount);
            auth.iCloudPhotosAccount.zoneName = undefined;
            expect(() => auth.validatePhotosAccount()).toThrowError(`Unable to validate photos account`);
            expect(auth.validateCloudCookies).toHaveBeenCalled();
        });

        test(`photosDomain missing`, () => {
            const auth = iCloudAuthFactory();
            auth.validateCloudCookies = jest.fn();
            Object.assign(auth.iCloudPhotosAccount, Config.iCloudPhotosAccount);
            auth.iCloudPhotosAccount.photosDomain = ``;
            expect(() => auth.validatePhotosAccount()).toThrowError(`Unable to validate photos account`);
            expect(auth.validateCloudCookies).toHaveBeenCalled();
        });

        test(`zoneType missing`, () => {
            const auth = iCloudAuthFactory();
            auth.validateCloudCookies = jest.fn();
            Object.assign(auth.iCloudPhotosAccount, Config.iCloudPhotosAccount);
            auth.iCloudPhotosAccount.zoneType = ``;
            expect(() => auth.validatePhotosAccount()).toThrowError(`Unable to validate photos account`);
            expect(auth.validateCloudCookies).toHaveBeenCalled();
        });
        test(`ownerName missing`, () => {
            const auth = iCloudAuthFactory();
            auth.validateCloudCookies = jest.fn();
            Object.assign(auth.iCloudPhotosAccount, Config.iCloudPhotosAccount);
            auth.iCloudPhotosAccount.ownerName = ``;
            expect(() => auth.validatePhotosAccount()).toThrowError(`Unable to validate photos account`);
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
            expect(() => auth.validateAccountSecrets()).toThrowError(`Unable to validate account secrets`);
        });

        test(`password missing`, () => {
            const auth = iCloudAuthFactory();
            auth.iCloudAccountSecrets.username = Config.username;
            auth.iCloudAccountSecrets.password = ``;
            expect(() => auth.validateAccountSecrets()).toThrowError(`Unable to validate account secrets`);
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
            expect(() => auth.validateAuthSecrets()).toThrowError(`Unable to validate auth secrets`);
        });
        test(`scnt missing`, () => {
            const auth = iCloudAuthFactory();
            Object.assign(auth.iCloudAuthSecrets, Config.iCloudAuthSecrets);
            auth.iCloudAuthSecrets.scnt = ``;
            expect(() => auth.validateAuthSecrets()).toThrowError(`Unable to validate auth secrets`);
        });

        test(`sessionId missing`, () => {
            const auth = iCloudAuthFactory();
            Object.assign(auth.iCloudAuthSecrets, Config.iCloudAuthSecrets);
            auth.iCloudAuthSecrets.sessionId = ``;
            expect(() => auth.validateAuthSecrets()).toThrowError(`Unable to validate auth secrets`);
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
            expect(() => auth.validateAccountTokens()).toThrowError(`Unable to validate account tokens`);
        });

        test(`Trust Token missing`, () => {
            const auth = iCloudAuthFactory();
            auth.iCloudAccountTokens.sessionToken = Config.iCloudAuthSecrets.sessionId;
            auth.iCloudAccountTokens.trustToken = ``;
            expect(() => auth.validateAccountTokens()).toThrowError(`Unable to validate account tokens`);
        });

        test(`Object valid`, () => {
            const auth = iCloudAuthFactory();
            auth.iCloudAccountTokens.sessionToken = Config.iCloudAuthSecrets.sessionId;
            auth.iCloudAccountTokens.trustToken = Config.trustToken;
            expect(() => auth.validateAccountTokens()).not.toThrowError();
        });
    });
});