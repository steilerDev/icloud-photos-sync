import * as PACKAGE_INFO from '../../lib/package.js';
import {iCPSError} from "../error/error.js";
import {randomUUID} from "crypto";
import {AUTH_ERR, ERR_SIGINT, ERR_SIGTERM, FILETYPE_REPORT, LIBRARY_ERR, MFA_ERR} from '../error/error-codes.js';
import fs from 'fs/promises';
import path from 'path';
import {Resources} from '../../lib/resources/main.js';
import {iCPSEventApp, iCPSEventArchiveEngine, iCPSEventCloud, iCPSEventMFA, iCPSEventPhotos, iCPSEventRuntimeError, iCPSEventRuntimeWarning, iCPSEventSyncEngine} from '../../lib/resources/events-types.js';
import {FILE_ENCODING} from '../../lib/resources/resource-types.js';
import * as zlib from 'zlib';
import {Readable} from 'stream';
import {pEvent} from 'p-event';
import bt from '@backtrace-labs/node';
import {MFAMethod} from '../../lib/icloud/mfa/mfa-method.js';

/**
 * List of errors that will never get reported
 */
const reportDenyList = [
    ERR_SIGINT.code,
    ERR_SIGTERM.code,
    MFA_ERR.ADDR_IN_USE_ERR.code, // Only happens if port/address is in use
    MFA_ERR.SERVER_TIMEOUT.code, // Only happens if user does not interact within 10 minutes
    LIBRARY_ERR.LOCKED.code, // Only happens if library is locked
    AUTH_ERR.UNAUTHORIZED.code, // Only happens if username/password don't match
];

const BACKTRACE_SUBMISSION = {
    DOMAIN: `https://submit.backtrace.io`,
    UNIVERSE: `steilerdev`,
    TOKEN: {
        PROD: `92b77410edda81e81e4e3b37e24d5a7045e1dae2825149fb022ba46da82b6b49`,
        DEV: `bf2e718ef569a1421ba4f3c9b36a8e4b84b1c4043265533f204e5759f7f4edee`,
    },
    TYPE: `json`,
};

/**
 * This class handles errors thrown or `HANDLER_EVENT` emitted by classes of this application
 */
export class ErrorHandler {
    /**
     * The error reporting client - if activated
     */
    btClient?: bt.BacktraceClient;

    constructor() {
        // Register handlers for interrupts
        process.on(`SIGTERM`, async () => {
            await this.handleError(new iCPSError(ERR_SIGTERM));
            process.exit(2);
        });

        process.on(`SIGINT`, async () => {
            await this.handleError(new iCPSError(ERR_SIGINT));
            process.exit(2);
        });

        Resources.events(this).on(iCPSEventRuntimeError.SCHEDULED_ERROR, this.handleError.bind(this));

        if (Resources.manager().enableCrashReporting) {
            const endpoint = `${BACKTRACE_SUBMISSION.DOMAIN}/${BACKTRACE_SUBMISSION.UNIVERSE}/`
                                + `${PACKAGE_INFO.VERSION === `0.0.0-development` ? BACKTRACE_SUBMISSION.TOKEN.DEV : BACKTRACE_SUBMISSION.TOKEN.PROD}/`
                                + BACKTRACE_SUBMISSION.TYPE;

            this.btClient = bt.BacktraceClient.initialize({
                url: endpoint,
                database: {
                    enable: true,
                    path: path.join(Resources.manager().dataDir, `.crash-reporter`),
                    captureNativeCrashes: true,
                    createDatabaseDirectory: true,
                    autoSend: true,
                },
                breadcrumbs: {
                    enable: true,
                    eventType: bt.BreadcrumbType.Manual,
                },
                beforeSend(data: bt.BacktraceData) {
                    return Object.assign(
                        data,
                        JSON.parse(ErrorHandler.maskConfidentialData(JSON.stringify(data))),
                    );
                },
            });

            // This.btClient.setSymbolication();
            Resources.events(this).on(iCPSEventApp.SCHEDULED_START, () => {
                this.btClient.metrics.addSummedEvent(`SyncExecution`);
            });

            Resources.events(this).on(iCPSEventArchiveEngine.ARCHIVE_START, () => {
                this.btClient.metrics.addSummedEvent(`ArchiveExecution`);
            });

            Resources.events(this).on(iCPSEventRuntimeWarning.FILETYPE_ERROR, this.handleFiletype.bind(this));

            this.registerBreadcrumbs();
        }
    }

