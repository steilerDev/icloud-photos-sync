import {Resources} from "../../lib/resources/main.js";
import {
    iCPSEventCloud,
    iCPSEventMFA,
    iCPSEventRuntimeError,
    iCPSEventSyncEngine, iCPSEventWebServer
} from "../../lib/resources/events-types.js";

const phaseLabels = [`authentication`, `fetchAndLoad`, `diff`, `writeAssets`, `writeAlbums`] as const;

export class PrometheusMetricsExporter {
    private readonly metrics = {
     state : new PrometheusSimpleMetric(`sync_status`, `Current status of the sync engine.`, `gauge`, [`unknown` , `ok` , `authenticating` , `syncing` , `error`], `unknown`),
     durations : new PrometheusMultipleValueMetric<number>(`sync_durations_second`, `Duration of the last sync run in seconds, split by phases, each labeled with the phase name.`, `gauge`, `phase`, phaseLabels, 0),
     loadedLocalAlbums : new PrometheusSimpleMetric(`loaded_local_albums`, `Number of albums loaded from the local library during the last sync run.`, `gauge`, undefined, 0 as number),
     loadedLocalAssets : new PrometheusSimpleMetric(`loaded_local_assets`, `Number of assets loaded from the local library during the last sync run.`, `gauge`, undefined, 0 as number),
     loadedRemoteAlbums : new PrometheusSimpleMetric(`loaded_remote_albums`, `Number of albums loaded from the remote library during the last sync run.`, `gauge`, undefined, 0 as number),
     loadedRemoteAssets : new PrometheusSimpleMetric(`loaded_remote_assets`, `Number of assets loaded from the remote library during the last sync run.`, `gauge`, undefined, 0 as number),
     assetsToBeAdded : new PrometheusSimpleMetric(`assets_to_be_added`, `Number of assets that need to be added to the local library during the last sync run.`, `gauge`, undefined, 0 as number),
     assetsToBeDeleted : new PrometheusSimpleMetric(`assets_to_be_deleted`, `Number of assets that need to be deleted from the local library during the last sync run.`, `gauge`, undefined, 0 as number),
     assetsToBeKept : new PrometheusSimpleMetric(`assets_to_be_kept`, `Number of assets that need to be kept in the local library during the last sync run.`, `gauge`, undefined, 0 as number),
     albumsToBeAdded : new PrometheusSimpleMetric(`albums_to_be_added`, `Number of albums that need to be added to the local library during the last sync run.`, `gauge`, undefined, 0 as number),
     albumsToBeDeleted : new PrometheusSimpleMetric(`albums_to_be_deleted`, `Number of albums that need to be deleted from the local library during the last sync run.`, `gauge`, undefined, 0 as number),
     albumsToBeKept : new PrometheusSimpleMetric(`albums_to_be_kept`, `Number of albums that need to be kept in the local library during the last sync run.`, `gauge`, undefined, 0 as number),
    }

    private startTimes: Map<string, number> = new Map();

    constructor() {
        if (!Resources.manager().exportPrometheusMetrics) {
            return;
        }

        this.setupListeners();
    }

