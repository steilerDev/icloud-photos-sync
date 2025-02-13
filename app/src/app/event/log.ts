/* eslint-disable no-fallthrough */

import * as fs from 'fs';
import {Resources} from "../../lib/resources/main.js";
import {iCPSEventLog, iCPSEventRuntimeError, iCPSEventRuntimeWarning, iCPSEventSyncEngine} from "../../lib/resources/events-types.js";
import {iCPSError} from "../error/error.js";
import {FILE_ENCODING} from '../../lib/resources/resource-types.js';
import {Asset} from '../../lib/photos-library/model/asset.js';
import {CPLAsset} from '../../lib/icloud/icloud-photos/query-parser.js';
import {Album} from '../../lib/photos-library/model/album.js';

export enum LogLevel {
    DEBUG = `debug`,
    INFO = `info`,
    WARN = `warn`,
    ERROR = `error`,
}

/**
 * This class handles the input/output to a log file
 */
export class LogInterface {
    /**
     * The opened file descriptor of the log file
     */
    private logFileDescriptor: number;

    constructor() {
        // Try opening the file - truncate if exists
        this.logFileDescriptor = fs.openSync(Resources.manager().logFilePath, `w`);

        switch (Resources.manager().logLevel) {
        case `debug`:
            Resources.events(this).on(iCPSEventLog.DEBUG, (source: unknown, msg: string) => this.logMessage(LogLevel.DEBUG, source, msg));
        default:
        case `info`:
            Resources.events(this).on(iCPSEventLog.INFO, (source: unknown, msg: string) => this.logMessage(LogLevel.INFO, source, msg));
        case `warn`:
            Resources.events(this)
                .on(iCPSEventLog.WARN, (source: unknown, msg: string) => this.logMessage(LogLevel.WARN, source, msg))
                .on(iCPSEventRuntimeWarning.COUNT_MISMATCH, (album: string, expectedCount: number, actualCPLAssets: number, actualCPLMasters: number) => {
                    this.logMessage(LogLevel.WARN, `RuntimeWarning`, `Expected ${expectedCount} CPLAssets & CPLMasters, but got ${actualCPLAssets} CPLAssets and ${actualCPLMasters} CPLMasters for album ${album}`);
                })
                .on(iCPSEventRuntimeWarning.FILETYPE_ERROR, (ext: string, descriptor: string) => {
                    this.logMessage(LogLevel.WARN, `RuntimeWarning`, `Unknown file extension ${ext} for descriptor ${descriptor}`);
                })
                .on(iCPSEventRuntimeWarning.LIBRARY_LOAD_ERROR, (err: Error, filePath: string) => {
                    this.logMessage(LogLevel.WARN, `RuntimeWarning`, `Error while loading file ${filePath}: ${iCPSError.toiCPSError(err).getDescription()}`);
                })
                .on(iCPSEventRuntimeWarning.EXTRANEOUS_FILE, (filePath: string) => {
                    this.logMessage(LogLevel.WARN, `RuntimeWarning`, `Extraneous file found in directory ${filePath}`);
                })
                .on(iCPSEventRuntimeWarning.ICLOUD_LOAD_ERROR, (err: Error, asset: CPLAsset) => {
                    this.logMessage(LogLevel.WARN, `RuntimeWarning`, `Error while loading iCloud asset ${asset.recordName}: ${iCPSError.toiCPSError(err).getDescription()}`);
                })
                .on(iCPSEventRuntimeWarning.WRITE_ASSET_ERROR, (err: Error, asset: Asset) => {
                    this.logMessage(LogLevel.WARN, `RuntimeWarning`, `Error while verifying asset ${asset.getDisplayName()}: ${iCPSError.toiCPSError(err).getDescription()}`);
                })
                .on(iCPSEventRuntimeWarning.WRITE_ALBUM_ERROR, (err: Error, album: Album) => {
                    this.logMessage(LogLevel.WARN, `RuntimeWarning`, `Error while writing album ${album.getDisplayName()}: ${iCPSError.toiCPSError(err).getDescription()}`);
                })
                .on(iCPSEventRuntimeWarning.LINK_ERROR, (err: Error, srcPath: string, dstPath: string) => {
                    this.logMessage(LogLevel.WARN, `RuntimeWarning`, `Error while linking ${srcPath} to ${dstPath}: ${iCPSError.toiCPSError(err).getDescription()}`);
                })
                .on(iCPSEventRuntimeWarning.MFA_ERROR, (err: iCPSError) => {
                    this.logMessage(LogLevel.WARN, `RuntimeWarning`, `Error within MFA flow: ${err.getDescription()}`);
                })
                .on(iCPSEventRuntimeWarning.RESOURCE_FILE_ERROR, (err: Error) => {
                    this.logMessage(LogLevel.WARN, `RuntimeWarning`, `Error while accessing resource file: ${iCPSError.toiCPSError(err).getDescription()}`);
                })
                .on(iCPSEventRuntimeWarning.ARCHIVE_ASSET_ERROR, (err: Error, assetPath: string) => {
                    this.logMessage(LogLevel.WARN, `RuntimeWarning`, `Error while archiving asset ${assetPath}: ${iCPSError.toiCPSError(err).getDescription()}`);
                });
            Resources.events(this)
                .on(iCPSEventSyncEngine.RETRY, (_retryCount: number, err: Error) => {
                    this.logMessage(LogLevel.WARN, `RuntimeWarning`, `Detected error during sync: ${iCPSError.toiCPSError(err).getDescription()}`);
                });
        case `error`:
            Resources.events(this)
                .on(iCPSEventLog.ERROR, (source: unknown, msg: string) => this.logMessage(LogLevel.ERROR, source, msg))
                .on(iCPSEventRuntimeError.HANDLED_ERROR, (err: iCPSError) => this.logMessage(LogLevel.ERROR, `RuntimeError`, err.getDescription()));
        }
    }

    /**
     * Logs a message to the log file
     * @param level - The log level
     * @param source - The source of the message, either a string of an object instance
     * @param msg - The message to log
     */
    private logMessage(level: LogLevel, source: unknown, msg: string) {
        const _source = typeof source === `string` ? source : String(source.constructor.name);

        const prefixedMessage = `[${new Date().toISOString()}] ${level.toUpperCase()} ${_source}: ${msg}\n`;

        if (Resources.manager().logToCli) {
            console.log(prefixedMessage);
            return;
        }

        fs.appendFileSync(this.logFileDescriptor, prefixedMessage, {encoding: FILE_ENCODING});
    }
}