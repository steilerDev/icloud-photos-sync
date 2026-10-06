import {iCPSEventCloud, iCPSEventRuntimeError, iCPSEventRuntimeWarning, iCPSEventSyncEngine} from "../../lib/resources/events-types.js";
import {Resources} from "../../lib/resources/main.js";
import {StateType} from "../../lib/resources/state-manager.js";

/**
 * The prefix applied to all exposed metric names
 */
const METRIC_PREFIX = `icps`;

/**
 * The timed phases of a sync run
 */
const SYNC_PHASES = [`authentication`, `fetchAndLoad`, `diff`, `writeAssets`, `writeAlbums`] as const;

/**
 * A timed phase of a sync run
 */
export type SyncPhase = typeof SYNC_PHASES[number];

/**
 * The exposition formats supported by this exporter
 * @see https://prometheus.io/docs/instrumenting/content_negotiation/
 */
export enum ExpositionFormat {
    /**
     * Prometheus text format 0.0.4 - the mandatory fallback
     */
    PROMETHEUS_TEXT_0_0_4 = `PrometheusText0.0.4`,
    /**
     * Prometheus text format 1.0.0 - identical body to 0.0.4, since all names are legacy compliant, but requires the escaping parameter
     */
    PROMETHEUS_TEXT_1_0_0 = `PrometheusText1.0.0`,
    /**
     * OpenMetrics 1.0.0
     */
    OPEN_METRICS_TEXT_1_0_0 = `OpenMetricsText1.0.0`,
}

/**
 * The escaping schemes a scraper might request for UTF-8 metric and label names
 */
const ESCAPING_SCHEMES = [`allow-utf-8`, `underscores`, `dots`, `values`];

/**
 * The escaping scheme announced, if none (or an unknown one) was requested. All names produced by this exporter are legacy compliant, so the output is identical under every scheme.
 */
const DEFAULT_ESCAPING_SCHEME = `underscores`;

/**
 * The result of the content negotiation
 */
export type NegotiatedFormat = {
    /**
     * The format to produce
     */
    format: ExpositionFormat,
    /**
     * The escaping scheme to announce - only set for formats version 1.0.0 and above
     */
    escaping?: string
}

/**
 * A rendered exposition
 */
export type Exposition = {
    /**
     * The value of the Content-Type header
     */
    contentType: string,
    /**
     * The response body
     */
    body: string
}

/**
 * A single sample of a metric family
 */
type MetricSample = {
    /**
     * The sample's labels (names need to be legacy compliant)
     */
    labels?: Record<string, string>,
    /**
     * The sample's value
     */
    value: number
}

/**
 * A metric family, following the OpenMetrics data model
 */
type MetricFamily = {
    /**
     * The family name - for counters without the `_total` suffix, for info metrics without the `_info` suffix
     */
    name: string,
    /**
     * The OpenMetrics type - stateset and info are exposed as gauge in the Prometheus text format
     */
    type: `gauge` | `counter` | `stateset` | `info`,
    /**
     * The unit of the family, the family name needs to end with it
     */
    unit?: `seconds`,
    /**
     * The help text
     */
    help: string,
    /**
     * The samples of this family
     */
    samples: MetricSample[]
}

/**
 * This class keeps track of sync metrics and renders them in a Prometheus compatible format, to be served through the web server's /metrics endpoint
 */
export class PrometheusMetricsExporter {
    /**
     * The time this exporter started counting, in seconds since epoch - used as the created timestamp of all counters
     */
    _createdTimestamp: number = Date.now() / 1000;

    /**
     * The start timestamp (ms since epoch) of currently running phases
     */
    _phaseStart: Map<SyncPhase, number> = new Map();

    /**
     * The duration (in seconds) of the last completed run of each phase
     */
    _phaseDuration: Map<SyncPhase, number> = new Map();

    /**
     * The library counts of the last sync run - only set once the respective sync phase was reached
     */
    _lastRun: {
        loadedRemoteAssets?: number,
        loadedRemoteAlbums?: number,
        loadedLocalAssets?: number,
        loadedLocalAlbums?: number,
        assetsToBeDeleted?: number,
        assetsToBeAdded?: number,
        assetsToBeKept?: number,
        albumsToBeDeleted?: number,
        albumsToBeAdded?: number,
        albumsToBeKept?: number,
    } = {};

