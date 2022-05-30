#!/usr/bin/env node

/**
 * CLI Setup
 */
import {setupCLI, setupCLIiCloudInterface} from './lib/cli.js';
const opts = setupCLI();

/**
 * Logger Setup
 */
import {setupLogger} from './lib/logger.js';
setupLogger(opts.log_level);

/**
 * Getting Started
 */

import {iCloud} from './lib/icloud/icloud.js';
import * as ICLOUD from './lib/icloud/icloud.constants.js';
const icloud = iCloud.getInstance(opts.username, opts.password, opts.port);

setupCLIiCloudInterface(icloud);
icloud.on(ICLOUD.EVENTS.READY, () => {
    // Get sync going!
});
icloud.authenticate();