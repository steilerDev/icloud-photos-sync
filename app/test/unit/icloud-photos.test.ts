import {beforeEach, describe, expect, jest, test} from '@jest/globals';
import {iCPSError} from '../../src/app/error/error';
import {VALIDATOR_ERR} from '../../src/app/error/error-codes';
import {iCloudPhotos} from '../../src/lib/icloud/icloud-photos/icloud-photos';
import {QUERY_KEYS, Zones} from '../../src/lib/icloud/icloud-photos/query-builder';
import {CPLAlbum, CPLAsset, CPLMaster} from '../../src/lib/icloud/icloud-photos/query-parser';
import {AlbumType} from '../../src/lib/photos-library/model/album';
import {Asset, AssetType} from '../../src/lib/photos-library/model/asset';
import {FileType} from '../../src/lib/photos-library/model/file-type';
import {PRIMARY_ASSET_DIR} from '../../src/lib/photos-library/constants';
import {iCPSEventPhotos, iCPSEventRuntimeWarning} from '../../src/lib/resources/events-types';
import {PhotosSetupResponse} from '../../src/lib/resources/network-types';
import {Validator} from '../../src/lib/resources/validator';
import * as Config from '../_helpers/_config';
import {MockedEventManager, MockedNetworkManager, MockedResourceManager, prepareResources} from '../_helpers/_general';
import {getICloudCookieHeader, iCloudCookieRequestHeader} from '../_helpers/icloud.helper';
import mockfs from '../_helpers/mock-fs.helper';
import {ZoneArea} from '../../src/lib/resources/resource-types';

let mockedResourceManager: MockedResourceManager;
let mockedNetworkManager: MockedNetworkManager;
let mockedEventManager: MockedEventManager;
let mockedValidator: Validator;
let photos: iCloudPhotos;

beforeEach(() => {
    const instances = prepareResources()!;
    mockedResourceManager = instances.manager;
    mockedNetworkManager = instances.network;
    mockedEventManager = instances.event;
    mockedValidator = instances.validator;

    mockedNetworkManager.photosUrl = Config.photosDomain;
    mockedNetworkManager._headerJar.setCookie(...getICloudCookieHeader()[`set-cookie`]);

    // mockedResourceManager._resources.primaryZone = {
    //     ...Config.primaryZone,
    //     area: `PRIVATE`
    // }
    // mockedResourceManager._resources.sharedZone = {
    //     ...Config.sharedZone,
    //     area: `SHARED`
    // }

    photos = new iCloudPhotos();
});

