#!/usr/bin/env node

/**
 * CLI Setup
 */
import {setupCLI} from './lib/cli.js';
const opts = setupCLI();

/**
 * Logger Setup
 */
import {setupLogger} from './lib/logger.js';
setupLogger(opts.log_level);

/**
 * Getting Started
 */

import {iCloud} from './lib/icloud.js';
const icloud = new iCloud();
icloud.doStuff();