import {BacktraceAttachment, BacktraceBufferAttachment, BacktraceClient, BacktraceClientBuilder, BacktraceData, BacktraceReport, BacktraceSetupConfiguration, BreadcrumbType} from "@backtrace/node";
import {randomUUID} from "crypto";
import {readFileSync} from 'fs';
import fs from 'fs/promises';
import {hostname} from 'os';
import {jsonc} from "jsonc";
import {once} from 'events';
import {Readable} from 'stream';
import * as zlib from 'zlib';
import {MFAMethod} from '../../lib/icloud/mfa/mfa-method.js';
import {iCPSEventArchiveEngine, iCPSEventCloud, iCPSEventMFA, iCPSEventPhotos, iCPSEventRuntimeError, iCPSEventRuntimeWarning, iCPSEventSyncEngine, iCPSEventWebServer} from '../../lib/resources/events-types.js';
import {Resources} from '../../lib/resources/main.js';
import {FILE_ENCODING} from '../../lib/resources/resource-types.js';
import {AUTH_ERR, ERR_SIGINT, ERR_SIGTERM, FILETYPE_REPORT, LIBRARY_ERR, MFA_ERR, WEB_SERVER_ERR} from "../error/error-codes.js";
import {errorMessage, iCPSError} from "../error/error.js";

/**
 * List of errors that will never get reported
 */
const reportDenyList = [
    ERR_SIGINT.code,
    ERR_SIGTERM.code,
    WEB_SERVER_ERR.ADDR_IN_USE_ERR.code, // Only happens if port/address is in use
    WEB_SERVER_ERR.INSUFFICIENT_PRIVILEGES.code, // Only happens if user is lacking privileges to open port/address
    MFA_ERR.MFA_TIMEOUT.code, // Only happens if user does not interact within 10 minutes
    MFA_ERR.CODE_REJECTED.code, // Only happens if MFA code is rejected from backend, e.g. if code is invalid
    LIBRARY_ERR.LOCKED.code, // Only happens if library is locked
    AUTH_ERR.UNAUTHORIZED.code, // Only happens if username/password don't match
];

/**
 * Headers (lower case) carrying session secrets - their values are masked before submitting crash reports
 */
const CONFIDENTIAL_HEADERS = [
    `cookie`,
    `set-cookie`,
    `scnt`,
    `x-apple-id-session-id`,
    `x-apple-session-token`,
    `x-apple-twosv-trust-token`,
    `x-apple-auth-attributes`,
    `authorization`,
];

/**
 * Placeholder for masked header values
 */
const MASKED_VALUE = `<MASKED>`;

const BACKTRACE_SUBMISSION = {
    DOMAIN: `https://submit.backtrace.io`,
    UNIVERSE: `steilerdev`,
    TOKEN: {
        PROD: `92b77410edda81e81e4e3b37e24d5a7045e1dae2825149fb022ba46da82b6b49`,
        DEV: `bf2e718ef569a1421ba4f3c9b36a8e4b84b1c4043265533f204e5759f7f4edee`,
    },
    TYPE: `json`,
};

type BacktraceAttributeProvider = Parameters<BacktraceClientBuilder[`addAttributeProvider`]>[0];

/**
 * Provides the `guid` attribute without spawning a shell.
 * Backtrace's default provider uses `execSync` to read the machine id, which requires `/bin/sh` and is denied by Node's permission model (unless `--allow-child-process` is granted).
 * On Linux, the machine id files are read directly - producing the same `guid` as the default provider. On other platforms, the default provider is only used if spawning child processes is permitted.
 */
export class MachineIdAttributeProvider implements BacktraceAttributeProvider {
    /**
     * @param shellProvider - Backtrace's default machine identifier provider, used on platforms without machine id files
     * @param machineIdFiles - Files holding the machine id, in order of precedence
     */
    constructor(
        private readonly shellProvider?: BacktraceAttributeProvider,
        private readonly machineIdFiles: string[] = [`/var/lib/dbus/machine-id`, `/etc/machine-id`],
    ) {}

