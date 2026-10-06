import {afterEach, beforeEach, describe, expect, test} from '@jest/globals';
import {CLIInterface} from '../../src/app/event/cli';
import {prepareResources} from '../_helpers/_general';

let cliInterface: CLIInterface;
let originalColumns: PropertyDescriptor | undefined;

beforeEach(() => {
    const instances = prepareResources()!;
    instances.manager._resources.silent = true;
    cliInterface = new CLIInterface();
    originalColumns = Object.getOwnPropertyDescriptor(process.stdout, `columns`);
});

afterEach(() => {
    if (originalColumns) {
        Object.defineProperty(process.stdout, `columns`, originalColumns);
    } else {
        delete (process.stdout as any).columns;
    }
});

describe(`Horizontal line`, () => {
    test.each([{
        desc: `the reported terminal width`,
        columns: 120,
        expectedLength: 120,
    }, {
        desc: `the default width if the terminal reports 0 columns`,
        columns: 0,
        expectedLength: 80,
    }, {
        desc: `the default width if the terminal reports no columns`,
        columns: undefined,
        expectedLength: 80,
    }])(`Uses $desc`, ({columns, expectedLength}) => {
        Object.defineProperty(process.stdout, `columns`, {value: columns, configurable: true, writable: true});

        expect(cliInterface.getHorizontalLine()).toEqual(`-`.repeat(expectedLength));
    });
});
