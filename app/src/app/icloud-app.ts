import {iCloud} from "../lib/icloud/icloud.js";
import {PhotosLibrary} from "../lib/photos-library/photos-library.js";
import * as Logger from '../lib/logger.js';
import * as fs from 'fs';
import {CLIInterface} from "../lib/cli.js";
import {OptionValues} from "commander";
import {ArchiveEngine} from "../lib/archive-engine/archive-engine.js";
import {SyncEngine} from "../lib/sync-engine/sync-engine.js";
import {ErrorHandler} from "./error-handler.js";

/**
 * This is the base application class which will setup and manage the iCloud connection and local Photos Library
 */
export abstract class iCloudApp {
    /**
     * The runtime options for this app
     */
    options: OptionValues;

    /**
     * This sessions' iCloud object
     */
    icloud: iCloud;

    /**
     * This sessions' CLI Interface object
     */
    cliInterface: CLIInterface;

    /**
     * Crash and error handling client
     */
    errorHandler: ErrorHandler;

    /**
     * Creates and sets up the necessary infrastructure
     * @param options - The parsed CLI options
     */
    constructor(options: OptionValues) {
        this.options = options;
        // Setting up infrastructure
        Logger.setupLogger(this);
        this.errorHandler = new ErrorHandler(this);

        // It's crucial for the data dir to exist, create if it doesn't
        if (!fs.existsSync(this.options.dataDir)) {
            fs.mkdirSync(this.options.dataDir, {"recursive": true});
        }

        // Creating necessary objects for this scope
        this.icloud = new iCloud(this);
        this.errorHandler.registerErrorEventHandler(this.icloud);
    }

    /**
     * This function establishes the iCloud connection.
     * @returns A promise that either resolves or the application is exited
     */
    async run(): Promise<any> {
        // Hocking up CLI Output
        this.cliInterface = new CLIInterface(this);
        return this.icloud.authenticate()
            .catch(err => this.errorHandler.fatalError(new Error(`Init failed`, {"cause": err})));
    }
}

/**
 * This application will print the locally stored token, acquire a new one (if necessary) and print it to the CLI
 */
export class TokenApp extends iCloudApp {
    /**
     * This function will validate the currently stored account token and print it afterwards
     */
    async run() {
        await super.run();
        try {
            this.icloud.auth.validateAccountTokens();
            this.cliInterface.print(`Validated trust token:`);
            this.cliInterface.print(this.icloud.auth.iCloudAccountTokens.trustToken);
        } catch (err) {
            await this.errorHandler.fatalError(new Error(`Getting validated trust token failed`, {"cause": err}));
        }
    }
}

/**
 * This application will perform a synchronisation of the provided Photos Library using the authenticated iCloud connection
 */
export class SyncApp extends iCloudApp {
    /**
     * This sessions' Photos Library object
     */
    photosLibrary: PhotosLibrary;

    /**
     * This sessions' Sync Engine object
     */
    syncEngine: SyncEngine;

    /**
     * Creates and sets up the necessary infrastructure for this app
     * @param options - The parsed CLI options
     */
    constructor(options: OptionValues) {
        super(options);
        this.photosLibrary = new PhotosLibrary(this);
        this.syncEngine = new SyncEngine(this);
        this.errorHandler.registerErrorEventHandler(this.syncEngine);
    }

    /**
     * Runs the syncronization of the local Photo Library
     * @returns A Promise that resolves to a tuple containing a list of assets as fetched from the remote state. It can be assumed that this reflects the local state (given a warning free execution of the sync). If the sync fails, the application will exit.
     */
    async run(): Promise<any> {
        return super.run()
            .then(() => this.syncEngine.sync())
            .catch(err => this.errorHandler.fatalError(new Error(`Sync failed`, {"cause": err})));
    }
}

/**
 * This application will first perform a synchronization and then archive a given local path
 */
export class ArchiveApp extends SyncApp {
    /**
     * This sessions' Archive Engine object
     */
    archiveEngine: ArchiveEngine;

    /**
     * The local path to be archived
     */
    archivePath: string;

    constructor(options: OptionValues, archivePath: string) {
        super(options);
        this.archivePath = archivePath;
        this.archiveEngine = new ArchiveEngine(this);
    }

    /**
     * This function will first perform a synchronisation run and then attempt to archive the provided path
     * @returns A promise that resolves or the application will exit
     */
    async run() {
        return super.run()
            .then(([remoteAssets]) => this.archiveEngine.archivePath(this.archivePath, remoteAssets))
            .catch(err => this.errorHandler.fatalError(new Error(`Archive failed`, {"cause": err})));
    }
}