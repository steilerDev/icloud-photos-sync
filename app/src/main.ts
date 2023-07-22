#!/usr/bin/env node
import {ErrorHandler} from "./app/event/error-handler.js";
import {CLIInterface} from "./app/event/cli.js";
import {appFactory} from "./app/factory.js";
import {MetricsExporter} from "./app/event/metrics-exporter.js";
import {registerObjectsToEventHandlers} from './app/event/event-handler.js';
import {ResourceManager} from "./lib/resource-manager/resource-manager.js";

// Creates the appropriate application
const app = appFactory(process.argv);

// Creates helper infrastructure on global level and linking to underlying app
const errorHandler = new ErrorHandler();
const cliInterface = new CLIInterface();
const metricsExporter = new MetricsExporter();

// Registering error handler to EventHandlers
registerObjectsToEventHandlers([cliInterface, metricsExporter], errorHandler);
registerObjectsToEventHandlers([errorHandler, cliInterface, metricsExporter], ResourceManager.instance);

// Executes app
try {
    await app.run(errorHandler, cliInterface, metricsExporter);
} catch (err) {
    await errorHandler.handle(err);
    process.exit(1);
}