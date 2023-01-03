#!/usr/bin/env node
import {ErrorHandler} from "./app/error/handler.js";
import {CLIInterface} from "./app/event/cli.js";
import {appFactory} from "./app/factory.js";
import * as Logger from './lib/logger.js';

// Creates the appropriate application
const app = appFactory(process.argv);

// Creates helper infrastructure on global level and linking to underlying app
Logger.setupLogger(app.options);

const errorHandler = new ErrorHandler(app.options);
app.needWarningHandler.forEach(obj => errorHandler.registerWarningHandlerForObject(obj));

const cliInterface = new CLIInterface(app.options, errorHandler);
app.needEventHandler.forEach(obj => cliInterface.registerEventHandlerForObject(obj));

// Executes app
try {
    await app.run();
} catch (err) {
    await errorHandler.handle(err);
}