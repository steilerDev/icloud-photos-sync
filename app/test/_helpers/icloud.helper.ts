import {iCloud} from "../../src/lib/icloud/icloud";
import {jest} from "@jest/globals";
import * as Config from './_config';
import {expectedMFAHeaders} from "./icloud-mfa.helper";
import {addHoursToCurrentDate, getDateInThePast} from "./_general";
import {iCloudPhotos} from "../../src/lib/icloud/icloud-photos/icloud-photos";
import {iCloudAuth} from "../../src/lib/icloud/auth";
import {mockValidation} from "./icloud-auth.helper";
import {appWithOptions} from "./app-factory.helper";

export const _defaultCliOpts = {
    "port": 0,
    "username": Config.username,
    "password": Config.password,
    "trustToken": Config.trustToken,
    "dataDir": Config.appDataDir,
    "refreshToken": Config.refreshToken,
    "failOnMfa": Config.failOnMfa,
};

export function iCloudFactory(cliOpts: any = _defaultCliOpts): iCloud {
    const icloud = new iCloud(appWithOptions(cliOpts));
    icloud.mfaServer.startServer = () => {};
    icloud.mfaServer.stopServer = () => {};
    icloud.removeAllListeners();
    icloud.ready = icloud.getReady();
    return icloud;
}

export function iCloudPhotosFactory(removeEventListeners: boolean = true): iCloudPhotos {
    const auth = new iCloudAuth(Config.username, Config.password, Config.trustToken, Config.appDataDir);
    mockValidation(auth);
    auth.iCloudPhotosAccount.photosDomain = Config.iCloudPhotosAccount.photosDomain;
    auth.iCloudPhotosAccount.ownerName = Config.iCloudPhotosAccount.ownerName;
    auth.iCloudPhotosAccount.zoneName = Config.iCloudPhotosAccount.zoneName;
    auth.iCloudPhotosAccount.zoneType = Config.iCloudPhotosAccount.zoneType;
    auth.getPhotosHeader = jest.fn(() => `headerValues`);

    const icloudPhotos = new iCloudPhotos(appWithOptions({metadataThreads: Config.metadataThreads}), auth);

    if (removeEventListeners) {
        icloudPhotos.removeAllListeners();
    }

    return icloudPhotos;
}

export const expectedTokenGetCall = [
    `https://idmsa.apple.com/appleauth/auth/2sv/trust`,
    {
        "headers": expectedMFAHeaders(),
    },
];

export function getICloudCookieHeader(expired: boolean = false) {
    // We need to dynamically set the expiration date, otherwise we might run into issues
    const HSATrustExpiration = expired ? getDateInThePast() : addHoursToCurrentDate(2158);
    const AppleWebKbExpiration = expired ? getDateInThePast() : addHoursToCurrentDate(1438);
    const WebSessionExpiration = expired ? getDateInThePast() : addHoursToCurrentDate(718);
    return {
        "set-cookie": [
            `X-APPLE-WEBAUTH-HSA-TRUST="8a7c91e6fcxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxA0sVMViklkL/qm6SBVEKD2uttGESLUH2lWSvni/sQJecA+iJFa6DyvSRVX";Expires=${HSATrustExpiration};Path=/;Domain=.icloud.com;Secure;HttpOnly`,
            `X-APPLE-WEBAUTH-PCS-Documents="TGlzdExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxV7v5//gztRqsIYpsU9TtMp2h1UA==";Path=/;Domain=.icloud.com;Secure;HttpOnly`,
            `X-APPLE-WEBAUTH-PCS-Photos="TGlzdExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxNTBISBjsuc745DjtDsiH/yHYfgA==";Path=/;Domain=.icloud.com;Secure;HttpOnly`,
            `X-APPLE-WEBAUTH-PCS-Cloudkit="TGlzdExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxVeHef/0ULtyvHtSgHUGlL7j5KFQ==";Path=/;Domain=.icloud.com;Secure;HttpOnly`,
            `X-APPLE-WEBAUTH-PCS-Safari="TGlzdExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxpqL5IcKJdwcXgGMcXjro+bgifiA==";Path=/;Domain=.icloud.com;Secure;HttpOnly`,
            `X-APPLE-WEBAUTH-PCS-Mail="TGlzdExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxABHBgot7Ib3orbZLQXGQzgPTZ9w==";Path=/;Domain=.icloud.com;Secure;HttpOnly`,
            `X-APPLE-WEBAUTH-PCS-Notes="TGlzdExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxLvjACvIoqe3JLeawWJUcGlVWfhg==";Path=/;Domain=.icloud.com;Secure;HttpOnly`,
            `X-APPLE-WEBAUTH-PCS-News="TGlzdExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx0DyPlzB1OWMIk5s6hWhwCUteozw==";Path=/;Domain=.icloud.com;Secure;HttpOnly`,
            `X-APPLE-WEBAUTH-PCS-Sharing="TGlzdExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxZD1Ll22Xk75XWbb+T8rnWZCviyw==";Path=/;Domain=.icloud.com;Secure;HttpOnly`,
            `X-APPLE-WEBAUTH-HSA-LOGIN=;Expires=Thu, 01-Jan-1970 00:00:01 GMT;Path=/;Domain=.icloud.com;Secure;HttpOnly`,
            `X-APPLE-UNIQUE-CLIENT-ID="Ab==";Path=/;Domain=.icloud.com;Secure`,
            `X-APPLE-WEBAUTH-LOGIN="v=1:t=Gw==BST_IAAAAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxEy3np0Qr1Lpv5hsKnIv5yNw~~";Path=/;Domain=.icloud.com;Secure;HttpOnly`,
            `X-APPLE-WEBAUTH-VALIDATE="v=1:t=Gw==BST_IAAAAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx09sUI4aWpMbX4Ta-EsVkJiQ~~";Path=/;Domain=.icloud.com;Secure`,
            `X-APPLE-WEBAUTH-TOKEN="v=2:t=Gw==BST_IAAAAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxs7RYxfK23oSY3m2BBap2IMw~~";Path=/;Domain=.icloud.com;Secure;HttpOnly`,
            `X-APPLE-WEBAUTH-USER="v=1:s=0:d=12345678901";Path=/;Domain=.icloud.com;Secure;HttpOnly`,
            `X_APPLE_WEB_KB-ZUCWSXYHSDNT7JZRYLZEQMQNCTW="v=1:t=Gw==BST_IAAAAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxdzGQIa0ev-ST4n1ejsIPvFw~~";Expires=${AppleWebKbExpiration};Path=/;Domain=.icloud.com;Secure;HttpOnly`,
            `X-APPLE-DS-WEB-SESSION-TOKEN="AQEiPexxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxsgH1lyGumhyY85tJUsIe5lYvBM5Xt66gkXKi9vwJnNVBrzhdXTolAJpj2f2MIipgTd6KEwN7Q=";Expires=${WebSessionExpiration};Path=/;Domain=.icloud.com;Secure;HttpOnly`,
        ],
    };
}

export const expectedICloudSetupHeaders = {
    "Accept": `application/json`,
    "Content-Type": `application/json`,
    "Origin": `https://www.icloud.com`,
    "User-Agent": `Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:97.0) Gecko/20100101 Firefox/97.0`,
};