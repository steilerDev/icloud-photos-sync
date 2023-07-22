import EventEmitter from "events";
import {EventHandler} from "./event-handler.js";
import {iCloud} from '../../lib/icloud/icloud.js';
import * as ICLOUD from '../../lib/icloud/constants.js';
import * as SYNC_ENGINE from '../../lib/sync-engine/constants.js';
import * as ARCHIVE_ENGINE from '../../lib/archive-engine/constants.js';
import * as MFA_SERVER from '../../lib/icloud/mfa/constants.js';
import {SyncEngine} from '../../lib/sync-engine/sync-engine.js';
import {getLogger} from '../../lib/logger.js';
import {ArchiveEngine} from '../../lib/archive-engine/archive-engine.js';
import {ErrorHandler, ERROR_EVENT, WARN_EVENT} from './error-handler.js';
import * as fs from "fs";
import path from "path";
import {MFAServer} from "../../lib/icloud/mfa/mfa-server.js";
import {DaemonAppEvents} from "../icloud-app.js";
import {ResourceManager} from "../../lib/resource-manager/resource-manager.js";

/**
 * The InfluxLineProtocol field set type
 */
export type InfluxLineProtocolFieldSet = {
    [fieldKey: string]: string
}

/**
 * The InfluxLineProtocol tag set type
 */
export type InfluxLineProtocolTagSet = {
    [tagKey: string]: string
}

const METRICS_FILE_NAME = `.icloud-photos-sync.metrics`;
const MEASUREMENT_NAME = `icloud_photos_sync`;

/**
 * An object holding all possible fields as well as their discrete values (if applicable)
 */
const FIELDS = {
    LOCAL_ASSETS_LOADED: `local_assets_loaded`,
    LOCAL_ALBUMS_LOADED: `local_albums_loaded`,
    REMOTE_ASSETS_FETCHED: `remote_assets_fetched`,
    REMOTE_ALBUMS_FETCHED: `remote_albums_fetched`,
    ASSETS_TO_BE_ADDED: `assets_to_be_added`,
    ASSETS_TO_BE_KEPT: `assets_to_be_kept`,
    ASSETS_TO_BE_DELETED: `assets_to_be_deleted`,
    ASSETS_ARCHIVED: `assets_archived`,
    REMOTE_ASSETS_DELETED: `remote_assets_deleted`,
    ASSET_WRITTEN: `asset_written`,
    ALBUMS_TO_BE_ADDED: `albums_to_be_added`,
    ALBUMS_TO_BE_KEPT: `albums_to_be_kept`,
    ALBUMS_TO_BE_DELETED: `albums_to_be_deleted`,
    ERROR: `errors`,
    WARNING: `warnings`,
    STATUS_TIME: `status_time`,
    NEXT_SCHEDULE: `next_schedule`,
    STATUS: {
        name: `status`,
        values: {
            AUTHENTICATION_STARTED: `AUTHENTICATION_STARTED`,
            AUTHENTICATED: `AUTHENTICATED`,
            MFA_REQUIRED: `MFA_REQUIRED`,
            MFA_RECEIVED: `MFA_RECEIVED`,
            MFA_NOT_PROVIDED: `MFA_NOT_PROVIDED`,
            DEVICE_TRUSTED: `DEVICE_TRUSTED`,
            ACCOUNT_READY: `ACCOUNT_READY`,
            ICLOUD_READY: `ICLOUD_READY`,
            SYNC_START: `SYNC_START`,
            FETCH_N_LOAD_STARTED: `FETCH_N_LOAD_STARTED`,
            FETCH_N_LOAD_COMPLETED: `FETCH_N_LOAD_COMPLETED`,
            DIFF_STARTED: `DIFF_STARTED`,
            DIFF_COMPLETED: `DIFF_COMPLETED`,
            WRITE_STARTED: `WRITE_STARTED`,
            WRITE_ASSETS_STARTED: `WRITE_ASSETS_STARTED`,
            WRITE_ASSETS_COMPLETED: `WRITE_ASSETS_COMPLETED`,
            WRITE_ALBUMS_STARTED: `WRITE_ALBUMS_STARTED`,
            WRITE_ALBUMS_COMPLETED: `WRITE_ALBUMS_COMPLETED`,
            WRITE_COMPLETED: `WRITE_COMPLETED`,
            SYNC_COMPLETED: `SYNC_COMPLETED`,
            SYNC_RETRY: `SYNC_RETRY`,
            ERROR: `ERROR`,
            SCHEDULED: `SCHEDULED`,
            SCHEDULED_SUCCESS: `SCHEDULED_SUCCESS`,
            SCHEDULED_FAILURE: `SCHEDULED_FAILURE`,
        },
    },
};

