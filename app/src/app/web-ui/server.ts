import * as http from 'http';
import {Resources} from '../../lib/resources/main.js';
import {requestMfaView} from './view/request-mfa-view.js';
import {stateView} from './view/state-view.js';
import {enterMfaView} from './view/submit-mfa-view.js';

export class WebUiServer {
    private webServer = http.createServer(this.handleRequest.bind(this));

    constructor() {
        // const port = Resources.manager().webUiPort;
        const port = 8080;
        this.webServer.listen(port, () => {
            Resources.logger(this).info(`Web UI server started on port 8080`);
        });
    }

    private handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        const cleanPath = req.url?.split(`?`)[0];
        const content = this.getUiHtml(cleanPath);
        if (content === null) {
            // redirect to base url
            res.writeHead(302, {Location: `/`});
            res.end();
            return
        }

        res.writeHead(200, {'Content-Type': `text/html`});
        res.write(content);
        res.end();
    }

    private getUiHtml(path: string): string | null {
        if (path === `/`) {
            return stateView;
        } else if (path === `/submit-mfa`) {
            return enterMfaView;
        } else if (path === `/request-mfa`) {
            return requestMfaView;
        }
        return null;
    }
}