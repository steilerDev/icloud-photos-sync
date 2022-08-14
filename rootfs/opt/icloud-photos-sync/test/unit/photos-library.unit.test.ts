import {describe, test} from '@jest/globals';
describe(`Unit Tests - Photos Library`, () => {
    test.todo(`Create necessary folder, if they don't exist`);
    test.todo(`Use existing folders, if they exist`);
    describe(`Load state`, () => {
        test.todo(`Load empty state`);
        test.todo(`Load valid state - no archives`);
        test.todo(`Load valid state - with archives`);
        test.todo(`Handle invalid state`);
        describe(`Album type detection`, () => {
            test.todo(`Identify album type`);
            test.todo(`Identify folder type`);
            test.todo(`Identify archived type`);
        });
    });
    describe(`Write state`, () => {
        test.todo(`Succesfully verify asset`);
        test.todo(`Reject unverifiable asset`);
        test.todo(`Write asset`);
        test.todo(`Delete asset`);
    });
    describe(`Handle processing queue`, () => {
        test.todo(`Empty processing queue`);
        test.todo(`Only deleting`);
        test.todo(`Only adding`);
        test.todo(`Adding & deleting`);
    });
});