describe(`Setup iCloud Photos`, () => {
    const setupPrivateURL = `${Config.photosDomain}/database/1/com.apple.photos.cloud/production/private/changes/database`;
    const setupSharedURL = `${Config.photosDomain}/database/1/com.apple.photos.cloud/production/shared/changes/database`;

    test(`Success`, async () => {
        const setupCompletedEvent = mockedEventManager.spyOnEvent(iCPSEventPhotos.SETUP_COMPLETED);
        setupCompletedEvent.mockImplementation(() => mockedEventManager.emit(iCPSEventPhotos.READY));

        mockedValidator.validatePhotosSetupResponse = jest.fn<typeof mockedValidator.validatePhotosSetupResponse>()
            .mockReturnValue({
                data: {
                    zones: []
                } as Partial<PhotosSetupResponse[`data`]> as PhotosSetupResponse[`data`],
            } as Partial<PhotosSetupResponse> as PhotosSetupResponse);
        mockedNetworkManager.applyZones = jest.fn<typeof mockedNetworkManager.applyZones>();

        mockedNetworkManager.mock
            .onPost(setupPrivateURL, {})
            .reply(200);
        mockedNetworkManager.mock
            .onPost(setupSharedURL, {})
            .reply(200);

        await photos.setup();

        expect(mockedValidator.validatePhotosSetupResponse).toHaveBeenCalledTimes(2);
        expect(mockedNetworkManager.applyZones).toHaveBeenCalledTimes(1);
        expect((mockedNetworkManager.mock.history.post[0].headers as any).Cookie).toBe(iCloudCookieRequestHeader);

        expect(setupCompletedEvent).toHaveBeenCalledTimes(1);
    });

    test(`Response validation fails`, async () => {
        const errorEvent = mockedEventManager.spyOnEvent(iCPSEventPhotos.ERROR, false);

        mockedValidator.validatePhotosSetupResponse = jest.fn<typeof mockedValidator.validatePhotosSetupResponse>(() => {
            throw new iCPSError(VALIDATOR_ERR.SETUP_RESPONSE);
        });

        mockedNetworkManager.mock
            .onPost(setupPrivateURL, {})
            .reply(200);
        mockedNetworkManager.mock
            .onPost(setupSharedURL, {})
            .reply(200);

        await expect(photos.setup()).rejects.toThrow(/^Unexpected error while setting up iCloud Photos$/);
        expect(errorEvent).toHaveBeenCalledWith(new Error(`Unexpected error while setting up iCloud Photos`));
    });

    test(`Network failure`, async () => {
        const errorEvent = mockedEventManager.spyOnEvent(iCPSEventPhotos.ERROR, false);

        mockedNetworkManager.mock
            .onPost(setupPrivateURL, {})
            .reply(500);

        await expect(photos.setup()).rejects.toThrow(/^Unexpected error while setting up iCloud Photos$/);
        expect(errorEvent).toHaveBeenCalledWith(new Error(`Unexpected error while setting up iCloud Photos`));
    });

    test(`Repeated setup reports failure after previous success`, async () => {
        photos.checkingIndexingStatus = jest.fn<typeof photos.checkingIndexingStatus>(async () => {
            mockedEventManager.emit(iCPSEventPhotos.READY);
        });

        mockedValidator.validatePhotosSetupResponse = jest.fn<typeof mockedValidator.validatePhotosSetupResponse>()
            .mockReturnValue({
                data: {
                    zones: []
                } as Partial<PhotosSetupResponse[`data`]> as PhotosSetupResponse[`data`],
            } as Partial<PhotosSetupResponse> as PhotosSetupResponse);
        mockedNetworkManager.applyZones = jest.fn<typeof mockedNetworkManager.applyZones>();

        mockedNetworkManager.mock
            .onPost(setupPrivateURL, {})
            .replyOnce(200)
            .onPost(setupSharedURL, {})
            .replyOnce(200)
            .onPost(setupPrivateURL, {})
            .replyOnce(500);

        await expect(photos.setup()).resolves.toBeUndefined();
        await expect(photos.setup()).rejects.toThrow(/^Unexpected error while setting up iCloud Photos$/);
    });

    test(`Repeated setup reports success after previous failure`, async () => {
        photos.checkingIndexingStatus = jest.fn<typeof photos.checkingIndexingStatus>(async () => {
            mockedEventManager.emit(iCPSEventPhotos.READY);
        });

        mockedValidator.validatePhotosSetupResponse = jest.fn<typeof mockedValidator.validatePhotosSetupResponse>()
            .mockReturnValue({
                data: {
                    zones: []
                } as Partial<PhotosSetupResponse[`data`]> as PhotosSetupResponse[`data`],
            } as Partial<PhotosSetupResponse> as PhotosSetupResponse);
        mockedNetworkManager.applyZones = jest.fn<typeof mockedNetworkManager.applyZones>();

        mockedNetworkManager.mock
            .onPost(setupPrivateURL, {})
            .replyOnce(500)
            .onPost(setupPrivateURL, {})
            .replyOnce(200)
            .onPost(setupSharedURL, {})
            .replyOnce(200);

        await expect(photos.setup()).rejects.toThrow(/^Unexpected error while setting up iCloud Photos$/);
        await expect(photos.setup()).resolves.toBeUndefined();
    });

    test(`Check indexing state after setup`, () => {
        photos.checkingIndexingStatus = jest.fn<typeof photos.checkingIndexingStatus>()
            .mockResolvedValue();

        mockedEventManager.emit(iCPSEventPhotos.SETUP_COMPLETED);

        expect(photos.checkingIndexingStatus).toHaveBeenCalledTimes(1);
    });

    describe.each([Zones.Primary, Zones.Shared])(`Check indexing state - %o`, zone => {
        test(`Indexing finished`, async () => {
            photos.performQuery = jest.fn<typeof photos.performQuery>()
                .mockResolvedValue([{
                    fields: {
                        state: {
                            value: `FINISHED`,
                        },
                    },
                }]);

            await expect(photos.checkIndexingStatusForZone(zone)).resolves.toBeUndefined();

            expect(photos.performQuery).toHaveBeenCalledWith(zone, `CheckIndexingState`);
        });

        test(`Indexing in progress with progress`, async () => {
            photos.performQuery = jest.fn<typeof photos.performQuery>()
                .mockResolvedValue([{
                    fields: {
                        state: {
                            value: `RUNNING`,
                        },
                        progress: {
                            value: 20,
                        },
                    },
                }]);

            await expect(photos.checkIndexingStatusForZone(zone)).rejects.toThrow(/^Indexing in progress, try again later$/);

            expect(photos.performQuery).toHaveBeenCalledWith(zone, `CheckIndexingState`);
        });

        test(`Indexing in progress without progress`, async () => {
            photos.performQuery = jest.fn<typeof photos.performQuery>()
                .mockResolvedValue([{
                    fields: {
                        state: {
                            value: `RUNNING`,
                        },
                    },
                }]);

            await expect(photos.checkIndexingStatusForZone(zone)).rejects.toThrow(/^Indexing in progress, try again later$/);

            expect(photos.performQuery).toHaveBeenCalledWith(zone, `CheckIndexingState`);
        });

        test(`Unknown status`, async () => {
            photos.performQuery = jest.fn<typeof photos.performQuery>()
                .mockResolvedValue([{
                    fields: {
                        state: {
                            value: `UNKNOWN_STATE`,
                        },
                    },
                }]);

            await expect(photos.checkIndexingStatusForZone(zone)).rejects.toThrow(/^Unknown indexing state$/);

            expect(photos.performQuery).toHaveBeenCalledWith(zone, `CheckIndexingState`);
        });

        test.each([
            [[]],
            [[{}]],
            [[{fields: {}}]],
            [[{fields: {state: {}}}]],
        ])(`Empty query - %o`, async queryResult => {
            photos.performQuery = jest.fn<typeof photos.performQuery>()
                .mockResolvedValue(queryResult);

            await expect(photos.checkIndexingStatusForZone(zone)).rejects.toThrow(/^Unable to get indexing state$/);

            expect(photos.performQuery).toHaveBeenCalledWith(zone, `CheckIndexingState`);
        });

        test(`Query failure`, async () => {
            photos.performQuery = jest.fn<typeof photos.performQuery>()
                .mockRejectedValue(new Error());

            await expect(photos.checkIndexingStatusForZone(zone)).rejects.toThrow(/^$/);

            expect(photos.performQuery).toHaveBeenCalledWith(zone, `CheckIndexingState`);
        });
    });
});

