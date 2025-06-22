import * as http from 'http';
import {jsonc} from 'jsonc';
import {MFAMethod} from '../../lib/icloud/mfa/mfa-method.js';
import {iCPSEventApp, iCPSEventCloud, iCPSEventMFA, iCPSEventRuntimeError, iCPSEventRuntimeWarning, iCPSEventSyncEngine, iCPSEventWebServer} from '../../lib/resources/events-types.js';
import {Resources} from '../../lib/resources/main.js';
import {AUTH_ERR, MFA_ERR, WEB_SERVER_ERR} from '../error/error-codes.js';
import {iCPSError} from '../error/error.js';
import {TokenApp} from '../icloud-app.js';
import {icon} from './icons.js';
import {manifest} from './manifest.js';
import {serviceWorker} from './service-worker.js';
import {RequestMfaView} from './view/request-mfa-view.js';
import {StateView} from './view/state-view.js';
import {SubmitMfaView} from './view/submit-mfa-view.js';

/**
 * Endpoint URI of Web Server, all expect POST requests
 */
export const WEB_SERVER_API_ENDPOINTS = {
    CODE_INPUT: `/mfa`, // Expecting URL parameter 'code' with 6 digits
    TRIGGER_REAUTH: `/reauthenticate`, // Expecting no URL parameters
    RESEND_CODE: `/resend_mfa`, // Expecting URL parameter 'method' (either 'device', 'sms', 'voice') and optionally 'phoneNumberId' (any number > 0)
    STATE: `/state`, // Expecting no URL parameters
    TRIGGER_SYNC: `/sync` // Expecting no URL parameters
};

/**
 * This objects starts a server, that will listen to incoming MFA codes and other MFA related commands
 */
export class WebServer {
    /**
     * The server object
     */
    server: http.Server;

    /**
     * Holds the MFA method used for this server
     */
    mfaMethod: MFAMethod;

    state: `unknown` | `ok` | `authenticating` | `syncing` | `error` | `reauthSuccess` | `reauthError` = `unknown`;

    stateTimestamp: Date = null;

    nextSyncTimestamp: Date = null;

    waitingForMfa: boolean = false;

    errorMessage: string = null;

    static async spawn(): Promise<WebServer> {
        return new WebServer().startServer();
    }

    /**
     * Creates the server object
     * @emits iCPSEventMFA.ERROR - When an error associated to the server occurs - Provides iCPSError as argument
     */
    private constructor() {
        Resources.logger(this).debug(`Preparing web server on port ${Resources.manager().webServerPort}`);
        this.server = http.createServer(this.handleRequest.bind(this));
        this.server.on(`error`, err => {
            let icpsErr = new iCPSError(WEB_SERVER_ERR.SERVER_ERR);

            if (Object.hasOwn(err, `code`)) {
                if ((err as any).code === `EADDRINUSE`) {
                    icpsErr = new iCPSError(WEB_SERVER_ERR.ADDR_IN_USE_ERR).addContext(`port`, Resources.manager().webServerPort);
                }

                if ((err as any).code === `EACCES`) {
                    icpsErr = new iCPSError(WEB_SERVER_ERR.INSUFFICIENT_PRIVILEGES).addContext(`port`, Resources.manager().webServerPort);
                }
            }

            icpsErr.addCause(err);

            Resources.emit(iCPSEventWebServer.ERROR, icpsErr);
        });

        Resources.events(this).on(iCPSEventSyncEngine.START, () => {
            this.state = `syncing`;
        });

        Resources.events(this).on(iCPSEventSyncEngine.DONE, () => {
            this.state = `ok`;
            this.stateTimestamp = new Date();
        });

        Resources.events(this).on(iCPSEventRuntimeError.SCHEDULED_ERROR, (error: iCPSError) => {
            this.state = `error`;
            this.setErrorMessageFromError(error);
            this.waitingForMfa = false;
            this.stateTimestamp = new Date();
        });

        Resources.events(this).on(iCPSEventCloud.MFA_REQUIRED, () => {
            this.waitingForMfa = true;
        });

        Resources.events(this).on(iCPSEventMFA.MFA_RECEIVED, () => {
            this.waitingForMfa = false;
        });

        Resources.events(this).on(iCPSEventMFA.MFA_NOT_PROVIDED, () => {
            this.waitingForMfa = false;
            this.state = `error`;
            this.stateTimestamp = new Date();
            this.errorMessage = `Multifactor authentication code not provided within timeout period. Use the 'Renew Authentication' button to request and enter a new code.`;
        });

        Resources.events(this).on(iCPSEventCloud.AUTHENTICATION_STARTED, () => {
            this.state = `authenticating`;
        });

        Resources.events(this).on(iCPSEventWebServer.REAUTH_SUCCESS, () => {
            this.state = `reauthSuccess`;
            this.stateTimestamp = new Date();
        });

        Resources.events(this).on(iCPSEventWebServer.REAUTH_ERROR, (error: iCPSError) => {
            this.state = `reauthError`;
            this.stateTimestamp = new Date();
            this.waitingForMfa = false;
            this.setErrorMessageFromError(error);
        });

        Resources.events(this).on(iCPSEventApp.SCHEDULED, (timestamp: Date) => {
            this.nextSyncTimestamp = timestamp;
        });

        Resources.events(this).on(iCPSEventApp.SCHEDULED_DONE, (timestamp: Date) => {
            this.nextSyncTimestamp = timestamp;
        });

        Resources.events(this).on(iCPSEventApp.SCHEDULED_DONE, (timestamp: Date) => {
            this.nextSyncTimestamp = timestamp;
        });

        Resources.events(this).on(iCPSEventApp.SCHEDULED_OVERRUN, (timestamp: Date) => {
            this.nextSyncTimestamp = timestamp;
        });

        // allow the process to exit, if this server is the only thing left running
        this.server.unref();

        // Default MFA request always goes to device
        this.mfaMethod = new MFAMethod();
    }

