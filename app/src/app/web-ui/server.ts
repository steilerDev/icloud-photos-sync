import * as http from 'http';
import {Resources} from '../../lib/resources/main.js';
import {RequestMfaView} from './view/request-mfa-view.js';
import {StateView} from './view/state-view.js';
import {SubmitMfaView} from './view/submit-mfa-view.js';

export class WebUiServer {
    private webServer = http.createServer(this.handleRequest.bind(this));

    constructor() {
        // const port = Resources.manager().webUiPort;
        const port = 8080;
        this.webServer.listen(port, () => {
            Resources.logger(this).info(`Web UI server started on port ${port}`);
        });
    }

    private handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        const cleanPath = req.url?.split(`?`)[0];
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
    }

    private getUiHtml(path: string): string | null {
        if (path === `/`) {
            return new StateView().asHtml();
        } else if (path === `/submit-mfa`) {
            return new SubmitMfaView().asHtml();
        } else if (path === `/request-mfa`) {
            return new RequestMfaView().asHtml();
        }
        return null;
    }
}