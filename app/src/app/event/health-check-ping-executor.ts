import { iCPSEventRuntimeError, iCPSEventSyncEngine } from "../../lib/resources/events-types.js";
import { Resources } from "../../lib/resources/main.js";
import { LogInterface } from "./log.js";

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
            Resources.logger(this).info(`Successfully sent start health check ping.`);
        } catch (e) {
            Resources.logger(this).error(`Failed to send start health check ping: ${e}`);
        }
    }

    private async pingSuccess(): Promise<void> {
        try {
            await this.getLog().then(log => this.networkInterface.post(`/success`, log));
            Resources.logger(this).info(`Successfully sent success health check ping.`);
        } catch (e) {
            Resources.logger(this).error(`Failed to send success health check ping: ${e}`);
        }
    }

    private async pingError(_err: Error): Promise<void> {
        try {
            await this.getLog().then(log => this.networkInterface.post(`/fail`, log));
            Resources.logger(this).info(`Successfully sent error health check ping.`);
        } catch (e) {
            Resources.logger(this).error(`Failed to send error health check ping: ${e}`);
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