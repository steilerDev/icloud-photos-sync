#!/usr/bin/env node
import {ErrorHandler} from "./app/event/error-handler.js";
import {CLIInterface} from "./app/event/cli.js";
import {appFactory} from "./app/factory.js";
import {MetricsExporter} from "./app/event/metrics-exporter.js";
import {LogInterface} from "./app/event/log.js";
import {iCPSApp} from "./app/icloud-app.js";

// Creates the appropriate application and initiates the ResourceManager
let app: iCPSApp;
try {
    app = await appFactory(process.argv);
} catch (_err) {
    // AppFactory will print appropriate error messages
    process.exit(3);
}

// Creates helper infrastructure on global level, which will subscribe to the global event bus provided by the ResourceManager
const _errorHandler = new ErrorHandler();
const _logInterface = new LogInterface();
const _cliInterface = new CLIInterface();
const _metricsExporter = new MetricsExporter();

// Executes app
try {
    await app.run();
    process.exit(0);
} catch (err) {
    await _errorHandler.handleError(err);
    process.exit(1);
}