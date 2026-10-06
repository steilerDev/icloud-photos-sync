import {afterEach, beforeEach, describe, expect, jest, test} from "@jest/globals";
import {MockedEventManager, MockedResourceManager, prepareResources} from "../_helpers/_general";
import {ExpositionFormat, PrometheusMetricsExporter} from "../../src/app/event/prometheus-metrics-exporter";
import {Resources} from "../../src/lib/resources/main";
import {iCPSEventApp, iCPSEventCloud, iCPSEventRuntimeError, iCPSEventRuntimeWarning, iCPSEventSyncEngine, iCPSEventWebServer} from "../../src/lib/resources/events-types";
import {StateManager, StateType} from "../../src/lib/resources/state-manager";
import {iCPSError} from "../../src/app/error/error";
import {APP_ERR} from "../../src/app/error/error-codes";

/**
 * The Accept header sent by Prometheus 3.x with default scrape protocols
 */
const PROMETHEUS_3_ACCEPT = `application/openmetrics-text;version=1.0.0;escaping=allow-utf-8;q=0.5,application/openmetrics-text;version=0.0.1;q=0.4,text/plain;version=1.0.0;escaping=allow-utf-8;q=0.3,text/plain;version=0.0.4;q=0.2,*/*;q=0.1`;

/**
 * The Accept header sent by Prometheus 2.x with default scrape protocols
 */
const PROMETHEUS_2_ACCEPT = `application/openmetrics-text;version=1.0.0,application/openmetrics-text;version=0.0.1;q=0.75,text/plain;version=0.0.4;q=0.5,*/*;q=0.1`;

let mockedEventManager: MockedEventManager;
let mockedResourceManager: MockedResourceManager;
let mockedState: StateManager;

beforeEach(() => {
    const instances = prepareResources()!;
    mockedEventManager = instances.event;
    mockedResourceManager = instances.manager;
    mockedState = instances.state;
    mockedResourceManager._resources.exportPrometheusMetrics = true;
    jest.useFakeTimers({now: new Date(`2026-01-01T00:00:00.000Z`)});
});

afterEach(() => {
    jest.useRealTimers();
});

/**
 * Advances the mocked system time
 * @param ms - Milliseconds to advance
 */
function advance(ms: number) {
    jest.setSystemTime(Date.now() + ms);
}

describe(`Setup`, () => {
    test(`Should not register listeners if disabled`, () => {
        mockedResourceManager._resources.exportPrometheusMetrics = false;
        const exporter = new PrometheusMetricsExporter();

        expect(mockedEventManager._eventRegistry.has(exporter)).toBeFalsy();
    });

    test(`Should register listeners if enabled`, () => {
        const exporter = new PrometheusMetricsExporter();

        expect(mockedEventManager._eventRegistry.has(exporter)).toBeTruthy();
    });

    test(`Should initialize warning counters for all runtime warnings`, () => {
        const exporter = new PrometheusMetricsExporter();

        expect(exporter._warnings.size).toEqual(Object.values(iCPSEventRuntimeWarning).length);
        expect(exporter._warnings.get(`count_mismatch`)).toEqual(0);
    });
});

