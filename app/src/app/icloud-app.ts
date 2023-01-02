import {iCloud} from "../lib/icloud/icloud.js";
import {PhotosLibrary} from "../lib/photos-library/photos-library.js";
import * as Logger from '../lib/logger.js';
import * as fs from 'fs';
import {CLIInterface} from "../lib/cli.js";
import {OptionValues} from "commander";
import {ArchiveEngine} from "../lib/archive-engine/archive-engine.js";
import {SyncEngine} from "../lib/sync-engine/sync-engine.js";
import {ErrorHandler} from "./error/handler.js";
import {ArchiveError, iCloudError, SyncError, TokenError} from "./error/types.js";
import {Asset} from "../lib/photos-library/model/asset.js";
import {Album} from "../lib/photos-library/model/album.js";

export interface iCPSApp {
    run(): Promise<unknown>
}

/**
 * This is the base application class which will setup and manage the iCloud connection and local Photos Library
 */
export abstract class iCloudApp implements iCPSApp {
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
        this.errorHandler = new ErrorHandler(this);
        Logger.setupLogger(this);

        // Hocking up CLI Output
        this.cliInterface = new CLIInterface(this);

        // It's crucial for the data dir to exist, create if it doesn't
        if (!fs.existsSync(this.options.dataDir)) {
            fs.mkdirSync(this.options.dataDir, {"recursive": true});
        }

        // Creating necessary objects for this scope
        this.icloud = new iCloud(this);
        this.errorHandler.registerHandlerForObject(this.icloud);
        this.errorHandler.registerHandlerForObject(this.icloud.mfaServer);
        this.cliInterface.setupCLIiCloudInterface(this.icloud);

        this.cliInterface.setupCLIErrorHandlerInterface(this.errorHandler);
    }

    /**
     * This function establishes the iCloud connection.
     * @returns A promise that either resolves or the application is exited
     */
    async run(): Promise<unknown> {
        try {
            return await this.icloud.authenticate();
        } catch (err) {
            this.errorHandler.handle(new iCloudError(`Init failed`, `FATAL`).addCause(err));
        }
    }
}

/**
 * This application will print the locally stored token, acquire a new one (if necessary) and print it to the CLI
 */
export class TokenApp extends iCloudApp {
    /**
     * This function will validate the currently stored account token and print it afterwards
     * @returns A promise that either resolves or the application is exited
     */
    async run(): Promise<unknown> {
        await super.run();
        try {
            this.icloud.auth.validateAccountTokens();
            this.cliInterface.print(`Validated trust token:`);
            return this.cliInterface.print(this.icloud.auth.iCloudAccountTokens.trustToken);
        } catch (err) {
            await this.errorHandler.handle(new TokenError(`Unable to validate account token`, `FATAL`).addCause(err));
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
        this.errorHandler.registerHandlerForObject(this.photosLibrary);
        this.syncEngine = new SyncEngine(this);
        this.errorHandler.registerHandlerForObject(this.syncEngine);
        this.cliInterface.setupCLISyncEngineInterface(this.syncEngine);
    }

    /**
     * Runs the syncronization of the local Photo Library
     * @returns A Promise that resolves to a tuple containing a list of assets as fetched from the remote state. It can be assumed that this reflects the local state (given a warning free execution of the sync). If the sync fails, the application will exit.
     */
    async run(): Promise<unknown> {
        await super.run();
        try {
            return await this.syncEngine.sync();
        } catch (err) {
            this.errorHandler.handle(new SyncError(`Sync failed`, `FATAL`).addCause(err));
        }
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

    /**
     * Creates and sets up the necessary infrastructure for this app
     * @param options - The parsed CLI options
     * @param archivePath - The path to the folder that should get archived
     */
    constructor(options: OptionValues, archivePath: string) {
        super(options);
        this.archivePath = archivePath;
        this.archiveEngine = new ArchiveEngine(this);
        this.errorHandler.registerHandlerForObject(this.archiveEngine);
        this.cliInterface.setupCLIArchiveEngineInterface(this.archiveEngine);
    }

    /**
     * This function will first perform a synchronisation run and then attempt to archive the provided path
     * @returns A promise that resolves or the application will exit
     */
    async run(): Promise<unknown> {
        try {
            const [remoteAssets] = await super.run() as [Asset[], Album[]];
            return await this.archiveEngine.archivePath(this.archivePath, remoteAssets);
        } catch (err) {
            this.errorHandler.handle(new ArchiveError(`Archive failed`, `FATAL`).addCause(err).addContext(`archivePath`, this.archivePath));
        }
    }
}