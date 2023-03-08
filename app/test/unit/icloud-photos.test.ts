import {describe, test, expect, jest} from '@jest/globals';
import {iCloudPhotosFactory} from '../_helpers/icloud.helper';
import {AxiosRequestConfig} from 'axios';
import * as Config from '../_helpers/_config';
import * as ICLOUD_PHOTOS from '../../src/lib/icloud/icloud-photos/constants';
import {spyOnEvent} from '../_helpers/_general';

test(`PhotosDomain not available`, () => {
    const iCloudPhotos = iCloudPhotosFactory();
    iCloudPhotos.auth.iCloudPhotosAccount.photosDomain = ``;

    expect(() => iCloudPhotos.getServiceEndpoint(`someExt`)).toThrowError(new Error(`Unable to get service endpoint: Photos Domain not defined`));
});

describe(`Setup iCloud Photos`, () => {
    test(`Setup successful`, async () => {
        const iCloudPhotos = iCloudPhotosFactory();

        iCloudPhotos.ready = Promise.resolve();
        const axiosResponse = `Success`;
        const setupCompleteEvent = spyOnEvent(iCloudPhotos, ICLOUD_PHOTOS.EVENTS.SETUP_COMPLETE);
        iCloudPhotos.auth.processPhotosSetupResponse = jest.fn();
        iCloudPhotos.axios.get = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve(axiosResponse));

        await iCloudPhotos.setup();

        expect(iCloudPhotos.axios.get).toHaveBeenCalledWith(
            `https://p123-ckdatabasews.icloud.com:443/database/1/com.apple.photos.cloud/production/private/zones/list`,
            {
                "headers": `headerValues`,
                "params": {
                    "getCurrentSyncToken": `True`,
                    "remapEnums": `True`,
                },
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

        iCloudPhotos.axios.get = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.resolve(axiosResponse));

        await expect(iCloudPhotos.setup()).rejects.toThrowError(new Error(`Unexpected error while setting up iCloud Photos`));

        expect(iCloudPhotos.axios.get).toHaveBeenCalledWith(
            `https://p123-ckdatabasews.icloud.com:443/database/1/com.apple.photos.cloud/production/private/zones/list`,
            {
                "headers": `headerValues`,
                "params": {
                    "getCurrentSyncToken": `True`,
                    "remapEnums": `True`,
                },
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

        iCloudPhotos.axios.get = jest.fn((_url: string, _data?: any, _config?: AxiosRequestConfig<any>): Promise<any> => Promise.reject(new Error(`Network Error`)));

        await expect(iCloudPhotos.setup()).rejects.toThrowError(new Error(`Unexpected error while setting up iCloud Photos`));

        expect(iCloudPhotos.axios.get).toHaveBeenCalledWith(
            `https://p123-ckdatabasews.icloud.com:443/database/1/com.apple.photos.cloud/production/private/zones/list`,
            {
                "headers": `headerValues`,
                "params": {
                    "getCurrentSyncToken": `True`,
                    "remapEnums": `True`,
                },
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

    describe(`Check indexing state`, () => {
        test(`Indexing finished`, async () => {
            const iCloudPhotos = iCloudPhotosFactory();
            const readyEvent = spyOnEvent(iCloudPhotos, ICLOUD_PHOTOS.EVENTS.READY);
            const errorEvent = spyOnEvent(iCloudPhotos, ICLOUD_PHOTOS.EVENTS.ERROR);

            iCloudPhotos.performQuery = jest.fn(() => Promise.resolve([{
                "fields": {
                    "state": {
                        "value": `FINISHED`,
                    },
                },
            }]));

            await iCloudPhotos.checkingIndexingStatus();

            expect(iCloudPhotos.performQuery).toHaveBeenCalledWith(`CheckIndexingState`);
            expect(readyEvent).toHaveBeenCalledTimes(1);
            expect(errorEvent).not.toHaveBeenCalled();
        });

        test(`Indexing in progress with progress`, async () => {
            const iCloudPhotos = iCloudPhotosFactory();
            const readyEvent = spyOnEvent(iCloudPhotos, ICLOUD_PHOTOS.EVENTS.READY);
            const errorEvent = spyOnEvent(iCloudPhotos, ICLOUD_PHOTOS.EVENTS.ERROR);

            iCloudPhotos.performQuery = jest.fn(() => Promise.resolve([{
                "fields": {
                    "state": {
                        "value": `RUNNING`,
                    },
                    "progress": {
                        "value": 20,
                    },
                },
            }]));

            await iCloudPhotos.checkingIndexingStatus();

            expect(iCloudPhotos.performQuery).toHaveBeenCalledWith(`CheckIndexingState`);
            expect(readyEvent).not.toHaveBeenCalled();
            expect(errorEvent).toHaveBeenCalledWith(new Error(`Indexing in progress, try again later`));
        });

        test(`Indexing in progress without progress`, async () => {
            const iCloudPhotos = iCloudPhotosFactory();
            const readyEvent = spyOnEvent(iCloudPhotos, ICLOUD_PHOTOS.EVENTS.READY);
            const errorEvent = spyOnEvent(iCloudPhotos, ICLOUD_PHOTOS.EVENTS.ERROR);

            iCloudPhotos.performQuery = jest.fn(() => Promise.resolve([{
                "fields": {
                    "state": {
                        "value": `RUNNING`,
                    },
                },
            }]));

            await iCloudPhotos.checkingIndexingStatus();

            expect(iCloudPhotos.performQuery).toHaveBeenCalledWith(`CheckIndexingState`);
            expect(readyEvent).not.toHaveBeenCalled();
            expect(errorEvent).toHaveBeenCalledWith(new Error(`Indexing in progress, try again later`));
        });

        test(`Unknown status`, async () => {
            const iCloudPhotos = iCloudPhotosFactory();
            const readyEvent = spyOnEvent(iCloudPhotos, ICLOUD_PHOTOS.EVENTS.READY);
            const errorEvent = spyOnEvent(iCloudPhotos, ICLOUD_PHOTOS.EVENTS.ERROR);

            iCloudPhotos.performQuery = jest.fn(() => Promise.resolve([{
                "fields": {
                    "state": {
                        "value": `UNKNOWN_STATE`,
                    },
                },
            }]));

            await iCloudPhotos.checkingIndexingStatus();

            expect(iCloudPhotos.performQuery).toHaveBeenCalledWith(`CheckIndexingState`);
            expect(readyEvent).not.toHaveBeenCalled();
            expect(errorEvent).toHaveBeenCalledWith(new Error(`Unknown indexing state`));
        });

        test.each([
            [[]],
            [[{}]],
            [[{"fields": {}}]],
            [[{"fields": {"state": {}}}]],
        ])(`Empty query - %o`, async queryResult => {
            const iCloudPhotos = iCloudPhotosFactory();
            const readyEvent = spyOnEvent(iCloudPhotos, ICLOUD_PHOTOS.EVENTS.READY);
            const errorEvent = spyOnEvent(iCloudPhotos, ICLOUD_PHOTOS.EVENTS.ERROR);

            iCloudPhotos.performQuery = jest.fn(() => Promise.resolve(queryResult));

            await iCloudPhotos.checkingIndexingStatus();

            expect(iCloudPhotos.performQuery).toHaveBeenCalledWith(`CheckIndexingState`);
            expect(readyEvent).not.toHaveBeenCalled();
            expect(errorEvent).toHaveBeenCalledWith(new Error(`Unable to get indexing state`));
        });

        test(`Query failure`, async () => {
            const iCloudPhotos = iCloudPhotosFactory();
            const readyEvent = spyOnEvent(iCloudPhotos, ICLOUD_PHOTOS.EVENTS.READY);
            const errorEvent = spyOnEvent(iCloudPhotos, ICLOUD_PHOTOS.EVENTS.ERROR);

            iCloudPhotos.performQuery = jest.fn(() => Promise.reject());

            await iCloudPhotos.checkingIndexingStatus();

            expect(iCloudPhotos.performQuery).toHaveBeenCalledWith(`CheckIndexingState`);
            expect(readyEvent).not.toHaveBeenCalled();
            expect(errorEvent).toHaveBeenCalledWith(new Error(`Unable to get indexing state`));
        });
    });
});

describe.each([
    {
        "_desc": `recordType + filterBy + resultsLimit + desiredKeys`,
        "recordType": `recordType`,
        "filterBy": [{
            "fieldName": `someField`,
            "comparator": `EQUALS`,
            "fieldValue": {
                "value": `someValue`,
                "type": `STRING`,
            },
        }],
        "resultsLimit": 2,
        "desiredKeys": [`key1, key2`],
        "expectedQuery": {
            "desiredKeys": [`key1, key2`],
            "query": {
                "filterBy": [
                    {"comparator": `EQUALS`, "fieldName": `someField`, "fieldValue": {"type": `STRING`, "value": `someValue`}},
                ],
                "recordType": `recordType`,
            },
            "resultsLimit": 2,
            "zoneID": {"ownerRecordName": Config.iCloudPhotosAccount.ownerName, "zoneName": Config.iCloudPhotosAccount.zoneName, "zoneType": Config.iCloudPhotosAccount.zoneType},
        },
    }, {
        "_desc": `recordType + filterBy + resultsLimit`,
        "recordType": `recordType`,
        "filterBy": [{
            "fieldName": `someField`,
            "comparator": `EQUALS`,
            "fieldValue": {
                "value": `someValue`,
                "type": `STRING`,
            },
        }],
        "resultsLimit": 2,
        "desiredKeys": undefined,
        "expectedQuery": {
            "query": {
                "filterBy": [
                    {"comparator": `EQUALS`, "fieldName": `someField`, "fieldValue": {"type": `STRING`, "value": `someValue`}},
                ],
                "recordType": `recordType`,
            },
            "resultsLimit": 2,
            "zoneID": {"ownerRecordName": Config.iCloudPhotosAccount.ownerName, "zoneName": Config.iCloudPhotosAccount.zoneName, "zoneType": Config.iCloudPhotosAccount.zoneType},
        },
    }, {
        "_desc": `recordType + filterBy`,
        "recordType": `recordType`,
        "filterBy": [{
            "fieldName": `someField`,
            "comparator": `EQUALS`,
            "fieldValue": {
                "value": `someValue`,
                "type": `STRING`,
            },
        }],
        "resultsLimit": undefined,
        "desiredKeys": undefined,
        "expectedQuery": {
            "query": {
                "filterBy": [
                    {"comparator": `EQUALS`, "fieldName": `someField`, "fieldValue": {"type": `STRING`, "value": `someValue`}},
                ],
                "recordType": `recordType`,
            },
            "zoneID": {"ownerRecordName": Config.iCloudPhotosAccount.ownerName, "zoneName": Config.iCloudPhotosAccount.zoneName, "zoneType": Config.iCloudPhotosAccount.zoneType},
        },
    }, {
        "_desc": `recordType`,
        "recordType": `recordType`,
        "filterBy": undefined,
        "resultsLimit": undefined,
        "desiredKeys": undefined,
        "expectedQuery": {
            "query": {
                "recordType": `recordType`,
            },
            "zoneID": {"ownerRecordName": Config.iCloudPhotosAccount.ownerName, "zoneName": Config.iCloudPhotosAccount.zoneName, "zoneType": Config.iCloudPhotosAccount.zoneType},
        },
    },
])(`Perform Query $_desc`, ({_desc, recordType, filterBy, resultsLimit, desiredKeys, expectedQuery}) => {
    test(`Success`, async () => {
        const iCloudPhotos = iCloudPhotosFactory();
        const responseRecords = [`recordA`, `recordB`];
        iCloudPhotos.axios.post = jest.fn(() => Promise.resolve({
            "data": {
                "records": responseRecords,
            },
        } as any));

        const result = await iCloudPhotos.performQuery(recordType, filterBy, resultsLimit, desiredKeys);

        expect(iCloudPhotos.axios.post).toHaveBeenCalledWith(
            `https://p123-ckdatabasews.icloud.com:443/database/1/com.apple.photos.cloud/production/private/records/query`,
            expectedQuery,
            {"headers": `headerValues`, "params": {"remapEnums": `True`}},
        );
        expect(result).toEqual(responseRecords);
    });

    test(`No data returned`, async () => {
        const iCloudPhotos = iCloudPhotosFactory();
        iCloudPhotos.axios.post = jest.fn(() => Promise.resolve({
            "data": {},
        } as any));

        await expect(iCloudPhotos.performQuery(recordType, filterBy, resultsLimit, desiredKeys)).rejects.toThrowError(new Error(`Received unexpected query response format`));

        expect(iCloudPhotos.axios.post).toHaveBeenCalledTimes(1);
    });
});

describe(`Perform Operation`, () => {

    test.only.each([
        {
            _desc: "No records",
            operation: 'someOperation',
            fields: {
                "someField": {
                    value: "someValue"
                },
            },
            records: [],
            expectedOperation: {
                "atomic": true,
                "operations": [],
                "zoneID": {"ownerRecordName": Config.iCloudPhotosAccount.ownerName, "zoneName": Config.iCloudPhotosAccount.zoneName, "zoneType": Config.iCloudPhotosAccount.zoneType},
            }
        }, {
            _desc: "One record",
            operation: 'someOperation',
            fields: {
                "someField": {
                    value: "someValue"
                },
            },
            records: ['recordA'],
            expectedOperation:{
                "atomic": true,
                "operations": [{
                    "operationType": `someOperation`,
                    "record": {
                        "recordName": `recordA`,
                        "recordType": `CPLAsset`,
                        "recordChangeTag": '21h2',
                        "fields": {
                            "someField": {
                                "value": "someValue"
                            },
                        }
                    },
                }],
                "zoneID": {"ownerRecordName": Config.iCloudPhotosAccount.ownerName, "zoneName": Config.iCloudPhotosAccount.zoneName, "zoneType": Config.iCloudPhotosAccount.zoneType},
            }
        }
    ])('Success $_desc', async ({operation, fields, records, expectedOperation}) => {
        const iCloudPhotos = iCloudPhotosFactory();

        const responseRecords = [`recordA`, `recordB`];
        iCloudPhotos.axios.post = jest.fn(() => Promise.resolve({
            "data": {
                "records": responseRecords,
            },
        } as any));

        const result = await iCloudPhotos.performOperation(operation, fields, records)

        expect(iCloudPhotos.axios.post).toHaveBeenCalledWith(
            `https://p123-ckdatabasews.icloud.com:443/database/1/com.apple.photos.cloud/production/private/records/modify`,
            expectedOperation,
            {"headers": `headerValues`, "params": {"remapEnums": `True`}},
        );
        expect(result).toEqual(responseRecords);
    })

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