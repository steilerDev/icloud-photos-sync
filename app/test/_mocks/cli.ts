import {jest} from '@jest/globals';
import {ErrorHandler} from '../../src/app/event/error-handler';
import {ArchiveEngine} from '../../src/lib/archive-engine/archive-engine';
import {iCloud} from '../../src/lib/icloud/icloud';
import {SyncEngine} from '../../src/lib/sync-engine/sync-engine';

export class CLIInterface {
    printFatalError: (arg0: string) => void = jest.fn((_arg0: string) => {});
    print: (arg0: string) => void = jest.fn((_arg0: string) => {});
    setupCLIiCloudInterface: (arg0: iCloud) => void = jest.fn((_arg0: iCloud) => {});
    setupCLISyncEngineInterface: (arg0: SyncEngine) => void = jest.fn((_arg0: SyncEngine) => {});
    setupCLIArchiveEngineInterface: (arg0: ArchiveEngine) => void = jest.fn((_arg0: ArchiveEngine) => {});
    setupCLIErrorHandlerInterface : (arg0: ErrorHandler) => void = jest.fn((_arg0: ErrorHandler) => {});
}