    private setupListeners() {
        Resources.events(this).on(iCPSEventSyncEngine.START, () => {
            this.resetMetrics();
            this.metrics.state.value = `syncing`;
        }).on(iCPSEventSyncEngine.DONE, () => {
            this.metrics.state.value = `ok`;
        }).on(iCPSEventRuntimeError.SCHEDULED_ERROR, () => {
            this.metrics.state.value = `error`;
            this.updateAllDurations();
        }).on(iCPSEventMFA.MFA_NOT_PROVIDED, () => {
            this.metrics.state.value = `error`;
            this.updateAllDurations();
        }).on(iCPSEventCloud.AUTHENTICATION_STARTED, () => {
            this.metrics.state.value = `authenticating`;
            this.setStartTime(`authentication`);
        }).on(iCPSEventCloud.AUTHENTICATED, () => {
            this.updateDuration(`authentication`);
        }).on(iCPSEventSyncEngine.FETCH_N_LOAD, () => {
            this.setStartTime(`fetchAndLoad`);
        }).on(iCPSEventSyncEngine.FETCH_N_LOAD_COMPLETED, (remoteAssetCount: number, remoteAlbumCount: number, localAssetCount: number, localAlbumCount: number) => {
            this.updateDuration(`fetchAndLoad`);
            this.metrics.loadedRemoteAssets.value = remoteAssetCount;
            this.metrics.loadedRemoteAlbums.value = remoteAlbumCount;
            this.metrics.loadedLocalAssets.value = localAssetCount;
            this.metrics.loadedLocalAlbums.value = localAlbumCount;
        }).on(iCPSEventSyncEngine.DIFF, () => {
            this.setStartTime(`diff`);
        }).on(iCPSEventSyncEngine.DIFF_COMPLETED, () => {
            this.updateDuration(`diff`);
        }).on(iCPSEventSyncEngine.WRITE_ASSETS, (toBeDeletedCount: number, toBeAddedCount: number, toBeKept: number) => {
            this.setStartTime(`writeAssets`);
            this.metrics.assetsToBeDeleted.value = toBeDeletedCount;
            this.metrics.assetsToBeAdded.value = toBeAddedCount;
            this.metrics.assetsToBeKept.value = toBeKept;
        }).on(iCPSEventSyncEngine.WRITE_ASSETS_COMPLETED, () => {
            this.updateDuration(`writeAssets`);
        }).on(iCPSEventSyncEngine.WRITE_ALBUMS, (toBeDeletedCount: number, toBeAddedCount: number, toBeKept: number) => {
            this.setStartTime(`writeAlbums`);
            this.metrics.albumsToBeDeleted.value = toBeDeletedCount;
            this.metrics.albumsToBeAdded.value = toBeAddedCount;
            this.metrics.albumsToBeKept.value = toBeKept;
        }).on(iCPSEventSyncEngine.WRITE_ALBUMS_COMPLETED, () => {
            this.updateDuration(`writeAlbums`);
        }).on(iCPSEventWebServer.REAUTH_REQUESTED, () => {
            Resources.events(this).removeListeners();

            Resources.events(this).on(iCPSEventCloud.AUTHENTICATED, () => {
                this.setupListeners();
            }).on(iCPSEventWebServer.REAUTH_ERROR, () => {
                this.setupListeners();
            });
        });
    }

    private setStartTime(phase: string) {
        this.startTimes.set(phase, Date.now());
    }

    private updateAllDurations() {
        for (const label of phaseLabels) {
            this.updateDuration(label);
        }
    }

    private updateDuration(phase: string) {
        const startTime = this.startTimes.get(phase);
        if (startTime) {
            const durationSeconds = (Date.now() - startTime) / 1000;
            this.metrics.durations.setValue(phase, durationSeconds);
            this.startTimes.delete(phase);
        }
    }

    public getMetrics() {
        return this.metrics
    }

    public resetMetrics() {
        for(const metricKey in this.metrics) {
            const metric = this.metrics[metricKey as keyof typeof this.metrics];
            if (metric instanceof PrometheusSimpleMetric) {
                metric.resetValue();
            } else if (metric instanceof PrometheusMultipleValueMetric) {
                metric.resetValues();
            }
        }
    }
}

export class PrometheusSimpleMetric<C extends string | number> {
    public value: C;
    constructor(
        public readonly name: string,
        public readonly description: string,
        public readonly type: `gauge` | `counter`,
        public readonly supportedValues: readonly C[] | undefined,
        public readonly initialValue: C
    ) { 
        this.value = initialValue;
    }

    public resetValue() {
        this.value = this.initialValue;
    }
}

export class PrometheusMultipleValueMetric<C extends string | number> {
    private values: Map<string, C> = new Map();

    constructor(
        public readonly name: string,
        public readonly description: string,
        public readonly type: `gauge` | `counter`,
        public readonly labelName: string,
        public readonly supportedLabelValues: readonly string[],
        public readonly initialValue: C
    ) {
        this.resetValues();
    }

    public resetValues() {
        for (const label of this.supportedLabelValues) {
            this.values.set(label, this.initialValue);
        }
    }

    public setValue(label: string, value: C) {
        this.values.set(label, value);
    }

    public getValues() {
        return this.values;
    }
}