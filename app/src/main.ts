#!/usr/bin/env node
import {CLIInterface} from "./app/event/cli.js";
import {ErrorHandler} from "./app/event/error-handler.js";
import {HealthCheckPingExecutor} from "./app/event/health-check-ping-executor.js";
import {LogInterface} from "./app/event/log.js";
import {MetricsExporter} from "./app/event/metrics-exporter.js";
import {appFactory} from "./app/factory.js";
import {WebServer} from "./app/web-ui/web-server.js";

const app = await appFactory(process.argv)
    .catch(() => process.exit(3)); // Error message is printed by factory

const _errorHandler = new ErrorHandler();
const _logInterface = new LogInterface();
const _cliInterface = new CLIInterface();
const _metricsExporter = new MetricsExporter();
const _healthCheckPingExecutor = new HealthCheckPingExecutor();
const _webServer = await WebServer.spawn();

try {
    await app.run();
} catch (err) {
    await _errorHandler.handleError(err);
    process.exit(1);
}