    /**
     * Handles a given error. Report fatal errors and provide appropriate output.
     * @param err - The occurred error
     */
    async handleError(err: unknown) {
        const _err = iCPSError.toiCPSError(err);
        const rootErrorCode = _err.getRootErrorCode(true);

        Resources.logger(this).info(`Handling error ${_err.code} caused by ${rootErrorCode}`);

        // Report error and append error code
        if (reportDenyList.indexOf(rootErrorCode) === -1) {
            _err.btUUID = await this.reportError(_err);
        }

        Resources.emit(iCPSEventRuntimeError.HANDLED_ERROR, _err);
    }

    async handleFiletype(_ext: string, _descriptor?: string) {
        const report = new bt.BacktraceReport(new iCPSError(FILETYPE_REPORT),
            {
                'icps.filetype.extension': _ext,
                'icps.filetype.descriptor': _descriptor,
            },
            [],
            {
                skipFrames: Infinity,
            });

        await this.btClient.send(report);
    }

    /**
     * Registers event listeners to provide breadcrumbs
     */
    registerBreadcrumbs() {
        Resources.events(this)
            .on(iCPSEventRuntimeWarning.MFA_ERROR, (err: Error) => {
                this.btClient.breadcrumbs.warn(`MFA_ERROR`, {error: iCPSError.toiCPSError(err).getDescription()});
            })
            .on(iCPSEventRuntimeWarning.FILETYPE_ERROR, (ext: string, descriptor: string) => {
                this.btClient.breadcrumbs.warn(`FILETYPE_ERROR`, {ext, descriptor});
            })
            .on(iCPSEventRuntimeWarning.RESOURCE_FILE_ERROR, (err: iCPSError) => {
                this.btClient.breadcrumbs.warn(`RESOURCE_FILE_ERROR`, {error: err.getDescription()});
            })
            .on(iCPSEventRuntimeWarning.EXTRANEOUS_FILE, () => {
                this.btClient.breadcrumbs.warn(`EXTRANEOUS_FILE`);
            })
            .on(iCPSEventRuntimeWarning.LIBRARY_LOAD_ERROR, (err: Error) => {
                this.btClient.breadcrumbs.warn(`LIBRARY_LOAD_ERROR`, {error: iCPSError.toiCPSError(err).getDescription()});
            })
            .on(iCPSEventRuntimeWarning.COUNT_MISMATCH, (_album: string, expectedCount: number, actualCPLAssets: number, actualCPLMasters: number) => {
                this.btClient.breadcrumbs.warn(`COUNT_MISMATCH`, {
                    expectedCount,
                    actualCPLAssets,
                    actualCPLMasters,
                });
            })
            .on(iCPSEventRuntimeWarning.ICLOUD_LOAD_ERROR, (err: Error) => {
                this.btClient.breadcrumbs.warn(`ICLOUD_LOAD_ERROR`, {error: iCPSError.toiCPSError(err).getDescription()});
            })
            .on(iCPSEventRuntimeWarning.WRITE_ASSET_ERROR, (err: Error) => {
                this.btClient.breadcrumbs.warn(`WRITE_ASSET_ERROR`, {error: iCPSError.toiCPSError(err).getDescription()});
            })
            .on(iCPSEventRuntimeWarning.WRITE_ALBUM_ERROR, (err: Error) => {
                this.btClient.breadcrumbs.warn(`WRITE_ALBUM_ERROR`, {error: iCPSError.toiCPSError(err).getDescription()});
            })
            .on(iCPSEventRuntimeWarning.LINK_ERROR, (err: Error) => {
                this.btClient.breadcrumbs.warn(`LINK_ERROR`, {error: iCPSError.toiCPSError(err).getDescription()});
            })
            .on(iCPSEventRuntimeWarning.ARCHIVE_ASSET_ERROR, (err: Error) => {
                this.btClient.breadcrumbs.warn(`ARCHIVE_ASSET_ERROR`, {error: iCPSError.toiCPSError(err).getDescription()});
            });

        Resources.events(this)
            .on(iCPSEventCloud.AUTHENTICATION_STARTED, () => {
                this.btClient.breadcrumbs.info(`AUTHENTICATION_STARTED`);
            })
            .on(iCPSEventCloud.AUTHENTICATED, () => {
                this.btClient.breadcrumbs.info(`AUTHENTICATED`);
            })
            .on(iCPSEventCloud.MFA_REQUIRED, () => {
                this.btClient.breadcrumbs.warn(`MFA_REQUIRED`);
            })
            .on(iCPSEventCloud.TRUSTED, () => {
                this.btClient.breadcrumbs.info(`TRUSTED`);
            })
            .on(iCPSEventCloud.ACCOUNT_READY, () => {
                this.btClient.breadcrumbs.info(`ACCOUNT_READY`);
            });

        Resources.events(this)
            .on(iCPSEventMFA.STARTED, () => {
                this.btClient.breadcrumbs.info(`MFA_STARTED`);
            })
            .on(iCPSEventMFA.MFA_RESEND, (method: MFAMethod) => {
                this.btClient.breadcrumbs.info(`MFA_RESEND`, {method: method.toString()});
            })
            .on(iCPSEventMFA.MFA_RECEIVED, (method: MFAMethod) => {
                this.btClient.breadcrumbs.info(`MFA_RECEIVED`, {method: method.toString()});
            })
            .on(iCPSEventMFA.MFA_NOT_PROVIDED, () => {
                this.btClient.breadcrumbs.error(`MFA_NOT_PROVIDED`);
            });

        Resources.events(this)
            .on(iCPSEventPhotos.SETUP_COMPLETED, () => {
                this.btClient.breadcrumbs.info(`SETUP_COMPLETED`);
            })
            .on(iCPSEventPhotos.READY, () => {
                this.btClient.breadcrumbs.info(`PHOTOS_READY`);
            });

        Resources.events(this)
            .on(iCPSEventSyncEngine.START, () => {
                this.btClient.breadcrumbs.info(`SYNC_STARTED`);
            })
            .on(iCPSEventSyncEngine.FETCH_N_LOAD, () => {
                this.btClient.breadcrumbs.info(`FETCH_N_LOAD`);
            })
            .on(iCPSEventSyncEngine.FETCH_N_LOAD_COMPLETED, (remoteAssetCount: number, remoteAlbumCount: number, localAssetCount: number, localAlbumCount: number) => {
                this.btClient.breadcrumbs.info(`FETCH_N_LOAD_COMPLETED`, {
                    remoteAssetCount,
                    remoteAlbumCount,
                    localAssetCount,
                    localAlbumCount,
                });
            })
            .on(iCPSEventSyncEngine.DIFF, () => {
                this.btClient.breadcrumbs.info(`DIFF`);
            })
            .on(iCPSEventSyncEngine.DIFF_COMPLETED, () => {
                this.btClient.breadcrumbs.info(`DIFF_COMPLETED`);
            })
            .on(iCPSEventSyncEngine.WRITE, () => {
                this.btClient.breadcrumbs.info(`WRITE`);
            })
            .on(iCPSEventSyncEngine.WRITE_ASSETS, (toBeDeletedCount: number, toBeAddedCount: number, toBeKept: number) => {
                this.btClient.breadcrumbs.info(`WRITE_ASSETS`, {
                    toBeDeletedCount,
                    toBeAddedCount,
                    toBeKept,
                });
            })
            .on(iCPSEventSyncEngine.WRITE_ASSET_COMPLETED, () => {
                this.btClient.breadcrumbs.info(`WRITE_ASSET_COMPLETED`);
            })
            .on(iCPSEventSyncEngine.WRITE_ASSETS_COMPLETED, () => {
                this.btClient.breadcrumbs.info(`WRITE_ASSETS_COMPLETED`);
            })
            .on(iCPSEventSyncEngine.WRITE_ALBUMS, (toBeDeletedCount: number, toBeAddedCount: number, toBeKept: number) => {
                this.btClient.breadcrumbs.info(`WRITE_ALBUMS`, {
                    toBeDeletedCount,
                    toBeAddedCount,
                    toBeKept,
                });
            })
            .on(iCPSEventSyncEngine.WRITE_ALBUMS_COMPLETED, () => {
                this.btClient.breadcrumbs.info(`WRITE_ALBUMS_COMPLETED`);
            })
            .on(iCPSEventSyncEngine.WRITE_COMPLETED, () => {
                this.btClient.breadcrumbs.info(`WRITE_COMPLETED`);
            })
            .on(iCPSEventSyncEngine.DONE, () => {
                this.btClient.breadcrumbs.info(`SYNC_COMPLETED`);
            })
            .on(iCPSEventSyncEngine.RETRY, (retryCount: number, err: iCPSError) => {
                this.btClient.breadcrumbs.warn(`SYNC_RETRY`, {retryCount, error: iCPSError.toiCPSError(err).getDescription()});
            });

        Resources.events(this)
            .on(iCPSEventArchiveEngine.ARCHIVE_START, () => {
                this.btClient.breadcrumbs.info(`ARCHIVE_STARTED`);
            })
            .on(iCPSEventArchiveEngine.PERSISTING_START, (numberOfAssets: number) => {
                this.btClient.breadcrumbs.info(`PERSISTING_START`, {numberOfAssets});
            })
            .on(iCPSEventArchiveEngine.REMOTE_DELETE, (numberOfAssets: number) => {
                this.btClient.breadcrumbs.info(`REMOTE_DELETE`, {numberOfAssets});
            })
            .on(iCPSEventArchiveEngine.ARCHIVE_DONE, () => {
                this.btClient.breadcrumbs.info(`ARCHIVE_COMPLETED`);
            });
    }

