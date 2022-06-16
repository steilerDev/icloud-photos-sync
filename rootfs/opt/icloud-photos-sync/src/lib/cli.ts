import {Command, Option, OptionValues} from 'commander';
import chalk from 'chalk';
import {PACKAGE_INFO} from './package.js';
import {iCloud} from './icloud/icloud.js';
import * as ICLOUD from './icloud/icloud.constants.js';
import * as SYNC_ENGINE from './sync/sync-engine.constants.js';
import * as PHOTOS_LIBRARY from './photos-library/photos-library.constants.js';
import {SyncEngine} from './sync/sync-engine.js';
import {SingleBar} from 'cli-progress';
import {PhotosLibrary} from './photos-library/photos-library.js';
import {exit} from 'process';

export class CLIInterface {
    progressBar: SingleBar;
    static instance: CLIInterface;

    constructor(iCloud: iCloud, photosLibrary: PhotosLibrary, syncEngine: SyncEngine) {
        this.progressBar = new SingleBar({});
        this.setupCLIiCloudInterface(iCloud);
        this.setupCLIPhotosLibraryInterface(photosLibrary);
        this.setupCLISyncEngineInterface(syncEngine);

        console.log(chalk.white.bold(`Welcome to ${PACKAGE_INFO.name}, v.${PACKAGE_INFO.version}!`));
        console.log(chalk.green(`Made with <3 by steilerDev`));
        console.log();
    }

    /**
     * Initiates the CLI interface and connects it to the relevant components
     * @param iCloud - The iCloud object
     * @param photosLibrary - The Photos Library object
     * @param syncEngine - The Sync Engine object
     */
    static createCLIInterface(iCloud: iCloud, photosLibrary: PhotosLibrary, syncEngine: SyncEngine) {
        if (!this.instance) {
            this.instance = new CLIInterface(iCloud, photosLibrary, syncEngine);
        }
    }

    /**
     * Processing CLI arguments
     * @returns The parsed values from the commandline/environment variables
     */
    static getCLIOptions(): OptionValues {
        const program = new Command();
        program.name(PACKAGE_INFO.name)
            .description(PACKAGE_INFO.description)
            .version(PACKAGE_INFO.version)
            .addOption(new Option(`-a, --app_data_dir <string>`, `Directory to store application data relevant information (e.g. trust tokens and state database)`)
                .env(`APP_DATA_DIR`)
                .default(`/opt/icloud-photos-sync/app-data`))
            .addOption(new Option(`-d, --photo_data_dir <string>`, `Directory to store local copy of library`)
                .env(`PHOTO_DATA_DIR`)
                .default(`/opt/icloud-photos-library`))
            .addOption(new Option(`-p, --port <number>`, `port number for MFA server (Awaiting MFA code when necessary)`)
                .env(`PORT`)
                .default(8080))
            .addOption(new Option(`-l, --log_level <level>`, `Set the log level`)
                .env(`LOG_LEVEL`)
                .choices([`trace`, `debug`, `info`, `warn`, `error`])
                .default(`debug`))
            .addOption(new Option(`--log_to_cli`, `Disables logging to file and logs to the console`)
                .env(`LOG_TO_CLI`)
                .default(false))
            .addOption(new Option(`-u, --username <email>`, `AppleID username`)
                .env(`APPLE_ID_USER`)
                .makeOptionMandatory(true))
            .addOption(new Option(`-p, --password <email>`, `AppleID password`)
                .env(`APPLE_ID_PWD`)
                .makeOptionMandatory(true))
            .addOption(new Option(`-t, --download_threads <number>`, `Sets the number of download threads`)
                .env(`DOWNLOAD_THREADS`));
        program.parse();
        return program.opts();
    }

    static fatalError(err: string) {
        console.log(chalk.red(`Experienced Fatal Error: ${err}`));
        exit(1);
    }

    /**
     * Listen to iCloud events and provide CLI output
     */
    setupCLIiCloudInterface(iCloud: iCloud) {
        iCloud.on(ICLOUD.EVENTS.AUTHENTICATED, () => {
            console.log(chalk.white(`User authenticated`));
        });

        iCloud.on(ICLOUD.EVENTS.MFA_REQUIRED, () => {
            console.log(chalk.yellowBright(`MFA code required`));
        });

        iCloud.on(ICLOUD.EVENTS.MFA_RECEIVED, () => {
            console.log(chalk.white(`MFA code received`));
        });

        iCloud.on(ICLOUD.EVENTS.TRUSTED, () => {
            console.log(chalk.whiteBright(`Device trusted`));
        });

        iCloud.on(ICLOUD.EVENTS.ACCOUNT_READY, () => {
            console.log(chalk.whiteBright(`Sign in successful`));
        });

        iCloud.on(ICLOUD.EVENTS.READY, () => {
            console.log(chalk.green(`iCloud connection established!`));
        });

        iCloud.on(ICLOUD.EVENTS.ERROR, (msg: string) => {
            console.log(chalk.red(`Unexpected error: ${msg}`));
        });
    }

    setupCLISyncEngineInterface(syncEngine: SyncEngine) {
        syncEngine.on(SYNC_ENGINE.EVENTS.FETCH, () => {
            console.log(chalk.white(`Fetching remote iCloud Library state`));
        });
        syncEngine.on(SYNC_ENGINE.EVENTS.DIFF, () => {
            console.log(chalk.white(`Diffing remote with local state`));
        });
        syncEngine.on(SYNC_ENGINE.EVENTS.DOWNLOAD, totalValue => {
            console.log(chalk.cyan(`Downloading records`));
            this.progressBar.start(totalValue, 0);
        });
        // SyncEngine.on(SYNC_ENGINE.EVENTS.RECORD_STARTED, (recordName) => {
        //
        // })
        syncEngine.on(SYNC_ENGINE.EVENTS.RECORD_COMPLETED, recordName => {
            this.progressBar.increment(1, recordName);
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.ERROR, msg => {
            console.log(chalk.red(`Unexpected error: ${msg}`));
        });
    }

    setupCLIPhotosLibraryInterface(photosLibrary: PhotosLibrary) {
        photosLibrary.on(PHOTOS_LIBRARY.EVENTS.READY, () => {
            console.log(chalk.green(`Database loaded`));
        });
        photosLibrary.on(PHOTOS_LIBRARY.EVENTS.SAVED, () => {
            console.log(chalk.green(`Database saved`));
        });
        photosLibrary.on(SYNC_ENGINE.EVENTS.ERROR, msg => {
            console.log(chalk.red(`Unexpected error: ${msg}`));
        });
    }
}