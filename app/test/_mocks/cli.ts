import {jest} from '@jest/globals';

export class CLIInterface {
    printFatalError: (arg0: string) => void = jest.fn((_arg0: string) => {});
    print: (arg0: string) => void = jest.fn((_arg0: string) => {});
}