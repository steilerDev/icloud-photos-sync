import {Command, Option, OptionValues} from 'commander';
import chalk from 'chalk';
import {PACKAGE_INFO} from './package.js';
import {iCloud} from './icloud/icloud.js';
import * as ICLOUD from './icloud/icloud.constants.js';

/**
 * Processing CLI arguments
 * @returns The parsed values from the commandline/environment variables
 */
export function setupCLI(): OptionValues {
    console.log(chalk.white.bold(`Welcome to ${PACKAGE_INFO.name}, v.${PACKAGE_INFO.version}!`));
    console.log(chalk.green(`Made with <3 by steilerDev`));
    console.log();

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
        .addOption(new Option(`-u, --username <email>`, `AppleID username`)
            .env(`APPLE_ID_USER`)
            .makeOptionMandatory(true))
        .addOption(new Option(`-p, --password <email>`, `AppleID password`)
            .env(`APPLE_ID_PWD`)
            .makeOptionMandatory(true));
    program.parse();
    return program.opts();
}

/**
 * Listen to iCloud events and provide CLI output
 */
export function setupCLIiCloudInterface(iCloud: iCloud) {
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