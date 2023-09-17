#!/usr/bin/env node
import {ErrorHandler} from "./app/event/error-handler.js";
import {CLIInterface} from "./app/event/cli.js";
import {appFactory} from "./app/factory.js";
import {MetricsExporter} from "./app/event/metrics-exporter.js";
import {LogInterface} from "./app/event/log.js";
import {iCPSApp} from "./app/icloud-app.js";

let app: iCPSApp;
try {
    app = await appFactory(process.argv);
} catch (_err) {
    // AppFactory will print appropriate error messages
    process.exit(3);
}

const _errorHandler = new ErrorHandler();
const _logInterface = new LogInterface();
const _cliInterface = new CLIInterface();
const _metricsExporter = new MetricsExporter();

try {
    await app.run();
} catch (err) {
    await _errorHandler.handleError(err);
    process.exit(1);
}