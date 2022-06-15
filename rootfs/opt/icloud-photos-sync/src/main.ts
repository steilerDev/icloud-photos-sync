#!/usr/bin/env node
import {setupLogger} from './lib/logger.js';
import {iCloud} from './lib/icloud/icloud.js';
import {PhotosLibrary} from './lib/photos-library/photos-library.js';
import {CLIInterface} from './lib/cli.js';
import {SyncEngine} from './lib/sync/sync-engine.js';
import {exit} from 'process';

const opts = CLIInterface.getCLIOptions();
setupLogger(opts.log_level);

// Creating components of the application
const icloud = iCloud.getInstance(opts);
const photosLibrary = new PhotosLibrary(opts.app_data_dir);
const syncEngine: SyncEngine = new SyncEngine(icloud, photosLibrary, opts);

const cliInterface = new CLIInterface(icloud, photosLibrary, syncEngine);

photosLibrary.load();
icloud.authenticate();

/**
 * Waiting for setup to complete
 */
await Promise.all([icloud.getReadyPromise(), photosLibrary.getReadyPromise()])
    .catch(err => {
        console.error(`Init failed: ${err.message}`);
        exit(1);
    });
/**
 * Starting sync
 */
await syncEngine.sync();
// .then(() => {
//    return SyncEngine.diffState();
// })