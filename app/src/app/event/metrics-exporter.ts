import * as fs from "fs";
import {CPLAsset} from "../../lib/icloud/icloud-photos/query-parser.js";
import {Album} from "../../lib/photos-library/model/album.js";
import {Asset} from "../../lib/photos-library/model/asset.js";
import {iCPSEventApp, iCPSEventArchiveEngine, iCPSEventCloud, iCPSEventMFA, iCPSEventPhotos, iCPSEventRuntimeError, iCPSEventRuntimeWarning, iCPSEventSyncEngine} from '../../lib/resources/events-types.js';
import {Resources} from "../../lib/resources/main.js";
import {FILE_ENCODING} from '../../lib/resources/resource-types.js';
import {iCPSError} from '../error/error.js';

/**
 * The InfluxLineProtocol field set type
 */
type InfluxLineProtocolFieldSet = {
    [fieldKey: string]: string
}

/**
 * The InfluxLineProtocol tag set type
 */
type InfluxLineProtocolTagSet = {
    [tagKey: string]: string
}

/**
 * The name of the measurement written to the metrics file
 */
const MEASUREMENT_NAME = `icloud_photos_sync`;

/**
 * An object holding all possible fields as well as their discrete values (if applicable)
 */
const FIELDS = {
    /**
     * Warnings
     */
    COUNT_MISMATCH: `warn-count_mismatch`,
    LIBRARY_LOAD_ERROR: `warn-library_load_error`,
    EXTRANEOUS_FILE: `warn-extraneous_file`,
    ICLOUD_LOAD_ERROR: `warn-icloud_load_error`,
    WRITE_ASSET_ERROR: `warn-write_asset_error`,
    WRITE_ALBUM_ERROR: `warn-write_album_error`,
    LINK_ERROR: `warn-link_error`,
    FILETYPE_ERROR: `warn-filetype_error`,
    MFA_RESEND_ERROR: `warn-mfa_resend_error`,
    WEB_SERVER_ERROR: `warn-web_server_error`,
    RESOURCE_FILE_ERROR: `warn-resource_file_error`,
    ARCHIVE_ASSET_ERROR: `warn-archive_asset_error`,
    ERROR: `errors`,
    /**
     * Loading metrics
     */
    LOCAL_ASSETS_LOADED: `local_assets_loaded`,
    LOCAL_ALBUMS_LOADED: `local_albums_loaded`,
    REMOTE_ASSETS_FETCHED: `remote_assets_fetched`,
    REMOTE_ALBUMS_FETCHED: `remote_albums_fetched`,
    /**
     * Sync metrics
     */
    ASSETS_TO_BE_ADDED: `assets_to_be_added`,
    ASSETS_TO_BE_KEPT: `assets_to_be_kept`,
    ASSETS_TO_BE_DELETED: `assets_to_be_deleted`,
    ASSET_WRITTEN: `asset_written`,
    ALBUMS_TO_BE_ADDED: `albums_to_be_added`,
    ALBUMS_TO_BE_KEPT: `albums_to_be_kept`,
    ALBUMS_TO_BE_DELETED: `albums_to_be_deleted`,
    STATUS_TIME: `status_time`,
    NEXT_SCHEDULE: `next_schedule`,
    /**
     * Archive metrics
     */
    ASSETS_ARCHIVED: `assets_archived`,
    REMOTE_ASSETS_DELETED: `remote_assets_deleted`,
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
            PCS_REQUIRED: `PCS_REQUIRED`,
            PCS_NOT_READY: `PCS_NOT_READY`,
            SESSION_EXPIRED: `SESSION_EXPIRED`,
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
            SCHEDULED_OVERRUN: `SCHEDULED_OVERRUN`,
        },
    },
};

/**
 * This class represents a measurement point using the Influx Line Protocol
 */
