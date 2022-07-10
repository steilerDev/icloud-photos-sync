import EventEmitter from 'events';
import http from 'http';
import log from 'loglevel';
import * as MFA_SERVER from './constants.js';

const MFA_ENDPOINT = `/mfa`;

/**
 * This objects starts a server, that will listen to incoming MFA codes and other MFA related commands
 */
export class MFAServer extends EventEmitter {
    /**
     * The server object
     */
    server: http.Server;

    /**
     * Port to start server on
     */
    port: number;

    logger: log.Logger = log.getLogger(`MFAServer`);

    /**
     * Creates the server object
     * @param port - The port to listen on
     */
    constructor(port: number) {
        super();
        this.port = port;
    }

    /**
     * Starts the server and listens for incoming requests to perform MFA actions
     */
    startServer() {
        this.logger.debug(`Preparing MFA server on port ${this.port}`);
        this.server = http.createServer(this.handleRequest.bind(this));

        this.server.on(`close`, () => {
            this.logger.debug(`MFA server stopped`);
            this.server = undefined;
        });

        this.server.listen(this.port, () => {
            this.logger.info(`MFA server listening on port ${this.port}, awaiting POST request on ${MFA_ENDPOINT}`);
        });
    }

    /**
     * Habdles incoming http requests
     * @param req - The HTTP request object
     * @param res - The HTTP response object
     */
    handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        if (req.url.startsWith(MFA_ENDPOINT) && req.url.match(/\?code=\d{6}$/) && req.method === `POST`) {
            this.logger.debug(`Received MFA: ${req.url}`);
            const mfa: string = req.url.slice(-6);

            res.writeHead(200, {"Content-Type": `application/json`});
            res.write(`Read MFA code: ${mfa}`);
            res.end();

            this.emit(MFA_SERVER.EVENTS.MFA_RECEIVED, mfa);
        } else {
            // @todo Implement resend codes via phone or text
            this.logger.warn(`Received unknown request to endpoint ${req.url}`);
            res.writeHead(404, {"Content-Type": `application/json`});
            res.end(JSON.stringify({message: `Route not found`}));
        }
    }

    /**
     * Stops the server
     */
    stopServer() {
        this.logger.debug(`Stopping server`);
        this.server.close();
    }
}