describe(`Event handling`, () => {
    let exporter: PrometheusMetricsExporter;

    beforeEach(() => {
        exporter = new PrometheusMetricsExporter();
    });

    test(`Should record phase durations`, () => {
        Resources.emit(iCPSEventCloud.AUTHENTICATION_STARTED);
        advance(1500);
        Resources.emit(iCPSEventCloud.ACCOUNT_READY);
        Resources.emit(iCPSEventSyncEngine.FETCH_N_LOAD);
        advance(2000);
        Resources.emit(iCPSEventSyncEngine.FETCH_N_LOAD_COMPLETED, 10, 2, 8, 1);
        Resources.emit(iCPSEventSyncEngine.DIFF);
        advance(250);
        Resources.emit(iCPSEventSyncEngine.DIFF_COMPLETED);
        Resources.emit(iCPSEventSyncEngine.WRITE_ASSETS, 1, 3, 7);
        advance(4000);
        Resources.emit(iCPSEventSyncEngine.WRITE_ASSETS_COMPLETED);
        Resources.emit(iCPSEventSyncEngine.WRITE_ALBUMS, 0, 1, 1);
        advance(100);
        Resources.emit(iCPSEventSyncEngine.WRITE_ALBUMS_COMPLETED);

        expect(Object.fromEntries(exporter._phaseDuration)).toEqual({
            authentication: 1.5,
            fetchAndLoad: 2,
            diff: 0.25,
            writeAssets: 4,
            writeAlbums: 0.1
        });
        expect(exporter._phaseStart.size).toEqual(0);
        expect(exporter._lastRun).toEqual({
            loadedRemoteAssets: 10,
            loadedRemoteAlbums: 2,
            loadedLocalAssets: 8,
            loadedLocalAlbums: 1,
            assetsToBeDeleted: 1,
            assetsToBeAdded: 3,
            assetsToBeKept: 7,
            albumsToBeDeleted: 0,
            albumsToBeAdded: 1,
            albumsToBeKept: 1
        });
    });

    test(`Should keep authentication duration once the sync engine starts`, () => {
        Resources.emit(iCPSEventCloud.AUTHENTICATION_STARTED);
        advance(3000);
        Resources.emit(iCPSEventCloud.ACCOUNT_READY);
        Resources.emit(iCPSEventSyncEngine.START);

        expect(exporter._phaseDuration.get(`authentication`)).toEqual(3);
    });

    test(`Should keep the previous duration while a phase is running`, () => {
        Resources.emit(iCPSEventSyncEngine.DIFF);
        advance(1000);
        Resources.emit(iCPSEventSyncEngine.DIFF_COMPLETED);
        Resources.emit(iCPSEventSyncEngine.DIFF);
        advance(5000);

        expect(exporter._phaseDuration.get(`diff`)).toEqual(1);
    });

    test(`Should ignore completion of a phase that was not started`, () => {
        Resources.emit(iCPSEventSyncEngine.DIFF_COMPLETED);

        expect(exporter._phaseDuration.has(`diff`)).toBeFalsy();
    });

    test(`Should keep recording after a re-authentication with a valid trust token`, () => {
        Resources.emit(iCPSEventWebServer.REAUTH_REQUESTED);
        Resources.emit(iCPSEventCloud.AUTHENTICATION_STARTED);
        Resources.emit(iCPSEventCloud.TRUSTED, `token`);
        Resources.emit(iCPSEventApp.TOKEN, `token`);

        Resources.emit(iCPSEventSyncEngine.WRITE_ASSET_COMPLETED, `asset`);
        Resources.emit(iCPSEventSyncEngine.DONE);

        expect(exporter._assetsWritten).toEqual(1);
        expect(exporter._syncRuns.success).toEqual(1);
    });

    test(`Should count successful syncs and record their time`, () => {
        Resources.emit(iCPSEventSyncEngine.DONE);

        expect(exporter._syncRuns).toEqual({success: 1, failure: 0});
        expect(exporter._lastSyncSuccess).toEqual(new Date(`2026-01-01T00:00:00.000Z`).getTime() / 1000);
    });

    test(`Should count failed syncs`, () => {
        Resources.emit(iCPSEventRuntimeError.SCHEDULED_ERROR, new iCPSError(APP_ERR.DAEMON));

        expect(exporter._syncRuns).toEqual({success: 0, failure: 1});
        expect(exporter._lastSyncSuccess).toBeUndefined();
    });

    test(`Should count retries`, () => {
        Resources.emit(iCPSEventSyncEngine.RETRY, 2, new Error(`test`));
        Resources.emit(iCPSEventSyncEngine.RETRY, 3, new Error(`test`));

        expect(exporter._syncRetries).toEqual(2);
    });

    test(`Should count written assets`, () => {
        Resources.emit(iCPSEventSyncEngine.WRITE_ASSET_COMPLETED, `a`);
        Resources.emit(iCPSEventSyncEngine.WRITE_ASSET_COMPLETED, `b`);

        expect(exporter._assetsWritten).toEqual(2);
    });

    test.each(Object.values(iCPSEventRuntimeWarning).map(warning => ({warning, desc: warning})))(`Should count warning $desc`, ({warning}) => {
        Resources.emit(warning, new Error(`test`), {getDisplayName: () => `test`, recordName: `test`});

        expect(exporter._warnings.get(warning.replace(/^warn-/, ``))).toEqual(1);
    });
});

