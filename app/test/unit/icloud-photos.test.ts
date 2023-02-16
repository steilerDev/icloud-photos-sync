import {describe, test} from '@jest/globals';

describe(`Unit Tests - iCloud Photos`, () => {
    describe(`Setup iCloud Photos`, () => {
        test.todo(`Setup successful`);
        test.todo(`Response validation fails`);
        test.todo(`Network failure`);

        describe(`Check indexing state`, () => {
            test.todo(`Indexing finished`);
            test.todo(`Indexing in progress`);
            test.todo(`Unknown status`);
            test.todo(`Network failure`);
        });
    });

    describe(`Perform Query`, () => {
        test.todo(`Without any content`);
        describe(`With recordName`, () => {
            test.todo(`Success`);
            test.todo(`No data returned`);
            test.todo(`Network failure`);
        });
        describe(`With recordName + filter`, () => {
            test.todo(`Success`);
            test.todo(`No data returned`);
            test.todo(`Network failure`);
        });
        describe(`With recordName + filter + desiredKeys`, () => {
            test.todo(`Success`);
            test.todo(`No data returned`);
            test.todo(`Network failure`);
        });
        describe(`With recordName + filter + desiredKeys + results limit`, () => {
            test.todo(`Success`);
            test.todo(`No data returned`);
            test.todo(`Network failure`);
        });
    });

    describe(`Perform Operation`, () => {
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
});