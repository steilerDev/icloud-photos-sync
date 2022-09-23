import {iCloud} from "../../src/lib/icloud/icloud";
import * as Config from './config';
import {expectedMFAHeaders} from "./icloud-mfa";

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
    const icloud = new iCloud(cliOpts);
    icloud.mfaServer.startServer = () => {};
    icloud.mfaServer.stopServer = () => {};
    icloud.removeAllListeners();
    return icloud;
}

export const expectedTokenGet = [
    `https://idmsa.apple.com/appleauth/auth/2sv/trust`,
    {
        "headers": expectedMFAHeaders(),
    },
];