    /**
     * Closes this server
     */
    public close(): Promise<void> {
        Resources.events(this).removeListeners();
        return new Promise<void>(resolve => {
            this.server.close(() => resolve());
        });
    }

    private setErrorMessageFromError(error: iCPSError) {
        let cause = error
        while (cause.cause && cause.cause instanceof iCPSError) {
            cause = cause.cause;
        }
        switch (cause.code) {
        case MFA_ERR.FAIL_ON_MFA.code:
            this.errorMessage = `Multifactor authentication code required. Use the 'Renew Authentication' button to request and enter a new code.`;
            break;
        case AUTH_ERR.UNAUTHORIZED.code:
            this.errorMessage = `Your credentials seem to be invalid. Please check your iCloud credentials and try again.`;
            break;
        case WEB_SERVER_ERR.MFA_CODE_NOT_PROVIDED.code:
            this.errorMessage = `Multifactor authentication code not provided within timeout period. Use the 'Renew Authentication' button to request and enter a new code.`;
            break;
        default:
            this.errorMessage = cause.message;
            break;
        }
    }

    /**
     * Starts the server and listens for incoming requests to perform MFA actions
     * @emits iCPSEventMFA.STARTED - When the server has started - Provides port number as argument
     * @emits iCPSEventMFA.MFA_NOT_PROVIDED - When the MFA code was not provided within timeout period - Provides MFA method and iCPSError as arguments
     * @emits iCPSEventMFA.ERROR - When an error associated to the server startup occurs - Provides iCPSError as argument
     */
    private startServer() {
        return new Promise<WebServer>((resolve, reject) => {
            try {
                this.server.listen(Resources.manager().webServerPort, () => {
                    /* c8 ignore start */
                    // Never starting the server just to see logger message
                    Resources.emit(iCPSEventWebServer.STARTED, Resources.manager().webServerPort);
                    Resources.logger(this).info(`Exposing endpoints: ${jsonc.stringify(Object.values(WEB_SERVER_API_ENDPOINTS))}`);
                    /* c8 ignore stop */
                    resolve(this);
                });
            } catch (err) {
                const icpsErr = new iCPSError(WEB_SERVER_ERR.STARTUP_FAILED).addCause(err);
                Resources.emit(iCPSEventWebServer.ERROR, icpsErr);
                reject(icpsErr);
            }
        });
    }

