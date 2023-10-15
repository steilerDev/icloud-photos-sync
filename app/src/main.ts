#!/usr/bin/env node
import {ErrorHandler} from "./app/event/error-handler.js";
import {CLIInterface} from "./app/event/cli.js";
import {appFactory} from "./app/factory.js";
import {MetricsExporter} from "./app/event/metrics-exporter.js";
import {LogInterface} from "./app/event/log.js";

const app = await appFactory(process.argv)
    .catch(() => process.exit(3)); // Error message is printed by factory

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