describe(`Collection`, () => {
    let exporter: PrometheusMetricsExporter;

    beforeEach(() => {
        exporter = new PrometheusMetricsExporter();
    });

    test(`Should omit families without samples`, () => {
        const names = exporter.collect().map(family => family.name);

        expect(names).not.toContain(`icps_sync_phase_duration_seconds`);
        expect(names).not.toContain(`icps_last_sync_success_timestamp_seconds`);
        expect(names).not.toContain(`icps_next_sync_timestamp_seconds`);
        expect(names).not.toContain(`icps_loaded_local_assets`);
        expect(names).toContain(`icps_state`);
        expect(names).toContain(`icps_sync_runs`);
    });

    test.each([StateType.READY, StateType.RUNNING, StateType.BLOCKED].map(state => ({state, desc: state})))(`Should expose application state $desc from the state manager`, ({state}) => {
        mockedState.state = state;

        const stateFamily = exporter.collect().find(family => family.name === `icps_state`)!;

        expect(stateFamily.type).toEqual(`stateset`);
        expect(stateFamily.samples).toEqual(Object.values(StateType).map(stateType => ({
            labels: {icps_state: stateType},
            value: stateType === state ? 1 : 0
        })));
    });

    test.each([{
        prevError: undefined,
        expected: 0,
        desc: `without`
    }, {
        prevError: new iCPSError(APP_ERR.DAEMON),
        expected: 1,
        desc: `with`
    }])(`Should expose last run error $desc previous error`, ({prevError, expected}) => {
        mockedState.prevError = prevError;

        const errorFamily = exporter.collect().find(family => family.name === `icps_last_run_error`)!;

        expect(errorFamily.samples).toEqual([{value: expected}]);
    });

    test(`Should expose next sync time in seconds`, () => {
        mockedState.nextSync = 1767225600500;

        const nextSyncFamily = exporter.collect().find(family => family.name === `icps_next_sync_timestamp_seconds`)!;

        expect(nextSyncFamily.unit).toEqual(`seconds`);
        expect(nextSyncFamily.samples).toEqual([{value: 1767225600.5}]);
    });

    test(`Should expose build info`, () => {
        const buildFamily = exporter.collect().find(family => family.name === `icps_build`)!;

        expect(buildFamily.type).toEqual(`info`);
        expect(buildFamily.samples).toEqual([{labels: {version: Resources.PackageInfo.version}, value: 1}]);
    });

    test(`Should expose phase durations in phase order`, () => {
        exporter._phaseDuration.set(`diff`, 1);
        exporter._phaseDuration.set(`authentication`, 2);

        const durationFamily = exporter.collect().find(family => family.name === `icps_sync_phase_duration_seconds`)!;

        expect(durationFamily.samples).toEqual([
            {labels: {phase: `authentication`}, value: 2},
            {labels: {phase: `diff`}, value: 1}
        ]);
    });
});

describe(`Content negotiation`, () => {
    let exporter: PrometheusMetricsExporter;

    beforeEach(() => {
        exporter = new PrometheusMetricsExporter();
    });

    test.each([{
        accept: PROMETHEUS_3_ACCEPT,
        expected: {format: ExpositionFormat.OPEN_METRICS_TEXT_1_0_0, escaping: `allow-utf-8`},
        desc: `Prometheus 3 default`
    }, {
        accept: PROMETHEUS_2_ACCEPT,
        expected: {format: ExpositionFormat.OPEN_METRICS_TEXT_1_0_0, escaping: `underscores`},
        desc: `Prometheus 2 default`
    }, {
        accept: `application/openmetrics-text`,
        expected: {format: ExpositionFormat.OPEN_METRICS_TEXT_1_0_0, escaping: `underscores`},
        desc: `OpenMetrics without version`
    }, {
        accept: `application/openmetrics-text; version="1.0.0"; escaping=unknown`,
        expected: {format: ExpositionFormat.OPEN_METRICS_TEXT_1_0_0, escaping: `underscores`},
        desc: `OpenMetrics with quoted version and unknown escaping scheme`
    }, {
        accept: `text/plain;version=1.0.0;escaping=dots`,
        expected: {format: ExpositionFormat.PROMETHEUS_TEXT_1_0_0, escaping: `dots`},
        desc: `Prometheus text 1.0.0`
    }, {
        accept: `text/plain`,
        expected: {format: ExpositionFormat.PROMETHEUS_TEXT_0_0_4},
        desc: `Plain text without version`
    }, {
        accept: `application/openmetrics-text;version=2.0.0`,
        expected: {format: ExpositionFormat.PROMETHEUS_TEXT_0_0_4},
        desc: `Unsupported OpenMetrics 2.0.0`
    }, {
        accept: `application/openmetrics-text;version=0.0.1`,
        expected: {format: ExpositionFormat.PROMETHEUS_TEXT_0_0_4},
        desc: `Unsupported OpenMetrics 0.0.1`
    }, {
        accept: `*/*`,
        expected: {format: ExpositionFormat.PROMETHEUS_TEXT_0_0_4},
        desc: `Wildcard`
    }, {
        accept: undefined,
        expected: {format: ExpositionFormat.PROMETHEUS_TEXT_0_0_4},
        desc: `Missing header`
    }, {
        accept: `application/openmetrics-text;version=1.0.0;q=0,text/plain;version=0.0.4;q=0.1`,
        expected: {format: ExpositionFormat.PROMETHEUS_TEXT_0_0_4},
        desc: `Excluded media range (q=0)`
    }, {
        accept: `application/openmetrics-text;version=1.0.0;q=0.2,text/plain;version=1.0.0;q=0.5`,
        expected: {format: ExpositionFormat.PROMETHEUS_TEXT_1_0_0, escaping: `underscores`},
        desc: `Higher weighted text format`
    }, {
        accept: `text/plain;version=0.0.4,application/openmetrics-text;version=1.0.0`,
        expected: {format: ExpositionFormat.OPEN_METRICS_TEXT_1_0_0, escaping: `underscores`},
        desc: `Equal weight prefers OpenMetrics`
    }, {
        accept: `application/openmetrics-text;version=1.0.0;q=invalid,text/plain`,
        expected: {format: ExpositionFormat.PROMETHEUS_TEXT_0_0_4},
        desc: `Invalid weight`
    }])(`$desc`, ({accept, expected}) => {
        expect(exporter.negotiate(accept)).toEqual(expected);
    });
});

