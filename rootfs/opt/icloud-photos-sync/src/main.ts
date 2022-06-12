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

let syncEngine: SyncEngine;
Promise.all([icloud.getReadyPromise(), photosLibrary.getReadyPromise()])
    .then(() => {
        syncEngine = new SyncEngine(icloud, photosLibrary);
        return syncEngine.fetchState();
    })
    // .then(() => {
    //    return SyncEngine.diffState();
    // })
    .catch(err => {
        console.error(`Init failed: ${err.message}`);
        exit(1);
    });