describe.each([
    {
        zone: Zones.Primary,
        area: `PRIVATE`,
        areaURL: `private`,
        expectedZoneObject: Config.primaryZone,
    }, {
        zone: Zones.Shared,
        area: `PRIVATE`,
        areaURL: `private`,
        expectedZoneObject: Config.sharedZone,
    }, {
        zone: Zones.Shared,
        area: `SHARED`,
        areaURL: `shared`,
        expectedZoneObject: Config.sharedZone
    }
])(`$zone ($area)`, ({zone, area, areaURL, expectedZoneObject}) => {
    beforeEach(() => {
        if(zone == Zones.Primary) {
            mockedResourceManager._resources.primaryZone = {
                ...Config.primaryZone,
                area: area as ZoneArea
            }
        }

        if(zone == Zones.Shared) {
            mockedResourceManager._resources.sharedZone = {
                ...Config.sharedZone,
                area: area as ZoneArea
            }
        }
    })

    describe.each([
        {
            desc: `recordType + filterBy + resultsLimit + desiredKeys`,
            recordType: `recordType`,
            filterBy: [{
                fieldName: `someField`,
                comparator: `EQUALS`,
                fieldValue: {
                    value: `someValue`,
                    type: `STRING`,
                },
            }],
            resultsLimit: 2,
            desiredKeys: [`key1, key2`],
            expectedQuery: {
                desiredKeys: [`key1, key2`],
                query: {
                    filterBy: [
                        {comparator: `EQUALS`, fieldName: `someField`, fieldValue: {type: `STRING`, value: `someValue`}},
                    ],
                    recordType: `recordType`,
                },
                resultsLimit: 2,
                zoneID: expectedZoneObject,
            },
        }, {
            desc: `recordType + filterBy + resultsLimit`,
            recordType: `recordType`,
            filterBy: [{
                fieldName: `someField`,
                comparator: `EQUALS`,
                fieldValue: {
                    value: `someValue`,
                    type: `STRING`,
                },
            }],
            resultsLimit: 2,
            desiredKeys: undefined,
            expectedQuery: {
                query: {
                    filterBy: [
                        {comparator: `EQUALS`, fieldName: `someField`, fieldValue: {type: `STRING`, value: `someValue`}},
                    ],
                    recordType: `recordType`,
                },
                resultsLimit: 2,
                zoneID: expectedZoneObject,
            },
        }, {
            desc: `recordType + filterBy`,
            recordType: `recordType`,
            filterBy: [{
                fieldName: `someField`,
                comparator: `EQUALS`,
                fieldValue: {
                    value: `someValue`,
                    type: `STRING`,
                },
            }],
            resultsLimit: undefined,
            desiredKeys: undefined,
            expectedQuery: {
                query: {
                    filterBy: [
                        {comparator: `EQUALS`, fieldName: `someField`, fieldValue: {type: `STRING`, value: `someValue`}},
                    ],
                    recordType: `recordType`,
                },
                zoneID: expectedZoneObject,
            },
        }, {
            desc: `recordType`,
            recordType: `recordType`,
            filterBy: undefined,
            resultsLimit: undefined,
            desiredKeys: undefined,
            expectedQuery: {
                query: {
                    recordType: `recordType`,
                },
                zoneID: expectedZoneObject,
            },
        },
    ])(`Perform Query $desc`, ({recordType, filterBy, resultsLimit, desiredKeys, expectedQuery}) => {
        test(`Success`, async () => {
            const responseRecords = [`recordA`, `recordB`];

            mockedNetworkManager.mock
                .onPost(`https://p123-ckdatabasews.icloud.com:443/database/1/com.apple.photos.cloud/production/${areaURL}/records/query`, expectedQuery)
                .reply(200, {
                    records: responseRecords,
                });

            const result = await photos.performQuery(zone, recordType, filterBy, resultsLimit, desiredKeys);

            expect(result).toEqual(responseRecords);

            expect((mockedNetworkManager.mock.history.post[0].headers as any).Cookie).toBe(iCloudCookieRequestHeader);
            expect(mockedNetworkManager.mock.history.post[0].params!.remapEnums).toEqual(`True`);
        });

        test(`No data returned`, async () => {
            mockedNetworkManager.mock
                .onPost(`https://p123-ckdatabasews.icloud.com:443/database/1/com.apple.photos.cloud/production/${areaURL}/records/query`, expectedQuery)
                .reply(200, {});

            await expect(photos.performQuery(zone, recordType, filterBy, resultsLimit, desiredKeys)).rejects.toThrow(/^Received unexpected query response format$/);
        });

        test(`Server Error`, async () => {
            mockedNetworkManager.mock
                .onPost(`https://p123-ckdatabasews.icloud.com:443/database/1/com.apple.photos.cloud/production/${areaURL}/records/query`, expectedQuery)
                .reply(500, {});

            const err = await photos.performQuery(zone, recordType, filterBy, resultsLimit, desiredKeys).catch(err => err);

            expect(err).toBeInstanceOf(iCPSError);
            expect((err as iCPSError).getDescription()).toEqual(`ICLOUD_PHOTOS_REQUEST_FAILED: CloudKit request failed (${recordType} query, status 500) caused by Request failed with status code 500`);
        });

        test(`Server Error with CloudKit error details`, async () => {
            const responseBody = {
                uuid: `some-uuid`,
                serverErrorCode: `TRY_AGAIN_LATER`,
                reason: `Service temporarily unavailable`,
                retryAfter: 30,
            };
            mockedNetworkManager.mock
                .onPost(`https://p123-ckdatabasews.icloud.com:443/database/1/com.apple.photos.cloud/production/${areaURL}/records/query`, expectedQuery)
                .reply(503, responseBody, {'retry-after': `30`});

            const err = await photos.performQuery(zone, recordType, filterBy, resultsLimit, desiredKeys).catch(err => err) as iCPSError;

            expect(err.getDescription()).toEqual(`ICLOUD_PHOTOS_REQUEST_FAILED: CloudKit request failed (${recordType} query, status 503, TRY_AGAIN_LATER: Service temporarily unavailable, retry after 30s, retry-after header 30) caused by Request failed with status code 503`);
            expect(err.context.responseBody).toEqual(JSON.stringify(responseBody));
        });

        test(`Server Error with partial CloudKit error details`, async () => {
            mockedNetworkManager.mock
                .onPost(`https://p123-ckdatabasews.icloud.com:443/database/1/com.apple.photos.cloud/production/${areaURL}/records/query`, expectedQuery)
                .reply(503, {serverErrorCode: `TRY_AGAIN_LATER`});

            const err = await photos.performQuery(zone, recordType, filterBy, resultsLimit, desiredKeys).catch(err => err) as iCPSError;

            expect(err.getDescription()).toEqual(`ICLOUD_PHOTOS_REQUEST_FAILED: CloudKit request failed (${recordType} query, status 503, TRY_AGAIN_LATER: no reason provided) caused by Request failed with status code 503`);
        });

        test(`Server Error with non-JSON response`, async () => {
            const responseBody = `<html>\n  <body>Service Unavailable</body>\n</html>` + `x`.repeat(300);
            mockedNetworkManager.mock
                .onPost(`https://p123-ckdatabasews.icloud.com:443/database/1/com.apple.photos.cloud/production/${areaURL}/records/query`, expectedQuery)
                .reply(503, responseBody);

            const err = await photos.performQuery(zone, recordType, filterBy, resultsLimit, desiredKeys).catch(err => err) as iCPSError;

            expect(err.getDescription()).toEqual(`ICLOUD_PHOTOS_REQUEST_FAILED: CloudKit request failed (${recordType} query, status 503, response: ${(`<html> <body>Service Unavailable</body> </html>` + `x`.repeat(300)).slice(0, 200)}) caused by Request failed with status code 503`);
            expect(err.context.responseBody).toEqual(responseBody);
        });

        test(`Network failure`, async () => {
            mockedNetworkManager.mock
                .onPost(`https://p123-ckdatabasews.icloud.com:443/database/1/com.apple.photos.cloud/production/${areaURL}/records/query`, expectedQuery)
                .networkError();

            await expect(photos.performQuery(zone, recordType, filterBy, resultsLimit, desiredKeys)).rejects.toThrow(/^Network Error$/);
        });
    });

    describe.each([{
        desc: `No records`,
        operation: `someOperation`,
        fields: {
            someField: {
                value: `someValue`,
            },
        },
        records: [],
        expectedOperation: {
            atomic: true,
            operations: [],
            zoneID: expectedZoneObject,
        },
    }, {
        desc: `One record`,
        operation: `someOperation`,
        fields: {
            someField: {
                value: `someValue`,
            },
        },
        records: [`recordA`],
        expectedOperation: {
            atomic: true,
            operations: [{
                operationType: `someOperation`,
                record: {
                    recordName: `recordA`,
                    recordType: `CPLAsset`,
                    recordChangeTag: `21h2`,
                    fields: {
                        someField: {
                            value: `someValue`,
                        },
                    },
                },
            }],
            zoneID: expectedZoneObject,
        },
    }, {
        desc: `Multiple records`,
        operation: `update`,
        fields: {
            isDeleted: {
                value: 1,
            },
        },
        records: [`recordA`, `recordB`],
        expectedOperation: {
            atomic: true,
            operations: [`recordA`, `recordB`].map(recordName => ({
                operationType: `update`,
                record: {
                    recordName,
                    recordType: `CPLAsset`,
                    recordChangeTag: `21h2`,
                    fields: {
                        isDeleted: {
                            value: 1,
                        },
                    },
                },
            })),
            zoneID: expectedZoneObject,
        },
    }])(`Perform Operation $desc`, ({operation, fields, records, expectedOperation}) => {
        test(`Success`, async () => {
            mockedNetworkManager.mock
                .onPost(`https://p123-ckdatabasews.icloud.com:443/database/1/com.apple.photos.cloud/production/${areaURL}/records/modify`, expectedOperation)
                .reply(200, {
                    records,
                });

            const result = await photos.performOperation(zone, operation, fields, records);

            expect(result).toEqual(records);

            expect((mockedNetworkManager.mock.history.post[0].headers as any).Cookie).toBe(iCloudCookieRequestHeader);
            expect(mockedNetworkManager.mock.history.post[0].params!.remapEnums).toEqual(`True`);
        });

        test(`No data returned`, async () => {
            mockedNetworkManager.mock
                .onPost(`https://p123-ckdatabasews.icloud.com:443/database/1/com.apple.photos.cloud/production/${areaURL}/records/modify`, expectedOperation)
                .reply(200, {});

            await expect(photos.performOperation(zone, operation, fields, records)).rejects.toThrow(/^Received unexpected operations response format$/);
        });

        test(`Server Error`, async () => {
            mockedNetworkManager.mock
                .onPost(`https://p123-ckdatabasews.icloud.com:443/database/1/com.apple.photos.cloud/production/${areaURL}/records/modify`, expectedOperation)
                .reply(500, {});

            const err = await photos.performOperation(zone, operation, fields, records).catch(err => err);

            expect(err).toBeInstanceOf(iCPSError);
            expect((err as iCPSError).getDescription()).toEqual(`ICLOUD_PHOTOS_REQUEST_FAILED: CloudKit request failed (${operation} operation, status 500) caused by Request failed with status code 500`);
        });

        test(`Network failure`, async () => {
            mockedNetworkManager.mock
                .onPost(`https://p123-ckdatabasews.icloud.com:443/database/1/com.apple.photos.cloud/production/${areaURL}/records/modify`, expectedOperation)
                .networkError();

            await expect(photos.performOperation(zone, operation, fields, records)).rejects.toThrow(/^Network Error$/);
        });
    });
});