    /**
     * The time of the last successful sync, in seconds since epoch
     */
    _lastSyncSuccess?: number;

    /**
     * Number of finished sync runs by result
     */
    _syncRuns = {
        success: 0,
        failure: 0
    };

    /**
     * Number of sync retries
     */
    _syncRetries = 0;

    /**
     * Number of assets written to disk
     */
    _assetsWritten = 0;

    /**
     * Number of runtime warnings by type - initialized for all known types
     */
    _warnings: Map<string, number> = new Map(Object.values(iCPSEventRuntimeWarning).map(warning => [PrometheusMetricsExporter.warningType(warning), 0]));

    /**
     * Creates the exporter and registers the event listeners, if the prometheus metrics export is enabled
     */
    constructor() {
        if (!Resources.manager().exportPrometheusMetrics) {
            return;
        }

        Resources.events(this)
            .on(iCPSEventCloud.AUTHENTICATION_STARTED, () => this.startPhase(`authentication`))
            .on(iCPSEventCloud.ACCOUNT_READY, () => this.completePhase(`authentication`))
            .on(iCPSEventSyncEngine.FETCH_N_LOAD, () => this.startPhase(`fetchAndLoad`))
            .on(iCPSEventSyncEngine.FETCH_N_LOAD_COMPLETED, (remoteAssetCount: number, remoteAlbumCount: number, localAssetCount: number, localAlbumCount: number) => {
                this.completePhase(`fetchAndLoad`);
                this._lastRun.loadedRemoteAssets = remoteAssetCount;
                this._lastRun.loadedRemoteAlbums = remoteAlbumCount;
                this._lastRun.loadedLocalAssets = localAssetCount;
                this._lastRun.loadedLocalAlbums = localAlbumCount;
            })
            .on(iCPSEventSyncEngine.DIFF, () => this.startPhase(`diff`))
            .on(iCPSEventSyncEngine.DIFF_COMPLETED, () => this.completePhase(`diff`))
            .on(iCPSEventSyncEngine.WRITE_ASSETS, (toBeDeletedCount: number, toBeAddedCount: number, toBeKept: number) => {
                this.startPhase(`writeAssets`);
                this._lastRun.assetsToBeDeleted = toBeDeletedCount;
                this._lastRun.assetsToBeAdded = toBeAddedCount;
                this._lastRun.assetsToBeKept = toBeKept;
            })
            .on(iCPSEventSyncEngine.WRITE_ASSET_COMPLETED, () => {
                this._assetsWritten++;
            })
            .on(iCPSEventSyncEngine.WRITE_ASSETS_COMPLETED, () => this.completePhase(`writeAssets`))
            .on(iCPSEventSyncEngine.WRITE_ALBUMS, (toBeDeletedCount: number, toBeAddedCount: number, toBeKept: number) => {
                this.startPhase(`writeAlbums`);
                this._lastRun.albumsToBeDeleted = toBeDeletedCount;
                this._lastRun.albumsToBeAdded = toBeAddedCount;
                this._lastRun.albumsToBeKept = toBeKept;
            })
            .on(iCPSEventSyncEngine.WRITE_ALBUMS_COMPLETED, () => this.completePhase(`writeAlbums`))
            .on(iCPSEventSyncEngine.RETRY, () => {
                this._syncRetries++;
            })
            .on(iCPSEventSyncEngine.DONE, () => {
                this._syncRuns.success++;
                this._lastSyncSuccess = Date.now() / 1000;
            })
            .on(iCPSEventRuntimeError.SCHEDULED_ERROR, () => {
                this._syncRuns.failure++;
            });

        for (const warning of Object.values(iCPSEventRuntimeWarning)) {
            const type = PrometheusMetricsExporter.warningType(warning);
            Resources.events(this).on(warning, () => {
                this._warnings.set(type, (this._warnings.get(type) ?? 0) + 1);
            });
        }

        Resources.logger(this).info(`Enabled Prometheus metrics exporter`);
    }

    /**
     * @param warning - The runtime warning event
     * @returns The label value used for the warning type
     */
    static warningType(warning: iCPSEventRuntimeWarning): string {
        return warning.replace(/^warn-/, ``);
    }

