import http from 'http';
import {jsonc} from 'jsonc';
import {MFAMethod} from '../../lib/icloud/mfa/mfa-method.js';
import {iCPSEventApp, iCPSEventCloud, iCPSEventMFA, iCPSEventRuntimeWarning, iCPSEventWebServer} from '../../lib/resources/events-types.js';
import {Resources} from '../../lib/resources/main.js';
import {MFA_ERR} from '../error/error-codes.js';
import {iCPSError} from '../error/error.js';
import {TokenApp} from '../icloud-app.js';
import {RequestMfaView} from './view/request-mfa-view.js';
import {StateView} from './view/state-view.js';
import {SubmitMfaView} from './view/submit-mfa-view.js';

/**
 * The MFA timeout value in milliseconds
 */
export const MFA_TIMEOUT_VALUE = 1000 * 60 * 10; // 10 minutes

/**
 * Endpoint URI of Web Server, all expect POST requests
 */
export const WEB_SERVER_API_ENDPOINTS = {
    CODE_INPUT: `/mfa`, // Expecting URL parameter 'code' with 6 digits
    RESEND_CODE: `/resend_mfa`, // Expecting URL parameter 'method' (either 'device', 'sms', 'voice') and optionally 'phoneNumberId' (any number > 0)
    TRIGGER_REAUTH: `/reauthenticate`,
    TRIGGER_SYNC: `/sync`
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

    state: `ok` | `syncing` | `error` = `ok`;

    lastSyncEndTimestamp: Date = null;

    waitingForMfa: boolean = false;

    static spawn() {
        const webServer = new WebServer()
        webServer.startServer();
        return webServer;
    }

    /**
     * Creates the server object
     * @emits iCPSEventMFA.ERROR - When an error associated to the server occurs - Provides iCPSError as argument
     */
    private constructor() {
        Resources.logger(this).debug(`Preparing web server on port ${Resources.manager().mfaServerPort}`);
        this.server = http.createServer(this.handleRequest.bind(this));
        this.server.on(`error`, err => {
            let icpsErr = new iCPSError(MFA_ERR.SERVER_ERR);

            if (Object.hasOwn(err, `code`)) {
                if ((err as any).code === `EADDRINUSE`) {
                    icpsErr = new iCPSError(MFA_ERR.ADDR_IN_USE_ERR).addContext(`port`, Resources.manager().mfaServerPort);
                }

                if ((err as any).code === `EACCES`) {
                    icpsErr = new iCPSError(MFA_ERR.INSUFFICIENT_PRIVILEGES).addContext(`port`, Resources.manager().mfaServerPort);
                }
            }

            icpsErr.addCause(err);

            Resources.emit(iCPSEventWebServer.ERROR, icpsErr);
        });

        Resources.events(this).on(iCPSEventApp.SCHEDULED_START, () => {
            this.state = `syncing`;
        });

        Resources.events(this).on(iCPSEventApp.SCHEDULED_DONE, () => {
            this.state = `ok`;
            this.lastSyncEndTimestamp = new Date();
        });

        Resources.events(this).on(iCPSEventApp.SCHEDULED_RETRY, () => {
            this.state = `error`;
            this.lastSyncEndTimestamp = new Date();
        });

        Resources.events(this).on(iCPSEventCloud.MFA_REQUIRED, () => {
            this.waitingForMfa = true;
        });

        Resources.events(this).on(iCPSEventMFA.MFA_RECEIVED, () => {
            this.waitingForMfa = false;
        });

        Resources.events(this).on(iCPSEventMFA.MFA_NOT_PROVIDED, () => {
            this.waitingForMfa = false;
        });

        // allow the process to exit, if this server is the only thing left running
        this.server.unref();

        // Default MFA request always goes to device
        this.mfaMethod = new MFAMethod();
    }

    /**
     * Starts the server and listens for incoming requests to perform MFA actions
     * @emits iCPSEventMFA.STARTED - When the server has started - Provides port number as argument
     * @emits iCPSEventMFA.MFA_NOT_PROVIDED - When the MFA code was not provided within timeout period - Provides MFA method and iCPSError as arguments
     * @emits iCPSEventMFA.ERROR - When an error associated to the server startup occurs - Provides iCPSError as argument
     */
    startServer() {
        try {
            this.server.listen(Resources.manager().mfaServerPort, () => {
                /* c8 ignore start */
                // Never starting the server just to see logger message
                Resources.emit(iCPSEventWebServer.STARTED, Resources.manager().mfaServerPort);
                Resources.logger(this).info(`Exposing endpoints: ${jsonc.stringify(Object.values(WEB_SERVER_API_ENDPOINTS))}`);
                /* c8 ignore stop */
            });
        } catch (err) {
            Resources.emit(iCPSEventWebServer.ERROR, new iCPSError(MFA_ERR.STARTUP_FAILED).addCause(err));
        }
    }

    /**
     * Handles incoming http requests
     * @param req - The HTTP request object
     * @param res - The HTTP response object
     * @emits iCPSEventRuntimeWarning.MFA_ERROR - When the request method or endpoint of server could not be found - Provides iCPSError as argument
     */
    handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        if (req.method === `GET`) {
            this.handleGetRequest(req, res);
            return;
        }

        if (req.method === `POST`) {
            this.handlePostRequest(req, res);
            return;
        }

        this.handleInvalidMethodRequest(req, res);
    }

    /**
     * Handle incoming GET requests
     * @param req - The HTTP request object
     * @param res - The HTTP response object
     */
    handleGetRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        
        if(req.headers[`content-type`] === `application/json`) {
            if(req.url.startsWith(`/state`)) {
                res.writeHead(200, {'Content-Type': `application/json`});
                res.write(JSON.stringify({
                    state: this.state,
                    lastSyncEndTimestamp: this.lastSyncEndTimestamp,
                    waitingForMfa: this.waitingForMfa,
                }));
                res.end();
            } else {
                res.writeHead(404, {'Content-Type': `text/plain`});
                res.write(`Not Found`);
                res.end();
            }
            return;
        }

        this.handleUiRequest(req, res);
    }

    /**
     * This function will return the HTML content for the UI
     * @param req - The HTTP request object
     * @param res - The HTTP response object
     * @returns HTML content as a string or null if no matching path is found
     */
    handleUiRequest(req: http.IncomingMessage, res: http.ServerResponse): string | null {
        const cleanPath = req.url?.split(`?`)[0];

        if (cleanPath === `/`) {
            res.writeHead(200, {'Content-Type': `text/html`});
            res.write(new StateView().asHtml());
            res.end();
            return ;
        } else if (cleanPath.startsWith(`/submit-mfa`)) {
            if(!this.waitingForMfa) {
                res.writeHead(302, {Location: `/`});
                res.end();
                return ;
            }
            res.writeHead(200, {'Content-Type': `text/html`});
            res.write(new SubmitMfaView().asHtml());
            res.end();
            return ;
        } else if (cleanPath.startsWith(`/request-mfa`)) {
            if(!this.waitingForMfa) {
                res.writeHead(302, {Location: `/`});
                res.end();
                return ;
            }
            res.writeHead(200, {'Content-Type': `text/html`});
            res.write(new RequestMfaView().asHtml());
            res.end();
            return ;
        }
        
        res.writeHead(404, {'Content-Type': `text/plain`});
        res.write(`Not Found`);
        res.end();
        return
    }

    /**
     * Handle incoming POST requests
     * @param req - The HTTP request object
     * @param res - The HTTP response object
     * @emits iCPSEventRuntimeWarning.MFA_ERROR - When the MFA code format is not as expected - Provides iCPSError as argument
     * @emits iCPSEventMFA.MFA_RECEIVED - When the MFA code was received - Provides MFA method and MFA code as arguments
     */
    handlePostRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        if (req.url.startsWith(WEB_SERVER_API_ENDPOINTS.TRIGGER_REAUTH)) {
            const app = new TokenApp();
            app.run();
            res.writeHead(200, {'Content-Type': `text/plain`});
            res.write(`Reauthentication started`);
            res.end();
        } else if (req.url.startsWith(WEB_SERVER_API_ENDPOINTS.TRIGGER_SYNC)) {
            Resources.emit(iCPSEventWebServer.SYNC_REQUESTED);
            res.writeHead(200, {'Content-Type': `text/plain`});
            res.write(`Sync started`);
            res.end();
        } else if (req.url.startsWith(WEB_SERVER_API_ENDPOINTS.CODE_INPUT)) {
            this.handleMFACode(req, res);
        } else if (req.url.startsWith(WEB_SERVER_API_ENDPOINTS.RESEND_CODE)) {
            this.handleMFAResend(req, res);
        } else {
            Resources.emit(iCPSEventRuntimeWarning.MFA_ERROR, new iCPSError(MFA_ERR.ROUTE_NOT_FOUND)
                .addMessage(req.url)
                .addContext(`request`, req));
            this.sendResponse(res, 404, `Route not found, available endpoints: ${jsonc.stringify(Object.values(WEB_SERVER_API_ENDPOINTS))}`);
        }
    }

    /**
     * Handle requests with invalid methods
     * @param req - The HTTP request object
     * @param res - The HTTP response object
     * @emits iCPSEventRuntimeWarning.MFA_ERROR - When the request method is not as expected - Provides iCPSError as argument
     */
    handleInvalidMethodRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        Resources.emit(iCPSEventRuntimeWarning.MFA_ERROR, new iCPSError(MFA_ERR.METHOD_NOT_FOUND)
            .addMessage(`endpoint ${req.url}, method ${req.method}`)
            .addContext(`request`, req));
        this.sendResponse(res, 400, `Method not supported: ${req.method}`);
    }

    /**
     * This function will handle requests send to the MFA code input endpoint
     * @param req - The HTTP request object
     * @param res - The HTTP response object
     * @emits iCPSEventRuntimeWarning.MFA_ERROR - When the MFA code format is not as expected - Provides iCPSError as argument
     * @emits iCPSEventMFA.MFA_RECEIVED - When the MFA code was received - Provides MFA method and MFA code as arguments
     */
    handleMFACode(req: http.IncomingMessage, res: http.ServerResponse) {
        if (!req.url.match(/\?code=\d{6}$/)) {
            Resources.emit(iCPSEventRuntimeWarning.MFA_ERROR, new iCPSError(MFA_ERR.CODE_FORMAT)
                .addMessage(req.url)
                .addContext(`request`, req));
            this.sendResponse(res, 400, `Unexpected MFA code format! Expecting 6 digits`);
            return;
        }

        const mfa: string = req.url.slice(-6);

        Resources.logger(this).debug(`Received MFA: ${mfa}`);
        this.sendResponse(res, 200, `Read MFA code: ${mfa}`);
        Resources.emit(iCPSEventMFA.MFA_RECEIVED, this.mfaMethod, mfa);
    }

    /**
     * This function will handle the request send to the MFA code resend endpoint
     * @param req - The HTTP request object
     * @param res - The HTTP response object
     * @emits iCPSEventRuntimeWarning.MFA_ERROR - When the MFA resend method is not as expected - Provides iCPSError as argument
     * @emits iCPSEventMFA.MFA_RESEND - When the MFA code resend was requested - Provides MFA method as argument
     */
    handleMFAResend(req: http.IncomingMessage, res: http.ServerResponse) {
        const methodMatch = req.url.match(/method=(?:sms|voice|device)/);
        if (!methodMatch) {
            this.sendResponse(res, 400, `Resend method does not match expected format`);
            Resources.emit(iCPSEventRuntimeWarning.MFA_ERROR, new iCPSError(MFA_ERR.RESEND_METHOD_FORMAT)
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

        this.sendResponse(res, 200, `Requesting MFA resend with method ${this.mfaMethod}`);
        Resources.emit(iCPSEventMFA.MFA_RESEND, this.mfaMethod);
    }

    /**
     * This function will send a response, based on its input variables
     * @param res - The response object, to send the response to
     * @param code - The status code for the response
     * @param msg - The message included in the response
     */
    sendResponse(res: http.ServerResponse, code: number, msg: string) {
        res.writeHead(code, {"Content-Type": `application/json`});
        res.end(jsonc.stringify({message: msg}));
    }
}