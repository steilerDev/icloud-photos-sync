import {describe, test, expect, jest, beforeEach} from '@jest/globals';
import {getICloudCookieHeader, iCloudCookieRequestHeader} from '../_helpers/icloud.helper';
import * as Config from '../_helpers/_config';
import {MockedResourceManager, prepareResourceManager} from '../_helpers/_general';
import {iCloudPhotos} from '../../src/lib/icloud/icloud-photos/icloud-photos';
import {iCPSError} from '../../src/app/error/error';
import {VALIDATOR_ERR} from '../../src/app/error/error-codes';
import {Zones} from '../../src/lib/icloud/icloud-photos/query-builder';
import {iCPSEventPhotos} from '../../src/lib/resource-manager/events';

let mockedResourceManager: MockedResourceManager;
let photos: iCloudPhotos;

beforeEach(() => {
    mockedResourceManager = prepareResourceManager()!;
    mockedResourceManager._networkManager.photosUrl = Config.photosDomain;
    getICloudCookieHeader()[`set-cookie`]
        .forEach(cookie => {
            mockedResourceManager._networkManager._headerJar.setCookie(cookie);
        });
    mockedResourceManager._resources.primaryZone = Config.primaryZone;
    mockedResourceManager._resources.sharedZone = Config.sharedZone;

    photos = new iCloudPhotos();
});

describe(`Setup iCloud Photos`, () => {
    const setupURL = `https://p123-ckdatabasews.icloud.com:443/database/1/com.apple.photos.cloud/production/private/changes/database`;

    test(`Success`, async () => {
        photos.ready = Promise.resolve();

        const setupCompletedEvent = mockedResourceManager.spyOnEvent(iCPSEventPhotos.SETUP_COMPLETED);

        mockedResourceManager._validator.validatePhotosSetupResponse = jest.fn<typeof mockedResourceManager._validator.validatePhotosSetupResponse>();
        mockedResourceManager._networkManager.applyPhotosSetupResponse = jest.fn<typeof mockedResourceManager._networkManager.applyPhotosSetupResponse>();

        mockedResourceManager._networkManager.mock
            .onPost(setupURL, {})
            .reply(200);

        await photos.setup();

        expect(mockedResourceManager._validator.validatePhotosSetupResponse).toHaveBeenCalledTimes(1);
        expect(mockedResourceManager._networkManager.applyPhotosSetupResponse).toHaveBeenCalledTimes(1);
        expect((mockedResourceManager._networkManager.mock.history.post[0].headers as any).Cookie).toBe(iCloudCookieRequestHeader);

        expect(setupCompletedEvent).toHaveBeenCalledTimes(1);
    });

    test(`Response validation fails`, async () => {
        const errorEvent = mockedResourceManager.spyOnEvent(iCPSEventPhotos.ERROR, false);

        mockedResourceManager._validator.validatePhotosSetupResponse = jest.fn<typeof mockedResourceManager._validator.validatePhotosSetupResponse>(() => {
            throw new iCPSError(VALIDATOR_ERR.SETUP_RESPONSE);
        });

        mockedResourceManager._networkManager.mock
            .onPost(setupURL, {})
            .reply(200);

        await expect(photos.setup()).rejects.toThrow(/^Unexpected error while setting up iCloud Photos$/);
        expect(errorEvent).toHaveBeenCalledWith(new Error(`Unexpected error while setting up iCloud Photos`));
    });

    test(`Network failure`, async () => {
        const errorEvent = mockedResourceManager.spyOnEvent(iCPSEventPhotos.ERROR, false);

        mockedResourceManager._networkManager.mock
            .onPost(setupURL, {})
            .reply(500);

        await expect(photos.setup()).rejects.toThrow(/^Unexpected error while setting up iCloud Photos$/);
        expect(errorEvent).toHaveBeenCalledWith(new Error(`Unexpected error while setting up iCloud Photos`));
    });

    test(`Check indexing state after setup`, () => {
        photos.checkingIndexingStatus = jest.fn<typeof photos.checkingIndexingStatus>()
            .mockResolvedValue();

        mockedResourceManager._eventManager.emit(iCPSEventPhotos.SETUP_COMPLETED);

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
        expectedZoneObject: Config.primaryZone,
    }, {
        zone: Zones.Shared,
        expectedZoneObject: Config.sharedZone,
    },
])(`$zone`, ({zone, expectedZoneObject}) => {
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

            mockedResourceManager._networkManager.mock
                .onPost(`https://p123-ckdatabasews.icloud.com:443/database/1/com.apple.photos.cloud/production/private/records/query`, expectedQuery)
                .reply(200, {
                    records: responseRecords,
                });

            const result = await photos.performQuery(zone, recordType, filterBy, resultsLimit, desiredKeys);

            expect(result).toEqual(responseRecords);

            expect((mockedResourceManager._networkManager.mock.history.post[0].headers as any).Cookie).toBe(iCloudCookieRequestHeader);
            expect(mockedResourceManager._networkManager.mock.history.post[0].params!.remapEnums).toEqual(`True`);
        });

        test(`No data returned`, async () => {
            mockedResourceManager._networkManager.mock
                .onPost(`https://p123-ckdatabasews.icloud.com:443/database/1/com.apple.photos.cloud/production/private/records/query`, expectedQuery)
                .reply(200, {});

            await expect(photos.performQuery(zone, recordType, filterBy, resultsLimit, desiredKeys)).rejects.toThrow(/^Received unexpected query response format$/);
        });

        test(`Server Error`, async () => {
            mockedResourceManager._networkManager.mock
                .onPost(`https://p123-ckdatabasews.icloud.com:443/database/1/com.apple.photos.cloud/production/private/records/query`, expectedQuery)
                .reply(500, {});

            await expect(photos.performQuery(zone, recordType, filterBy, resultsLimit, desiredKeys)).rejects.toThrow(/^Request failed with status code 500$/);
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
    }])(`Perform Operation $desc`, ({operation, fields, records, expectedOperation}) => {
        test(`Success`, async () => {
            mockedResourceManager._networkManager.mock
                .onPost(`https://p123-ckdatabasews.icloud.com:443/database/1/com.apple.photos.cloud/production/private/records/modify`, expectedOperation)
                .reply(200, {
                    records,
                });

            const result = await photos.performOperation(zone, operation, fields, records);

            expect(result).toEqual(records);

            expect((mockedResourceManager._networkManager.mock.history.post[0].headers as any).Cookie).toBe(iCloudCookieRequestHeader);
            expect(mockedResourceManager._networkManager.mock.history.post[0].params!.remapEnums).toEqual(`True`);
        });

        test.todo(`Without any content`);
        test.todo(`Only operationType`);
        test.todo(`Only operationType + recordName`);
        describe(`With operationType + recordName + fields`, () => {
            test.todo(`Success`);
            test.todo(`No data returned`);
            test.todo(`Network failure`);
        });
    });
});

// Describe(`Fetch records`, () => {
//     // Test invalid extension
// });

// describe(`Fetch albums`, () => {

// });

// describe(`Download asset`, () => {
//     test.todo(`Success`);
//     test.todo(`No download url`);
// });

// describe(`Delete asset`, () => {
//     test.todo(`Success`);
// });