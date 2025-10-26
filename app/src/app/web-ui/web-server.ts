import * as http from 'http';
import {jsonc} from 'jsonc';
import {MFAMethod} from '../../lib/icloud/mfa/mfa-method.js';
import {iCPSEventMFA, iCPSEventRuntimeWarning, iCPSEventWebServer} from '../../lib/resources/events-types.js';
import {Resources} from '../../lib/resources/main.js';
import {WEB_SERVER_ERR} from '../error/error-codes.js';
import {iCPSError} from '../error/error.js';
import {TokenApp} from '../icloud-app.js';
import {faviconBase64, iconBase64} from './assets/icons.js';
import {manifest} from './assets/manifest.js';
import {serviceWorker} from './scripts/service-worker.js';
import {RequestMfaView} from './view/request-mfa-view.js';
import {StateView} from './view/state-view.js';
import {SubmitMfaView} from './view/submit-mfa-view.js';
import {LogLevel, StateType} from '../../lib/resources/state-manager.js';
import {NotificationPusher} from './notification-pusher.js';
import {URL} from 'url';
import {pEvent} from 'p-event';

type WebServerResponse = {
    code: number, 
    header: {
        "Content-Type": string, // eslint-disable-line
        "Content-Length"?: number, //eslint-disable-line
        Location?: string
    }, 
    body: any
}

type WebServerRoute = (url: URL, body?: string) => WebServerResponse

