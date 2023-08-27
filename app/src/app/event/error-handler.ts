import * as bt from 'backtrace-node';
import * as PACKAGE_INFO from '../../lib/package.js';
import {iCPSError} from "../error/error.js";
import {randomUUID} from "crypto";
import {AUTH_ERR, ERR_SIGINT, ERR_SIGTERM, LIBRARY_ERR, MFA_ERR} from '../error/error-codes.js';
import fs from 'fs/promises';
import path from 'path';
import {Resources} from '../../lib/resources/main.js';
import {iCPSEventApp, iCPSEventRuntimeError, iCPSEventRuntimeWarning} from '../../lib/resources/events-types.js';
import {FILE_ENCODING} from '../../lib/resources/resource-types.js';
import * as zlib from 'zlib';
import {Readable} from 'stream';
import os from 'os';
import {pEvent} from 'p-event';

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
        if (Resources.manager().enableCrashReporting) {
            const endpoint = `${BACKTRACE_SUBMISSION.DOMAIN}/${BACKTRACE_SUBMISSION.UNIVERSE}/`
                                + `${PACKAGE_INFO.VERSION === `0.0.0-development` ? BACKTRACE_SUBMISSION.TOKEN.DEV : BACKTRACE_SUBMISSION.TOKEN.PROD}/`
                                + BACKTRACE_SUBMISSION.TYPE;

            this.btClient = bt.initialize({
                endpoint,
                handlePromises: true,
                enableMetricsSupport: true,
                attributes: {
                    application: PACKAGE_INFO.NAME,
                    'application.version': PACKAGE_INFO.VERSION,
                },
            });
            // This.btClient.setSymbolication();
            Resources.events(this).on(iCPSEventApp.SCHEDULED_START, async () => {
                await this.reportSyncStart();
            });
        }

        Resources.events(this).on(iCPSEventRuntimeError.SCHEDULED_ERROR, this.handleError.bind(this));
        Resources.events(this).on(iCPSEventRuntimeWarning.FILETYPE_ERROR, this.handleFiletype.bind(this));

        // Register handlers for interrupts
        process.on(`SIGTERM`, async () => {
            await this.handleError(new iCPSError(ERR_SIGTERM));
            process.exit(2);
        });

        process.on(`SIGINT`, async () => {
            await this.handleError(new iCPSError(ERR_SIGINT));
            process.exit(2);
        });
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
        // Todo: report the filetype
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

        const attachments = await this.prepareAttachments(errorUUID);

        const report = this.btClient.createReport(err, {
            'icps.description': err.getDescription(),
            'icps.uuid': errorUUID,
            'icps.rootErrorCode': err.getRootErrorCode(),
            'icps.errorCodeStack': err.getErrorCodeStack().join(`->`),
        }, attachments);

        await this.btClient.sendAsync(report);
        return errorUUID;
    }

    /**
     * Prepares and compresses the error attachments
     * @param errorUUID - The UUID of the error, used to identify the files
     * @returns A promise that resolves to an array of file paths (might be empty)
     */
    async prepareAttachments(errorUUID: string): Promise<string[]> {
        const attachmentDir = await fs.mkdtemp(path.join(os.tmpdir(), `icps-crash-report-`));

        const attachments: string[] = [];

        // Adding log file
        const logFilePath = await this.prepareLogFile(attachmentDir, errorUUID);
        if (logFilePath) {
            attachments.push(logFilePath);
        }

        // Adding HAR file
        const harFilePath = await this.prepareHarFile(attachmentDir, errorUUID);
        if (harFilePath) {
            attachments.push(harFilePath);
        }

        if (attachments.length === 0) {
            Resources.logger(this).warn(`No attachments found for error report`);
            await fs.rmdir(attachmentDir);
            return [];
        }

        Resources.logger(this).info(`Crash report saved to ${attachmentDir}`);

        return attachments;
    }

    /**
     * Prepares the log file for submission.
     * This function extracts relevant parts of the log file, in order to streamline error reporting
     * @param attachmentDir - The directory to store the prepared log file in
     * @param errorUUID - The UUID of the error, used to identify the log file
     * @returns A promise that resolves to the path of the prepared log file - compressed using the brotli algorithm
     */
    async prepareLogFile(attachmentDir: string, errorUUID: string): Promise<string | undefined> {
        const maxNumberOfLines = 200;
        const targetPath = path.join(attachmentDir, `icps-crash-${errorUUID}.log`);

        try {
            // Reading current log file and determining length
            const data = (await fs.readFile(Resources.manager().logFilePath, {encoding: FILE_ENCODING})).split(`\n`);
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
                    truncatedData.push(`${data[i]}\n`);
                }
            }

            truncatedData.push(null);

            await this.compressStream(targetPath, truncatedData);

            return targetPath;
        } catch (err) {
            Resources.logger(this).warn(`Unable to prepare log file for crash report: ${err.message}`);
            return undefined;
        }
    }

    /**
     * Prepares the HAR file for submission
     * @param attachmentDir - The directory to store the prepared log file in
     * @param errorUUID - The UUID of the error, used to identify the log file
     * @returns A promise that resolves to the path of the prepared HAR file, or undefined if no file was written - compressed using the brotli algorithm
     */
    async prepareHarFile(attachmentDir: string, errorUUID: string): Promise<string | undefined> {
        if (!(await Resources.network().writeHarFile())) {
            return undefined;
        }

        const targetPath = path.join(attachmentDir, `icps-crash-${errorUUID}.har`);
        let harData: fs.FileHandle;
        try {
            harData = await fs.open(Resources.manager().harFilePath, `r`);

            const harStream = harData.createReadStream();
            await this.compressStream(targetPath, harStream);
        } catch (err) {
            Resources.logger(this).warn(`Unable to prepare HAR file for crash report: ${err.message}`);
            return undefined;
        } finally {
            await harData?.close();
        }

        return targetPath;
    }

    async compressStream(targetPath: string, data: Readable): Promise<void> {
        let targetFd: fs.FileHandle;
        try {
            targetFd = await fs.open(`${targetPath}.br`, `w`);
            const output = targetFd.createWriteStream();

            const brotliStream = zlib.createBrotliCompress();
            data.pipe(brotliStream).pipe(output);
            await pEvent(output, `finish`, {rejectionEvents: [`error`]});
        } finally {
            await targetFd?.close();
        }
    }

    /**
     * Reports a scheduled sync start
     * Only runs if this.btClient is defined (i.e. error reporting is enabled)
     */
    async reportSyncStart() {
        try {
            await (this.btClient as any)._backtraceMetrics.sendSummedEvent(`Sync`);
        } catch (err) {
            await this.reportError(new iCPSError({name: `iCPSError`, code: `METRIC_FAILED`, message: `Unable to report sync start`}).addCause(err));
        }
    }

    /**
    * This function removes confidential data from the environment after parsing arguments, to make sure, nothing is collected.
    */
    static cleanEnv() {
        const confidentialData = {
            username: {
                env: `APPLE_ID_USER`,
                cli: [
                    `-u`, `--username`,
                ],
                replacement: `<APPLE ID USERNAME>`,
            },
            password: {
                env: `APPLE_ID_PWD`,
                cli: [
                    `-p`, `--password`,
                ],
                replacement: `<APPLE ID PASSWORD>`,
            },
            "trust-token": {
                env: `TRUST_TOKEN`,
                cli: [
                    `-T`, `--trust-token`,
                ],
                replacement: `<TRUST TOKEN>`,
            },
        };

        for (const confidentialEntry of Object.values(confidentialData)) {
            if (process.env[confidentialEntry.env]) {
                process.env[confidentialEntry.env] = confidentialEntry.replacement;
            }

            for (const confidentialCliValue of confidentialEntry.cli) {
                const confidentialCliValueIndexArgV = process.argv.findIndex(value => value === confidentialCliValue);
                if (confidentialCliValueIndexArgV !== -1) {
                    process.argv[confidentialCliValueIndexArgV + 1] = confidentialEntry.replacement;
                }

                const confidentialCliValueIndexExecArgV = process.execArgv.findIndex(value => value === confidentialCliValue);
                if (confidentialCliValueIndexExecArgV !== -1) {
                    process.argv[confidentialCliValueIndexExecArgV + 1] = confidentialEntry.replacement;
                }
            }
        }
    }
}