    /**
     * Reports the provided error to the error reporting backend
     * @param err - The occurred error
     * @returns - An unique error code
     */
    async reportError(err: iCPSError): Promise<string> {
        if (!this.btClient) {
            return `Enable crash reporting for error code`;
        }

        const errorUUID = randomUUID();

        const attachments = await this.prepareAttachments();

        const report = new bt.BacktraceReport(err, {
            'icps.description': err.getDescription(),
            'icps.uuid': errorUUID,
            'icps.rootErrorCode': err.getRootErrorCode(),
            'icps.errorCodeStack': err.getErrorCodeStack().join(`->`),
        }, attachments);

        await this.btClient.send(report);
        return errorUUID;
    }

    /**
     * Prepares and compresses the error attachments
     * @returns A promise that resolves to an array of file paths (might be empty)
     */
    async prepareAttachments(): Promise<bt.BacktraceAttachment[]> {
        const attachments: bt.BacktraceAttachment[] = [];

        // Adding log file
        const logFile = await this.prepareLogFile();
        if (logFile) {
            attachments.push(new bt.BacktraceBufferAttachment(`icps.log.br`, logFile));
        }

        // Adding HAR file
        const harFile = await this.prepareHarFile();
        if (harFile) {
            attachments.push(new bt.BacktraceBufferAttachment(`icps.har.br`, harFile));
        }

        if (attachments.length === 0) {
            Resources.logger(this).warn(`No attachments found for error report`);
        }

        return attachments;
    }