/**
 * This class represents a measurement point using the Influx Line Protocol
 */
export class InfluxLineProtocolPoint {
    /**
     * Default logger for the class
     */
    private logger = getLogger(this);

    /**
     * The measurement's name
     */
    measurement: string;

    /**
     * Set of field key/value pairs
     */
    fieldSet: InfluxLineProtocolFieldSet = {};

    /**
     * Set of tag key/value pairs
     */
    tagSet: InfluxLineProtocolTagSet = {};

    /**
     * Unix timestamp with millisecond precision
     */
    timestamp: number;

    /**
     * Creates a new data point using the provided measurement name and current time
     * @param measurement - The measurement, which will be sanitized based on the Influx Line Protocol
     */
    constructor(measurement: string = MEASUREMENT_NAME) {
        if (measurement.startsWith(`_`)) {
            this.logger.debug(`Measurement (${measurement}) cannot start with '_': Removing leading characters`);
            measurement = measurement.replace(/^_+/, ``);
        }

        measurement = this.replaceIfExists(measurement, `,`);
        measurement = this.replaceIfExists(measurement, ` `);
        this.measurement = measurement;

        // Timestamp in nanosecond
        this.timestamp = Date.now() * 1000000;
    }

    /**
     *
     * @returns This data point, formatted in the Influx Line Protocol with an appended new line character
     */
    toString(): string {
        if (!this.measurement || this.measurement.length === 0) {
            this.logger.debug(`Measurement name required!`);
            return `# Invalid data point: Measurement name is required\n`;
        }

        if (Object.keys(this.fieldSet).length === 0) {
            this.logger.debug(`At least one field is required!`);
            return `# Invalid data point: At least one field is required\n`;
        }

        let output = this.measurement;

        // Adding tag sets
        output += Object.keys(this.tagSet)
            .map(tagKey => `,${tagKey}=${this.tagSet[tagKey]}`)
            .join(``);

        // Adding first whitespace
        output += ` `;

        // Adding field sets
        output += Object.keys(this.fieldSet)
            .map(fieldKey => `${fieldKey}=${this.fieldSet[fieldKey]}`)
            .join(`,`);

        // Adding second whitespace and timestamp
        output += ` ${this.timestamp}\n`;

        return output;
    }

    /**
     * Adds a tag key-value pair. The function sanitizes the input, based on the Influx Line Protocol
     * @param key - The key of the tag
     * @param value - The value of the tag
     * @returns This object for chaining
     */
    addTag(key: string, value: string) {
        key = this.replaceIfExists(key, `,`);
        key = this.replaceIfExists(key, `=`);
        key = this.replaceIfExists(key, ` `);
        key = this.replaceIfExists(key, `\n`);

        value = this.replaceIfExists(value, `,`);
        value = this.replaceIfExists(value, `=`);
        value = this.replaceIfExists(value, ` `);
        value = this.replaceIfExists(value, `\n`);

        this.tagSet[key] = value;
        return this;
    }

