import {describe, test, expect, jest, beforeEach} from '@jest/globals';
import {iCloudPhotosFactory} from '../_helpers/icloud.helper';
import {AxiosRequestConfig} from 'axios';
import * as Config from '../_helpers/_config';
import * as ICLOUD_PHOTOS from '../../src/lib/icloud/icloud-photos/constants';
import {prepareResourceManager, spyOnEvent} from '../_helpers/_general';
import {Zones} from '../../src/lib/icloud/icloud-photos/query-builder';

beforeEach(() => {
    prepareResourceManager();
});

test(`PhotosDomain not available`, () => {
    const iCloudPhotos = iCloudPhotosFactory();
    iCloudPhotos.auth.iCloudPhotosAccount.photosDomain = ``;

    expect(() => iCloudPhotos.getServiceEndpoint(`someExt`)).toThrow(/^Unable to get service endpoint: Photos Domain not defined$/);
});

describe(`Setup iCloud Photos`, () => {
    test(`Setup successful`, async () => {
        const iCloudPhotos = iCloudPhotosFactory();

        iCloudPhotos.ready = Promise.resolve();
        const axiosResponse = `Success`;
        const setupCompleteEvent = spyOnEvent(iCloudPhotos, ICLOUD_PHOTOS.EVENTS.SETUP_COMPLETE);
        iCloudPhotos.auth.processPhotosSetupResponse = jest.fn();
        iCloudPhotos.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve(axiosResponse));

        await iCloudPhotos.setup();

        expect(iCloudPhotos.axios.post).toHaveBeenCalledWith(
            `https://p123-ckdatabasews.icloud.com:443/database/1/com.apple.photos.cloud/production/private/changes/database`,
            {},
            {
                headers: `headerValues`,
            },
        );
        expect(iCloudPhotos.auth.processPhotosSetupResponse).toHaveBeenCalledWith(axiosResponse);
        expect(setupCompleteEvent).toHaveBeenCalledTimes(1);
    });

    test(`Response validation fails`, async () => {
        const iCloudPhotos = iCloudPhotosFactory();

        iCloudPhotos.ready = iCloudPhotos.getReady();
        const axiosResponse = `Success`;
        const errorEvent = spyOnEvent(iCloudPhotos, ICLOUD_PHOTOS.EVENTS.ERROR);
        iCloudPhotos.auth.processPhotosSetupResponse = jest.fn(() => {
            throw new Error();
        });

        iCloudPhotos.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve(axiosResponse));

        await expect(iCloudPhotos.setup()).rejects.toThrow(/^Unexpected error while setting up iCloud Photos$/);

        expect(iCloudPhotos.axios.post).toHaveBeenCalledWith(
            `https://p123-ckdatabasews.icloud.com:443/database/1/com.apple.photos.cloud/production/private/changes/database`,
            {},
            {
                headers: `headerValues`,
            },
        );
        expect(iCloudPhotos.auth.processPhotosSetupResponse).toHaveBeenCalledWith(axiosResponse);
        expect(errorEvent).toHaveBeenCalledWith(new Error(`Unexpected error while setting up iCloud Photos`));
    });

    test(`Network failure`, async () => {
        const iCloudPhotos = iCloudPhotosFactory();

        iCloudPhotos.ready = iCloudPhotos.getReady();
        const errorEvent = spyOnEvent(iCloudPhotos, ICLOUD_PHOTOS.EVENTS.ERROR);
        iCloudPhotos.auth.processPhotosSetupResponse = jest.fn();

        iCloudPhotos.axios.post = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.reject(new Error(`Network Error`)));

        await expect(iCloudPhotos.setup()).rejects.toThrow(/^Unexpected error while setting up iCloud Photos$/);

        expect(iCloudPhotos.axios.post).toHaveBeenCalledWith(
            `https://p123-ckdatabasews.icloud.com:443/database/1/com.apple.photos.cloud/production/private/changes/database`,
            {},
            {
                headers: `headerValues`,
            },
        );
        expect(iCloudPhotos.auth.processPhotosSetupResponse).not.toHaveBeenCalled();
        expect(errorEvent).toHaveBeenCalledWith(new Error(`Unexpected error while setting up iCloud Photos`));
    });

    test(`Check indexing state after setup`, () => {
        const iCloudPhotos = iCloudPhotosFactory(false);
        iCloudPhotos.checkingIndexingStatus = jest.fn(() => Promise.resolve());

        iCloudPhotos.emit(ICLOUD_PHOTOS.EVENTS.SETUP_COMPLETE);

        expect(iCloudPhotos.checkingIndexingStatus).toHaveBeenCalledTimes(1);
    });

    describe.each([Zones.Primary, Zones.Shared])(`Check indexing state - %o`, zone => {
        test(`Indexing finished`, async () => {
            const iCloudPhotos = iCloudPhotosFactory();

            iCloudPhotos.performQuery = jest.fn(() => Promise.resolve([{
                fields: {
                    state: {
                        value: `FINISHED`,
                    },
                },
            }]));

            await expect(iCloudPhotos.checkIndexingStatusForZone(zone)).resolves.toBeUndefined();

            expect(iCloudPhotos.performQuery).toHaveBeenCalledWith(zone, `CheckIndexingState`);
        });

        test(`Indexing in progress with progress`, async () => {
            const iCloudPhotos = iCloudPhotosFactory();

            iCloudPhotos.performQuery = jest.fn(() => Promise.resolve([{
                fields: {
                    state: {
                        value: `RUNNING`,
                    },
                    progress: {
                        value: 20,
                    },
                },
            }]));

            await expect(iCloudPhotos.checkIndexingStatusForZone(zone)).rejects.toThrow(/^Indexing in progress, try again later$/);

            expect(iCloudPhotos.performQuery).toHaveBeenCalledWith(zone, `CheckIndexingState`);
        });

        test(`Indexing in progress without progress`, async () => {
            const iCloudPhotos = iCloudPhotosFactory();

            iCloudPhotos.performQuery = jest.fn(() => Promise.resolve([{
                fields: {
                    state: {
                        value: `RUNNING`,
                    },
                },
            }]));

            await expect(iCloudPhotos.checkIndexingStatusForZone(zone)).rejects.toThrow(/^Indexing in progress, try again later$/);

            expect(iCloudPhotos.performQuery).toHaveBeenCalledWith(zone, `CheckIndexingState`);
        });

        test(`Unknown status`, async () => {
            const iCloudPhotos = iCloudPhotosFactory();

            iCloudPhotos.performQuery = jest.fn(() => Promise.resolve([{
                fields: {
                    state: {
                        value: `UNKNOWN_STATE`,
                    },
                },
            }]));

            await expect(iCloudPhotos.checkIndexingStatusForZone(zone)).rejects.toThrow(/^Unknown indexing state$/);

            expect(iCloudPhotos.performQuery).toHaveBeenCalledWith(zone, `CheckIndexingState`);
        });

        test.each([
            [[]],
            [[{}]],
            [[{fields: {}}]],
            [[{fields: {state: {}}}]],
        ])(`Empty query - %o`, async queryResult => {
            const iCloudPhotos = iCloudPhotosFactory();

            iCloudPhotos.performQuery = jest.fn(() => Promise.resolve(queryResult));

            await expect(iCloudPhotos.checkIndexingStatusForZone(zone)).rejects.toThrow(/^Unable to get indexing state$/);

            expect(iCloudPhotos.performQuery).toHaveBeenCalledWith(zone, `CheckIndexingState`);
        });

        test(`Query failure`, async () => {
            const iCloudPhotos = iCloudPhotosFactory();
            iCloudPhotos.performQuery = jest.fn(() => Promise.reject(new Error()));

            await expect(iCloudPhotos.checkIndexingStatusForZone(zone)).rejects.toThrow(/^$/);

            expect(iCloudPhotos.performQuery).toHaveBeenCalledWith(zone, `CheckIndexingState`);
        });
    });
});

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
        zone: Zones.Primary,
        expectedQuery: {
            desiredKeys: [`key1, key2`],
            query: {
                filterBy: [
                    {comparator: `EQUALS`, fieldName: `someField`, fieldValue: {type: `STRING`, value: `someValue`}},
                ],
                recordType: `recordType`,
            },
            resultsLimit: 2,
            zoneID: {ownerRecordName: Config.primaryZone.ownerName, zoneName: Config.primaryZone.zoneName, zoneType: Config.primaryZone.zoneType},
        },
    }, {
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
        zone: Zones.Shared,
        expectedQuery: {
            desiredKeys: [`key1, key2`],
            query: {
                filterBy: [
                    {comparator: `EQUALS`, fieldName: `someField`, fieldValue: {type: `STRING`, value: `someValue`}},
                ],
                recordType: `recordType`,
            },
            resultsLimit: 2,
            zoneID: {ownerRecordName: Config.sharedZone.ownerName, zoneName: Config.sharedZone.zoneName, zoneType: Config.sharedZone.zoneType},
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
        zone: Zones.Primary,
        expectedQuery: {
            query: {
                filterBy: [
                    {comparator: `EQUALS`, fieldName: `someField`, fieldValue: {type: `STRING`, value: `someValue`}},
                ],
                recordType: `recordType`,
            },
            resultsLimit: 2,
            zoneID: {ownerRecordName: Config.primaryZone.ownerName, zoneName: Config.primaryZone.zoneName, zoneType: Config.primaryZone.zoneType},
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
        zone: Zones.Shared,
        expectedQuery: {
            query: {
                filterBy: [
                    {comparator: `EQUALS`, fieldName: `someField`, fieldValue: {type: `STRING`, value: `someValue`}},
                ],
                recordType: `recordType`,
            },
            resultsLimit: 2,
            zoneID: {ownerRecordName: Config.sharedZone.ownerName, zoneName: Config.sharedZone.zoneName, zoneType: Config.sharedZone.zoneType},
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
        zone: Zones.Primary,
        expectedQuery: {
            query: {
                filterBy: [
                    {comparator: `EQUALS`, fieldName: `someField`, fieldValue: {type: `STRING`, value: `someValue`}},
                ],
                recordType: `recordType`,
            },
            zoneID: {ownerRecordName: Config.primaryZone.ownerName, zoneName: Config.primaryZone.zoneName, zoneType: Config.primaryZone.zoneType},
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
        zone: Zones.Shared,
        expectedQuery: {
            query: {
                filterBy: [
                    {comparator: `EQUALS`, fieldName: `someField`, fieldValue: {type: `STRING`, value: `someValue`}},
                ],
                recordType: `recordType`,
            },
            zoneID: {ownerRecordName: Config.sharedZone.ownerName, zoneName: Config.sharedZone.zoneName, zoneType: Config.sharedZone.zoneType},
        },
    }, {
        desc: `recordType`,
        recordType: `recordType`,
        filterBy: undefined,
        resultsLimit: undefined,
        desiredKeys: undefined,
        zone: Zones.Primary,
        expectedQuery: {
            query: {
                recordType: `recordType`,
            },
            zoneID: {ownerRecordName: Config.primaryZone.ownerName, zoneName: Config.primaryZone.zoneName, zoneType: Config.primaryZone.zoneType},
        },
    }, {
        desc: `recordType`,
        recordType: `recordType`,
        filterBy: undefined,
        resultsLimit: undefined,
        desiredKeys: undefined,
        zone: Zones.Shared,
        expectedQuery: {
            query: {
                recordType: `recordType`,
            },
            zoneID: {ownerRecordName: Config.sharedZone.ownerName, zoneName: Config.sharedZone.zoneName, zoneType: Config.sharedZone.zoneType},
        },
    },
])(`Perform Query $desc - $zone`, ({recordType, filterBy, resultsLimit, desiredKeys, expectedQuery, zone}) => {
    test(`Success`, async () => {
        const iCloudPhotos = iCloudPhotosFactory();
        const responseRecords = [`recordA`, `recordB`];
        iCloudPhotos.axios.post = jest.fn(() => Promise.resolve({
            data: {
                records: responseRecords,
            },
        } as any));

        const result = await iCloudPhotos.performQuery(zone, recordType, filterBy, resultsLimit, desiredKeys);

        expect(iCloudPhotos.axios.post).toHaveBeenCalledWith(
            `https://p123-ckdatabasews.icloud.com:443/database/1/com.apple.photos.cloud/production/private/records/query`,
            expectedQuery,
            {headers: `headerValues`, params: {remapEnums: `True`}},
        );
        expect(iCloudPhotos.auth.validatePhotosAccount).toHaveBeenCalledWith(zone);
        expect(result).toEqual(responseRecords);
    });

    test(`No data returned`, async () => {
        const iCloudPhotos = iCloudPhotosFactory();
        iCloudPhotos.axios.post = jest.fn(() => Promise.resolve({
            data: {},
        } as any));

        await expect(iCloudPhotos.performQuery(zone, recordType, filterBy, resultsLimit, desiredKeys)).rejects.toThrow(/^Received unexpected query response format$/);

        expect(iCloudPhotos.auth.validatePhotosAccount).toHaveBeenCalledWith(zone);
        expect(iCloudPhotos.axios.post).toHaveBeenCalledTimes(1);
    });
});

describe(`Perform Operation`, () => {
    test.each([
        {
            _desc: `No records - PrimaryZone`,
            operation: `someOperation`,
            fields: {
                someField: {
                    value: `someValue`,
                },
            },
            records: [],
            zone: Zones.Primary,
            expectedOperation: {
                atomic: true,
                operations: [],
                zoneID: {ownerRecordName: Config.primaryZone.ownerName, zoneName: Config.primaryZone.zoneName, zoneType: Config.primaryZone.zoneType},
            },
        }, {
            _desc: `No records - SharedZone`,
            operation: `someOperation`,
            fields: {
                someField: {
                    value: `someValue`,
                },
            },
            records: [],
            zone: Zones.Shared,
            expectedOperation: {
                atomic: true,
                operations: [],
                zoneID: {ownerRecordName: Config.sharedZone.ownerName, zoneName: Config.sharedZone.zoneName, zoneType: Config.sharedZone.zoneType},
            },
        }, {
            _desc: `One record - PrimaryZone`,
            operation: `someOperation`,
            fields: {
                someField: {
                    value: `someValue`,
                },
            },
            records: [`recordA`],
            zone: Zones.Primary,
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
                zoneID: {ownerRecordName: Config.primaryZone.ownerName, zoneName: Config.primaryZone.zoneName, zoneType: Config.primaryZone.zoneType},
            },
        }, {
            _desc: `One record - SharedZone`,
            operation: `someOperation`,
            fields: {
                someField: {
                    value: `someValue`,
                },
            },
            records: [`recordA`],
            zone: Zones.Shared,
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
                zoneID: {ownerRecordName: Config.sharedZone.ownerName, zoneName: Config.sharedZone.zoneName, zoneType: Config.sharedZone.zoneType},
            },
        },
    ])(`Success $_desc`, async ({operation, fields, records, expectedOperation, zone}) => {
        const iCloudPhotos = iCloudPhotosFactory();

        const responseRecords = [`recordA`, `recordB`];
        iCloudPhotos.axios.post = jest.fn(() => Promise.resolve({
            data: {
                records: responseRecords,
            },
        } as any));

        const result = await iCloudPhotos.performOperation(zone, operation, fields, records);

        expect(iCloudPhotos.axios.post).toHaveBeenCalledWith(
            `https://p123-ckdatabasews.icloud.com:443/database/1/com.apple.photos.cloud/production/private/records/modify`,
            expectedOperation,
            {headers: `headerValues`, params: {remapEnums: `True`}},
        );
        expect(result).toEqual(responseRecords);
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

describe(`Fetch records`, () => {
    // Test invalid extension
});

describe(`Fetch albums`, () => {

});

describe(`Download asset`, () => {
    test.todo(`Success`);
    test.todo(`No download url`);
});

describe(`Delete asset`, () => {
    test.todo(`Success`);
});