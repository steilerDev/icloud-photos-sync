import {iCPSAppOptions} from "../../src/app/factory";
import {PhotosAccountZone} from "../../src/lib/resource-manager/resources";

export const defaultConfig = {
    username: `test@icloud.com`,
    password: `testPass`,
    dataDir: `/opt/icloud-photos-library`,
    port: 80,
    maxRetries: Infinity,
    downloadThreads: 5,
    schedule: `0 2 * * *`,
    enableCrashReporting: false,
    failOnMfa: false,
    force: false,
    refreshToken: false,
    remoteDelete: false,
    logLevel: `info`,
    silent: false,
    logToCli: false,
    suppressWarnings: false,
    exportMetrics: false,
    metadataRate: [Infinity, 0],
} as iCPSAppOptions;

export const trustToken = `HSARMTKNSRVWFlaje+uXQGSn7KqxCHcGvTYF5r7F6j8wnFOsemu+g20/1mNJmE+hfNgaB09Bt3RDLzU4kWCsjQUvEsv3C//DrFvldh26AGf9sSv8QyRkUFNJjSHH7fHHiWaZRlWIZk9viZVnxiAh+NE/cA9ZGpbshwkVErwD5/cHN+Ek69ufbIS0O5P0eA==SRVX`;
export const trustTokenModified = `asefaTKNSRVWFlaje+uXQGSn7KqxCHcGvTYF5r7F6j8wnFOsemu+g20/1mNJmE+hfNgaB09Bt3RDLzU4kWCsjQUvEsv3C//DrFvldh26AGf9sSv8QyRkUFNJjSHH7fHHiWaZRlWIZk9viZVnxiAh+NE/cA9ZGpbshwkVErwD5/cHN+Ek69ufbIS0O5P0eA==SRVX`;

export const iCloudAuthSecrets = {
    scnt: `AAAA-jM2MDVERjQ4QUJBNDlFOTNDREE5ODhEQjlCN0Q4NDE3QUUxMDI1MjM3NDZBOTNGNTIyMjE3QzJENDQ5QTUzOTdDQTRBRUFBNjY3ODNGNTQ1RkUxQjUxRjQ3QkY1ODk5QkJCNTE0NzA4N0QxQTM5ODBCQkNDRjU0QTJGMkEzNjY2N0Y2ODgyQUUzMEZDNjUxMUM0NjA0NjNEQjUyQ0MxNTM4NzNFMzQ5QzVBNTc1QzVEOUM3RTlBRTU4NTU3RjQ0RThENUFDNDQyRTYxOTIyMDdBNjM0MTcyODY5Q0YxMDY4NkQ0OTgyRTlEODQ5QUIyNXwxAAABg2YuFELp_Dzvh1riqxdzhFTO9hsgIst5rbPXUxxxkTs6FutFy63q6O6u6A8EAByNp_FEsjvXb2sQUOPA3qlZny3CU-45lRq-0UOxcw9L-jEJMrwLnw`,
    aasp: `9F430B47DF8326B57157A8719F7B4928DB709E9DD62892A24BE5F41E20489F657A2BA19936576FC615B688ACBE550D2EC2FA0A8785E68525A0F99F197CACE4915CD13D5E8A56181B16937ED6F04F9F5FF1E8044A1C4EEE9F1FC3357B04E5F7BE07823201FCAFC76757F0BA7DF54BBABBAE80FDC71A959D47`,
    sessionSecret: `cfyeumNVTBhBafvTQ/ZX5kxYyEKU9zE4dh5MLRRREvVQlez+OQDwxHTMOKPU3rhJX//qaNa1vyKOFksLGz+96kIk3rGh5hfMxRFcTc8vcFA9xTdslk2syHb+jj2vjFUT51vziUxJjXv/SldvzfgK0AjkDgcsLYvFwQ/E8FSSTTarbx1h2hNMAByNqAcj7RA=`,
    sessionSecretModified: `CFyeumNVTBhBafvTQ/ZX5kxYyEKU9zE4dh5MLRRREvVQlez+OQDwxHTMOKPU3rhJX//qaNa1vyKOFksLGz+96kIk3rGh5hfMxRFcTc8vcFA9xTdslk2syHb+jj2vjFUT51vziUxJjXv/SldvzfgK0AjkDgcsLYvFwQ/E8FSSTTarbx1h2hNMAByNqAcj7RA=`,
};

export const aaspCookieString = `aasp=${iCloudAuthSecrets.aasp}; Domain=idmsa.apple.com; Path=/; Secure; HttpOnly`;

export const photosDomain = `https://p123-ckdatabasews.icloud.com:443`;

export const primaryZone: PhotosAccountZone = {
    ownerRecordName: `_11a1a1a1a11111111a111aa1a1111a11`,
    zoneName: `PrimarySync`,
    zoneType: `REGULAR_CUSTOM_ZONE`,
};

export const sharedZone: PhotosAccountZone = {
    ownerRecordName: `_11a1a1a1a11111111a111aa1a1111a11`,
    zoneName: `SharedSync-AABBCCDD-EEFF-0011-2233-445566778899`,
    zoneType: `REGULAR_CUSTOM_ZONE`,
};

export const REQUEST_HEADER = {
    DEFAULT: {
        'User-Agent': `Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:97.0) Gecko/20100101 Firefox/97.0`,
        Accept: `application/json`,
        'Content-Type': `application/json`,
        Origin: `https://www.icloud.com`,
        Connection: `keep-alive`,
        'Accept-Encoding': `gzip, deflate, br`,
    },
    AUTH: {
        'User-Agent': `Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:97.0) Gecko/20100101 Firefox/97.0`,
        Accept: `application/json`,
        'Content-Type': `application/json`,
        Connection: `keep-alive`,
        'Accept-Encoding': `gzip, deflate, br`,
        Origin: `https://idmsa.apple.com`,
        Referer: `https://idmsa.apple.com/`,
        'X-Apple-Widget-Key': `d39ba9916b7251055b22c7f910e2ea796ee65e98b2ddecea8f5dde8d9d1a815d`,
        'X-Apple-OAuth-Client-Id': `d39ba9916b7251055b22c7f910e2ea796ee65e98b2ddecea8f5dde8d9d1a815d`,
        'X-Apple-I-FD-Client-Info': `{"U":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:97.0) Gecko/20100101 Firefox/97.0","L":"en-US","Z":"GMT+01:00","V":"1.1","F":""}`,
        'X-Apple-OAuth-Response-Type': `code`,
        'X-Apple-OAuth-Response-Mode': `web_message`,
        'X-Apple-OAuth-Client-Type': `firstPartyAuth`,
    },
};