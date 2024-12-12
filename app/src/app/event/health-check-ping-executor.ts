import {iCPSEventRuntimeError, iCPSEventSyncEngine} from "../../lib/resources/events-types.js";
import {Resources} from "../../lib/resources/main.js";
import {LogInterface} from "./log.js";

export class HealthCheckPingExecutor {
    private healthCheckPingUrl: string;
    public constructor(
        private logInterface: LogInterface,
    ) {
        this.healthCheckPingUrl = Resources.manager().healthCheckPingUrl;

        if (!this.healthCheckPingUrl) {
            return;
        }

        Resources.events(this).on(iCPSEventSyncEngine.START, this.pingStart.bind(this));
        Resources.events(this).on(iCPSEventSyncEngine.DONE, this.pingSuccess.bind(this));
        Resources.events(this).on(iCPSEventRuntimeError.HANDLED_ERROR, this.pingError.bind(this));
    }

    private async pingStart(): Promise<void> {
        try {
            await Resources.network().post(this.healthCheckPingUrl + `/start`);
            Resources.logger(this).info(`Successfully sent start health check ping.`);
        } catch (e) {
            Resources.logger(this).error(`Failed to send start health check ping: ${e}`);
        }
    }

    private async pingSuccess(): Promise<void> {
        try {
            await Resources.network().post(this.healthCheckPingUrl, this.getLog());
            Resources.logger(this).info(`Successfully sent success health check ping.`);
        } catch (e) {
            Resources.logger(this).error(`Failed to send success health check ping: ${e}`);
        }
    }

    private async pingError(_err: Error): Promise<void> {
        try {
            await Resources.network().post(this.healthCheckPingUrl + `/fail`, this.getLog());
            Resources.logger(this).info(`Successfully sent error health check ping.`);
        } catch (e) {
            Resources.logger(this).error(`Failed to send error health check ping: ${e}`);
        }
    }

    private getLog(): String {
        // Get roughly the 100KB by getting the last 100 characters
        // may be too large due to some characters taking up more than one byte
        const last100Chars = this
            .logInterface
            .getLog()
            .slice(-100000);

        // Actually get the last 100KB by encoding the last 100 characters
        const bytes = new TextEncoder().encode(last100Chars);
        return new TextDecoder().decode(bytes.slice(-100000));
    }
}