describe(`Rendering`, () => {
    let exporter: PrometheusMetricsExporter;

    beforeEach(() => {
        exporter = new PrometheusMetricsExporter();
        mockedState.state = StateType.READY;
        exporter._phaseDuration.set(`authentication`, 1.5);
        exporter._syncRuns.success = 2;
    });

    describe(`Prometheus text format`, () => {
        test.each([{
            negotiated: {format: ExpositionFormat.PROMETHEUS_TEXT_0_0_4},
            contentType: `text/plain; version=0.0.4; charset=utf-8`,
            desc: `0.0.4`
        }, {
            negotiated: {format: ExpositionFormat.PROMETHEUS_TEXT_1_0_0, escaping: `allow-utf-8`},
            contentType: `text/plain; version=1.0.0; charset=utf-8; escaping=allow-utf-8`,
            desc: `1.0.0`
        }])(`Should use content type for $desc`, ({negotiated, contentType}) => {
            expect(exporter.render(negotiated).contentType).toEqual(contentType);
        });

        test(`Should render families`, () => {
            const {body} = exporter.render({format: ExpositionFormat.PROMETHEUS_TEXT_0_0_4});

            expect(body).toContain(`# HELP icps_build_info Build information of icloud-photos-sync.\n# TYPE icps_build_info gauge\nicps_build_info{version="${Resources.PackageInfo.version}"} 1\n`);
            expect(body).toContain(`# TYPE icps_state gauge\nicps_state{icps_state="ready"} 1\nicps_state{icps_state="running"} 0\nicps_state{icps_state="blocked"} 0\n`);
            expect(body).toContain(`# TYPE icps_sync_phase_duration_seconds gauge\nicps_sync_phase_duration_seconds{phase="authentication"} 1.5\n`);
            expect(body).toContain(`# HELP icps_sync_runs_total Number of finished sync runs by result.\n# TYPE icps_sync_runs_total counter\nicps_sync_runs_total{result="success"} 2\nicps_sync_runs_total{result="failure"} 0\n`);
            expect(body).not.toContain(`_created`);
            expect(body).not.toContain(`# UNIT`);
            expect(body).not.toContain(`# EOF`);
            expect(body.endsWith(`\n`)).toBeTruthy();
            expect(body).not.toContain(`\r`);
        });

        test(`Should declare every family once, before its samples`, () => {
            const {body} = exporter.render({format: ExpositionFormat.PROMETHEUS_TEXT_0_0_4});
            const typeLines = body.split(`\n`).filter(line => line.startsWith(`# TYPE `));

            expect(new Set(typeLines).size).toEqual(typeLines.length);
            for (const typeLine of typeLines) {
                const name = typeLine.split(` `)[2];
                expect(body.indexOf(typeLine)).toBeLessThan(body.indexOf(`\n${name}`));
            }
        });
    });

    describe(`OpenMetrics format`, () => {
        test(`Should use content type with escaping scheme`, () => {
            expect(exporter.render({format: ExpositionFormat.OPEN_METRICS_TEXT_1_0_0, escaping: `allow-utf-8`}).contentType)
                .toEqual(`application/openmetrics-text; version=1.0.0; charset=utf-8; escaping=allow-utf-8`);
        });

        test(`Should default escaping scheme`, () => {
            expect(exporter.render({format: ExpositionFormat.OPEN_METRICS_TEXT_1_0_0}).contentType)
                .toEqual(`application/openmetrics-text; version=1.0.0; charset=utf-8; escaping=underscores`);
        });

        test(`Should render families`, () => {
            const {body} = exporter.render({format: ExpositionFormat.OPEN_METRICS_TEXT_1_0_0, escaping: `underscores`});
            const created = exporter._createdTimestamp;

            expect(body).toContain(`# TYPE icps_build info\n# HELP icps_build Build information of icloud-photos-sync.\nicps_build_info{version="${Resources.PackageInfo.version}"} 1\n`);
            expect(body).toContain(`# TYPE icps_state stateset\n# HELP icps_state Current state of the application.\nicps_state{icps_state="ready"} 1\n`);
            expect(body).toContain(`# TYPE icps_sync_phase_duration_seconds gauge\n# UNIT icps_sync_phase_duration_seconds seconds\n# HELP icps_sync_phase_duration_seconds Duration of the last completed run of each sync phase.\nicps_sync_phase_duration_seconds{phase="authentication"} 1.5\n`);
            expect(body).toContain(`# TYPE icps_sync_runs counter\n# HELP icps_sync_runs Number of finished sync runs by result.\nicps_sync_runs_total{result="success"} 2\nicps_sync_runs_created{result="success"} ${created}\nicps_sync_runs_total{result="failure"} 0\nicps_sync_runs_created{result="failure"} ${created}\n`);
            expect(body).toContain(`# TYPE icps_sync_retries counter\n# HELP icps_sync_retries Number of sync attempts that failed and were retried.\nicps_sync_retries_total 0\nicps_sync_retries_created ${created}\n`);
            expect(body).not.toContain(`# TYPE icps_sync_runs_total`);
            expect(body.endsWith(`\n# EOF\n`)).toBeTruthy();
            expect(body.indexOf(`# EOF`)).toEqual(body.length - `# EOF\n`.length);
        });

        test(`Should only declare units for families named after them`, () => {
            const {body} = exporter.render({format: ExpositionFormat.OPEN_METRICS_TEXT_1_0_0});
            const unitLines = body.split(`\n`).filter(line => line.startsWith(`# UNIT `));

            expect(unitLines.length).toBeGreaterThan(0);
            for (const unitLine of unitLines) {
                const [, , name, unit] = unitLine.split(` `);
                expect(name.endsWith(`_${unit}`)).toBeTruthy();
            }
        });
    });
});

