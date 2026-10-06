#!/usr/bin/env node
import {CommanderError} from "commander";
import {iCPSError} from "./app/error/error.js";
import {CLIInterface} from "./app/event/cli.js";
import {ErrorHandler} from "./app/event/error-handler.js";
import {HealthCheckPingExecutor} from "./app/event/health-check-ping-executor.js";
import {LogInterface} from "./app/event/log.js";
import {MetricsExporter} from "./app/event/metrics-exporter.js";
import {appFactory} from "./app/factory.js";
import {WebServer} from "./app/web-ui/web-server.js";
import {Resources} from "./lib/resources/main.js";

const app = await appFactory(process.argv)
    .catch(err => {
        if (err instanceof CommanderError) { // Commander prints its own output - help and version exit with code 0
            process.exit(err.exitCode === 0 ? 0 : 3);
        }
        console.error(iCPSError.toiCPSError(err).getDescription());
        process.exit(3);
    });

process.on(`exit`, () => {
    Resources.state().releaseLibraryLock()
})

const errorHandler = new ErrorHandler();

try {
    const _eventApps = [
        new LogInterface(),
        new CLIInterface(),
        new MetricsExporter(),
        new HealthCheckPingExecutor(),
        await WebServer.spawn(),
    ]
    await app.run();
} catch (err) {
    await errorHandler.handleError(err);
    process.exitCode = 1
}