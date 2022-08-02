#!/usr/bin/env node
import * as Logger from './lib/logger.js';
import {iCloud} from './lib/icloud/icloud.js';
import {PhotosLibrary} from './lib/photos-library/photos-library.js';
import {CLIInterface} from './lib/cli.js';
import {SyncEngine} from './lib/sync-engine/sync-engine.js';
import * as fs from 'fs';

// Read CLI Options
const cliOpts = CLIInterface.getCLIOptions();

// It's crucial for the data dir to exist, create if it doesn't 
if(!fs.existsSync(cliOpts.data_dir)) {
    fs.mkdirSync(cliOpts.data_dir, {recursive: true})
}

// Creating components of the application
Logger.setupLogger(cliOpts);
const icloud = new iCloud(cliOpts);
const photosLibrary = new PhotosLibrary(cliOpts);
const syncEngine: SyncEngine = new SyncEngine(icloud, photosLibrary, cliOpts);

// Setting up CLI Interface
CLIInterface.createCLIInterface(icloud, syncEngine);

/**
 * Waiting for setup to complete
 */
await icloud.authenticate()
    .catch(err => CLIInterface.fatalError(`Init failed: ${err}`));
/**
 * Starting sync
 */
await syncEngine.sync()
    .catch(err => CLIInterface.fatalError(`Sync failed: ${err}`));