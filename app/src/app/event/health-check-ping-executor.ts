import axios, { Axios, AxiosInstance } from "axios";
import { iCPSEventRuntimeError, iCPSEventSyncEngine } from "../../lib/resources/events-types.js";
import { Resources } from "../../lib/resources/main.js";
import { FILE_ENCODING } from "../../lib/resources/resource-types.js";
import { LogInterface } from "./log.js";
import { promises as fs } from 'fs';
import { hasSubscribers } from "diagnostics_channel";

export class HealthCheckPingExecutor {
    private networkInterface: AxiosInstance;
    public constructor() {
        if (!Resources.manager().healthCheckUrl) {
            return;
        }

        this.networkInterface = axios.create({baseURL: Resources.manager().healthCheckUrl});

        Resources.events(this).on(iCPSEventSyncEngine.START, this.pingStart.bind(this));
        Resources.events(this).on(iCPSEventSyncEngine.DONE, this.pingSuccess.bind(this));
        Resources.events(this).on(iCPSEventRuntimeError.HANDLED_ERROR, this.pingError.bind(this));
    }

    private async pingStart(): Promise<void> {
        try {
            await this.networkInterface.post(`/start`);
            Resources.logger(this).debug(`Successfully sent start health check ping.`);
        } catch (err) {
            Resources.logger(this).error(`Failed to send start health check ping: ${err}`);
        }
    }

    private async pingSuccess(): Promise<void> {
        try {
            await this.getLog().then(log => this.networkInterface.post(`/success`, log));
            Resources.logger(this).debug(`Successfully sent success health check ping.`);
        } catch (err) {
            Resources.logger(this).error(`Failed to send success health check ping: ${err}`);
        }
    }

    private async pingError(_err: Error): Promise<void> {
        try {
            await this.getLog().then(log => this.networkInterface.post(`/fail`, log));
            Resources.logger(this).debug(`Successfully sent error health check ping.`);
        } catch (err) {
            Resources.logger(this).error(`Failed to send error health check ping: ${err}`);
        }
    }

    private async getLog(): Promise<string> {
        const filePath = Resources.manager().logFilePath;
        if (!filePath) {
            return `no log available`;
        }

        return fs.readFile(filePath)
            .then(data => data.subarray(-1000000).toString(FILE_ENCODING))
    }
}