    /**
     * Adds a field key-value pair. The function sanitizes the input, based on the Influx Line Protocol
     * @param key - The key of the field
     * @param value - The value of the field
     * @returns This object for chaining
     */
    addField(key: string, value: string | number | boolean): InfluxLineProtocolPoint {
        key = this.replaceIfExists(key, `,`);
        key = this.replaceIfExists(key, `=`);
        key = this.replaceIfExists(key, ` `);
        key = this.replaceIfExists(key, `\n`);

        if (typeof value === `string`) {
            value = this.replaceIfExists(value, `\\`);
            value = this.replaceIfExists(value, `"`);
            value = this.replaceIfExists(value, `'`);
            value = this.replaceIfExists(value, `\n`);
            this.fieldSet[key] = `"${value}"`;
            return this;
        }

        if (typeof value === `number`) {
            if (Number.isInteger(value)) {
                this.fieldSet[key] = `${value}i`;
                return this;
            }

            if (Number.isFinite(value)) {
                this.fieldSet[key] = value.toExponential();
                return this;
            }

            this.logger.debug(`Provided field value number is neither integer, nor finite, ignoring...`);
            return this;
        }

        if (typeof value === `boolean`) {
            this.fieldSet[key] = value ? `TRUE` : `FALSE`;
            return this;
        }
    }

    /**
     * Checks if a given input string contains the disallowed sequence and replaces it with a given other sequence.
     * A warning will be logged if this happens.
     * @param input - The input string
     * @param disallowedSequence - A sequence of characters that is not allowed
     * @param replacement - An alternative sequence for replacement - if not specified, will replace using '_'
     * @returns The sanitized string
     */
    private replaceIfExists(input: string, disallowedSequence: string, replacement: string = `_`): string {
        if (input.indexOf(disallowedSequence) >= 0) {
            this.logger.trace(`Input **${input}** contains '${disallowedSequence}': Replacing with ${replacement}`);
            input = input.replaceAll(disallowedSequence, replacement);
        }

        return input;
    }
}

/**
 * This class implements exporting metrics for monitoring purposes
 */
export class MetricsExporter implements EventHandler {
    /**
     * Default logger for the class
     */
    private logger = getLogger(this);

    /**
     * Path to the file, where metrics will be exported to. Undefined if exporter is not activated.
     */
    metricsFile?: string;

    /**
     * Creates the exporter and checks for the file
     * @param options - The CLI options
     */
    constructor() {
        if (!ResourceManager.exportMetrics) {
            this.metricsFile = undefined;
            return;
        }

        this.metricsFile = path.format({
            dir: ResourceManager.dataDir,
            base: METRICS_FILE_NAME,
        });

        if (fs.existsSync(this.metricsFile)) {
            // Clearing file if it exists
            fs.truncateSync(this.metricsFile);
        }

        this.logger.info(`Enabling metrics exporter to file ${this.metricsFile}`);
    }

    /**
     * Starts listening on class specific events on the provided object for status printing
     * @param objects - The EventEmitter
     */
    registerObjects(...objects: EventEmitter[]) {
        if (!this.metricsFile) {
            return;
        }

        objects.forEach(obj => {
            if (obj instanceof iCloud) {
                this.handleICloud(obj);
                return;
            }

            if (obj instanceof SyncEngine) {
                this.handleSyncEngine(obj);
                return;
            }

            if (obj instanceof ArchiveEngine) {
                this.handleArchiveEngine(obj);
                return;
            }

            if (obj instanceof MFAServer) {
                this.handleMFAServer(obj);
                return;
            }

            if (obj instanceof DaemonAppEvents) {
                this.handleDaemonApp(obj);
            }

            if (obj instanceof ErrorHandler) {
                this.handleErrorHandler(obj);
            }
        });
    }

    logDataPoint(dataPoint: InfluxLineProtocolPoint) {
        fs.appendFileSync(this.metricsFile, dataPoint.toString(), {encoding: `utf8`});
    }

