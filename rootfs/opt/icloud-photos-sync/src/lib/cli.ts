import {Command, Option, OptionValues} from 'commander';
import chalk from 'chalk';
import {PACKAGE_INFO} from './package.js';

export function setupCLI(): OptionValues {
    console.log(chalk.white.bold(`Welcome to ${PACKAGE_INFO.name}, v.${PACKAGE_INFO.version}!`));
    console.log(chalk.green(`Made with <3 by steilerDev`));
    console.log();

    const program = new Command();
    program.name(PACKAGE_INFO.name)
        .description(PACKAGE_INFO.description)
        .version(PACKAGE_INFO.version)
        .addOption(new Option(`-p, --port <number>`, `port number`)
            .env(`PORT`)
            .default(8080))
        .addOption(new Option(`-l, --log_level <level>`, `Set the log level`)
            .env(`LOG_LEVEL`)
            .choices([`trace`, `debug`, `info`, `warn`, `error`])
            .default(`info`));
    program.parse();
    return program.opts();
}