    get type() {
        return `scoped` as const;
    }

    get(): Record<string, unknown> {
        return {
            guid: this.generateGuid() || randomUUID(),
        };
    }

    /**
     * @returns The normalized machine id, or undefined if it could not be determined
     */
    generateGuid(): string | undefined {
        if (process.platform !== `linux`) {
            return process.permission?.has(`child`) === false
                ? undefined
                : this.shellProvider?.get()[`guid`] as string | undefined;
        }

        // Equivalent to `( cat /var/lib/dbus/machine-id /etc/machine-id || hostname ) | head -n 1` - cat fails if any file is unreadable, appending the hostname
        let output = ``;
        let unreadable = false;
        for (const file of this.machineIdFiles) {
            try {
                output += readFileSync(file, {encoding: `utf8`});
            } catch {
                unreadable = true;
            }
        }

        if (unreadable) {
            output += `${hostname()}\n`;
        }

        return output.split(`\n`)[0].replace(/\s+/g, ``).toLowerCase();
    }
}

/**
 * Backtrace client builder, replacing the default machine identifier provider with the shell-free MachineIdAttributeProvider
 */
export class ShellFreeBacktraceClientBuilder extends BacktraceClientBuilder {
    constructor(options: BacktraceSetupConfiguration) {
        super({options});
        const providers = this.clientSetup.attributeProviders ?? [];
        // The default provider is not exported, identifying it by its distinct method
        const shellProvider = providers.find(provider => `generateGuid` in provider);
        this.clientSetup.attributeProviders = providers.filter(provider => provider !== shellProvider);
        this.addAttributeProvider(new MachineIdAttributeProvider(shellProvider));
    }
}

/**
 * This class handles errors and error reporting
 */
export class ErrorHandler {
    /**
     * The error reporting client - if activated
     */
    btClient?: BacktraceClient;

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

        // Register handler for errors during scheduled execution
        Resources.events(this).on(iCPSEventRuntimeError.SCHEDULED_ERROR, this.handleError.bind(this));

