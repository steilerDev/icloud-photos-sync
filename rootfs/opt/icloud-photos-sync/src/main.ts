#!/usr/bin/env node

/**
 * CLI Setup
 */
import {Command, Option} from 'commander';
import {PACKAGE_INFO} from './lib/package.js';

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
const options = program.opts();

/**
 * Logger Setup
 */
import log from 'loglevel';
import prefix from 'loglevel-plugin-prefix';
import chalk from 'chalk';

const colors = {
    TRACE: chalk.magenta,
    DEBUG: chalk.cyan,
    INFO: chalk.blue,
    WARN: chalk.yellow,
    ERROR: chalk.red,
};

prefix.reg(log);
log.setLevel(options.log_level);
prefix.apply(log, {
    format(level, name, timestamp) {
        return `${chalk.gray(`[${timestamp}]`)} ${colors[level.toUpperCase()](level)} ${chalk.green(`${name}:`)}`;
    },
});

/**
 * Getting Started
 */

import {Test} from './lib/test.js';
const test = new Test();
test.printSth();