#!/usr/bin/env node
import * as Logger from './lib/logger.js';
import {iCloud} from './lib/icloud/icloud.js';
import {PhotosLibrary} from './lib/photos-library/photos-library.js';
import {CLIInterface} from './lib/cli.js';
import {SyncEngine} from './lib/sync/sync-engine.js';

// Read CLI Options
const cliOpts = CLIInterface.getCLIOptions();

// Creating components of the application
Logger.setupLogger(cliOpts);
const icloud = new iCloud(cliOpts);
const photosLibrary = new PhotosLibrary(cliOpts);
const syncEngine: SyncEngine = new SyncEngine(icloud, photosLibrary, cliOpts);

// Setting up CLI Interface
CLIInterface.createCLIInterface(icloud, photosLibrary, syncEngine);

/**
 * Waiting for setup to complete
 */
await Promise.all([icloud.authenticate(), photosLibrary.load()])
    .catch(err => CLIInterface.fatalError(`Init failed: ${err}`));
/**
 * Starting sync
 */
await syncEngine.sync()
    .catch(err => CLIInterface.fatalError(`Sync failed: ${err}`));