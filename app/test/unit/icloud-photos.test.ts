import {describe, test, expect, jest, beforeEach} from '@jest/globals';
import {getICloudCookieHeader, iCloudCookieRequestHeader} from '../_helpers/icloud.helper';
import * as Config from '../_helpers/_config';
import * as ICLOUD_PHOTOS from '../../src/lib/icloud/icloud-photos/constants';
import {MockedResourceManager, prepareResourceManager, spyOnEvent} from '../_helpers/_general';
import {iCloudPhotos} from '../../src/lib/icloud/icloud-photos/icloud-photos';
import {iCPSError} from '../../src/app/error/error';
import {VALIDATOR_ERR} from '../../src/app/error/error-codes';
import {Zones} from '../../src/lib/icloud/icloud-photos/query-builder';

let mockedResourceManager: MockedResourceManager;
let mockedICloudPhotos: iCloudPhotos;

beforeEach(() => {
    mockedResourceManager = prepareResourceManager()!;
    mockedResourceManager._network.photosUrl = Config.photosDomain;
    mockedResourceManager._network.pushCookieString(getICloudCookieHeader()[`set-cookie`]);
    mockedResourceManager._resources.primaryZone = Config.primaryZone;
    mockedResourceManager._resources.sharedZone = Config.sharedZone;

    mockedICloudPhotos = new iCloudPhotos();
    mockedICloudPhotos.removeAllListeners();
});