    /**
     * Listens to MFA Server events and provides metrics output
     * @param mfaServer - The MFA server to listen on
     */
    private handleMFAServer(mfaServer: MFAServer) {
        mfaServer.on(MFA_SERVER.EVENTS.MFA_NOT_PROVIDED, () => {
            this.logDataPoint(new InfluxLineProtocolPoint()
                .addField(FIELDS.STATUS_TIME, Date.now())
                .addField(FIELDS.STATUS.name, FIELDS.STATUS.values.MFA_NOT_PROVIDED));
        });
    }

    /**
     * Listens to iCloud events and provides metrics output
     * @param iCloud - The iCloud object to listen on
     */
    private handleICloud(iCloud: iCloud) {
        iCloud.on(ICLOUD.EVENTS.AUTHENTICATION_STARTED, () => {
            this.logDataPoint(new InfluxLineProtocolPoint()
                .addField(FIELDS.STATUS_TIME, Date.now())
                .addField(FIELDS.STATUS.name, FIELDS.STATUS.values.AUTHENTICATION_STARTED));
        });

        iCloud.on(ICLOUD.EVENTS.AUTHENTICATED, () => {
            this.logDataPoint(new InfluxLineProtocolPoint()
                .addField(FIELDS.STATUS_TIME, Date.now())
                .addField(FIELDS.STATUS.name, FIELDS.STATUS.values.AUTHENTICATED));
        });

        iCloud.on(ICLOUD.EVENTS.MFA_REQUIRED, () => {
            this.logDataPoint(new InfluxLineProtocolPoint()
                .addField(FIELDS.STATUS_TIME, Date.now())
                .addField(FIELDS.STATUS.name, FIELDS.STATUS.values.MFA_REQUIRED));
        });

        iCloud.on(ICLOUD.EVENTS.MFA_RECEIVED, () => {
            this.logDataPoint(new InfluxLineProtocolPoint()
                .addField(FIELDS.STATUS_TIME, Date.now())
                .addField(FIELDS.STATUS.name, FIELDS.STATUS.values.MFA_RECEIVED));
        });

        iCloud.on(ICLOUD.EVENTS.TRUSTED, () => {
            this.logDataPoint(new InfluxLineProtocolPoint()
                .addField(FIELDS.STATUS_TIME, Date.now())
                .addField(FIELDS.STATUS.name, FIELDS.STATUS.values.DEVICE_TRUSTED));
        });

        iCloud.on(ICLOUD.EVENTS.ACCOUNT_READY, () => {
            this.logDataPoint(new InfluxLineProtocolPoint()
                .addField(FIELDS.STATUS_TIME, Date.now())
                .addField(FIELDS.STATUS.name, FIELDS.STATUS.values.ACCOUNT_READY));
        });

        iCloud.on(ICLOUD.EVENTS.READY, () => {
            this.logDataPoint(new InfluxLineProtocolPoint()
                .addField(FIELDS.STATUS_TIME, Date.now())
                .addField(FIELDS.STATUS.name, FIELDS.STATUS.values.ICLOUD_READY));
        });
    }

