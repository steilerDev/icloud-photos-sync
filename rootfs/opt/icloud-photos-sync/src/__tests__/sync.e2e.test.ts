describe(`Synchronization E2E tests`, () => {
    describe(`Fresh synchronization scenario`, () => {
        test.todo(`Mock SyncEngine, in order to run full sync scenario`);
        test.todo(`Mock iCloud-Photos object to provide data / mock download`);
        test.todo(`Measure calls to logger.warn / logger.error`);
        test.todo(`Handle re-authentication`);
    });
    describe(`Existing local state`, () => {
        test.todo(`Loading state from disk`);

        describe(`Asset changed`, () => {
            test.todo(`Added asset`);
            test.todo(`Removed asset`);
        });

        describe(`Structure change`, () => {
            test.todo(`Album added`);
            test.todo(`Album removed`);
            test.todo(`Album moved`);
            test.todo(`Folder deleted - Albums deleted`);
            test.todo(`Folder deleted - Album moved`);
            test.todo(`Folder deleted - Sub-folder deleted`);
            test.todo(`Folder deleted - Subfolder moved`);
            test.todo(`Folder moved - Albums stayed`);
            test.todo(`Archived albums`);
        });
    });
});