/**
 * Builds a raw AssetID, as returned by the CloudKit API
 * @param checksum - The (base64 encoded) file checksum
 * @returns The raw AssetID
 */
function rawAssetID(checksum: string) {
    return {
        type: `ASSETID`,
        value: {
            fileChecksum: checksum,
            size: 42,
            wrappingKey: `someWrappingKey`,
            referenceChecksum: `someReferenceChecksum`,
            downloadURL: `https://cvws.icloud-content.com/${checksum}`,
        },
    };
}

/**
 * Builds a raw CPLMaster record, as returned by the CloudKit API
 * @param recordName - The record name of the master
 * @param zoneName - The zone the record lives in
 * @returns The raw record
 */
function rawMaster(recordName: string, zoneName: string = Config.primaryZone.zoneName) {
    return {
        recordType: `CPLMaster`,
        recordName,
        modified: {timestamp: 1000},
        fields: {
            resOriginalRes: rawAssetID(Buffer.from(recordName).toString(`base64`)),
            resOriginalFileType: {value: `public.jpeg`},
            filenameEnc: {value: Buffer.from(`${recordName}.jpeg`).toString(`base64`)},
        },
        zoneID: {zoneName},
    };
}

/**
 * Builds a raw CPLAsset record, as returned by the CloudKit API
 * @param recordName - The record name of the asset
 * @param masterRecordName - The record name of the linked master
 * @param zoneName - The zone the record lives in
 * @returns The raw record
 */
function rawAsset(recordName: string, masterRecordName: string, zoneName: string = Config.primaryZone.zoneName) {
    return {
        recordType: `CPLAsset`,
        recordName,
        modified: {timestamp: 2000},
        fields: {
            masterRef: {value: {recordName: masterRecordName}},
        },
        zoneID: {zoneName},
    };
}

/**
 * Builds a raw CPLAlbum record, as returned by the CloudKit API
 * @param recordName - The record name of the album
 * @param albumType - The type of the album
 * @param parentId - The record name of the parent folder
 * @returns The raw record
 */
function rawAlbum(recordName: string, albumType: AlbumType, parentId?: string) {
    return {
        recordType: `CPLAlbum`,
        recordName,
        modified: {timestamp: 3000},
        fields: {
            albumType: {value: albumType},
            albumNameEnc: {value: Buffer.from(recordName).toString(`base64`)},
            ...(parentId ? {parentId: {value: parentId}} : {}),
        },
    };
}