    /**
     * Records the start of a phase
     * @param phase - The phase that started
     */
    startPhase(phase: SyncPhase) {
        this._phaseStart.set(phase, Date.now());
    }

    /**
     * Records the completion of a phase and stores its duration - a phase that was not started is ignored
     * @param phase - The phase that completed
     */
    completePhase(phase: SyncPhase) {
        const startTime = this._phaseStart.get(phase);
        if (startTime === undefined) {
            return;
        }
        this._phaseDuration.set(phase, (Date.now() - startTime) / 1000);
        this._phaseStart.delete(phase);
    }

    /**
     * Collects the current metric families. The application state is read from the state manager at collection time.
     * @returns All metric families, families without samples are omitted
     */
    collect(): MetricFamily[] {
        const state = Resources.state();
        const lastRunGauge = (name: string, help: string, value?: number): MetricFamily => ({
            name: `${METRIC_PREFIX}_${name}`,
            type: `gauge`,
            help,
            samples: value === undefined ? [] : [{value}]
        });

        const families: MetricFamily[] = [{
            name: `${METRIC_PREFIX}_build`,
            type: `info`,
            help: `Build information of icloud-photos-sync.`,
            samples: [{labels: {version: Resources.PackageInfo.version}, value: 1}]
        }, {
            name: `${METRIC_PREFIX}_state`,
            type: `stateset`,
            help: `Current state of the application.`,
            samples: Object.values(StateType).map(stateType => ({
                labels: {[`${METRIC_PREFIX}_state`]: stateType},
                value: state.state === stateType ? 1 : 0
            }))
        }, {
            name: `${METRIC_PREFIX}_last_run_error`,
            type: `gauge`,
            help: `Whether the last run (sync or re-authentication) ended with an error (1) or not (0). Cleared when the next run starts.`,
            samples: [{value: state.prevError ? 1 : 0}]
        }, {
            name: `${METRIC_PREFIX}_next_sync_timestamp_seconds`,
            type: `gauge`,
            unit: `seconds`,
            help: `Time of the next scheduled sync, in seconds since epoch.`,
            samples: state.nextSync === undefined ? [] : [{value: state.nextSync / 1000}]
        }, {
            name: `${METRIC_PREFIX}_last_sync_success_timestamp_seconds`,
            type: `gauge`,
            unit: `seconds`,
            help: `Time of the last successful sync, in seconds since epoch.`,
            samples: this._lastSyncSuccess === undefined ? [] : [{value: this._lastSyncSuccess}]
        }, {
            name: `${METRIC_PREFIX}_sync_phase_duration_seconds`,
            type: `gauge`,
            unit: `seconds`,
            help: `Duration of the last completed run of each sync phase.`,
            samples: SYNC_PHASES
                .filter(phase => this._phaseDuration.has(phase))
                .map(phase => ({labels: {phase}, value: this._phaseDuration.get(phase)!}))
        },
        lastRunGauge(`loaded_local_assets`, `Number of assets loaded from the local library during the last sync.`, this._lastRun.loadedLocalAssets),
        lastRunGauge(`loaded_local_albums`, `Number of albums loaded from the local library during the last sync.`, this._lastRun.loadedLocalAlbums),
        lastRunGauge(`loaded_remote_assets`, `Number of assets fetched from the remote library during the last sync.`, this._lastRun.loadedRemoteAssets),
        lastRunGauge(`loaded_remote_albums`, `Number of albums fetched from the remote library during the last sync.`, this._lastRun.loadedRemoteAlbums),
        lastRunGauge(`assets_to_be_added`, `Number of assets to be added to the local library during the last sync.`, this._lastRun.assetsToBeAdded),
        lastRunGauge(`assets_to_be_deleted`, `Number of assets to be deleted from the local library during the last sync.`, this._lastRun.assetsToBeDeleted),
        lastRunGauge(`assets_to_be_kept`, `Number of assets to be kept in the local library during the last sync.`, this._lastRun.assetsToBeKept),
        lastRunGauge(`albums_to_be_added`, `Number of albums to be added to the local library during the last sync.`, this._lastRun.albumsToBeAdded),
        lastRunGauge(`albums_to_be_deleted`, `Number of albums to be deleted from the local library during the last sync.`, this._lastRun.albumsToBeDeleted),
        lastRunGauge(`albums_to_be_kept`, `Number of albums to be kept in the local library during the last sync.`, this._lastRun.albumsToBeKept),
        {
            name: `${METRIC_PREFIX}_sync_runs`,
            type: `counter`,
            help: `Number of finished sync runs by result.`,
            samples: [
                {labels: {result: `success`}, value: this._syncRuns.success},
                {labels: {result: `failure`}, value: this._syncRuns.failure}
            ]
        }, {
            name: `${METRIC_PREFIX}_sync_retries`,
            type: `counter`,
            help: `Number of sync attempts that failed and were retried.`,
            samples: [{value: this._syncRetries}]
        }, {
            name: `${METRIC_PREFIX}_assets_written`,
            type: `counter`,
            help: `Number of assets written to the local library.`,
            samples: [{value: this._assetsWritten}]
        }, {
            name: `${METRIC_PREFIX}_warnings`,
            type: `counter`,
            help: `Number of runtime warnings by type.`,
            samples: [...this._warnings.entries()].map(([type, value]) => ({labels: {type}, value}))
        }];

        return families.filter(family => family.samples.length > 0);
    }

