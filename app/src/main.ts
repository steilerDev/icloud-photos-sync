#!/usr/bin/env node
import {ErrorHandler} from "./app/event/error-handler.js";
import {CLIInterface} from "./app/event/cli.js";
import {appFactory} from "./app/factory.js";
import {MetricsExporter} from "./app/event/metrics-exporter.js";
import {registerObjectsToEventHandlers} from './app/event/event-handler.js';

// Creates the appropriate application
const app = appFactory(process.argv);

// Creates helper infrastructure on global level and linking to underlying app
const errorHandler = new ErrorHandler(app.options);
const cliInterface = new CLIInterface(app.options);
const metricsExporter = new MetricsExporter(app.options);

// Registering error handler to EventHandlers
registerObjectsToEventHandlers([cliInterface, metricsExporter], errorHandler);

// Executes app
try {
    await app.run(errorHandler, cliInterface, metricsExporter);
} catch (err) {
    await errorHandler.handle(err);
    process.exit(1);
}