import {describe, expect, test} from '@jest/globals';

describe(`API E2E Tests`, () => {
    const username = process.env.APPLE_ID_USER;
    expect(username).not.toBeUndefined();
    const password = process.env.APPLE_ID_PWD;
    expect(password).not.toBeUndefined();
    const token = process.env.TRUST_TOKEN;
    expect(token).not.toBeUndefined();

    test.todo(`Only run if trust token is available and valid`);
    test.todo(`Setup test icloud account`);
    test.todo(`Keep iCloud Account in state and check if calls continue to work as expected`);
    test.todo(`We need the remote assets + folder state`);
    console.log(`Loaded user: ${username.split("@")[0]}@[...]${username.slice(-2)}, token: ${token.slice(0, 4)}[...]${token.slice(-4)}`);

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