type WebServerSitemap = {
    POST: {
        [path: string]: WebServerRoute
    },
    GET: {
        [path: string]: WebServerRoute
    }
}

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

    /**
     * Provides notification capabilities to the server
     */
    notificationPusher: NotificationPusher = new NotificationPusher();

    /**
     * Routing table for this server
     */
    _sitemap: WebServerSitemap = {
        GET: {
            '/': this.handleRoot.bind(this),
            '/state': this.handleStateView.bind(this),
            '/submit-mfa': this.handleSubmitMFAView.bind(this),
            '/request-mfa': this.handleRequestMFAView.bind(this),
            '/service-worker.js': this.handleServiceWorker.bind(this),
            '/manifest.json': this.handleManifest.bind(this),
            '/icon.png': this.handleIcon.bind(this),
            '/favicon.ico': this.handleFavicon.bind(this),
            '/api/state': this.handleStateRequest.bind(this),
            '/api/log': this.handleLogRequest.bind(this),
            '/api/vapid-public-key': this.handleVapidPublicKeyRequest.bind(this)
        },
        POST: {
            '/api/reauthenticate': this.handleReauthRequest.bind(this),
            '/api/mfa': this.handleMFACode.bind(this),
            '/api/resend_mfa': this.handleMFAResend.bind(this),
            '/api/sync': this.handleSyncRequest.bind(this),
            '/api/subscribe': this.handlePushSubscription.bind(this)
        }
    }

    /**
     * Creates the server object and starts the web server
     * @returns 
     */
    static async spawn(): Promise<WebServer> {
        return new WebServer().startServer();
    }

    /**
     * Creates the server object
     * @emits iCPSEventWebServer.ERROR - When an error associated to the server occurs - Provides iCPSError as argument
     */
    constructor() {
        Resources.logger(this).debug(`Preparing web server on port ${Resources.manager().webServerPort}`);
        this.server = http.createServer(this.handleRequest.bind(this));

        // allow the process to exit, if this server is the only thing left running
        this.server.unref();

        // Default MFA request always goes to device
        this.mfaMethod = new MFAMethod();
    }

    /* c8 ignore start */
    // Never starting/stopping the server just to see logger messages

    /**
     * Closes this server
     */
    close(): Promise<void> {
        Resources.events(this).removeListeners();
        return new Promise<void>(resolve => {
            this.server.close(() => resolve());
        });
    }

    /**
     * Starts the server and listens for incoming requests to perform MFA actions
     */
    startServer(): Promise<WebServer> {
        return new Promise<WebServer>((resolve, reject) => {
            try {
                this.server.listen(Resources.manager().webServerPort, () => {
                    
                    // Updating the port to match the actual listening port
                    //Resources.manager().webServerPort = (this.server.address() as AddressInfo).port

                    Resources.emit(iCPSEventWebServer.STARTED, Resources.manager().webServerPort);
                    Resources.logger(this).info(`Exposing GET endpoints: ${jsonc.stringify(Object.keys(this._sitemap.GET))}`);
                    Resources.logger(this).info(`Exposing POST endpoints: ${jsonc.stringify(Object.keys(this._sitemap.POST))}`);
                    resolve(this);
                });
            } catch (err) {
                reject(new iCPSError(WEB_SERVER_ERR.STARTUP_FAILED).addCause(err));
            }
        });
    }

    /* c8 ignore stop */

    /**
     * Handles incoming http requests
     * @param req - The HTTP request object
     * @param res - The HTTP response object
     * @emits iCPSEventRuntimeWarning.WEB_SERVER_ERR - When the request method or endpoint of server could not be found - Provides iCPSError as argument
     */
    async handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        try {
            const url = new URL(
                req.url.replace(new RegExp(`^${Resources.manager().webBasePath}`), ``), // Removing the web base path for request matching
                `http://localhost/` // Necessary, because the req.url is relative
            )
            const body = await this.readBody(req)

            if (req.method === `GET` && url.pathname in this._sitemap.GET) {
                this.sendResponse(this._sitemap.GET[url.pathname](url, body), res)
                return;
            }

            if (req.method === `POST` && url.pathname in this._sitemap.POST) {
                this.sendResponse(this._sitemap.POST[url.pathname](url, body), res)
                return;
            }

            Resources.logger(this).warn(`Unknown request method: ${req.method} for ${req.url}`);

            Resources.emit(iCPSEventRuntimeWarning.WEB_SERVER_ERROR, new iCPSError(WEB_SERVER_ERR.BAD_REQUEST)
                .addMessage(`Unknown path: endpoint ${req.url}, method ${req.method}, pathname ${url.pathname}`)
                .addContext(`request`, req));

            this.sendResponse({
                code: 400,
                header: {
                    "Content-Type": `application/json`
                },
                body: {
                    message: `Method (${req.method}) not supported on endpoint ${req.url}`
                }
            }, res)
        } catch (err) {
            const error = new iCPSError(WEB_SERVER_ERR.UNKNOWN_ERR)
                .addCause(err)
                .addContext(`request`, req)
                .addContext(`responseWritten`, !res.writable)
            Resources.emit(iCPSEventRuntimeWarning.WEB_SERVER_ERROR, error);

            if (res.writable) {
                this.sendResponse({
                    code: 500,
                    header: {
                        "Content-Type": `application/json`
                    },
                    body: {
                        message: error.getDescription()
                    }
                }, res)
            }
        }
    }

    async readBody(req: http.IncomingMessage): Promise<string> {
        try {
            if(req.headers[`content-length`] && Number.parseInt(req.headers[`content-length`], 10) > 0) {
                let body = ``;
                req.on(`data`, chunk => {
                    body += chunk.toString();
                });
                await pEvent(req, `end`, {rejectionEvents: [`error`]})

                Resources.logger(this).debug(`Read body: ${body}`)
                return body;
            }
            return ``;
        } catch (err) {
            throw new iCPSError(WEB_SERVER_ERR.UNABLE_TO_READ_BODY)
                .addCause(err)
                .addContext(`request`, req)
        }
    }

    sendResponse(response: WebServerResponse, res: http.ServerResponse) {
        res.writeHead(response.code, response.header)
            .end(
                typeof response.body === `string` || response.body instanceof Buffer
                    ? response.body
                    : jsonc.stringify(response.body)
            )
    }

    handleRoot(): WebServerResponse {
        return {
            code: 302,
            header: {
                "Content-Type": `text/plain`,
                Location: `/state`
            },
            body: ``
        }
    }

    handleServiceWorker(): WebServerResponse {
        return {
            code: 200,
            header: {
                "Content-Type": `application/javascript`
            },
            body: serviceWorker(Resources.manager().webBasePath)
        }
    }

    handleManifest(): WebServerResponse {
        return {
            code: 200,
            header: {
                'Content-Type': `application/json`
            },
            body: manifest(Resources.manager().webBasePath)
        }
    }

    handleIcon(): WebServerResponse {
        const iconBuffer = Buffer.from(iconBase64, `base64`);
        return {
            code: 200,
            header: {
                'Content-Type': `image/png`,
                'Content-Length': iconBuffer.length,
            },
            body: iconBuffer
        }
    }

    handleFavicon(): WebServerResponse {
        const faviconBuffer = Buffer.from(faviconBase64, `base64`);
        return {
            code: 200,
            header: {
                'Content-Type': `image/x-icon`,
                'Content-Length': faviconBuffer.length,
            },
            body: faviconBuffer
        }
    }

    /**
     * This function will handle the request send to the state endpoint
     */
    handleStateRequest(): WebServerResponse {
        return {
            code: 200,
            header: {
                "Content-Type": `application/json`
            },
            body: Resources.state().serialize()
        }
    }

    handleLogRequest(url: URL): WebServerResponse {
        const logLevelMatch = url.search.match(/loglevel=(debug|info|warn|error)/);
        const logLevel = logLevelMatch?.[1] as LogLevel ?? `none`

        return {
            code: 200,
            header: {
                "Content-Type": `application/json`
            },
            body: Resources.state().serializeLog({level: logLevel})
        }

    }

    handleVapidPublicKeyRequest(): WebServerResponse {
        return {
            code: 200,
            header: {
                "Content-Type": `application/json`
            },
            body: {
                publicKey: Resources.manager().notificationVapidCredentials.publicKey
            }
        }
    }

    /**
     * This function will check if the server is currently expecting an MFA code
     * @returns - Undefined if the server is expecting an MFA code, otherwise a WebServerResponse object indicating the error
     */
    handleInProgress(): WebServerResponse | undefined {
        if (Resources.state().state !== StateType.READY) {
            Resources.emit(iCPSEventRuntimeWarning.WEB_SERVER_ERROR, new iCPSError(WEB_SERVER_ERR.SYNC_IN_PROGRESS));
            return {
                code: 412,
                header: {
                    "Content-Type": `application/json`
                },
                body: {
                    message: `Cannot perform action while sync is in progress`,
                }
            }
        } 
        return undefined;
    }

    /**
     * This function will handle the request send to the re-authentication endpoint
     * @emits iCPSEventWebServer.REAUTH_REQUESTED - When the request was received
     * @emits iCPSEventWebServer.REAUTH_ERROR - When there was an error
     */
    handleReauthRequest(): WebServerResponse {
        const check = this.handleInProgress();
        if (check) {
            return check;
        }

        Resources.emit(iCPSEventWebServer.REAUTH_REQUESTED);

        this.triggerReauth()
            .catch(err => {
                Resources.emit(iCPSEventWebServer.REAUTH_ERROR, iCPSError.toiCPSError(err));
            });
        
        return {
            code: 200,
            header: {
                "Content-Type": `application/json`
            },
            body: {
                message: `Reauthentication requested`
            }
        }
    }

    /**
     * This function will trigger the reauthentication process
     * @param app - An optional TokenApp instance to use for reauthentication. If not provided, a new instance will be created (structured for testing purposes)
     * @returns A promise that resolves when the reauthentication process is complete
     */
    triggerReauth(app: TokenApp = new TokenApp()): Promise<unknown> {
        return app.run()
    }

    /**
     * This function will handle the request send to the sync endpoint
     * @param res - The HTTP response object
     * @emits iCPSEventWebServer.SYNC_REQUESTED - When the sync was requested
     */
    handleSyncRequest(): WebServerResponse {
        const check = this.handleInProgress();
        if (check) {
            return check;
        }
        Resources.emit(iCPSEventWebServer.SYNC_REQUESTED); // Will run a manual trigger for the cron-job
        return {
            code: 200,
            header: {
                "Content-Type": `application/json`
            },
            body: {
                message: `Sync requested`
            }
        }
    }

    /**
     * This function will check if the server is currently expecting an MFA code
     * @returns - Undefined if the server is expecting an MFA code, otherwise a WebServerResponse object indicating the error
     */
    handleMFACheck(): WebServerResponse | undefined {
        if (Resources.state().state !== StateType.BLOCKED) {
            Resources.emit(iCPSEventRuntimeWarning.WEB_SERVER_ERROR, new iCPSError(WEB_SERVER_ERR.NO_CODE_EXPECTED));
            return {
                code: 412,
                header: {
                    "Content-Type": `application/json`
                },
                body: {
                    message: `MFA code not expected at this time.`,
                }
            }
        } 
        return undefined;
    }

    /**
     * This function will handle requests send to the MFA code input endpoint
     * @param url - The parsed URL invoking this request
     * @emits iCPSEventRuntimeWarning.WEB_SERVER_ERR - When the parameters do not match the expected format
     * @emits iCPSEventMFA.MFA_RECEIVED - When the MFA code was received - Provides MFA method and MFA code as arguments
     */
    handleMFACode(url: URL): WebServerResponse {
        const check = this.handleMFACheck();
        if (check) {
            return check;
        }

        if (!url.search.match(/code=(\d{6})/)) {
            Resources.emit(iCPSEventRuntimeWarning.WEB_SERVER_ERROR, new iCPSError(WEB_SERVER_ERR.CODE_FORMAT)
                .addMessage(url.toString()));
            return {
                code: 400,
                header: {
                    "Content-Type": `application/json`
                },
                body: {
                    message: `Unexpected MFA code format! Expecting 6 digits`
                }
            }
        }

        const mfa: string = url.search.match(/code=(\d{6})/)[1]

        Resources.logger(this).debug(`Received MFA: ${mfa}`);
        Resources.emit(iCPSEventMFA.MFA_RECEIVED, this.mfaMethod, mfa);
        return {
            code: 200,
            header: {
                "Content-Type": `application/json`
            },
            body: {
                message: `Read MFA code: ${mfa}`
            }
        }
    }

    /**
     * This function will handle the request send to the MFA code resend endpoint
     * @param url - The parsed URL invoking this request
     * @emits iCPSEventRuntimeWarning.WEB_SERVER_ERR - When the MFA resend method is not as expected - Provides iCPSError as argument
     * @emits iCPSEventMFA.MFA_RESEND - When the MFA code resend was requested - Provides MFA method as argument
     */
    handleMFAResend(url: URL): WebServerResponse {
        const check = this.handleMFACheck();
        if (check) {
            return check;
        }
        
        const methodMatch = url.search.match(/method=(sms|voice|device)/);
        if (!methodMatch) {
            Resources.emit(iCPSEventRuntimeWarning.WEB_SERVER_ERROR, new iCPSError(WEB_SERVER_ERR.RESEND_METHOD_FORMAT)
                .addContext(`requestURL`, url));
            
            return {
                code: 400,
                header: {
                    "Content-Type": `application/json`
                },
                body: {
                    message: `Resend method does not match expected format`
                }
            }
        }

        const methodString = methodMatch[1];

        const phoneNumberIdMatch = url.search.match(/phoneNumberId=(\d+)/);

        if (phoneNumberIdMatch && methodString !== `device`) {
            this.mfaMethod.update(methodString, parseInt(phoneNumberIdMatch[1], 10));
        } else {
            this.mfaMethod.update(methodString);
        }

        Resources.emit(iCPSEventMFA.MFA_RESEND, this.mfaMethod);

        return {
            code: 200,
            header: {
                "Content-Type": `application/json`
            },
            body: {
                message: `Requesting MFA resend with method ${this.mfaMethod}`
            }
        }
    }
    
    handlePushSubscription(_url: URL, data?: string): WebServerResponse {
        try {
            const pushSubscriptionData = Resources.validator().validatePushSubscription(jsonc.parse(data));
            Resources.manager().addNotificationSubscription(pushSubscriptionData);
            return {
                code: 201,
                header: {
                    "Content-Type": `application/json`
                },
                body: {
                    message: `Push subscription added successfully`
                }
            }
        } catch (err) {
            Resources.logger(this).error(`Unable to register push subscription: ${err}`);
            return {
                code: 400,
                header: {
                    "Content-Type": `application/json`
                },
                body: {
                    message: `Unable to add push subscription`
                }
            }
        }
    }

    handleStateView(): WebServerResponse {
        return {
            code: 200,
            header: {
                "Content-Type": `text/html`
            },
            body: new StateView().asHtml()
        }
    }

    handleSubmitMFAView(): WebServerResponse {
        if (Resources.state().state !== StateType.BLOCKED) {
            Resources.logger(this).warn(`Submit MFA view requested, but not waiting for it. Redirecting to state view.`);
            return {
                code: 302,
                header: {
                    "Content-Type": `text/plain`,
                    Location: `${Resources.manager().webBasePath}/state`
                },
                body: {}
            }
        }
        return {
            code: 200,
            header: {
                "Content-Type": `text/html`
            },
            body: new SubmitMfaView().asHtml()
        }
    }

    handleRequestMFAView(): WebServerResponse {
        if (Resources.state().state !== StateType.BLOCKED) {
            Resources.logger(this).warn(`Request MFA view requested, but not waiting for it. Redirecting to state view.`);
            return {
                code: 302,
                header: {
                    "Content-Type": `text/plain`,
                    Location: `${Resources.manager().webBasePath}/state`
                },
                body: {}
            }
        }
        return {
            code: 200,
            header: {
                "Content-Type": `text/html`
            },
            body: new RequestMfaView().asHtml()
        }
    }
}