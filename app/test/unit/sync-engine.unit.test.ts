import {describe, test, jest, expect} from '@jest/globals';
import { CPLAsset, CPLMaster } from '../../src/lib/icloud/icloud-photos/query-parser';
import {SyncEngine} from '../../src/lib/sync-engine/sync-engine'
import expectedAssetsAll from "../_data/api.expected.all-cpl-assets.json";
import expectedMastersAll from "../_data/api.expected.all-cpl-masters.json";
import {iCloud} from '../../src/lib/icloud/icloud'
import { PhotosLibrary } from '../../src/lib/photos-library/photos-library';
const photosDataDir = `/media/files/photos-library`;

function syncEngineFactory(): SyncEngine {
    return new SyncEngine(
        {
            downloadThreads: 1,
            maxRetry: -1
        },
        new iCloud({
            username: "steilerdev@web.de", 
            password: "some-pass", 
            trustToken: "token", 
            dataDir: photosDataDir
        }),
        new PhotosLibrary({
            "dataDir": photosDataDir,
        }),
    )
}

describe(`Unit Tests - Sync Engine`, () => {
    describe(`Processing remote records`, () => {
        describe(`Converting assets`, () => {
            test.only(`Valid list`, () => {
                const cplAssets = expectedAssetsAll as CPLAsset[]
                const cplMasters = expectedMastersAll.map(pseudoMaster => {
                    pseudoMaster.resource["downloadURL"] = "https:/icloud.com"
                    return pseudoMaster
                }) as unknown as CPLMaster[]
                const assets = SyncEngine.convertCPLAssets(cplAssets, cplMasters)
                debugger
                expect(assets.length).toEqual(206) // 202 + 4 edits
            })
        })
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

    describe(`Handle processing queue`, () => {
        test.todo(`Empty processing queue`);
        test.todo(`Only deleting`);
        test.todo(`Only adding`);
        test.todo(`Adding & deleting`);
    });
});