    /**
     * Selects the exposition format based on the Accept header of the request: The supported media range with the highest weight wins, Prometheus text format 0.0.4 is used as fallback.
     * @param accept - The value of the Accept header
     * @returns The negotiated format
     * @see https://prometheus.io/docs/instrumenting/content_negotiation/
     */
    negotiate(accept?: string): NegotiatedFormat {
        const preference = Object.values(ExpositionFormat).reverse(); // Preferring newer formats on equal weight
        const candidates = (accept ?? ``)
            .split(`,`)
            .map(mediaRange => {
                const [mediaType, ...parameterList] = mediaRange.split(`;`).map(part => part.trim());
                const parameters: Record<string, string> = {};
                for (const parameter of parameterList) {
                    const separator = parameter.indexOf(`=`);
                    if (separator > 0) {
                        parameters[parameter.slice(0, separator).trim().toLowerCase()] = parameter.slice(separator + 1).trim().replace(/^"(.*)"$/, `$1`);
                    }
                }
                const q = parameters.q === undefined ? 1 : Number.parseFloat(parameters.q);
                return {
                    format: PrometheusMetricsExporter.matchFormat(mediaType.toLowerCase(), parameters.version),
                    q: Number.isNaN(q) ? 0 : q,
                    escaping: parameters.escaping
                };
            })
            .filter(candidate => candidate.format !== undefined && candidate.q > 0)
            .sort((a, b) => (b.q - a.q) || (preference.indexOf(a.format!) - preference.indexOf(b.format!)));

        const best = candidates[0];
        if (!best || best.format === ExpositionFormat.PROMETHEUS_TEXT_0_0_4) {
            return {format: ExpositionFormat.PROMETHEUS_TEXT_0_0_4};
        }

        return {
            format: best.format!,
            escaping: best.escaping !== undefined && ESCAPING_SCHEMES.includes(best.escaping) ? best.escaping : DEFAULT_ESCAPING_SCHEME
        };
    }

    /**
     * @param mediaType - The lower cased media type
     * @param version - The requested version (if any)
     * @returns The matching exposition format, or undefined if the media range is not supported
     */
    static matchFormat(mediaType: string, version?: string): ExpositionFormat | undefined {
        if (mediaType === `application/openmetrics-text` && (version === undefined || version === `1.0.0`)) {
            return ExpositionFormat.OPEN_METRICS_TEXT_1_0_0;
        }
        if (mediaType === `text/plain` && version === `1.0.0`) {
            return ExpositionFormat.PROMETHEUS_TEXT_1_0_0;
        }
        if (mediaType === `text/plain` && (version === undefined || version === `0.0.4`)) {
            return ExpositionFormat.PROMETHEUS_TEXT_0_0_4;
        }
        return undefined;
    }

