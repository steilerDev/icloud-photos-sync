import {requestMfaScript} from "../scripts/request-mfa-scripts.js";
import {View} from "./base.js";

export class RequestMfaView extends View {
    protected override get content(): string {
        return `
            <!-- Options are sms, voice, device -->
            <h2>Choose MFA Method</h2>
            <button class="request-buttons" onclick="requestMfaWithMethod('device')" id="device-button">Send to My Devices</button>
            <button class="request-buttons" onclick="requestMfaWithMethod('sms')" id="sms-button">Send SMS</button>
            <button class="request-buttons" onclick="requestMfaWithMethod('voice')" id="voice-button">Receive a Call</button>

            <button class="inverted" onclick="navigate('/state')" id="cancel-button">Cancel</button>
        `;
    }

    get scripts() {
        return [...super.scripts, requestMfaScript]
    }
}
