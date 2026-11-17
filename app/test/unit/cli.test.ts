import {afterEach, beforeEach, describe, expect, jest, test} from '@jest/globals';
import {iCPSEventApp} from '../../src/lib/resources/events-types';
import {Resources} from '../../src/lib/resources/main';
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

describe(`Next run`, () => {
    test(`Formats the date of the next run`, () => {
        const next = new Date(1000);

        expect(cliInterface.getNextRun(next)).toEqual(cliInterface.getDateTime(next));
    });

    test.each([{
        desc: `scheduled`,
        event: iCPSEventApp.SCHEDULED,
    }, {
        desc: `scheduled done`,
        event: iCPSEventApp.SCHEDULED_DONE,
    }, {
        desc: `scheduled retry`,
        event: iCPSEventApp.SCHEDULED_RETRY,
    }, {
        desc: `scheduled overrun`,
        event: iCPSEventApp.SCHEDULED_OVERRUN,
    }])(`Handles the $desc event, if the schedule has no upcoming run`, ({event}) => {
        // The listeners are only registered, if the CLI is not silent
        Resources.manager()._resources.silent = false;
        jest.spyOn(console, `clear`).mockImplementation(() => {});
        jest.spyOn(console, `log`).mockImplementation(() => {});
        const verboseCliInterface = new CLIInterface();
        verboseCliInterface.print = jest.fn<typeof verboseCliInterface.print>();

        Resources.emit(event, undefined);
        jest.restoreAllMocks();

        expect(verboseCliInterface.print).toHaveBeenCalledWith(expect.stringContaining(`the schedule has no upcoming run`));
    });
});