describe(`Setup iCloud Photos`, () => {
    const setupURL = `https://p123-ckdatabasews.icloud.com:443/database/1/com.apple.photos.cloud/production/private/changes/database`;

    test(`Success`, async () => {
        mockedICloudPhotos.ready = Promise.resolve();

        const setupCompleteEvent = spyOnEvent(mockedICloudPhotos, ICLOUD_PHOTOS.EVENTS.SETUP_COMPLETE);

        mockedResourceManager._validator.validatePhotosSetupResponse = jest.fn<typeof mockedResourceManager._validator.validatePhotosSetupResponse>();
        mockedResourceManager._network.applyPhotosSetupResponse = jest.fn<typeof mockedResourceManager._network.applyPhotosSetupResponse>();

        mockedResourceManager._network.mock
            .onPost(setupURL, {})
            .reply(200);

        await mockedICloudPhotos.setup();

        expect(mockedResourceManager._validator.validatePhotosSetupResponse).toHaveBeenCalledTimes(1);
        expect(mockedResourceManager._network.applyPhotosSetupResponse).toHaveBeenCalledTimes(1);
        expect((mockedResourceManager._network.mock.history.post[0].headers as any).Cookie).toBe(iCloudCookieRequestHeader);

        expect(setupCompleteEvent).toHaveBeenCalledTimes(1);
    });

    test(`Response validation fails`, async () => {
        mockedICloudPhotos.ready = mockedICloudPhotos.getReady();

        const errorEvent = spyOnEvent(mockedICloudPhotos, ICLOUD_PHOTOS.EVENTS.ERROR);

        mockedResourceManager._validator.validatePhotosSetupResponse = jest.fn<typeof mockedResourceManager._validator.validatePhotosSetupResponse>(() => {
            throw new iCPSError(VALIDATOR_ERR.SETUP_RESPONSE);
        });

        mockedResourceManager._network.mock
            .onPost(setupURL, {})
            .reply(200);

        await expect(mockedICloudPhotos.setup()).rejects.toThrow(/^Unexpected error while setting up iCloud Photos$/);
        expect(errorEvent).toHaveBeenCalledWith(new Error(`Unexpected error while setting up iCloud Photos`));
    });

    test(`Network failure`, async () => {
        mockedICloudPhotos.ready = mockedICloudPhotos.getReady();

        const errorEvent = spyOnEvent(mockedICloudPhotos, ICLOUD_PHOTOS.EVENTS.ERROR);

        mockedResourceManager._network.mock
            .onPost(setupURL, {})
            .reply(500);

        await expect(mockedICloudPhotos.setup()).rejects.toThrow(/^Unexpected error while setting up iCloud Photos$/);
        expect(errorEvent).toHaveBeenCalledWith(new Error(`Unexpected error while setting up iCloud Photos`));
    });

    test(`Check indexing state after setup`, () => {
        mockedICloudPhotos = new iCloudPhotos(); // Doing this so event listeners are maintained

        mockedICloudPhotos.checkingIndexingStatus = jest.fn<typeof mockedICloudPhotos.checkingIndexingStatus>()
            .mockResolvedValue();

        mockedICloudPhotos.emit(ICLOUD_PHOTOS.EVENTS.SETUP_COMPLETE);

        expect(mockedICloudPhotos.checkingIndexingStatus).toHaveBeenCalledTimes(1);
    });

    describe.each([Zones.Primary, Zones.Shared])(`Check indexing state - %o`, zone => {
        test(`Indexing finished`, async () => {
            mockedICloudPhotos.performQuery = jest.fn<typeof mockedICloudPhotos.performQuery>()
                .mockResolvedValue([{
                    fields: {
                        state: {
                            value: `FINISHED`,
                        },
                    },
                }]);

            await expect(mockedICloudPhotos.checkIndexingStatusForZone(zone)).resolves.toBeUndefined();

            expect(mockedICloudPhotos.performQuery).toHaveBeenCalledWith(zone, `CheckIndexingState`);
        });

        test(`Indexing in progress with progress`, async () => {
            mockedICloudPhotos.performQuery = jest.fn<typeof mockedICloudPhotos.performQuery>()
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

            await expect(mockedICloudPhotos.checkIndexingStatusForZone(zone)).rejects.toThrow(/^Indexing in progress, try again later$/);

            expect(mockedICloudPhotos.performQuery).toHaveBeenCalledWith(zone, `CheckIndexingState`);
        });

        test(`Indexing in progress without progress`, async () => {
            mockedICloudPhotos.performQuery = jest.fn<typeof mockedICloudPhotos.performQuery>()
                .mockResolvedValue([{
                    fields: {
                        state: {
                            value: `RUNNING`,
                        },
                    },
                }]);

            await expect(mockedICloudPhotos.checkIndexingStatusForZone(zone)).rejects.toThrow(/^Indexing in progress, try again later$/);

            expect(mockedICloudPhotos.performQuery).toHaveBeenCalledWith(zone, `CheckIndexingState`);
        });

        test(`Unknown status`, async () => {
            mockedICloudPhotos.performQuery = jest.fn<typeof mockedICloudPhotos.performQuery>()
                .mockResolvedValue([{
                    fields: {
                        state: {
                            value: `UNKNOWN_STATE`,
                        },
                    },
                }]);

            await expect(mockedICloudPhotos.checkIndexingStatusForZone(zone)).rejects.toThrow(/^Unknown indexing state$/);

            expect(mockedICloudPhotos.performQuery).toHaveBeenCalledWith(zone, `CheckIndexingState`);
        });

        test.each([
            [[]],
            [[{}]],
            [[{fields: {}}]],
            [[{fields: {state: {}}}]],
        ])(`Empty query - %o`, async queryResult => {
            mockedICloudPhotos.performQuery = jest.fn<typeof mockedICloudPhotos.performQuery>()
                .mockResolvedValue(queryResult);

            await expect(mockedICloudPhotos.checkIndexingStatusForZone(zone)).rejects.toThrow(/^Unable to get indexing state$/);

            expect(mockedICloudPhotos.performQuery).toHaveBeenCalledWith(zone, `CheckIndexingState`);
        });

        test(`Query failure`, async () => {
            mockedICloudPhotos.performQuery = jest.fn<typeof mockedICloudPhotos.performQuery>()
                .mockRejectedValue(new Error());

            await expect(mockedICloudPhotos.checkIndexingStatusForZone(zone)).rejects.toThrow(/^$/);

            expect(mockedICloudPhotos.performQuery).toHaveBeenCalledWith(zone, `CheckIndexingState`);
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

            mockedResourceManager._network.mock
                .onPost(`https://p123-ckdatabasews.icloud.com:443/database/1/com.apple.photos.cloud/production/private/records/query`, expectedQuery)
                .reply(200, {
                    records: responseRecords,
                });

            const result = await mockedICloudPhotos.performQuery(zone, recordType, filterBy, resultsLimit, desiredKeys);

            expect(result).toEqual(responseRecords);

            expect((mockedResourceManager._network.mock.history.post[0].headers as any).Cookie).toBe(iCloudCookieRequestHeader);
            expect(mockedResourceManager._network.mock.history.post[0].params!.remapEnums).toEqual(`True`);
        });

        test(`No data returned`, async () => {
            mockedResourceManager._network.mock
                .onPost(`https://p123-ckdatabasews.icloud.com:443/database/1/com.apple.photos.cloud/production/private/records/query`, expectedQuery)
                .reply(200, {});

            await expect(mockedICloudPhotos.performQuery(zone, recordType, filterBy, resultsLimit, desiredKeys)).rejects.toThrow(/^Received unexpected query response format$/);
        });

        test(`Server Error`, async () => {
            mockedResourceManager._network.mock
                .onPost(`https://p123-ckdatabasews.icloud.com:443/database/1/com.apple.photos.cloud/production/private/records/query`, expectedQuery)
                .reply(500, {});

            await expect(mockedICloudPhotos.performQuery(zone, recordType, filterBy, resultsLimit, desiredKeys)).rejects.toThrow(/^Request failed with status code 500$/);
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
            mockedResourceManager._network.mock
                .onPost(`https://p123-ckdatabasews.icloud.com:443/database/1/com.apple.photos.cloud/production/private/records/modify`, expectedOperation)
                .reply(200, {
                    records,
                });

            const result = await mockedICloudPhotos.performOperation(zone, operation, fields, records);

            expect(result).toEqual(records);

            expect((mockedResourceManager._network.mock.history.post[0].headers as any).Cookie).toBe(iCloudCookieRequestHeader);
            expect(mockedResourceManager._network.mock.history.post[0].params!.remapEnums).toEqual(`True`);
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