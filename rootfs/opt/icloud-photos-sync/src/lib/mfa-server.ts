import http from 'http';
import log from 'loglevel';
import {iCloud} from './icloud/icloud.js';
import * as ICLOUD from './icloud/icloud.constants.js';

const MFA_ENDPOINT = `/mfa`;

/**
 * This objects starts a server, that will listen to incoming MFA codes
 */
export class MFAServer {
    /**
     * The server object
     */
    server: http.Server;

    /**
     * Link to parent object
     */
    iCloud: iCloud;

    /**
     * Port to start server on
     */
    port: number;

    logger: log.Logger = log.getLogger(`MFAServer`);

    constructor(port: number, iCloud: iCloud) {
        this.iCloud = iCloud;
        this.port = port;
    }

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

    handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        if (req.url.startsWith(MFA_ENDPOINT) && req.url.match(/\?code=\d{6}$/) && req.method === `POST`) {
            this.logger.debug(`Received MFA: ${req.url}`);
            const mfa: string = req.url.slice(-6);

            res.writeHead(200, {"Content-Type": `application/json`});
            res.write(`Read MFA code: ${mfa}`);
            res.end();

            this.iCloud.emit(ICLOUD.EVENTS.MFA_RECEIVED, mfa);
        } else {
            this.logger.warn(`Received unknown request to endpoint ${req.url}`);
            res.writeHead(404, {"Content-Type": `application/json`});
            res.end(JSON.stringify({message: `Route not found`}));
        }
    }

    stopServer() {
        this.logger.debug(`Stopping server`);
        this.server.close();
    }
}