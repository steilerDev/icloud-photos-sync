import {describe, test} from '@jest/globals';
describe(`Unit Tests - Sync Engine`, () => {
    describe(`Processing remote records`, () => {
        test.todo(`Converting assets`);
        test.todo(`Converting albums`);
    });

    describe(`Diffing state`, () => {
        test.todo(`Add items to empty state`);
        test.todo(`Only remove items from existing state`);
        test.todo(`Only add items to existing state`);
        test.todo(`Add & remove items from existing state`);
        test.todo(`No change in state`);
        describe(`Hierarchical dependencies`, () => {
            test.todo(`Album moved`);
            test.todo(`Folder with albums moved`);
            test.todo(`Folder with folders moved`);
            test.todo(`Folder with albums deleted, albums kept`);
            test.todo(`Folder with albums deleted, albums deleted`);
            test.todo(`Folder with folders deleted, nested folder kept`);
            test.todo(`Folder with folders deleted, nested folder deleted`);
        });
        describe(`Archive albums`, () => {
            test.todo(`Remote album (locally archived) deleted`);
            test.todo(`Remote album (locally archived) moved`);
            test.todo(`Remote album's content (locally archived) changed`);
        });
    });
});