describe(`Formatting helpers`, () => {
    test.each([{
        value: 1,
        expected: `1`,
        desc: `integer without decimal point`
    }, {
        value: 0.25,
        expected: `0.25`,
        desc: `float`
    }, {
        value: Infinity,
        expected: `+Inf`,
        desc: `positive infinity`
    }, {
        value: -Infinity,
        expected: `-Inf`,
        desc: `negative infinity`
    }, {
        value: NaN,
        expected: `NaN`,
        desc: `NaN`
    }])(`Should format $desc`, ({value, expected}) => {
        expect(PrometheusMetricsExporter.formatValue(value)).toEqual(expected);
    });

    test.each([{
        escapeQuotes: true,
        expected: `a\\\\b\\nc\\"d`,
        desc: `label values and OpenMetrics help`
    }, {
        escapeQuotes: false,
        expected: `a\\\\b\\nc"d`,
        desc: `Prometheus text help`
    }])(`Should escape $desc`, ({escapeQuotes, expected}) => {
        expect(PrometheusMetricsExporter.escape(`a\\b\nc"d`, escapeQuotes)).toEqual(expected);
    });

    test(`Should render escaped label values`, () => {
        expect(PrometheusMetricsExporter.renderSample(`foo`, {bar: `a"b\nc\\d`}, 1)).toEqual(`foo{bar="a\\"b\\nc\\\\d"} 1`);
    });

    test(`Should render samples without labels`, () => {
        expect(PrometheusMetricsExporter.renderSample(`foo`, {}, 2)).toEqual(`foo 2`);
    });
});
