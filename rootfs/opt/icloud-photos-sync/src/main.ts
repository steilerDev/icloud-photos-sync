#!/usr/bin/env node
import * as Logger from './lib/logger.js';
import {iCloud} from './lib/icloud/icloud.js';
import {PhotosLibrary} from './lib/photos-library/photos-library.js';
import {CLIInterface, CLIInterfaceCommand} from './lib/cli.js';
import {SyncEngine} from './lib/sync-engine/sync-engine.js';
import * as fs from 'fs';
import {ArchiveEngine} from './lib/archive-engine/archive-engine.js';

// Read CLI Options
const [cliOpts, cliCommand] = CLIInterface.getCLIOptions();

// It's crucial for the data dir to exist, create if it doesn't
if (!fs.existsSync(cliOpts.dataDir)) {
    fs.mkdirSync(cliOpts.dataDir, {recursive: true});
}

// Creating components of the application
Logger.setupLogger(cliOpts);
const icloud = new iCloud(cliOpts);
const photosLibrary = new PhotosLibrary(cliOpts);
const syncEngine: SyncEngine = new SyncEngine(cliOpts, icloud, photosLibrary);
// Setting up CLI Interface
const cliInterface = new CLIInterface(cliOpts, icloud, syncEngine);

/**
 * Waiting for setup to complete
 */
await icloud.authenticate()
    .catch(err => cliInterface.fatalError(`Init failed: ${err}`));

// Sync will happen archive and sync
if (cliCommand[0] === CLIInterfaceCommand.archive || cliCommand[0] === CLIInterfaceCommand.sync) {
    try {
        const [remoteAssets, remoteAlbums] = await syncEngine.sync();
        // If we are in archive mode, proceed with operation
        if (cliCommand[0] === CLIInterfaceCommand.archive) {
            const archiveEngine = new ArchiveEngine(cliOpts, photosLibrary, icloud);
            cliInterface.setupCLIArchiveEngineInterface(archiveEngine);
            await archiveEngine.archivePath(cliCommand[1], remoteAssets);
        }
    } catch (err) {
        cliInterface.fatalError(`Sync failed: ${err}`);
    }
}