    /**
     * Prepares the log file for submission.
     * This function extracts relevant parts of the log file, in order to streamline error reporting
     * @returns A promise that resolves to a Buffer holding the prepared log file - compressed using the brotli algorithm
     */
    async prepareLogFile(): Promise<Buffer | undefined> {
        const maxNumberOfLines = 200;
        const filePath = Resources.manager().logFilePath;
        if (!filePath) {
            return undefined;
        }

        try {
            // Reading current log file and determining length
            const data = (await fs.readFile(filePath, {encoding: FILE_ENCODING})).split(`\n`);
            const totalNumberOfLines = data.length;

            if (totalNumberOfLines === 0) {
                return undefined;
            }

            // If there is nothing to truncate, we copy the original log file
            const truncatedData = new Readable();

            // If we truncate, make a note of it
            if (totalNumberOfLines > maxNumberOfLines) {
                truncatedData.push(`########################\n`);
                truncatedData.push(`# Truncated ${totalNumberOfLines - maxNumberOfLines} lines\n`);
                truncatedData.push(`########################\n`);
            }

            for (let i = 0; i < totalNumberOfLines; i++) {
                if (i > (totalNumberOfLines - maxNumberOfLines)) {
                    truncatedData.push(
                        ErrorHandler.maskConfidentialData(data[i]) + `\n`,
                    );
                }
            }

            truncatedData.push(null);

            return await this.compressStream(truncatedData);
        } catch (err) {
            Resources.logger(this).warn(`Unable to prepare log file for crash report: ${err.message}`);
            return undefined;
        }
    }

    /**
     * Prepares the HAR file for submission
     * @returns A promise that resolves to a Buffer holding the prepared HAR file, or undefined if no file is available - compressed using the brotli algorithm
     */
    async prepareHarFile(): Promise<Buffer | undefined> {
        const filePath = Resources.manager().harFilePath;
        if (!filePath) {
            return undefined;
        }

        try {
            const harData = await fs.readFile(Resources.manager().harFilePath, {encoding: FILE_ENCODING});

            const dataStream = new Readable();
            dataStream.push(ErrorHandler.maskConfidentialData(harData));
            dataStream.push(null);

            return this.compressStream(dataStream);
        } catch (err) {
            Resources.logger(this).warn(`Unable to prepare HAR file for crash report: ${err.message}`);
            return undefined;
        }
    }

    async compressStream(data: Readable): Promise<Buffer> {
        const brotliStream = zlib.createBrotliCompress();
        const chunks = [];
        brotliStream.on(`data`, chunk => {
            chunks.push(chunk);
        });
        data.pipe(brotliStream);
        await pEvent(brotliStream, `end`, {rejectionEvents: [`error`]});
        return Buffer.concat(chunks);
    }

    /**
     * This function masks confidential data from the provided input string
     * @param input - The input string to mask
     * @returns The masked string
     */
    static maskConfidentialData(input: string): string {
        return input
            .replaceAll(Resources.manager().username, `<APPLE ID USERNAME>`)
            .replaceAll(Resources.manager().password, `<APPLE ID PASSWORD>`)
            .replaceAll(Resources.manager().trustToken, `<TRUST TOKEN>`);
    }
}