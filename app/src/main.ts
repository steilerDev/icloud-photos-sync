#!/usr/bin/env node
import {appFactory} from "./app/factory.js";

import * as bt from 'backtrace-node';

// Creates and runs the appropriate application
await appFactory(process.argv).run();