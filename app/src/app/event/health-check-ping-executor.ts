import {iCPSState} from "../../lib/resources/events-types.js";
import {HttpClient, isHttpError} from "../../lib/resources/http-client.js";
import {Resources} from "../../lib/resources/main.js";
import {FILE_ENCODING} from "../../lib/resources/resource-types.js";
import {LogInterface} from "./log.js";
import {LogLevel, SerializedState, StateType} from "../../lib/resources/state-manager.js";

export class HealthCheckPingExecutor {

    /**
     * The network interface used for pinging - only set (and used), if a health check URL is configured
     */
    networkInterface!: HttpClient;

    public constructor() {
        if (!Resources.manager().healthCheckUrl) {
            return;
        }

        // Neither header jar nor network capture, the health check endpoint is not related to iCloud
        this.networkInterface = new HttpClient({baseURL: Resources.manager().healthCheckUrl});

        Resources.events(this).on(iCPSState.STATE_CHANGED, async (state: SerializedState) => {
            if(state.state === StateType.READY && state.prevTrigger) {
                if(state.prevError) {
                    await this.pingError()
                    return
                } else {
                    await this.pingSuccess()
                    return
                }
            }
            if(state.state === StateType.RUNNING && state.progressMsg?.startsWith(`Starting`) && state.progress === 0) {
                await this.pingStart()
                return
            }
        })
    }

    private async pingStart(): Promise<void> {
        try {
            await this.networkInterface.post(`/start`, undefined, Resources.validator().response.healthCheckPing);
            Resources.logger(this).debug(`Successfully sent start health check ping.`);
        } catch (err) {
            if(isHttpError(err)) {
                Resources.logger(this).error(`Failed to send start health check ping: ${err.message}, got response: ${JSON.stringify(err.response?.data)}`);
            } else {
                Resources.logger(this).error(`Failed to send start health check ping: ${err}`);
            }
        }
    }

    private async pingSuccess(): Promise<void> {
        try {
            await this.networkInterface.post(``, this.getLog(), Resources.validator().response.healthCheckPing);
            Resources.logger(this).debug(`Successfully sent success health check ping.`);
        } catch (err) {
            if(isHttpError(err)) {
                Resources.logger(this).error(`Failed to send success health check ping: ${err.message}, got response: ${JSON.stringify(err.response?.data)}`);
            } else {
                Resources.logger(this).error(`Failed to send success health check ping: ${err}`);
            }
        }
    }

    private async pingError(): Promise<void> {
        try {
            await this.networkInterface.post(`/fail`, this.getLog(), Resources.validator().response.healthCheckPing);
            Resources.logger(this).debug(`Successfully sent error health check ping.`);
        } catch (err) {
            if(isHttpError(err)) {
                Resources.logger(this).error(`Failed to send error health check ping: ${err.message}, got response: ${JSON.stringify(err.response?.data)}`);
            } else {
                Resources.logger(this).error(`Failed to send error health check ping: ${err}`);
            }
        }
    }

    getLog(): string {
        const logs = Resources.state().serializeLog({level: LogLevel.DEBUG}).map(LogInterface.logToString).join(``)
        return Buffer
            .from(logs)
            .subarray(-102400)
            .toString(FILE_ENCODING)
    }
}