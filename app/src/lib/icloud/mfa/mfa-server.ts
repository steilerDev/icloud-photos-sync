import EventEmitter from 'events';
import http from 'http';
import * as MFA_SERVER from './constants.js';
import {getLogger} from '../../logger.js';
import {MFAMethod} from './mfa-method.js';
import * as PACKAGE from '../../package.js';
import {HANDLER_EVENT} from '../../../app/error/handler.js';
import {MFAError} from '../../../app/error/types.js';

/**
 * This objects starts a server, that will listen to incoming MFA codes and other MFA related commands
 * todo - Implement re-request of MFA code
 */
export class MFAServer extends EventEmitter {
    /**
     * Default logger for this class
     */
    private logger = getLogger(this);

    /**
     * The server object
     */
    server: http.Server;

    /**
     * Port to start server on
     */
    port: number;

    /**
     * Holds the MFA method used for this server
     */
    mfaMethod: MFAMethod;

    /**
     * Creates the server object
     * @param port - The port to listen on, defaults to 80
     */
    constructor(port: number = 80) {
        super();
        this.port = port;

        this.logger.debug(`Preparing MFA server on port ${this.port}`);
        this.server = http.createServer(this.handleRequest.bind(this));

        // Default MFA request always goes to device
        this.mfaMethod = new MFAMethod();

        this.server.on(`close`, () => {
            this.logger.debug(`MFA server stopped`);
            this.server = undefined;
        });
    }

    /**
     * Starts the server and listens for incoming requests to perform MFA actions
     */
    startServer() {
        this.server.listen(this.port, () => {
            /* c8 ignore start */
            // Never starting the server just to see logger message
            this.logger.info(`Exposing endpoints: ${JSON.stringify(Object.values(MFA_SERVER.ENDPOINT))}`);
            /* c8 ignore stop */
        });
    }

    /**
     * Habdles incoming http requests
     * @param req - The HTTP request object
     * @param res - The HTTP response object
     */
    handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        if (req.method === `GET` && req.url === `/`) {
            this.sendResponse(res, 200, `MFA Server up & running - ${PACKAGE.NAME}@v${PACKAGE.VERSION}`);
            return;
        }

        if (req.method !== `POST`) {
            this.emit(HANDLER_EVENT, new MFAError(`Received unknown method to endpoint ${req.url}: ${req.method}`, `WARN`).addContext(`request`, req));
            this.sendResponse(res, 400, `Method not supported: ${req.method}`);
            return;
        }

        if (req.url.startsWith(MFA_SERVER.ENDPOINT.CODE_INPUT)) {
            this.handleMFACode(req, res);
        } else if (req.url.startsWith(MFA_SERVER.ENDPOINT.RESEND_CODE)) {
            this.handleMFAResend(req, res);
        } else {
            this.emit(HANDLER_EVENT, new MFAError(`Received request to unknown endpoint ${req.url}`, `WARN`).addContext(`request`, req));
            this.sendResponse(res, 404, `Route not found, available endpoints: ${JSON.stringify(Object.values(MFA_SERVER.ENDPOINT))}`);
        }
    }

    /**
     * This function will handle requests send to the MFA Code Input Endpoint
     * @param req - The HTTP request object
     * @param res - The HTTP response object
     */
    handleMFACode(req: http.IncomingMessage, res: http.ServerResponse) {
        if (!req.url.match(/\?code=\d{6}$/)) {
            this.emit(HANDLER_EVENT, new MFAError(`Received unexpected MFA code format, expecting 6 digits`, `WARN`).addContext(`request`, req));
            this.sendResponse(res, 400, `Unexpected MFA code format! Expecting 6 digits`);
            return;
        }

        const mfa: string = req.url.slice(-6);

        this.logger.debug(`Received MFA: ${mfa}`);
        this.sendResponse(res, 200, `Read MFA code: ${mfa}`);
        this.emit(MFA_SERVER.EVENTS.MFA_RECEIVED, this.mfaMethod, mfa);
    }

    /**
     * This function will handle the request send to the MFA Code Resend Endpoint
     * @param req - The HTTP request object
     * @param res - The HTTP response object
     */
    handleMFAResend(req: http.IncomingMessage, res: http.ServerResponse) {
        const methodMatch = req.url.match(/method=(?:sms|voice|device)/);
        if (!methodMatch) {
            this.sendResponse(res, 400, `Method does not match expected format`);
            this.emit(HANDLER_EVENT, new MFAError(`Method does not match expected format`, 'WARN').addContext(`requestURL`, req.url))
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
        this.emit(MFA_SERVER.EVENTS.MFA_RESEND, this.mfaMethod);
    }

    /**
     * This function will send a response, based on its input variables
     * @param res - The response object, to send the response to
     * @param code - The status code for the response
     * @param msg - The message included in the response
     */
    sendResponse(res: http.ServerResponse, code: number, msg: string) {
        res.writeHead(code, {"Content-Type": `application/json`});
        res.end(JSON.stringify({"message": msg}));
    }

    /**
     * Stops the server
     */
    stopServer() {
        this.logger.debug(`Stopping server`);
        if (this.server) {
            this.server.close();
            this.server = undefined;
        }
    }
}