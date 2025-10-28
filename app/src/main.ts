#!/usr/bin/env node
import {CLIInterface} from "./app/event/cli.js";
import {ErrorHandler} from "./app/event/error-handler.js";
import {HealthCheckPingExecutor} from "./app/event/health-check-ping-executor.js";
import {LogInterface} from "./app/event/log.js";
import {MetricsExporter} from "./app/event/metrics-exporter.js";
import {appFactory} from "./app/factory.js";
import {WebServer} from "./app/web-ui/web-server.js";
import {Resources} from "./lib/resources/main.js";

let exitCode = 0

const app = await appFactory(process.argv)
    .catch(() => process.exit(3)); // Error message is printed by factory

const errorHandler = new ErrorHandler();

try {
    const _apps = [
        new LogInterface(),
        new CLIInterface(),
        new MetricsExporter(),
        new HealthCheckPingExecutor(),
        await WebServer.spawn()
    ]
    await app.run();
} catch (err) {
    await errorHandler.handleError(err);
    exitCode = 1
} finally {
    await Resources.state().releaseLibraryLock()
    process.exit(exitCode)
}