describe(`Checking indexing status`, () => {
    test(`Primary zone only`, async () => {
        mockedResourceManager._resources.sharedZone = undefined;
        const readyEvent = mockedEventManager.spyOnEvent(iCPSEventPhotos.READY);
        photos.checkIndexingStatusForZone = jest.fn<typeof photos.checkIndexingStatusForZone>()
            .mockResolvedValue();

        await photos.checkingIndexingStatus();

        expect(photos.checkIndexingStatusForZone).toHaveBeenCalledTimes(1);
        expect(photos.checkIndexingStatusForZone).toHaveBeenCalledWith(Zones.Primary);
        expect(readyEvent).toHaveBeenCalledTimes(1);
    });

    test(`Primary and shared zone`, async () => {
        mockedResourceManager._resources.sharedZone = Config.sharedZoneInPrivateArea;
        const readyEvent = mockedEventManager.spyOnEvent(iCPSEventPhotos.READY);
        photos.checkIndexingStatusForZone = jest.fn<typeof photos.checkIndexingStatusForZone>()
            .mockResolvedValue();

        await photos.checkingIndexingStatus();

        expect(photos.checkIndexingStatusForZone).toHaveBeenCalledTimes(2);
        expect(photos.checkIndexingStatusForZone).toHaveBeenNthCalledWith(1, Zones.Primary);
        expect(photos.checkIndexingStatusForZone).toHaveBeenNthCalledWith(2, Zones.Shared);
        expect(readyEvent).toHaveBeenCalledTimes(1);
    });

    test(`Indexing not finished`, async () => {
        mockedResourceManager._resources.sharedZone = Config.sharedZoneInPrivateArea;
        const readyEvent = mockedEventManager.spyOnEvent(iCPSEventPhotos.READY);
        const errorEvent = mockedEventManager.spyOnEvent(iCPSEventPhotos.ERROR);
        photos.checkIndexingStatusForZone = jest.fn<typeof photos.checkIndexingStatusForZone>()
            .mockResolvedValueOnce()
            .mockRejectedValueOnce(new Error(`Indexing in progress`));

        await photos.checkingIndexingStatus();

        expect(readyEvent).not.toHaveBeenCalled();
        expect(errorEvent).toHaveBeenCalledWith(new Error(`Unable to get indexing state`));
    });
});

describe(`Fetch albums`, () => {
    describe(`Build album records request`, () => {
        test(`Root folder`, async () => {
            photos.performQuery = jest.fn<typeof photos.performQuery>()
                .mockResolvedValue([`someRecord`]);

            await expect(photos.buildAlbumRecordsRequest()).resolves.toEqual([`someRecord`]);

            expect(photos.performQuery).toHaveBeenCalledWith(Zones.Primary, `CPLAlbumByPositionLive`);
        });

        test(`Sub folder`, async () => {
            photos.performQuery = jest.fn<typeof photos.performQuery>()
                .mockResolvedValue([`someRecord`]);

            await expect(photos.buildAlbumRecordsRequest(`someFolderId`)).resolves.toEqual([`someRecord`]);

            expect(photos.performQuery).toHaveBeenCalledWith(Zones.Primary, `CPLAlbumByPositionLive`, [{
                fieldName: `parentId`,
                comparator: `EQUALS`,
                fieldValue: {
                    value: `someFolderId`,
                    type: `STRING`,
                },
            }]);
        });
    });

    describe(`Filter album record`, () => {
        test.each([
            {
                desc: `Album`,
                record: rawAlbum(`someAlbum`, AlbumType.ALBUM),
            }, {
                desc: `Folder`,
                record: rawAlbum(`someFolder`, AlbumType.FOLDER),
            },
        ])(`Accepts $desc`, ({record}) => {
            expect(() => photos.filterAlbumRecord(record)).not.toThrow();
        });

        test.each([
            {
                desc: `Deleted record`,
                record: {...rawAlbum(`someAlbum`, AlbumType.ALBUM), deleted: true},
                expectedError: /^Ignoring deleted record$/,
            }, {
                desc: `Root folder`,
                record: rawAlbum(`----Root-Folder----`, AlbumType.FOLDER),
                expectedError: /^Ignoring unwanted album$/,
            }, {
                desc: `Project root folder`,
                record: rawAlbum(`----Project-Root-Folder----`, AlbumType.FOLDER),
                expectedError: /^Ignoring unwanted album$/,
            }, {
                desc: `Unknown album type`,
                record: rawAlbum(`someSmartAlbum`, 6 as AlbumType),
                expectedError: /^Ignoring unknown album$/,
            },
        ])(`Rejects $desc`, ({record, expectedError}) => {
            expect(() => photos.filterAlbumRecord(record)).toThrow(expectedError);
        });
    });

    describe(`Fetch CPL albums`, () => {
        test(`Parses albums and folders, ignoring invalid records`, async () => {
            const folder = rawAlbum(`someFolder`, AlbumType.FOLDER, `someParent`);
            const album = rawAlbum(`someAlbum`, AlbumType.ALBUM, `someParent`);
            const invalidAlbum = {...rawAlbum(`invalidAlbum`, AlbumType.ALBUM), modified: {}};

            photos.buildAlbumRecordsRequest = jest.fn<typeof photos.buildAlbumRecordsRequest>()
                .mockResolvedValue([
                    folder,
                    album,
                    {...rawAlbum(`deletedAlbum`, AlbumType.ALBUM), deleted: true},
                    rawAlbum(`----Root-Folder----`, AlbumType.FOLDER),
                    invalidAlbum,
                ]);
            photos.fetchAllCPLAssetsMasters = jest.fn<typeof photos.fetchAllCPLAssetsMasters>()
                .mockResolvedValue([
                    [CPLAsset.parseFromQuery(rawAsset(`assetA`, `masterA`))],
                    [CPLMaster.parseFromQuery(rawMaster(`masterA`))],
                ]);

            const result = await photos.fetchCPLAlbums(`someParent`);

            expect(photos.buildAlbumRecordsRequest).toHaveBeenCalledWith(`someParent`);
            expect(photos.fetchAllCPLAssetsMasters).toHaveBeenCalledTimes(2);
            expect(photos.fetchAllCPLAssetsMasters).toHaveBeenNthCalledWith(1, `someAlbum`);
            expect(photos.fetchAllCPLAssetsMasters).toHaveBeenNthCalledWith(2, `invalidAlbum`);
            expect(result).toEqual([
                CPLAlbum.parseFromQuery(folder),
                CPLAlbum.parseFromQuery(album, {
                    [`${Buffer.from(`masterA`).toString(`base64url`)}.jpeg`]: `masterA.jpeg`,
                }),
            ]);
        });

        test(`Request failure`, async () => {
            photos.buildAlbumRecordsRequest = jest.fn<typeof photos.buildAlbumRecordsRequest>()
                .mockRejectedValue(new Error(`Network Error`));

            await expect(photos.fetchCPLAlbums()).rejects.toThrow(/^Network Error$/);
        });
    });

    describe(`Fetch all CPL albums`, () => {
        test(`Traverses the folder structure breadth-first`, async () => {
            const rootFolder = CPLAlbum.parseFromQuery(rawAlbum(`rootFolder`, AlbumType.FOLDER));
            const rootAlbum = CPLAlbum.parseFromQuery(rawAlbum(`rootAlbum`, AlbumType.ALBUM));
            const subFolder = CPLAlbum.parseFromQuery(rawAlbum(`subFolder`, AlbumType.FOLDER, `rootFolder`));
            const subAlbum = CPLAlbum.parseFromQuery(rawAlbum(`subAlbum`, AlbumType.ALBUM, `rootFolder`));
            const subSubAlbum = CPLAlbum.parseFromQuery(rawAlbum(`subSubAlbum`, AlbumType.ALBUM, `subFolder`));

            photos.fetchCPLAlbums = jest.fn<typeof photos.fetchCPLAlbums>(async (parentId?: string) => {
                switch (parentId) {
                case undefined:
                    return [rootFolder, rootAlbum];
                case `rootFolder`:
                    return [subFolder, subAlbum];
                case `subFolder`:
                    return [subSubAlbum];
                default:
                    return [];
                }
            });

            await expect(photos.fetchAllCPLAlbums()).resolves.toEqual([rootFolder, rootAlbum, subFolder, subAlbum, subSubAlbum]);

            expect(photos.fetchCPLAlbums).toHaveBeenCalledTimes(3);
            expect(photos.fetchCPLAlbums).toHaveBeenNthCalledWith(1);
            expect(photos.fetchCPLAlbums).toHaveBeenNthCalledWith(2, `rootFolder`);
            expect(photos.fetchCPLAlbums).toHaveBeenNthCalledWith(3, `subFolder`);
        });

        test(`Fetch failure`, async () => {
            photos.fetchCPLAlbums = jest.fn<typeof photos.fetchCPLAlbums>()
                .mockRejectedValue(new Error(`Network Error`));

            await expect(photos.fetchAllCPLAlbums()).rejects.toThrow(/^Unable to fetch folder structure$/);
        });
    });
});

