import {resolveSchema} from "ajv/dist/compile/index.js";
import {Resources} from "../../../lib/resources/main.js";
import {logoBase64} from "../assets/logo.js";
import {viewCSS} from "../css/base-css.js";
import {navigationHelperScript} from "../scripts/base-scripts.js";
import {notificationHandlerScript} from "../scripts/notification-handler.js";

const bellIcon = `<?xml version="1.0" encoding="utf-8"?><svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" width="120.641px" height="122.878px" viewBox="0 0 120.641 122.878" enable-background="new 0 0 120.641 122.878" xml:space="preserve"><g><path fill="#fff" fill-rule="evenodd" clip-rule="evenodd" d="M68.16,6.889c18.129,3.653,31.889,19.757,31.889,38.921 c0,22.594-2.146,39.585,20.592,54.716c-40.277,0-80.366,0-120.641,0C22.8,85.353,20.647,68.036,20.647,45.81 c0-19.267,13.91-35.439,32.182-38.979C53.883-2.309,67.174-2.265,68.16,6.889L68.16,6.889z M76.711,109.19 c-1.398,7.785-8.205,13.688-16.392,13.688c-8.187,0-14.992-5.902-16.393-13.688H76.711L76.711,109.19z"/></g></svg>`;

type WebAsset = (basePath: string) => string

export abstract class View {
    public asHtml(): string {
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>ICPS Web UI</title>
            <link rel="manifest" href="${Resources.manager().webBasePath}/manifest.json" />
            ${this.formatCss()}
        </head>
        <body>
            <div class="container">
                <button id="notificationButton" onclick="requestNotificationPermissions()">
                    <div id="bellIcon" ">
                        ${bellIcon}
                    </div>
                    <span>Enable Notifications</span>
                </button>
                <div class="content">
                    <img src="data:image/png;base64,${logoBase64}" class="logo" alt="ICPS Logo">
                    <div class="innerContent">
                        ${this.content}
                    </div>
                </div>
            </div>
            ${this.formatScripts()}
        </body>
        </html>
        `;
    }

    formatCss(): string {
        return this.css.map((css) => `<style>${css}</style>`).join(`\n`)
    }

    formatScripts(): string {
        return this.scripts.map((script) => `<script type="text/javascript">${script(Resources.manager().webBasePath)}</script>`).join(`\n`)
    }

    get css(): string[] {
        return [viewCSS]
    }

    get scripts(): WebAsset[] {
        return [navigationHelperScript, notificationHandlerScript]
    }

    protected abstract get content(): string;
}
