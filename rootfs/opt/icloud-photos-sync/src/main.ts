#!/usr/bin/env node

/**
 * CLI Setup
 */
import {setupCLI, setupCLIiCloudInterface} from './lib/cli.js';
const opts = setupCLI();

/**
 * Logger Setup
 */
import {setupLogger} from './lib/logger.js';
setupLogger(opts.log_level);

/**
 * Database setup
 */
import {PhotosLibrary} from './lib/photos-library/photos-library.js';
const photosLibrary = new PhotosLibrary(opts.app_data_dir);
photosLibrary.load();

/**
 * ICloud connection
 */
import {iCloud} from './lib/icloud/icloud.js';
const icloud = iCloud.getInstance(opts);
setupCLIiCloudInterface(icloud);
icloud.authenticate();

/**
 * Waiting for setup to complete
 */
import {SyncEngine} from './lib/sync/sync-engine.js';
import {exit} from 'process';

await Promise.all([icloud.getReadyPromise(), photosLibrary.getReadyPromise()])
    .catch(err => {
        console.error(`Init failed: ${err.message}`);
        exit(1);
    });
const syncEngine: SyncEngine = new SyncEngine(icloud, photosLibrary, opts.photo_data_dir);
await syncEngine.sync();
// .then(() => {
//    return SyncEngine.diffState();
// })