        if (Resources.manager().enableCrashReporting) {
            const endpoint = `${BACKTRACE_SUBMISSION.DOMAIN}/${BACKTRACE_SUBMISSION.UNIVERSE}/`
                                + `${Resources.PackageInfo.version === `0.0.0-development` ? BACKTRACE_SUBMISSION.TOKEN.DEV : BACKTRACE_SUBMISSION.TOKEN.PROD}/`
                                + BACKTRACE_SUBMISSION.TYPE;

            const btClient = new ShellFreeBacktraceClientBuilder({
                userAttributes: {
                    application: Resources.PackageInfo.name,
                    'application.version': Resources.PackageInfo.version,
                },
                url: endpoint,
                breadcrumbs: {
                    enable: true,
                    eventType: BreadcrumbType.Manual,
                    maximumBreadcrumbs: 200,
                },
                metrics: {
                    enable: true,
                    autoSendInterval: 0,
                },
                beforeSend(data: BacktraceData) {
                    return Object.assign(
                        data,
                        ErrorHandler.maskConfidentialHeaders(jsonc.parse(ErrorHandler.maskConfidentialData(jsonc.stringify(data)))),
                    );
                },
            }).build();

            this.btClient = btClient;

            // Register listener for unknown filetypes
            Resources.events(this).on(iCPSEventRuntimeWarning.FILETYPE_ERROR, this.handleFiletype.bind(this));

            // Usage statistics
            Resources.events(this).on(iCPSEventSyncEngine.START, () => {
                btClient.metrics?.addSummedEvent(`SyncExecution`);
                btClient.metrics?.send();
            });
            Resources.events(this).on(iCPSEventArchiveEngine.ARCHIVE_START, () => {
                btClient.metrics?.addSummedEvent(`ArchiveExecution`);
                btClient.metrics?.send();
            });

            this.registerBreadcrumbs();
        }
    }

    /**
     * Handles a given error, by providing error reporting (if enabled)
     * @param err - The occurred error
     * @emits iCPSEventRuntimeError.HANDLED_ERROR - providing the handled iCPSError as argument once the error was handled
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

    /**
     * Creates a specific error report, in case an unknown filetype descriptor/extension is detected
     * @param _ext - The unknown extension
     * @param _descriptor  - The unknown descriptor, can be empty
     */
    async handleFiletype(_ext: string, _descriptor: string = ``) {
        if (this.btClient === undefined) {
            return;
        }

        const report = new BacktraceReport(new iCPSError(FILETYPE_REPORT),
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
        const breadcrumbs = this.btClient?.breadcrumbs;
        if (breadcrumbs === undefined) {
            return;
        }

        Resources.events(this)
            .on(iCPSEventRuntimeWarning.MFA_ERROR, (err: iCPSError) => {
                breadcrumbs.warn(`MFA_ERROR`, {error: err.getDescription()});
            })
            .on(iCPSEventRuntimeWarning.WEB_SERVER_ERROR, (err: iCPSError) => {
                breadcrumbs.warn(`MFA_ERROR`, {error: err.getDescription()});
            })
            .on(iCPSEventRuntimeWarning.FILETYPE_ERROR, (ext: string, descriptor: string) => {
                breadcrumbs.warn(`FILETYPE_ERROR`, {ext, descriptor});
            })
            .on(iCPSEventRuntimeWarning.RESOURCE_FILE_ERROR, (err: iCPSError) => {
                breadcrumbs.warn(`RESOURCE_FILE_ERROR`, {error: err.getDescription()});
            })
            .on(iCPSEventRuntimeWarning.EXTRANEOUS_FILE, () => {
                breadcrumbs.warn(`EXTRANEOUS_FILE`);
            })
            .on(iCPSEventRuntimeWarning.LIBRARY_LOAD_ERROR, (err: Error) => {
                breadcrumbs.warn(`LIBRARY_LOAD_ERROR`, {error: iCPSError.toiCPSError(err).getDescription()});
            })
            .on(iCPSEventRuntimeWarning.COUNT_MISMATCH, (_album: string, expectedCount: number, actualCPLAssets: number, actualCPLMasters: number) => {
                breadcrumbs.warn(`COUNT_MISMATCH`, {
                    expectedCount,
                    actualCPLAssets,
                    actualCPLMasters,
                });
            })
            .on(iCPSEventRuntimeWarning.ICLOUD_LOAD_ERROR, (err: Error) => {
                breadcrumbs.warn(`ICLOUD_LOAD_ERROR`, {error: iCPSError.toiCPSError(err).getDescription()});
            })
            .on(iCPSEventRuntimeWarning.WRITE_ASSET_ERROR, (err: Error) => {
                breadcrumbs.warn(`WRITE_ASSET_ERROR`, {error: iCPSError.toiCPSError(err).getDescription()});
            })
            .on(iCPSEventRuntimeWarning.WRITE_ALBUM_ERROR, (err: Error) => {
                breadcrumbs.warn(`WRITE_ALBUM_ERROR`, {error: iCPSError.toiCPSError(err).getDescription()});
            })
            .on(iCPSEventRuntimeWarning.LINK_ERROR, (err: Error) => {
                breadcrumbs.warn(`LINK_ERROR`, {error: iCPSError.toiCPSError(err).getDescription()});
            })
            .on(iCPSEventRuntimeWarning.ARCHIVE_ASSET_ERROR, (err: Error) => {
                breadcrumbs.warn(`ARCHIVE_ASSET_ERROR`, {error: iCPSError.toiCPSError(err).getDescription()});
            });

        Resources.events(this)
            .on(iCPSEventCloud.AUTHENTICATION_STARTED, () => {
                breadcrumbs.info(`AUTHENTICATION_STARTED`);
            })
            .on(iCPSEventCloud.AUTHENTICATED, () => {
                breadcrumbs.info(`AUTHENTICATED`);
            })
            .on(iCPSEventCloud.MFA_REQUIRED, () => {
                breadcrumbs.warn(`MFA_REQUIRED`);
            })
            .on(iCPSEventCloud.TRUSTED, () => {
                breadcrumbs.info(`TRUSTED`);
            })
            .on(iCPSEventCloud.ACCOUNT_READY, () => {
                breadcrumbs.info(`ACCOUNT_READY`);
            })
            .on(iCPSEventCloud.SESSION_EXPIRED, () => {
                breadcrumbs.info(`SESSION_EXPIRED`);
            })
            .on(iCPSEventCloud.PCS_REQUIRED, () => {
                breadcrumbs.info(`PCS_REQUIRED`);
            })
            .on(iCPSEventCloud.PCS_NOT_READY, () => {
                breadcrumbs.info(`PCS_NOT_READY`);
            });

        Resources.events(this)
            .on(iCPSEventWebServer.STARTED, () => {
                breadcrumbs.info(`WEB_SERVER_STARTED`);
            })
            .on(iCPSEventWebServer.SYNC_REQUESTED, () => {
                breadcrumbs.info(`WEB_SERVER_SYNC_REQUESTED`)
            })
            .on(iCPSEventWebServer.REAUTH_REQUESTED, () => {
                breadcrumbs.info(`WEB_SERVER_AUTH_REQUESTED`)
            })
            .on(iCPSEventWebServer.REAUTH_ERROR, (err) => {
                breadcrumbs.warn(`REAUTH_ERROR`, {error: iCPSError.toiCPSError(err).getDescription()})
            })

        Resources.events(this)
            .on(iCPSEventMFA.MFA_RESEND, (method: MFAMethod) => {
                breadcrumbs.info(`MFA_RESEND`, {method: method.toString()});
            })
            .on(iCPSEventMFA.MFA_RECEIVED, (method: MFAMethod) => {
                breadcrumbs.info(`MFA_RECEIVED`, {method: method.toString()});
            })
            .on(iCPSEventMFA.MFA_NOT_PROVIDED, () => {
                breadcrumbs.error(`MFA_NOT_PROVIDED`);
            });

        Resources.events(this)
            .on(iCPSEventPhotos.SETUP_COMPLETED, () => {
                breadcrumbs.info(`SETUP_COMPLETED`);
            })
            .on(iCPSEventPhotos.READY, () => {
                breadcrumbs.info(`PHOTOS_READY`);
            });

        Resources.events(this)
            .on(iCPSEventSyncEngine.START, () => {
                breadcrumbs.info(`SYNC_STARTED`);
            })
            .on(iCPSEventSyncEngine.FETCH_N_LOAD, () => {
                breadcrumbs.info(`FETCH_N_LOAD`);
            })
            .on(iCPSEventSyncEngine.FETCH_N_LOAD_COMPLETED, (remoteAssetCount: number, remoteAlbumCount: number, localAssetCount: number, localAlbumCount: number) => {
                breadcrumbs.info(`FETCH_N_LOAD_COMPLETED`, {
                    remoteAssetCount,
                    remoteAlbumCount,
                    localAssetCount,
                    localAlbumCount,
                });
            })
            .on(iCPSEventSyncEngine.DIFF, () => {
                breadcrumbs.info(`DIFF`);
            })
            .on(iCPSEventSyncEngine.DIFF_COMPLETED, () => {
                breadcrumbs.info(`DIFF_COMPLETED`);
            })
            .on(iCPSEventSyncEngine.WRITE, () => {
                breadcrumbs.info(`WRITE`);
            })
            .on(iCPSEventSyncEngine.WRITE_ASSETS, (toBeDeletedCount: number, toBeAddedCount: number, toBeKept: number) => {
                breadcrumbs.info(`WRITE_ASSETS`, {
                    toBeDeletedCount,
                    toBeAddedCount,
                    toBeKept,
                });
            })
            .on(iCPSEventSyncEngine.WRITE_ASSETS_COMPLETED, () => {
                const writeAssetCount = Resources.event().getEventCount(iCPSEventSyncEngine.WRITE_ASSET_COMPLETED);
                breadcrumbs.info(`WRITE_ASSETS_COMPLETED`, {writeAssetCount});
            })
            .on(iCPSEventSyncEngine.WRITE_ALBUMS, (toBeDeletedCount: number, toBeAddedCount: number, toBeKept: number) => {
                breadcrumbs.info(`WRITE_ALBUMS`, {
                    toBeDeletedCount,
                    toBeAddedCount,
                    toBeKept,
                });
            })
            .on(iCPSEventSyncEngine.WRITE_ALBUMS_COMPLETED, () => {
                breadcrumbs.info(`WRITE_ALBUMS_COMPLETED`);
            })
            .on(iCPSEventSyncEngine.WRITE_COMPLETED, () => {
                breadcrumbs.info(`WRITE_COMPLETED`);
            })
            .on(iCPSEventSyncEngine.DONE, () => {
                breadcrumbs.info(`SYNC_COMPLETED`);
            })
            .on(iCPSEventSyncEngine.RETRY, (retryCount: number, err: iCPSError) => {
                breadcrumbs.warn(`SYNC_RETRY`, {retryCount, error: iCPSError.toiCPSError(err).getDescription()});
            })
            .on(iCPSEventSyncEngine.REFRESH, (writtenAssets: number) => {
                breadcrumbs.info(`SYNC_REFRESH`, {writtenAssets});
            });

        Resources.events(this)
            .on(iCPSEventArchiveEngine.ARCHIVE_START, () => {
                breadcrumbs.info(`ARCHIVE_STARTED`);
            })
            .on(iCPSEventArchiveEngine.PERSISTING_START, (numberOfAssets: number) => {
                breadcrumbs.info(`PERSISTING_START`, {numberOfAssets});
            })
            .on(iCPSEventArchiveEngine.REMOTE_DELETE, (numberOfAssets: number) => {
                breadcrumbs.info(`REMOTE_DELETE`, {numberOfAssets});
            })
            .on(iCPSEventArchiveEngine.ARCHIVE_DONE, () => {
                breadcrumbs.info(`ARCHIVE_COMPLETED`);
            });
    }

    /**
     * Reports the provided error to the error reporting backend
     * @param err - The occurred error
     * @returns - An unique error code for tracing
     */
    async reportError(err: iCPSError): Promise<string> {
        if (!this.btClient) {
            return `Enable crash reporting for error code`;
        }

        const errorUUID = randomUUID();

        const attachments = await this.prepareAttachments();

        const report = new BacktraceReport(err, {
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
     * @returns A promise that resolves to an array of buffer attachments
     */
    async prepareAttachments(): Promise<BacktraceAttachment[]> {
        const attachments: BacktraceAttachment[] = [];

        // Adding log file
        const logFile = await this.prepareLogFile();
        if (logFile) {
            attachments.push(new BacktraceBufferAttachment(`icps.log.br`, logFile));
        }

        // Adding HAR file
        const harFile = await this.prepareHarFile();
        if (harFile) {
            attachments.push(new BacktraceBufferAttachment(`icps.har.br`, harFile));
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
            Resources.logger(this).warn(`Unable to prepare log file for crash report: ${errorMessage(err)}`);
            return undefined;
        }
    }

    /**
     * Prepares the HAR file for submission
     * @returns A promise that resolves to a Buffer holding the prepared HAR file, or undefined if no file is available - compressed using the brotli algorithm
     */
    async prepareHarFile(): Promise<Buffer | undefined> {
        if (!Resources.manager().enableNetworkCapture) {
            return undefined;
        }

        try {
            const harData = await fs.readFile(Resources.manager().harFilePath, {encoding: FILE_ENCODING});
            // An unparsable HAR file is not attached, since its headers cannot be masked
            const maskedHarData = jsonc.stringify(ErrorHandler.maskConfidentialHeaders(jsonc.parse(harData)));

            const dataStream = new Readable();
            dataStream.push(ErrorHandler.maskConfidentialData(maskedHarData));
            dataStream.push(null);

            return this.compressStream(dataStream);
        } catch (err) {
            Resources.logger(this).warn(`Unable to prepare HAR file for crash report: ${errorMessage(err)}`);
            return undefined;
        }
    }

    /**
     * Compresses the provided data stream into a Buffer object, using the brotli algorithm
     * @param data - A readable stream of uncompressed data
     * @returns A buffer containing the compressed data
     */
    async compressStream(data: Readable): Promise<Buffer> {
        const brotliStream = zlib.createBrotliCompress();
        const chunks: Buffer[] = [];
        brotliStream.on(`data`, (chunk: Buffer) => {
            chunks.push(chunk);
        });
        data.pipe(brotliStream);
        await once(brotliStream, `end`); // Rejects if an 'error' event is emitted
        return Buffer.concat(chunks);
    }

    /**
     * This function masks confidential data from the provided input string
     * @param input - The input string to mask
     * @returns The string, with masked confidential data
     */
    static maskConfidentialData(input: string): string {
        const masked = input
            .replaceAll(Resources.manager().username, `<APPLE ID USERNAME>`)
            .replaceAll(Resources.manager().password, `<APPLE ID PASSWORD>`);

        // Reading cached trust token, instead of re-reading from file
        const {trustToken, sessionSecret} = Resources.manager()._resources;
        const maskedTrustToken = trustToken
            ? masked.replaceAll(trustToken, `<TRUST TOKEN>`)
            : masked;

        // The session secret is also sent in request bodies (as dsWebAuthToken)
        return sessionSecret
            ? maskedTrustToken.replaceAll(sessionSecret, `<SESSION SECRET>`)
            : maskedTrustToken;
    }

    /**
     * Masks the values of headers carrying session secrets (e.g. cookies) within the provided data.
     * Headers are expected in a `headers` property, either as an object (as in requests/responses of errors) or as a list of name/value pairs (as in the HAR file).
     * Cookie names and attributes are kept, in order to keep the reports useful for debugging.
     * @param data - The parsed data to mask
     * @returns A copy of the data, with masked header values
     */
    static maskConfidentialHeaders(data: unknown): unknown {
        if (Array.isArray(data)) {
            return data.map(item => ErrorHandler.maskConfidentialHeaders(item));
        }

        if (typeof data !== `object` || data === null) {
            return data;
        }

        return Object.fromEntries(Object.entries(data).map(([key, value]) => {
            if (key !== `headers`) {
                return [key, ErrorHandler.maskConfidentialHeaders(value)];
            }

            if (Array.isArray(value)) {
                return [key, value.map(pair => typeof pair?.name === `string`
                    ? {...pair, value: ErrorHandler.maskHeaderValue(pair.name, pair.value)}
                    : ErrorHandler.maskConfidentialHeaders(pair))];
            }

            if (typeof value === `object` && value !== null) {
                return [key, Object.fromEntries(Object.entries(value).map(([name, headerValue]) => [name, ErrorHandler.maskHeaderValue(name, headerValue)]))];
            }

            return [key, value];
        }));
    }

    /**
     * Masks the value of a single header, if it carries session secrets
     * @param name - The header name
     * @param value - The header value - a string, or a list of strings for multi-value headers (e.g. set-cookie)
     * @returns The masked header value - cookies keep their names and attributes, other confidential headers are masked entirely
     */
    static maskHeaderValue(name: string, value: unknown): unknown {
        const headerName = name.toLowerCase();
        if (!CONFIDENTIAL_HEADERS.includes(headerName)) {
            return value;
        }

        if (Array.isArray(value)) {
            return value.map(item => ErrorHandler.maskHeaderValue(name, item));
        }

        if (typeof value !== `string`) {
            return MASKED_VALUE;
        }

        switch (headerName) {
        case `cookie`:
            // Each cookie of the list: name=value
            return value.replace(/([^=;\s]+)=[^;]*/g, `$1=${MASKED_VALUE}`);
        case `set-cookie`:
            // Only the leading name=value, followed by attributes
            return value.replace(/^([^=;]+)=[^;]*/, `$1=${MASKED_VALUE}`);
        default:
            return MASKED_VALUE;
        }
    }
}