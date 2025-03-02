import {View} from "./view.js";

export class RequestMfaView extends View {
    protected override get content(): string {
        return `
            <!-- Options are sms, voice, device -->
            <h2>Choose MFA Method</h2>
            <button>SMS</button>
            <button>Voice</button>
            <button>Device</button>
            <button class="inverted" onclick="window.location.href=window.location.href + '/..'">Cancel</button>
        `;
    }
}