    /**
     * Renders the current metrics in the requested format
     * @param negotiated - The negotiated format
     * @returns The content type and body of the exposition
     */
    render(negotiated: NegotiatedFormat): Exposition {
        const families = this.collect();
        switch (negotiated.format) {
        case ExpositionFormat.OPEN_METRICS_TEXT_1_0_0:
            return {
                contentType: `application/openmetrics-text; version=1.0.0; charset=utf-8; escaping=${negotiated.escaping ?? DEFAULT_ESCAPING_SCHEME}`,
                body: this.renderOpenMetrics(families)
            };
        case ExpositionFormat.PROMETHEUS_TEXT_1_0_0:
            return {
                contentType: `text/plain; version=1.0.0; charset=utf-8; escaping=${negotiated.escaping ?? DEFAULT_ESCAPING_SCHEME}`,
                body: this.renderText(families)
            };
        default:
            return {
                contentType: `text/plain; version=0.0.4; charset=utf-8`,
                body: this.renderText(families)
            };
        }
    }

    /**
     * Renders the metric families in the Prometheus text format. Counters carry the `_total` suffix in their name, state sets and info metrics are exposed as gauges.
     * @param families - The metric families
     * @returns The exposition, terminated by a line feed
     */
    renderText(families: MetricFamily[]): string {
        const lines: string[] = [];
        for (const family of families) {
            const name = family.type === `counter`
                ? `${family.name}_total`
                : family.type === `info`
                    ? `${family.name}_info`
                    : family.name;
            lines.push(
                `# HELP ${name} ${PrometheusMetricsExporter.escape(family.help, false)}`,
                `# TYPE ${name} ${family.type === `counter` ? `counter` : `gauge`}`,
                ...family.samples.map(sample => PrometheusMetricsExporter.renderSample(name, sample.labels, sample.value)),
            );
        }
        return lines.map(line => `${line}\n`).join(``);
    }

    /**
     * Renders the metric families in the OpenMetrics 1.0.0 text format
     * @param families - The metric families
     * @returns The exposition, terminated by `# EOF` and a line feed
     */
    renderOpenMetrics(families: MetricFamily[]): string {
        const lines: string[] = [];
        for (const family of families) {
            lines.push(`# TYPE ${family.name} ${family.type}`);
            if (family.unit) {
                lines.push(`# UNIT ${family.name} ${family.unit}`);
            }
            lines.push(`# HELP ${family.name} ${PrometheusMetricsExporter.escape(family.help, true)}`);
            for (const sample of family.samples) {
                switch (family.type) {
                case `counter`:
                    lines.push(
                        PrometheusMetricsExporter.renderSample(`${family.name}_total`, sample.labels, sample.value),
                        PrometheusMetricsExporter.renderSample(`${family.name}_created`, sample.labels, this._createdTimestamp),
                    );
                    break;
                case `info`:
                    lines.push(PrometheusMetricsExporter.renderSample(`${family.name}_info`, sample.labels, sample.value));
                    break;
                default:
                    lines.push(PrometheusMetricsExporter.renderSample(family.name, sample.labels, sample.value));
                }
            }
        }
        lines.push(`# EOF`);
        return lines.map(line => `${line}\n`).join(``);
    }

    /**
     * @param name - The sample's metric name
     * @param labels - The sample's labels
     * @param value - The sample's value
     * @returns A single sample line
     */
    static renderSample(name: string, labels: Record<string, string> | undefined, value: number): string {
        const labelString = labels && Object.keys(labels).length > 0
            ? `{${Object.entries(labels).map(([labelName, labelValue]) => `${labelName}="${PrometheusMetricsExporter.escape(labelValue, true)}"`).join(`,`)}}`
            : ``;
        return `${name}${labelString} ${PrometheusMetricsExporter.formatValue(value)}`;
    }

    /**
     * Escapes a HELP text or label value
     * @param value - The string to escape
     * @param escapeQuotes - Whether double quotes need to be escaped (label values and OpenMetrics HELP texts), Prometheus text format HELP texts only escape backslash and line feed
     * @returns The escaped string
     */
    static escape(value: string, escapeQuotes: boolean): string {
        const escaped = value.replaceAll(`\\`, `\\\\`).replaceAll(`\n`, `\\n`);
        return escapeQuotes ? escaped.replaceAll(`"`, `\\"`) : escaped;
    }

    /**
     * @param value - The number to format
     * @returns The number formatted as required by the exposition formats (e.g. `+Inf` instead of `Infinity`)
     */
    static formatValue(value: number): string {
        if (Number.isNaN(value)) {
            return `NaN`;
        }
        if (value === Infinity) {
            return `+Inf`;
        }
        if (value === -Infinity) {
            return `-Inf`;
        }
        return `${value}`;
    }
}