describe(`Fetch picture records`, () => {
    describe.each([Zones.Primary, Zones.Shared])(`Get picture records count - %o`, zone => {
        test.each([
            {
                desc: `All photos`,
                albumId: undefined,
                expectedIndexCountID: `CPLAssetByAssetDateWithoutHiddenOrDeleted`,
            }, {
                desc: `Album`,
                albumId: `someAlbum`,
                expectedIndexCountID: `CPLContainerRelationNotDeletedByAssetDate:someAlbum`,
            },
        ])(`Success - $desc`, async ({albumId, expectedIndexCountID}) => {
            photos.performQuery = jest.fn<typeof photos.performQuery>()
                .mockResolvedValue([{fields: {itemCount: {value: `42`}}}]);

            await expect(photos.getPictureRecordsCountForZone(zone, albumId)).resolves.toEqual(42);

            expect(photos.performQuery).toHaveBeenCalledWith(zone, `HyperionIndexCountLookup`, [{
                fieldName: `indexCountID`,
                comparator: `IN`,
                fieldValue: {
                    value: [expectedIndexCountID],
                    type: `STRING_LIST`,
                },
            }]);
        });

        test(`Empty response`, async () => {
            photos.performQuery = jest.fn<typeof photos.performQuery>()
                .mockResolvedValue([]);

            await expect(photos.getPictureRecordsCountForZone(zone)).rejects.toThrow(/^Unable to extract count data$/);
        });

        test(`Query failure`, async () => {
            photos.performQuery = jest.fn<typeof photos.performQuery>()
                .mockRejectedValue(new Error(`Network Error`));

            await expect(photos.getPictureRecordsCountForZone(zone)).rejects.toThrow(/^Unable to extract count data$/);
        });
    });

    describe.each([Zones.Primary, Zones.Shared])(`Build picture records requests - %o`, zone => {
        beforeEach(() => {
            photos.performQuery = jest.fn<typeof photos.performQuery>()
                .mockResolvedValue([]);
        });

        test.each([
            {
                desc: `All photos`,
                albumId: undefined,
                expectedNumberOfRecords: 200,
                expectedStartRanks: [0, 99, 198],
                expectedRecordType: `CPLAssetAndMasterByAssetDateWithoutHiddenOrDeleted`,
            }, {
                desc: `Album`,
                albumId: `someAlbum`,
                expectedNumberOfRecords: 100,
                expectedStartRanks: [0, 66],
                expectedRecordType: `CPLContainerRelationLiveByPosition`,
            }, {
                desc: `Empty album`,
                albumId: `someAlbum`,
                expectedNumberOfRecords: 0,
                expectedStartRanks: [],
                expectedRecordType: `CPLContainerRelationLiveByPosition`,
            },
        ])(`$desc`, async ({albumId, expectedNumberOfRecords, expectedStartRanks, expectedRecordType}) => {
            const requests = photos.buildPictureRecordsRequestsForZone(zone, expectedNumberOfRecords, albumId);

            expect(requests).toHaveLength(expectedStartRanks.length);
            await expect(Promise.all(requests)).resolves.toEqual(expectedStartRanks.map(() => []));

            expect(photos.performQuery).toHaveBeenCalledTimes(expectedStartRanks.length);
            expectedStartRanks.forEach((startRank, index) => {
                const expectedFilters: any[] = [{
                    fieldName: `startRank`,
                    comparator: `EQUALS`,
                    fieldValue: {
                        value: startRank,
                        type: `INT64`,
                    },
                }, {
                    fieldName: `direction`,
                    comparator: `EQUALS`,
                    fieldValue: {
                        value: `ASCENDING`,
                        type: `STRING`,
                    },
                }];
                if (albumId !== undefined) {
                    expectedFilters.push({
                        fieldName: `parentId`,
                        comparator: `EQUALS`,
                        fieldValue: {
                            value: albumId,
                            type: `STRING`,
                        },
                    });
                }

                expect(photos.performQuery).toHaveBeenNthCalledWith(index + 1, zone, expectedRecordType, expectedFilters, 198, QUERY_KEYS);
            });
        });
    });

    describe(`Filter picture record`, () => {
        test.each([
            {
                desc: `CPLMaster`,
                record: rawMaster(`someMaster`),
            }, {
                desc: `CPLAsset`,
                record: rawAsset(`someAsset`, `someMaster`),
            }, {
                desc: `Not hidden CPLAsset`,
                record: {...rawAsset(`someAsset`, `someMaster`), fields: {isHidden: {value: 0}}},
            },
        ])(`Accepts $desc`, ({record}) => {
            expect(() => photos.filterPictureRecord(record, new Set([`otherRecord`]))).not.toThrow();
        });

        test.each([
            {
                desc: `Deleted record`,
                record: {...rawMaster(`someMaster`), deleted: true},
                expectedError: /^Ignoring deleted record$/,
            }, {
                desc: `Hidden record`,
                record: {...rawAsset(`someAsset`, `someMaster`), fields: {isHidden: {value: 1}}},
                expectedError: /^Ignoring hidden record$/,
            }, {
                desc: `Duplicate record`,
                record: rawMaster(`seenRecord`),
                expectedError: /^Ignoring duplicate record$/,
            }, {
                desc: `Container relation`,
                record: {recordType: `CPLContainerRelation`, recordName: `someRelation`},
                expectedError: /^Ignoring unwanted record type$/,
            }, {
                desc: `Unknown record type`,
                record: {recordType: `CPLSomething`, recordName: `someRecord`},
                expectedError: /^Ignoring unknown record type$/,
            },
        ])(`Rejects $desc`, ({record, expectedError}) => {
            expect(() => photos.filterPictureRecord(record, new Set([`seenRecord`]))).toThrow(expectedError);
        });
    });

    describe.each([Zones.Primary, Zones.Shared])(`Fetch all picture records - %o`, zone => {
        test(`Merges the results of all requests`, async () => {
            photos.getPictureRecordsCountForZone = jest.fn<typeof photos.getPictureRecordsCountForZone>()
                .mockResolvedValue(3);
            photos.buildPictureRecordsRequestsForZone = jest.fn<typeof photos.buildPictureRecordsRequestsForZone>()
                .mockReturnValue([Promise.resolve([`recordA`, `recordB`]), Promise.resolve([`recordC`])]);

            await expect(photos.fetchAllPictureRecordsForZone(zone, `someAlbum`)).resolves.toEqual([[`recordA`, `recordB`, `recordC`], 3]);

            expect(photos.getPictureRecordsCountForZone).toHaveBeenCalledWith(zone, `someAlbum`);
            expect(photos.buildPictureRecordsRequestsForZone).toHaveBeenCalledWith(zone, 3, `someAlbum`);
        });

        test(`Request failure`, async () => {
            photos.getPictureRecordsCountForZone = jest.fn<typeof photos.getPictureRecordsCountForZone>()
                .mockResolvedValue(3);
            photos.buildPictureRecordsRequestsForZone = jest.fn<typeof photos.buildPictureRecordsRequestsForZone>()
                .mockReturnValue([Promise.resolve([`recordA`]), Promise.reject(new Error(`Network Error`))]);

            await expect(photos.fetchAllPictureRecordsForZone(zone)).rejects.toThrow(/^Network Error$/);
        });
    });

    describe(`Fetch all CPL assets and masters`, () => {
        const primaryRecords = [
            rawMaster(`masterA`),
            rawAsset(`assetA`, `masterA`),
            rawMaster(`masterB`),
            rawAsset(`assetB`, `masterB`),
        ];
        const sharedRecords = [
            rawMaster(`sharedMaster`, Config.sharedZone.zoneName),
            rawAsset(`sharedAsset`, `sharedMaster`, Config.sharedZone.zoneName),
        ];

        test(`Primary zone only`, async () => {
            mockedResourceManager._resources.sharedZone = undefined;
            const countMismatchEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.COUNT_MISMATCH);
            photos.fetchAllPictureRecordsForZone = jest.fn<typeof photos.fetchAllPictureRecordsForZone>()
                .mockResolvedValue([primaryRecords, 2]);

            const [assets, masters] = await photos.fetchAllCPLAssetsMasters();

            expect(photos.fetchAllPictureRecordsForZone).toHaveBeenCalledTimes(1);
            expect(photos.fetchAllPictureRecordsForZone).toHaveBeenCalledWith(Zones.Primary, undefined);
            expect(assets.map(asset => asset.recordName)).toEqual([`assetA`, `assetB`]);
            expect(masters.map(master => master.recordName)).toEqual([`masterA`, `masterB`]);
            expect(countMismatchEvent).not.toHaveBeenCalled();
        });

        test(`Primary and shared zone`, async () => {
            mockedResourceManager._resources.sharedZone = Config.sharedZoneInPrivateArea;
            const countMismatchEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.COUNT_MISMATCH);
            photos.fetchAllPictureRecordsForZone = jest.fn<typeof photos.fetchAllPictureRecordsForZone>()
                .mockResolvedValueOnce([primaryRecords, 2])
                .mockResolvedValueOnce([sharedRecords, 1]);

            const [assets, masters] = await photos.fetchAllCPLAssetsMasters();

            expect(photos.fetchAllPictureRecordsForZone).toHaveBeenCalledTimes(2);
            expect(photos.fetchAllPictureRecordsForZone).toHaveBeenNthCalledWith(1, Zones.Primary, undefined);
            expect(photos.fetchAllPictureRecordsForZone).toHaveBeenNthCalledWith(2, Zones.Shared);
            expect(assets.map(asset => asset.recordName)).toEqual([`assetA`, `assetB`, `sharedAsset`]);
            expect(masters.map(master => master.recordName)).toEqual([`masterA`, `masterB`, `sharedMaster`]);
            expect(countMismatchEvent).not.toHaveBeenCalled();
        });

        test(`Album does not include shared zone`, async () => {
            mockedResourceManager._resources.sharedZone = Config.sharedZoneInPrivateArea;
            photos.fetchAllPictureRecordsForZone = jest.fn<typeof photos.fetchAllPictureRecordsForZone>()
                .mockResolvedValue([[...primaryRecords, {recordType: `CPLContainerRelation`, recordName: `someRelation`}], 2]);

            const [assets, masters] = await photos.fetchAllCPLAssetsMasters(`someAlbum`);

            expect(photos.fetchAllPictureRecordsForZone).toHaveBeenCalledTimes(1);
            expect(photos.fetchAllPictureRecordsForZone).toHaveBeenCalledWith(Zones.Primary, `someAlbum`);
            expect(assets).toHaveLength(2);
            expect(masters).toHaveLength(2);
        });

        test.each([
            {
                desc: `All photos`,
                albumId: undefined,
                expectedAlbumName: `All photos`,
            }, {
                desc: `Album`,
                albumId: `someAlbum`,
                expectedAlbumName: `someAlbum`,
            },
        ])(`Ignores unwanted records and reports count mismatch - $desc`, async ({albumId, expectedAlbumName}) => {
            mockedResourceManager._resources.sharedZone = undefined;
            const countMismatchEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.COUNT_MISMATCH);
            photos.fetchAllPictureRecordsForZone = jest.fn<typeof photos.fetchAllPictureRecordsForZone>()
                .mockResolvedValue([[
                    ...primaryRecords,
                    rawMaster(`masterA`), // Duplicate
                    {...rawMaster(`deletedMaster`), deleted: true},
                    {...rawAsset(`hiddenAsset`, `masterA`), fields: {isHidden: {value: 1}}},
                    {recordType: `CPLContainerRelation`, recordName: `someRelation`},
                    {recordType: `CPLSomething`, recordName: `someRecord`},
                    {...rawAsset(`invalidAsset`, `masterA`), modified: {}}, // Unparsable
                ], 3]);

            const [assets, masters] = await photos.fetchAllCPLAssetsMasters(albumId);

            expect(assets.map(asset => asset.recordName)).toEqual([`assetA`, `assetB`]);
            expect(masters.map(master => master.recordName)).toEqual([`masterA`, `masterB`]);
            expect(countMismatchEvent).toHaveBeenCalledWith(expectedAlbumName, 3, 2, 2);
        });

        test(`Only expected unwanted records`, async () => {
            mockedResourceManager._resources.sharedZone = undefined;
            const countMismatchEvent = mockedEventManager.spyOnEvent(iCPSEventRuntimeWarning.COUNT_MISMATCH);
            photos.fetchAllPictureRecordsForZone = jest.fn<typeof photos.fetchAllPictureRecordsForZone>()
                .mockResolvedValue([[
                    ...primaryRecords,
                    {recordType: `CPLContainerRelation`, recordName: `someRelation`},
                ], 2]);

            const [assets, masters] = await photos.fetchAllCPLAssetsMasters(`someAlbum`);

            expect(assets).toHaveLength(2);
            expect(masters).toHaveLength(2);
            expect(countMismatchEvent).not.toHaveBeenCalled();
        });

        test.each([
            {
                desc: `All photos`,
                albumId: undefined,
                expectedError: /^Unable to fetch records$/,
            }, {
                desc: `Album`,
                albumId: `someAlbum`,
                expectedError: /^Unable to fetch records$/,
            },
        ])(`Fetch failure - $desc`, async ({albumId, expectedError}) => {
            mockedResourceManager._resources.sharedZone = undefined;
            photos.fetchAllPictureRecordsForZone = jest.fn<typeof photos.fetchAllPictureRecordsForZone>()
                .mockRejectedValue(new Error(`Network Error`));

            await expect(photos.fetchAllCPLAssetsMasters(albumId)).rejects.toThrow(expectedError);
        });
    });
});

