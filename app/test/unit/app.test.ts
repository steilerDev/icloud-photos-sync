import {describe, test, afterEach, expect, jest} from '@jest/globals';

describe(`Unit Tests - iCloud App`, () => {
    describe(`App Factory`, () => {
        test.todo(`Reject missing mandatory options`)
        test.todo(`Create Token App`)
        test.todo(`Create Sync App`)
        test.todo(`Create Archive App`)
    })
    describe(`App control flow`, () => {
        test.todo(`Handle authentication error`)
        describe(`Token App`, () => {
            test.todo(`Execute token actions`)
            test.todo(`Handle trust token error`)
        })
        describe(`Sync App`, () => {
            test.todo(`Execute sync actions`)
            test.todo(`Handle sync error`)
        })
        describe(`Archive App`, () => {
            test.todo(`Execute archive actions`)
            test.todo(`Handle archive error`)
        })
    })
})