class InfluxLineProtocolPoint {
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
    constructor(measurement: string) {
        if (measurement.startsWith(`_`)) {
            Resources.logger(this).debug(`Measurement (${measurement}) cannot start with '_': Removing leading characters`);
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
            Resources.logger(this).debug(`Measurement name required!`);
            return `# Invalid data point: Measurement name is required\n`;
        }

        if (Object.keys(this.fieldSet).length === 0) {
            Resources.logger(this).debug(`At least one field is required!`);
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

            Resources.logger(this).debug(`Provided field value number is neither integer, nor finite, ignoring...`);
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
            Resources.logger(this).debug(`Input **${input.length > 50 ? input.substring(0, 49) + `...` : input}** contains '${disallowedSequence}': Replacing with ${replacement}`);
            input = input.replaceAll(disallowedSequence, replacement);
        }

        return input;
    }
}

/**
 * Specialized data point class for this application, applying the measurement name and adding the status time field
 */
class iCPSInfluxLineProtocolPoint extends InfluxLineProtocolPoint {
    constructor() {
        super(MEASUREMENT_NAME);
    }

    /**
     * Logs the status and applies the current time as timestamp
     * @param statusValue - The status value to log
     * @returns This object for chaining
     */
    logStatus(statusValue: string): iCPSInfluxLineProtocolPoint {
        this
            .addField(FIELDS.STATUS_TIME, Date.now())
            .addField(FIELDS.STATUS.name, statusValue);

        return this;
    }
}

/**
 * This class implements exporting metrics for monitoring purposes
 */
export class MetricsExporter {
    /**
     * The opened file descriptor of the metrics file
     */
    private metricsFileDescriptor: number;

