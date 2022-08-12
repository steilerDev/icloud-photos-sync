describe(`API E2E Tests`, () => {
    const username = process.env.APPLE_ID_USER;
    const password = process.env.APPLE_ID_PWD;
    const token = process.env.TRUST_TOKEN;

    test.todo(`Only run if trust token is available and valid`);
    test.todo(`Setup test icloud account`);
    test.todo(`Keep iCloud Account in state and check if calls continue to work as expected`);
    test.todo(`We need the remote assets + folder state`);
    console.log('test')

    if (token) {
        describe(`Login flow`, () => {
            test.todo(`Login flow without token`);
            test.todo(`Login flow with token`);
        });
        describe(`Fetching records`, () => {
            test.todo(`Fetch all records`);
            test.todo(`Fetch records of one album`);
        });
        describe(`Fetching albums`, () => {
            test.todo(`Fetch one album`);
            test.todo(`Fetch all albums`);
        });
        describe(`Deleting records`, () => {
            test.todo(`Delete a record - How to restore state afterwards??`);
        });
    }
});