    /**
     * Handles incoming http requests
     * @param req - The HTTP request object
     * @param res - The HTTP response object
     * @emits iCPSEventRuntimeWarning.WEB_SERVER_ERR - When the request method or endpoint of server could not be found - Provides iCPSError as argument
     */
    private handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        try {
            const cleanPath = req.url?.split(`?`)[0] || ``;

            if(cleanPath == `/`) {
                Resources.logger(this).debug(`Redirecting root path to state view.`);
                res.writeHead(302, {Location: `./state`});
                res.end();
                return;
            }

            if(cleanPath.endsWith(`/`)) {
                Resources.logger(this).debug(`Redirecting ${req.url} to same path without trailing slash.`);
                const redirectUrl = cleanPath.slice(0, -1);
                res.writeHead(301, {Location: redirectUrl});
                res.end();
                return;
            }

            if(cleanPath.startsWith(`/service-worker.js`)) {
                Resources.logger(this).debug(`Serving service worker script.`);
                res.writeHead(200, {'Content-Type': `application/javascript`});
                res.write(serviceWorker);
                res.end();
                return;
            }

            if (req.method === `GET`) {
                this.handleGetRequest(req, res);
                return;
            }

            if (req.method === `POST`) {
                this.handlePostRequest(req, res);
                return;
            }

            Resources.logger(this).warn(`Unknown request method: ${req.method} for ${req.url}`);
            this.handleInvalidMethodRequest(req, res);
        } catch(err) {
            Resources.emit(iCPSEventRuntimeWarning.WEB_SERVER_ERROR, new iCPSError(WEB_SERVER_ERR.UNKNOWN_ERR)
                .addMessage(err.message)
                .addContext(`request`, req)
                .addContext(`responseWritten`, !res.writable));

            if(res.writable) {
                this.sendApiResponse(res, 500, `Unknown error occurred.`);
            }
            throw err
        }
    }

    /**
     * Handle incoming GET requests
     * @param req - The HTTP request object
     * @param res - The HTTP response object
     */
    private handleGetRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        if(req.headers[`accept`] === `application/json`) {
            Resources.logger(this).debug(`Received JSON request: GET ${req.url}`);
            if(req.url.startsWith(WEB_SERVER_API_ENDPOINTS.STATE)) {
                Resources.logger(this).debug(`Received state request`);
                this.handleStateRequest(res);
            } else {
                Resources.logger(this).warn(`Unknown API endpoint requested: GET ${req.url}`);
                res.writeHead(404, {'Content-Type': `text/plain`});
                res.write(`Not Found`);
                res.end();
            }
            return;
        }

        if(req.url.startsWith(`/manifest.json`)) {
            Resources.logger(this).debug(`Serving manifest.json`);
            res.writeHead(200, {'Content-Type': `application/json`});
            res.write(JSON.stringify(manifest));
            res.end();
            return;
        }

        if(req.url.startsWith(`/icon.png`)) {
            this.handleIconRequest(req, res);
            return;
        }

        this.handleUiRequest(req, res);
    }

    /**
     * This function will handle the request send to the state endpoint
     * @emits iCPSEventRuntimeWarning.WEB_SERVER_ERR - When the request method or endpoint of server could not be found - Provides iCPSError as argument
     * @param res - The HTTP response object
     */
    private handleStateRequest(res: http.ServerResponse<http.IncomingMessage>) {
        res.writeHead(200, {'Content-Type': `application/json`});
        res.write(JSON.stringify({
            state: this.state,
            stateTimestamp: this.stateTimestamp,
            nextSyncTimestamp: this.nextSyncTimestamp,
            waitingForMfa: this.waitingForMfa,
            errorMessage: this.state == `error` || this.state == `reauthError` ? this.errorMessage : null,
        }));
        res.end();
    }

    private handleIconRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        Resources.logger(this).debug(`Serving icon request: ${req.url}`);

        const buffer = Buffer.from(icon, `base64`);
        res.writeHead(200, {
            'Content-Type': `image/png`,
            'Content-Length': buffer.length,
        });
        res.write(buffer);
        res.end();
    }

    /**
     * This function will return the HTML content for the UI
     * @param req - The HTTP request object
     * @param res - The HTTP response object
     * @returns HTML content as a string or null if no matching path is found
     */
    private handleUiRequest(req: http.IncomingMessage, res: http.ServerResponse): string | null {
        const cleanPath = req.url?.split(`?`)[0];

        if (cleanPath.startsWith(`/state`)) {
            Resources.logger(this).debug(`State view requested`);
            this.sendHtmlResponse(res, new StateView().asHtml());
            return;
        } else if (cleanPath.startsWith(`/submit-mfa`)) {
            Resources.logger(this).debug(`Submit MFA view requested`);
            if(!this.waitingForMfa) {
                Resources.logger(this).warn(`Submit MFA view requested, but not waiting for it. Redirecting to state view.`);
                this.sendStateRedirect(res);
                return;
            }
            this.sendHtmlResponse(res, new SubmitMfaView().asHtml());
            return ;
        } else if (cleanPath.startsWith(`/request-mfa`)) {
            Resources.logger(this).debug(`Request MFA view requested`);
            if(!this.waitingForMfa) {
                Resources.logger(this).warn(`Request MFA view requested, but not waiting for it. Redirecting to state view.`);
                this.sendStateRedirect(res);
                return;
            }
            this.sendHtmlResponse(res, new RequestMfaView().asHtml());
            return;
        }
        
        Resources.logger(this).warn(`Unknown path requested: ${cleanPath}`);
        res.writeHead(404, {'Content-Type': `text/plain`});
        res.write(`Not Found`);
        res.end();
        return;
    }

    /**
     * This function will send the HTML response to the client
     * @param res - The HTTP response object
     * @param html - The HTML content to be sent
     */
    private sendHtmlResponse(res: http.ServerResponse, html: string) {
        res.writeHead(200, {'Content-Type': `text/html`});
        res.write(html);
        res.end();
    }

    /**
     * Redirects to the state view
     * @param res - The HTTP response object
     */
    private sendStateRedirect(res: http.ServerResponse) {
        res.writeHead(302, {Location: `./state`});
        res.end();
    }

    /**
     * Handle incoming POST requests
     * @param req - The HTTP request object
     * @param res - The HTTP response object
     * @emits iCPSEventRuntimeWarning.WEB_SERVER_ERR - When the MFA code format is not as expected - Provides iCPSError as argument
     * @emits iCPSEventMFA.MFA_RECEIVED - When the MFA code was received - Provides MFA method and MFA code as arguments
     */
    private handlePostRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        Resources.logger(this).debug(`Received POST request: ${req.url}`);
        if (req.url.startsWith(WEB_SERVER_API_ENDPOINTS.TRIGGER_REAUTH)) {
            Resources.logger(this).debug(`Reauthentication requested`);
            this.handleReauthRequest(res);
        } else if (req.url.startsWith(WEB_SERVER_API_ENDPOINTS.TRIGGER_SYNC)) {
            Resources.logger(this).debug(`Sync requested`);
            this.handleSyncRequest(res);
        } else if (req.url.startsWith(WEB_SERVER_API_ENDPOINTS.CODE_INPUT)) {
            Resources.logger(this).debug(`MFA code input requested`);
            this.handleMFACode(req, res);
        } else if (req.url.startsWith(WEB_SERVER_API_ENDPOINTS.RESEND_CODE)) {
            Resources.logger(this).debug(`MFA code resend requested`);
            this.handleMFAResend(req, res);
        } else {
            Resources.logger(this).warn(`Unknown endpoint requested: POST ${req.url}`);
            Resources.emit(iCPSEventRuntimeWarning.WEB_SERVER_ERROR, new iCPSError(WEB_SERVER_ERR.ROUTE_NOT_FOUND)
                .addMessage(req.url)
                .addContext(`request`, req));
            this.sendApiResponse(res, 404, `Route not found, available endpoints: ${jsonc.stringify(Object.values(WEB_SERVER_API_ENDPOINTS))}`);
        }
    }

    /**
     * This function will handle the request send to the reauthentication endpoint
     * @param res - The HTTP response object
     */
    private handleReauthRequest(res: http.ServerResponse<http.IncomingMessage>) {
        Resources.emit(iCPSEventWebServer.REAUTH_REQUESTED);
        this.triggerReauth()
            // this unchecked cast is a bit nasty, maybe we can listen to a success event so we don't need to set any state based on the promise result
            .then((mfaOk: boolean) => {
                if(mfaOk) {
                    Resources.emit(iCPSEventWebServer.REAUTH_SUCCESS);
                } else {
                    Resources.emit(iCPSEventWebServer.REAUTH_ERROR, new iCPSError(WEB_SERVER_ERR.MFA_CODE_NOT_PROVIDED));
                }
            }).catch(err => {
                Resources.emit(iCPSEventWebServer.REAUTH_ERROR, iCPSError.toiCPSError(err));
            });
        this.sendApiResponse(res, 200, `Reauthentication requested`);
    }

    /**
     * This function will trigger the reauthentication process
     * @returns A promise that resolves when the reauthentication process is complete
     */
    private triggerReauth(): Promise<unknown> {
        const app = new TokenApp(true);
        return app.run()
    }

    /**
     * This function will handle the request send to the sync endpoint
     * @param res - The HTTP response object
     * @emits iCPSEventWebServer.SYNC_REQUESTED - When the sync was requested
     */
    private handleSyncRequest(res: http.ServerResponse<http.IncomingMessage>) {
        Resources.emit(iCPSEventWebServer.SYNC_REQUESTED);
        this.sendApiResponse(res, 200, `Sync requested`);
    }

    /**
     * Handle requests with invalid methods
     * @param req - The HTTP request object
     * @param res - The HTTP response object
     * @emits iCPSEventRuntimeWarning.WEB_SERVER_ERROR - When the request method is not as expected - Provides iCPSError as argument
     */
    private handleInvalidMethodRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        Resources.emit(iCPSEventRuntimeWarning.WEB_SERVER_ERROR, new iCPSError(WEB_SERVER_ERR.METHOD_NOT_FOUND)
            .addMessage(`endpoint ${req.url}, method ${req.method}`)
            .addContext(`request`, req));
        this.sendApiResponse(res, 405, `Method not supported: ${req.method}`);
    }

    /**
     * This function will handle requests send to the MFA code input endpoint
     * @param req - The HTTP request object
     * @param res - The HTTP response object
     * @emits iCPSEventRuntimeWarning.WEB_SERVER_ERR - When the MFA code format is not as expected - Provides iCPSError as argument
     * @emits iCPSEventMFA.MFA_RECEIVED - When the MFA code was received - Provides MFA method and MFA code as arguments
     */
    private handleMFACode(req: http.IncomingMessage, res: http.ServerResponse) {
        if (!this.waitingForMfa) {
            this.sendApiResponse(res, 400, `MFA code not expected at this time. Taking you back home.`, `/`);
            Resources.emit(iCPSEventRuntimeWarning.WEB_SERVER_ERROR, new iCPSError(WEB_SERVER_ERR.NO_CODE_EXPECTED));
            return;
        }

        if (!req.url.match(/\?code=\d{6}$/)) {
            Resources.emit(iCPSEventRuntimeWarning.WEB_SERVER_ERROR, new iCPSError(WEB_SERVER_ERR.CODE_FORMAT)
                .addMessage(req.url)
                .addContext(`request`, req));
            this.sendApiResponse(res, 400, `Unexpected MFA code format! Expecting 6 digits`);
            return;
        }

        const mfa: string = req.url.slice(-6);

        Resources.logger(this).debug(`Received MFA: ${mfa}`);
        this.sendApiResponse(res, 200, `Read MFA code: ${mfa}`);
        Resources.emit(iCPSEventMFA.MFA_RECEIVED, this.mfaMethod, mfa);
    }

    /**
     * This function will handle the request send to the MFA code resend endpoint
     * @param req - The HTTP request object
     * @param res - The HTTP response object
     * @emits iCPSEventRuntimeWarning.WEB_SERVER_ERR - When the MFA resend method is not as expected - Provides iCPSError as argument
     * @emits iCPSEventMFA.MFA_RESEND - When the MFA code resend was requested - Provides MFA method as argument
     */
    private handleMFAResend(req: http.IncomingMessage, res: http.ServerResponse) {
        const methodMatch = req.url.match(/method=(?:sms|voice|device)/);
        if (!methodMatch) {
            this.sendApiResponse(res, 400, `Resend method does not match expected format`);
            Resources.emit(iCPSEventRuntimeWarning.WEB_SERVER_ERROR, new iCPSError(WEB_SERVER_ERR.RESEND_METHOD_FORMAT)
                .addContext(`requestURL`, req.url));
            return;
        }

        const methodString = methodMatch[0].slice(7);

        const phoneNumberIdMatch = req.url.match(/phoneNumberId=\d+/);

        if (phoneNumberIdMatch && methodString !== `device`) {
            this.mfaMethod.update(methodString, parseInt(phoneNumberIdMatch[0].slice(14), 10));
        } else {
            this.mfaMethod.update(methodString);
        }

        this.sendApiResponse(res, 200, `Requesting MFA resend with method ${this.mfaMethod}`);
        Resources.emit(iCPSEventMFA.MFA_RESEND, this.mfaMethod);
    }

    /**
     * This function will send a response, based on its input variables
     * @param res - The response object, to send the response to
     * @param code - The status code for the response
     * @param msg - The message included in the response
     * @param newLocation - The new location to redirect to, if any
     */
    private sendApiResponse(res: http.ServerResponse, code: number, msg: string, newLocation?: string) {
        res.writeHead(code, {"Content-Type": `application/json`});
        res.end(jsonc.stringify({message: msg, newLocation: newLocation}));
    }
}