    /**
     * Creates the exporter and checks for the file
     */
    constructor() {
        if (!Resources.manager().exportMetrics) {
            return;
        }

        // Try opening the file - truncate if exists
        this.metricsFileDescriptor = fs.openSync(Resources.manager().metricsFilePath, `w`);

        Resources.events(this)
            .on(iCPSEventRuntimeError.HANDLED_ERROR, (err: iCPSError) => {
                this.logDataPoint(new iCPSInfluxLineProtocolPoint()
                    .logStatus(FIELDS.STATUS.values.ERROR)
                    .addField(FIELDS.ERROR, err.getDescription()));
            })
            .on(iCPSEventRuntimeWarning.COUNT_MISMATCH, (album: string, expectedCount: number, actualCPLAssets: number, actualCPLMasters: number) => {
                this.logDataPoint(new iCPSInfluxLineProtocolPoint()
                    .addField(FIELDS.COUNT_MISMATCH, `${album} - Expected ${expectedCount}, but got ${actualCPLAssets} CPLAssets and ${actualCPLMasters} CPLMasters`));
            })
            .on(iCPSEventRuntimeWarning.FILETYPE_ERROR, (ext: string, descriptor: string) => {
                this.logDataPoint(new iCPSInfluxLineProtocolPoint()
                    .addField(FIELDS.FILETYPE_ERROR, `${descriptor} (${ext})`));
            })
            .on(iCPSEventRuntimeWarning.LIBRARY_LOAD_ERROR, (err: Error, filePath: string) => {
                this.logDataPoint(new iCPSInfluxLineProtocolPoint()
                    .addField(FIELDS.LIBRARY_LOAD_ERROR, `${filePath} - ${iCPSError.toiCPSError(err).getDescription()}`));
            })
            .on(iCPSEventRuntimeWarning.EXTRANEOUS_FILE, (filePath: string) => {
                this.logDataPoint(new iCPSInfluxLineProtocolPoint()
                    .addField(FIELDS.EXTRANEOUS_FILE, filePath));
            })
            .on(iCPSEventRuntimeWarning.ICLOUD_LOAD_ERROR, (err: Error, asset: CPLAsset) => {
                this.logDataPoint(new iCPSInfluxLineProtocolPoint()
                    .addField(FIELDS.ICLOUD_LOAD_ERROR, `${asset.recordName} - ${iCPSError.toiCPSError(err).getDescription()}`));
            })
            .on(iCPSEventRuntimeWarning.WRITE_ASSET_ERROR, (err: Error, asset: Asset) => {
                this.logDataPoint(new iCPSInfluxLineProtocolPoint()
                    .addField(FIELDS.WRITE_ASSET_ERROR, `${asset.getDisplayName()} - ${iCPSError.toiCPSError(err).getDescription()}`));
            })
            .on(iCPSEventRuntimeWarning.WRITE_ALBUM_ERROR, (err: Error, album: Album) => {
                this.logDataPoint(new iCPSInfluxLineProtocolPoint()
                    .addField(FIELDS.WRITE_ALBUM_ERROR, `${album.getDisplayName()} - ${iCPSError.toiCPSError(err).getDescription()}`));
            })
            .on(iCPSEventRuntimeWarning.LINK_ERROR, (err: Error, srcPath: string, dstPath: string) => {
                this.logDataPoint(new iCPSInfluxLineProtocolPoint()
                    .addField(FIELDS.LINK_ERROR, `${srcPath} -> ${dstPath} - ${iCPSError.toiCPSError(err).getDescription()}`));
            })
            .on(iCPSEventRuntimeWarning.MFA_ERROR, (err: iCPSError) => {
                this.logDataPoint(new iCPSInfluxLineProtocolPoint()
                    .addField(FIELDS.MFA_RESEND_ERROR, err.getDescription()));
            })
            .on(iCPSEventRuntimeWarning.WEB_SERVER_ERROR, (err: iCPSError) => {
                this.logDataPoint(new iCPSInfluxLineProtocolPoint()
                    .addField(FIELDS.WEB_SERVER_ERROR, err.getDescription()));
            })
            .on(iCPSEventRuntimeWarning.RESOURCE_FILE_ERROR, (err: Error) => {
                this.logDataPoint(new iCPSInfluxLineProtocolPoint()
                    .addField(FIELDS.RESOURCE_FILE_ERROR, iCPSError.toiCPSError(err).getDescription()));
            })
            .on(iCPSEventRuntimeWarning.ARCHIVE_ASSET_ERROR, (err: Error) => {
                this.logDataPoint(new iCPSInfluxLineProtocolPoint()
                    .addField(FIELDS.ARCHIVE_ASSET_ERROR, iCPSError.toiCPSError(err).getDescription()));
            });

        Resources.events(this)
            .on(iCPSEventCloud.AUTHENTICATION_STARTED, () => {
                this.logDataPoint(new iCPSInfluxLineProtocolPoint()
                    .logStatus(FIELDS.STATUS.values.AUTHENTICATION_STARTED));
            })
            .on(iCPSEventCloud.AUTHENTICATED, () => {
                this.logDataPoint(new iCPSInfluxLineProtocolPoint()
                    .logStatus(FIELDS.STATUS.values.AUTHENTICATED));
            })
            .on(iCPSEventCloud.MFA_REQUIRED, () => {
                this.logDataPoint(new iCPSInfluxLineProtocolPoint()
                    .logStatus(FIELDS.STATUS.values.MFA_REQUIRED));
            })
            .on(iCPSEventCloud.TRUSTED, () => {
                this.logDataPoint(new iCPSInfluxLineProtocolPoint()
                    .logStatus(FIELDS.STATUS.values.DEVICE_TRUSTED));
            })
            .on(iCPSEventCloud.ACCOUNT_READY, () => {
                this.logDataPoint(new iCPSInfluxLineProtocolPoint()
                    .logStatus(FIELDS.STATUS.values.ACCOUNT_READY));
            })
            .on(iCPSEventCloud.SESSION_EXPIRED, () => {
                this.logDataPoint(new iCPSInfluxLineProtocolPoint()
                    .logStatus(FIELDS.STATUS.values.SESSION_EXPIRED));
            })
            .on(iCPSEventCloud.PCS_REQUIRED, () => {
                this.logDataPoint(new iCPSInfluxLineProtocolPoint()
                    .logStatus(FIELDS.STATUS.values.PCS_REQUIRED));
            })
            .on(iCPSEventCloud.PCS_NOT_READY, () => {
                this.logDataPoint(new iCPSInfluxLineProtocolPoint()
                    .logStatus(FIELDS.STATUS.values.PCS_NOT_READY));
            });

        Resources.events(this)
            .on(iCPSEventMFA.MFA_RECEIVED, () => {
                this.logDataPoint(new iCPSInfluxLineProtocolPoint()
                    .logStatus(FIELDS.STATUS.values.MFA_RECEIVED));
            })
            .on(iCPSEventMFA.MFA_NOT_PROVIDED, () => {
                this.logDataPoint(new iCPSInfluxLineProtocolPoint()
                    .logStatus(FIELDS.STATUS.values.MFA_NOT_PROVIDED));
            });

        Resources.events(this)
            .on(iCPSEventPhotos.READY, () => {
                this.logDataPoint(new iCPSInfluxLineProtocolPoint()
                    .logStatus(FIELDS.STATUS.values.ICLOUD_READY));
            });

        Resources.events(this)
            .on(iCPSEventApp.SCHEDULED, (next: Date) => {
                this.logDataPoint(new iCPSInfluxLineProtocolPoint()
                    .logStatus(FIELDS.STATUS.values.SCHEDULED)
                    .addField(FIELDS.NEXT_SCHEDULE, next.getTime()));
            })
            .on(iCPSEventApp.SCHEDULED_DONE, (next: Date) => {
                this.logDataPoint(new iCPSInfluxLineProtocolPoint()
                    .logStatus(FIELDS.STATUS.values.SCHEDULED_SUCCESS)
                    .addField(FIELDS.NEXT_SCHEDULE, next.getTime()));
            })
            .on(iCPSEventApp.SCHEDULED_RETRY, (next: Date) => {
                this.logDataPoint(new iCPSInfluxLineProtocolPoint()
                    .logStatus(FIELDS.STATUS.values.SCHEDULED_FAILURE)
                    .addField(FIELDS.NEXT_SCHEDULE, next.getTime()));
            })
            .on(iCPSEventApp.SCHEDULED_OVERRUN, (next: Date) => {
                this.logDataPoint(new iCPSInfluxLineProtocolPoint()
                    .logStatus(FIELDS.STATUS.values.SCHEDULED_OVERRUN)
                    .addField(FIELDS.NEXT_SCHEDULE, next.getTime()));
            });

        Resources.events(this)
            .on(iCPSEventSyncEngine.START, () => {
                this.logDataPoint(new iCPSInfluxLineProtocolPoint()
                    .logStatus(FIELDS.STATUS.values.SYNC_START));
            })
            .on(iCPSEventSyncEngine.FETCH_N_LOAD, () => {
                this.logDataPoint(new iCPSInfluxLineProtocolPoint()
                    .logStatus(FIELDS.STATUS.values.FETCH_N_LOAD_STARTED));
            })
            .on(iCPSEventSyncEngine.FETCH_N_LOAD_COMPLETED, (remoteAssetCount: number, remoteAlbumCount: number, localAssetCount: number, localAlbumCount: number) => {
                this.logDataPoint(new iCPSInfluxLineProtocolPoint()
                    .logStatus(FIELDS.STATUS.values.FETCH_N_LOAD_COMPLETED)
                    .addField(FIELDS.LOCAL_ALBUMS_LOADED, localAlbumCount)
                    .addField(FIELDS.LOCAL_ASSETS_LOADED, localAssetCount)
                    .addField(FIELDS.REMOTE_ALBUMS_FETCHED, remoteAlbumCount)
                    .addField(FIELDS.REMOTE_ASSETS_FETCHED, remoteAssetCount),
                );
            })
            .on(iCPSEventSyncEngine.DIFF, () => {
                this.logDataPoint(new iCPSInfluxLineProtocolPoint()
                    .logStatus(FIELDS.STATUS.values.DIFF_STARTED));
            })
            .on(iCPSEventSyncEngine.DIFF_COMPLETED, () => {
                this.logDataPoint(new iCPSInfluxLineProtocolPoint()
                    .logStatus(FIELDS.STATUS.values.DIFF_COMPLETED));
            })
            .on(iCPSEventSyncEngine.WRITE, () => {
                this.logDataPoint(new iCPSInfluxLineProtocolPoint()
                    .logStatus(FIELDS.STATUS.values.WRITE_STARTED));
            })
            .on(iCPSEventSyncEngine.WRITE_ASSETS, (toBeDeletedCount: number, toBeAddedCount: number, toBeKept: number) => {
                this.logDataPoint(new iCPSInfluxLineProtocolPoint()
                    .logStatus(FIELDS.STATUS.values.WRITE_ASSETS_STARTED)
                    .addField(FIELDS.ASSETS_TO_BE_ADDED, toBeAddedCount)
                    .addField(FIELDS.ASSETS_TO_BE_DELETED, toBeDeletedCount)
                    .addField(FIELDS.ASSETS_TO_BE_KEPT, toBeKept),
                );
            })
            .on(iCPSEventSyncEngine.WRITE_ASSET_COMPLETED, (recordName: string) => {
                this.logDataPoint(new iCPSInfluxLineProtocolPoint()
                    .addField(FIELDS.ASSET_WRITTEN, recordName),
                );
            })
            .on(iCPSEventSyncEngine.WRITE_ASSETS_COMPLETED, () => {
                this.logDataPoint(new iCPSInfluxLineProtocolPoint()
                    .logStatus(FIELDS.STATUS.values.WRITE_ASSETS_COMPLETED));
            })
            .on(iCPSEventSyncEngine.WRITE_ALBUMS, (toBeDeletedCount: number, toBeAddedCount: number, toBeKept: number) => {
                this.logDataPoint(new iCPSInfluxLineProtocolPoint()
                    .logStatus(FIELDS.STATUS.values.WRITE_ALBUMS_COMPLETED)
                    .addField(FIELDS.ALBUMS_TO_BE_ADDED, toBeAddedCount)
                    .addField(FIELDS.ALBUMS_TO_BE_DELETED, toBeDeletedCount)
                    .addField(FIELDS.ALBUMS_TO_BE_KEPT, toBeKept),
                );
            })
            .on(iCPSEventSyncEngine.WRITE_ALBUMS_COMPLETED, () => {
                this.logDataPoint(new iCPSInfluxLineProtocolPoint()
                    .logStatus(FIELDS.STATUS.values.WRITE_ALBUMS_COMPLETED));
            })
            .on(iCPSEventSyncEngine.WRITE_COMPLETED, () => {
                this.logDataPoint(new iCPSInfluxLineProtocolPoint()
                    .logStatus(FIELDS.STATUS.values.WRITE_COMPLETED));
            })
            .on(iCPSEventSyncEngine.DONE, () => {
                this.logDataPoint(new iCPSInfluxLineProtocolPoint()
                    .logStatus(FIELDS.STATUS.values.SYNC_COMPLETED));
            })
            .on(iCPSEventSyncEngine.RETRY, () => {
                this.logDataPoint(new iCPSInfluxLineProtocolPoint()
                    .logStatus(FIELDS.STATUS.values.SYNC_RETRY));
            });

        Resources.events(this)
            .on(iCPSEventArchiveEngine.PERSISTING_START, (numberOfAssets: number) => {
                this.logDataPoint(new iCPSInfluxLineProtocolPoint().addField(FIELDS.ASSETS_ARCHIVED, numberOfAssets));
            })
            .on(iCPSEventArchiveEngine.REMOTE_DELETE, (numberOfAssets: number) => {
                this.logDataPoint(new iCPSInfluxLineProtocolPoint().addField(FIELDS.REMOTE_ASSETS_DELETED, numberOfAssets));
            });

        Resources.logger(this).info(`Enabled metrics exporter to file ${Resources.manager().metricsFilePath}`);
    }

    /**
     * Appends the data point to the metrics output file
     * @param dataPoint - The data point to log
     */
    logDataPoint(dataPoint: InfluxLineProtocolPoint) {
        fs.appendFileSync(this.metricsFileDescriptor, dataPoint.toString(), {encoding: FILE_ENCODING});
    }
}