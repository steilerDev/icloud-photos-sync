import {PhotosAccount, PhotosAccountZone} from "../../src/lib/icloud/auth";

/**
 * The data dir path, to be used in the tests
 */
export const appDataDir = `/opt/icloud-photos-library`;

export const username = `test@steilerdev.de`;
export const password = `somepass`;
export const refreshToken = false;
export const failOnMfa = false;
export const metadataRate = [Infinity, 0];

export const trustToken = `HSARMTKNSRVWFlaje+uXQGSn7KqxCHcGvTYF5r7F6j8wnFOsemu+g20/1mNJmE+hfNgaB09Bt3RDLzU4kWCsjQUvEsv3C//DrFvldh26AGf9sSv8QyRkUFNJjSHH7fHHiWaZRlWIZk9viZVnxiAh+NE/cA9ZGpbshwkVErwD5/cHN+Ek69ufbIS0O5P0eA==SRVX`;
export const trustTokenModified = `asefaTKNSRVWFlaje+uXQGSn7KqxCHcGvTYF5r7F6j8wnFOsemu+g20/1mNJmE+hfNgaB09Bt3RDLzU4kWCsjQUvEsv3C//DrFvldh26AGf9sSv8QyRkUFNJjSHH7fHHiWaZRlWIZk9viZVnxiAh+NE/cA9ZGpbshwkVErwD5/cHN+Ek69ufbIS0O5P0eA==SRVX`;

export const iCloudAuthSecrets = {
    "scnt": `AAAA-jM2MDVERjQ4QUJBNDlFOTNDREE5ODhEQjlCN0Q4NDE3QUUxMDI1MjM3NDZBOTNGNTIyMjE3QzJENDQ5QTUzOTdDQTRBRUFBNjY3ODNGNTQ1RkUxQjUxRjQ3QkY1ODk5QkJCNTE0NzA4N0QxQTM5ODBCQkNDRjU0QTJGMkEzNjY2N0Y2ODgyQUUzMEZDNjUxMUM0NjA0NjNEQjUyQ0MxNTM4NzNFMzQ5QzVBNTc1QzVEOUM3RTlBRTU4NTU3RjQ0RThENUFDNDQyRTYxOTIyMDdBNjM0MTcyODY5Q0YxMDY4NkQ0OTgyRTlEODQ5QUIyNXwxAAABg2YuFELp_Dzvh1riqxdzhFTO9hsgIst5rbPXUxxxkTs6FutFy63q6O6u6A8EAByNp_FEsjvXb2sQUOPA3qlZny3CU-45lRq-0UOxcw9L-jEJMrwLnw`,
    "aasp": `9F430B47DF8326B57157A8719F7B4928DB709E9DD62892A24BE5F41E20489F657A2BA19936576FC615B688ACBE550D2EC2FA0A8785E68525A0F99F197CACE4915CD13D5E8A56181B16937ED6F04F9F5FF1E8044A1C4EEE9F1FC3357B04E5F7BE07823201FCAFC76757F0BA7DF54BBABBAE80FDC71A959D47`,
    "sessionId": `cfyeumNVTBhBafvTQ/ZX5kxYyEKU9zE4dh5MLRRREvVQlez+OQDwxHTMOKPU3rhJX//qaNa1vyKOFksLGz+96kIk3rGh5hfMxRFcTc8vcFA9xTdslk2syHb+jj2vjFUT51vziUxJjXv/SldvzfgK0AjkDgcsLYvFwQ/E8FSSTTarbx1h2hNMAByNqAcj7RA=`,
};

export const iCloudPhotosAccount: PhotosAccount = {
    'photosDomain': `https://p123-ckdatabasews.icloud.com:443`,
};

export const primaryZone: PhotosAccountZone = {
    'ownerName': `_11a1a1a1a11111111a111aa1a1111a11`,
    'zoneName': `PrimarySync`,
    'zoneType': `REGULAR_CUSTOM_ZONE`,
};

export const sharedZone: PhotosAccountZone = {
    'ownerName': `_11a1a1a1a11111111a111aa1a1111a11`,
    'zoneName': `SharedSync-AABBCCDD-EEFF-0011-2233-445566778899`,
    'zoneType': `REGULAR_CUSTOM_ZONE`,
};