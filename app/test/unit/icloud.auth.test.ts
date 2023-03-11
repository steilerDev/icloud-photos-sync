import mockfs from 'mock-fs';
import * as fs from 'fs';
import {describe, test, expect, jest, afterEach} from "@jest/globals";
import {getICloudCookies, iCloudAuthFactory, mockValidation} from "../_helpers/icloud-auth.helper";
import * as Config from '../_helpers/_config';
import {AxiosResponse} from 'axios';
import { Zones } from '../../src/lib/icloud/icloud-photos/query-builder';

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

describe(`Setup Photos Account`, () => {
    test(`Only Primary Zone`, () => {
        const auth = iCloudAuthFactory();
        mockValidation(auth);
    
        auth.processPhotosSetupResponse({
            "data": {
                "zones": [{
                    "zoneID": {
                        "ownerRecordName": `someOwner`,
                        "zoneName": `PrimarySync`,
                        "zoneType": `someZoneType`,
                    },
                }],
            },
        } as AxiosResponse);
    
        expect(auth.validatePhotosAccount).toHaveBeenCalledWith(Zones.Primary);
        expect(auth.iCloudPhotosAccount.primary?.ownerName).toEqual(`someOwner`);
        expect(auth.iCloudPhotosAccount.primary?.zoneName).toEqual(`PrimarySync`);
        expect(auth.iCloudPhotosAccount.primary?.zoneType).toEqual(`someZoneType`);
    });

    test(`Primary Zone + Shared Zone`, () => {
        const auth = iCloudAuthFactory();
        mockValidation(auth);
    
        auth.processPhotosSetupResponse({
            "data": {
                "zones": [{
                    "zoneID": {
                        "ownerRecordName": `someOwner`,
                        "zoneName": `PrimarySync`,
                        "zoneType": `someZoneType`,
                    },
                }, {
                    "zoneID": {
                        "ownerRecordName": `someOwner`,
                        "zoneName": `SharedSync-AABBCCDD-EEFF-0011-2233-445566778899`,
                        "zoneType": `someZoneType`,
                    },
                }],
            },
        } as AxiosResponse);
    
        expect(auth.validatePhotosAccount).toHaveBeenCalledWith(undefined);
        expect(auth.iCloudPhotosAccount.primary?.ownerName).toEqual(`someOwner`);
        expect(auth.iCloudPhotosAccount.primary?.zoneName).toEqual(`PrimarySync`);
        expect(auth.iCloudPhotosAccount.primary?.zoneType).toEqual(`someZoneType`);
        expect(auth.iCloudPhotosAccount.shared?.ownerName).toEqual(`someOwner`);
        expect(auth.iCloudPhotosAccount.shared?.zoneName).toEqual(`SharedSync-AABBCCDD-EEFF-0011-2233-445566778899`);
        expect(auth.iCloudPhotosAccount.shared?.zoneType).toEqual(`someZoneType`);
    });

    test(`More Coming`, () => {
        const auth = iCloudAuthFactory();
        mockValidation(auth);
    
        expect(() => auth.processPhotosSetupResponse({
            "data": {
                "moreComing": true,
                "zones": [{
                    "zoneID": {
                        "ownerRecordName": `someOwner`,
                        "zoneName": `PrimarySync`,
                        "zoneType": `someZoneType`,
                    },
                }, {
                    "zoneID": {
                        "ownerRecordName": `someOwner`,
                        "zoneName": `SharedSync-AABBCCDD-EEFF-0011-2233-445566778899`,
                        "zoneType": `someZoneType`,
                    },
                }],
            },
        } as AxiosResponse)).toThrowError('iCloud Photos returned more zones than expected')
    });

    test(`Invalid data format`, () => {
        const auth = iCloudAuthFactory();
        mockValidation(auth);
    
        expect(() => auth.processPhotosSetupResponse({
            "data": {
                "zones": {
                    "zoneID": {
                        "ownerRecordName": `someOwner`,
                        "zoneName": `PrimarySync`,
                        "zoneType": `someZoneType`,
                    },
                },
            },
        } as AxiosResponse)).toThrowError('Unable to setup zones: response format invalid')
    });
})


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

    test(`photosDomain missing`, () => {
        const auth = iCloudAuthFactory();
        auth.validateCloudCookies = jest.fn();
        Object.assign(auth.iCloudPhotosAccount, Config.iCloudPhotosAccount);
        auth.iCloudPhotosAccount.photosDomain = ``;
        expect(() => auth.validatePhotosAccount()).toThrowError(`Unable to validate photos account`);
        expect(auth.validateCloudCookies).toHaveBeenCalled();
    });

    test(`Validate primary zone only`, () => {
        const auth = iCloudAuthFactory();
        auth.validateZone = jest.fn()
        auth.validateCloudCookies = jest.fn();
        Object.assign(auth.iCloudPhotosAccount, Config.iCloudPhotosAccount);

        auth.validatePhotosAccount(Zones.Primary)

        expect(auth.validateCloudCookies).toHaveBeenCalled();
        expect(auth.validateZone).toHaveBeenCalledWith(Zones.Primary)
        expect(auth.validateZone).toHaveBeenCalledTimes(1)
    })

    test(`Validate shared zone only`, () => {
        const auth = iCloudAuthFactory();
        auth.validateZone = jest.fn()
        auth.validateCloudCookies = jest.fn();
        Object.assign(auth.iCloudPhotosAccount, Config.iCloudPhotosAccount);

        auth.validatePhotosAccount(Zones.Shared)

        expect(auth.validateCloudCookies).toHaveBeenCalled();
        expect(auth.validateZone).toHaveBeenCalledWith(Zones.Shared)
        expect(auth.validateZone).toHaveBeenCalledTimes(1)
    })

    test(`Validate both zones`, () => {
        const auth = iCloudAuthFactory();
        auth.validateZone = jest.fn()
        auth.validateCloudCookies = jest.fn();
        Object.assign(auth.iCloudPhotosAccount, Config.iCloudPhotosAccount);

        auth.validatePhotosAccount()

        expect(auth.validateCloudCookies).toHaveBeenCalled();
        expect(auth.validateZone).toHaveBeenCalledWith(Zones.Primary)
        expect(auth.validateZone).toHaveBeenCalledWith(Zones.Shared)
        expect(auth.validateZone).toHaveBeenCalledTimes(2)
    })

    describe.each([Zones.Primary, Zones.Shared])(`Validate zone - %o`, (zone) => {

        test(`zone object missing`, () => {
            const auth = iCloudAuthFactory();
            Object.assign(auth.iCloudPhotosAccount, Config.iCloudPhotosAccount);

            expect(() => auth.validateZone(zone)).toThrowError(`Unable to validate photos account`);
        });

        test(`zoneName missing`, () => {
            const auth = iCloudAuthFactory();
            Object.assign(auth.iCloudPhotosAccount, Config.iCloudPhotosAccount);
            if(zone === Zones.Primary) {
                auth.iCloudPhotosAccount.primary = {}
                Object.assign(auth.iCloudPhotosAccount.primary, Config.primaryZone)
                auth.iCloudPhotosAccount.primary.zoneName = ''
            }
            if(zone === Zones.Shared) {
                auth.iCloudPhotosAccount.shared = {}
                Object.assign(auth.iCloudPhotosAccount.shared, Config.sharedZone)
                auth.iCloudPhotosAccount.shared.zoneName = ''

            }

            expect(() => auth.validateZone(zone)).toThrowError(`Unable to validate photos account`);
        });
    
        test(`zoneType missing`, () => {
            const auth = iCloudAuthFactory();
            Object.assign(auth.iCloudPhotosAccount, Config.iCloudPhotosAccount);
            if(zone === Zones.Primary) {
                auth.iCloudPhotosAccount.primary = {}
                Object.assign(auth.iCloudPhotosAccount.primary, Config.primaryZone)
                auth.iCloudPhotosAccount.primary.zoneType = ''
            }
            if(zone === Zones.Shared) {
                auth.iCloudPhotosAccount.shared = {}
                Object.assign(auth.iCloudPhotosAccount.shared, Config.sharedZone)
                auth.iCloudPhotosAccount.shared.zoneType = ''

            }

            expect(() => auth.validateZone(zone)).toThrowError(`Unable to validate photos account`);
        });
        test(`ownerName missing`, () => {
            const auth = iCloudAuthFactory();
            Object.assign(auth.iCloudPhotosAccount, Config.iCloudPhotosAccount);
            if(zone === Zones.Primary) {
                auth.iCloudPhotosAccount.primary = {}
                Object.assign(auth.iCloudPhotosAccount.primary, Config.primaryZone)
                auth.iCloudPhotosAccount.primary.ownerName = ''
            }
            if(zone === Zones.Shared) {
                auth.iCloudPhotosAccount.shared = {}
                Object.assign(auth.iCloudPhotosAccount.shared, Config.sharedZone)
                auth.iCloudPhotosAccount.shared.ownerName = ''

            }

            expect(() => auth.validateZone(zone)).toThrowError(`Unable to validate photos account`);
        });
    
        test(`Object valid`, () => {
            const auth = iCloudAuthFactory();
            Object.assign(auth.iCloudPhotosAccount, Config.iCloudPhotosAccount);
            if(zone === Zones.Primary) {
                auth.iCloudPhotosAccount.primary = {}
                Object.assign(auth.iCloudPhotosAccount.primary, Config.primaryZone)
            }
            if(zone === Zones.Shared) {
                auth.iCloudPhotosAccount.shared = {}
                Object.assign(auth.iCloudPhotosAccount.shared, Config.sharedZone)
            }

            expect(() => auth.validateZone(zone)).not.toThrowError();
        });
    })
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