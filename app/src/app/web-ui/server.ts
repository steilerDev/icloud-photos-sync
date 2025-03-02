import * as http from 'http';
import {jsonc} from 'jsonc';
import {MFAMethod} from '../../lib/icloud/mfa/mfa-method.js';
import {MFA_SERVER_ENDPOINTS} from '../../lib/icloud/mfa/mfa-server.js';
import {iCPSEventMFA, iCPSEventRuntimeWarning} from '../../lib/resources/events-types.js';
import {Resources} from '../../lib/resources/main.js';
import {MFA_ERR} from '../error/error-codes.js';
import {iCPSError} from '../error/error.js';
import {TokenApp} from '../icloud-app.js';
import {RequestMfaView} from './view/request-mfa-view.js';
import {StateView} from './view/state-view.js';
import {SubmitMfaView} from './view/submit-mfa-view.js';

export class WebUiServer {
    private webServer = http.createServer(this.handleRequest.bind(this));
    private mfaMethod = new MFAMethod();

    constructor() {
        // const port = Resources.manager().webUiPort;
        const port = 8080;
        this.webServer.listen(port, () => {
            Resources.logger(this).info(`Web UI server started on port ${port}`);
        });
    }

    private handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        const cleanPath = req.url?.split(`?`)[0];

        if (req.method === `GET`) {
            const content = this.getUiHtml(cleanPath);
            if (content === null) {
                res.writeHead(404, {'Content-Type': `text/plain`});
                res.write(`Not Found`);
                res.end();
                return
            }

            res.writeHead(200, {'Content-Type': `text/html`});
            res.write(content);
            res.end();
            return;
        }

        if (req.method === `POST`) {
            if (req.url.startsWith(`/reauthenticate`)) {
                const app = new TokenApp();
                app.run();
                res.writeHead(200, {'Content-Type': `text/plain`});
                res.write(`Reauthentication started`);
                res.end();
                return;
            }
            if (req.url.startsWith(MFA_SERVER_ENDPOINTS.CODE_INPUT)) {
                if (!req.url.match(/\?code=\d{6}$/)) {
                    Resources.emit(iCPSEventRuntimeWarning.MFA_ERROR, new iCPSError(MFA_ERR.CODE_FORMAT)
                        .addMessage(req.url)
                        .addContext(`request`, req));
                    this.sendApiResponse(res, 400, `Unexpected MFA code format! Expecting 6 digits`);
                    return;
                }

                const mfa: string = req.url.slice(-6);

                Resources.logger(this).debug(`Received MFA: ${mfa}`);
                this.sendApiResponse(res, 200, `Read MFA code: ${mfa}`);
                Resources.emit(iCPSEventMFA.MFA_RECEIVED, this.mfaMethod, mfa);
                return;
            } else if (req.url.startsWith(MFA_SERVER_ENDPOINTS.RESEND_CODE)) {
                const methodMatch = req.url.match(/method=(?:sms|voice|device)/);
                if (!methodMatch) {
                    this.sendApiResponse(res, 400, `Resend method does not match expected format`);
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
        
                this.sendApiResponse(res, 200, `Requesting MFA resend with method ${this.mfaMethod}`);
                Resources.emit(iCPSEventMFA.MFA_RESEND, this.mfaMethod);
                return;
            } else {
                res.writeHead(404, {'Content-Type': `text/plain`});
                res.write(`Not Found`);
                res.end();
                return;
            }
        } else {
            res.writeHead(405, {'Content-Type': `text/plain`});
            res.write(`Method Not Allowed`);
            res.end();
            return;
        }
    }

    private getUiHtml(path: string): string | null {
        if (path === `/`) {
            return new StateView().asHtml();
        } else if (path.startsWith(`/submit-mfa`)) {
            return new SubmitMfaView().asHtml();
        } else if (path.startsWith(`/request-mfa`)) {
            return new RequestMfaView().asHtml();
        }
        return null;
    }

    /**
     * This function will send a response, based on its input variables
     * @param res - The response object, to send the response to
     * @param code - The status code for the response
     * @param msg - The message included in the response
     */
    sendApiResponse(res: http.ServerResponse, code: number, msg: string) {
        res.writeHead(code, {"Content-Type": `application/json`});
        res.end(jsonc.stringify({message: msg}));
    }
}