    /**
     * Listens to Sync Engine events and provides CLI output
     * @param syncEngine - The Sync Engine object to listen on
     */
    private handleSyncEngine(syncEngine: SyncEngine) {
        syncEngine.on(SYNC_ENGINE.EVENTS.START, () => {
            this.logDataPoint(new InfluxLineProtocolPoint()
                .addField(FIELDS.STATUS_TIME, Date.now())
                .addField(FIELDS.STATUS.name, FIELDS.STATUS.values.SYNC_START));
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.FETCH_N_LOAD, () => {
            this.logDataPoint(new InfluxLineProtocolPoint()
                .addField(FIELDS.STATUS_TIME, Date.now())
                .addField(FIELDS.STATUS.name, FIELDS.STATUS.values.FETCH_N_LOAD_STARTED));
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.FETCH_N_LOAD_COMPLETED, (remoteAssetCount, remoteAlbumCount, localAssetCount, localAlbumCount) => {
            this.logDataPoint(new InfluxLineProtocolPoint()
                .addField(FIELDS.STATUS_TIME, Date.now())
                .addField(FIELDS.STATUS.name, FIELDS.STATUS.values.FETCH_N_LOAD_COMPLETED)
                .addField(FIELDS.LOCAL_ALBUMS_LOADED, localAlbumCount)
                .addField(FIELDS.LOCAL_ASSETS_LOADED, localAssetCount)
                .addField(FIELDS.REMOTE_ALBUMS_FETCHED, remoteAlbumCount)
                .addField(FIELDS.REMOTE_ASSETS_FETCHED, remoteAssetCount),
            );
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.DIFF, () => {
            this.logDataPoint(new InfluxLineProtocolPoint()
                .addField(FIELDS.STATUS_TIME, Date.now())
                .addField(FIELDS.STATUS.name, FIELDS.STATUS.values.DIFF_STARTED));
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.DIFF_COMPLETED, () => {
            this.logDataPoint(new InfluxLineProtocolPoint()
                .addField(FIELDS.STATUS_TIME, Date.now())
                .addField(FIELDS.STATUS.name, FIELDS.STATUS.values.DIFF_COMPLETED));
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.WRITE, () => {
            this.logDataPoint(new InfluxLineProtocolPoint()
                .addField(FIELDS.STATUS_TIME, Date.now())
                .addField(FIELDS.STATUS.name, FIELDS.STATUS.values.WRITE_STARTED));
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.WRITE_ASSETS, (toBeDeletedCount, toBeAddedCount, toBeKept) => {
            this.logDataPoint(new InfluxLineProtocolPoint()
                .addField(FIELDS.STATUS_TIME, Date.now())
                .addField(FIELDS.STATUS.name, FIELDS.STATUS.values.WRITE_ASSETS_STARTED)
                .addField(FIELDS.ASSETS_TO_BE_ADDED, toBeAddedCount)
                .addField(FIELDS.ASSETS_TO_BE_DELETED, toBeDeletedCount)
                .addField(FIELDS.ASSETS_TO_BE_KEPT, toBeKept),
            );
        });

        // RecordName would be available
        syncEngine.on(SYNC_ENGINE.EVENTS.WRITE_ASSET_COMPLETED, recordName => {
            this.logDataPoint(new InfluxLineProtocolPoint()
                .addField(FIELDS.ASSET_WRITTEN, recordName),
            );
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.WRITE_ASSETS_COMPLETED, () => {
            this.logDataPoint(new InfluxLineProtocolPoint()
                .addField(FIELDS.STATUS_TIME, Date.now())
                .addField(FIELDS.STATUS.name, FIELDS.STATUS.values.WRITE_ASSETS_COMPLETED));
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.WRITE_ALBUMS, (toBeDeletedCount, toBeAddedCount, toBeKept) => {
            this.logDataPoint(new InfluxLineProtocolPoint()
                .addField(FIELDS.STATUS_TIME, Date.now())
                .addField(FIELDS.STATUS.name, FIELDS.STATUS.values.WRITE_ALBUMS_COMPLETED)
                .addField(FIELDS.ALBUMS_TO_BE_ADDED, toBeAddedCount)
                .addField(FIELDS.ALBUMS_TO_BE_DELETED, toBeDeletedCount)
                .addField(FIELDS.ALBUMS_TO_BE_KEPT, toBeKept),
            );
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.WRITE_ALBUMS_COMPLETED, () => {
            this.logDataPoint(new InfluxLineProtocolPoint()
                .addField(FIELDS.STATUS_TIME, Date.now())
                .addField(FIELDS.STATUS.name, FIELDS.STATUS.values.WRITE_ALBUMS_COMPLETED));
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.WRITE_COMPLETED, () => {
            this.logDataPoint(new InfluxLineProtocolPoint()
                .addField(FIELDS.STATUS_TIME, Date.now())
                .addField(FIELDS.STATUS.name, FIELDS.STATUS.values.WRITE_COMPLETED));
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.DONE, () => {
            this.logDataPoint(new InfluxLineProtocolPoint()
                .addField(FIELDS.STATUS_TIME, Date.now())
                .addField(FIELDS.STATUS.name, FIELDS.STATUS.values.SYNC_COMPLETED));
        });

        syncEngine.on(SYNC_ENGINE.EVENTS.RETRY, () => {
            this.logDataPoint(new InfluxLineProtocolPoint()
                .addField(FIELDS.STATUS_TIME, Date.now())
                .addField(FIELDS.STATUS.name, FIELDS.STATUS.values.SYNC_RETRY));
        });
    }

    /**
     * Listens to Archive Engine events and provides CLI output
     * @param archiveEngine - The Archive Engine object to listen on
     */
    private handleArchiveEngine(archiveEngine: ArchiveEngine) {
        archiveEngine.on(ARCHIVE_ENGINE.EVENTS.PERSISTING_START, (numberOfAssets: number) => {
            this.logDataPoint(new InfluxLineProtocolPoint().addField(FIELDS.ASSETS_ARCHIVED, numberOfAssets));
        });

        archiveEngine.on(ARCHIVE_ENGINE.EVENTS.REMOTE_DELETE, (numberOfAssets: number) => {
            this.logDataPoint(new InfluxLineProtocolPoint().addField(FIELDS.REMOTE_ASSETS_DELETED, numberOfAssets));
        });
    }

    /**
     * Listens to Error Handler events and provides CLI output
     * @param errorHandler - The Error Handler object to listen on
     */
    private handleErrorHandler(errorHandler: ErrorHandler) {
        errorHandler.on(ERROR_EVENT, (err: string) => {
            this.logDataPoint(new InfluxLineProtocolPoint()
                .addField(FIELDS.STATUS_TIME, Date.now())
                .addField(FIELDS.STATUS.name, FIELDS.STATUS.values.ERROR)
                .addField(FIELDS.ERROR, err));
        });

        errorHandler.on(WARN_EVENT, (err: string) => {
            this.logDataPoint(new InfluxLineProtocolPoint()
                .addField(FIELDS.WARNING, err));
        });
    }

    /**
     * Handles events emitted from the daemon app
     * @param daemon - The daemon app event emitter
     */
    private handleDaemonApp(daemon: DaemonAppEvents) {
        daemon.on(DaemonAppEvents.EVENTS.SCHEDULED, (next: Date) => {
            this.logDataPoint(new InfluxLineProtocolPoint()
                .addField(FIELDS.STATUS_TIME, Date.now())
                .addField(FIELDS.STATUS.name, FIELDS.STATUS.values.SCHEDULED)
                .addField(FIELDS.NEXT_SCHEDULE, next.getTime()));
        });

        daemon.on(DaemonAppEvents.EVENTS.DONE, (next: Date) => {
            this.logDataPoint(new InfluxLineProtocolPoint()
                .addField(FIELDS.STATUS_TIME, Date.now())
                .addField(FIELDS.STATUS.name, FIELDS.STATUS.values.SCHEDULED_SUCCESS)
                .addField(FIELDS.NEXT_SCHEDULE, next.getTime()));
        });

        daemon.on(DaemonAppEvents.EVENTS.RETRY, (next: Date) => {
            this.logDataPoint(new InfluxLineProtocolPoint()
                .addField(FIELDS.STATUS_TIME, Date.now())
                .addField(FIELDS.STATUS.name, FIELDS.STATUS.values.SCHEDULED_FAILURE)
                .addField(FIELDS.NEXT_SCHEDULE, next.getTime()));
        });
    }
}