describe(`Download asset`, () => {
    const modified = 1640995200000; // 2022-01-01T00:00:00.000Z

    test(`Success`, async () => {
        mockfs({
            [Config.defaultConfig.dataDir]: {
                [PRIMARY_ASSET_DIR]: {},
            },
        });

        const asset = new Asset(`someChecksum`, 8, FileType.fromExtension(`jpeg`), modified, Zones.Primary, AssetType.ORIG, `someFile`, `someWrappingKey`, `someReferenceChecksum`, `https://cvws.icloud-content.com/someAsset`, `someRecord`, false);
        mockedNetworkManager.downloadData = jest.fn<typeof mockedNetworkManager.downloadData>()
            .mockResolvedValue();

        await photos.downloadAsset(asset);

        expect(mockedNetworkManager.downloadData).toHaveBeenCalledWith(`https://cvws.icloud-content.com/someAsset`, asset.getAssetFilePath(), modified);

        mockfs.restore();
    });

    test(`No download URL`, async () => {
        const asset = new Asset(`someChecksum`, 8, FileType.fromExtension(`jpeg`), modified, Zones.Primary);
        mockedNetworkManager.downloadData = jest.fn<typeof mockedNetworkManager.downloadData>();

        await expect(photos.downloadAsset(asset)).rejects.toThrow(/^Asset has no download URL$/);

        expect(mockedNetworkManager.downloadData).not.toHaveBeenCalled();
    });

    test(`Download failure`, async () => {
        const asset = new Asset(`someChecksum`, 8, FileType.fromExtension(`jpeg`), modified, Zones.Primary, AssetType.ORIG, `someFile`, `someWrappingKey`, `someReferenceChecksum`, `https://cvws.icloud-content.com/someAsset`, `someRecord`, false);
        mockedNetworkManager.downloadData = jest.fn<typeof mockedNetworkManager.downloadData>()
            .mockRejectedValue(new Error(`Network Error`));

        await expect(photos.downloadAsset(asset)).rejects.toThrow(/^Network Error$/);
    });
});

describe(`Delete assets`, () => {
    test(`Success`, async () => {
        photos.performOperation = jest.fn<typeof photos.performOperation>()
            .mockResolvedValue([]);

        await photos.deleteAssets([`recordA`, `recordB`]);

        expect(photos.performOperation).toHaveBeenCalledWith(Zones.Primary, `update`, {isDeleted: {value: 1}}, [`recordA`, `recordB`]);
    });

    test(`Operation failure`, async () => {
        photos.performOperation = jest.fn<typeof photos.performOperation>()
            .mockRejectedValue(new Error(`Network Error`));

        await expect(photos.deleteAssets([`recordA`])).rejects.toThrow(/^Network Error$/);
    });
});
