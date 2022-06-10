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
import {PhotosLibraryDB} from './lib/db/photos-library-db.js';
const photosLibraryDB = new PhotosLibraryDB(opts.app_data_dir);
photosLibraryDB.open();

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
await photosLibraryDB.getReadyPromise();
await icloud.getReadyPromise();

import {SyncEngine} from './lib/sync/sync-engine.js';

const syncEngine = new SyncEngine(icloud, photosLibraryDB);
await syncEngine.sync();